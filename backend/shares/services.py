"""Every state change to a file share goes through here (views, the tus
upload endpoints, the admin and the purge command all call these)."""

import logging
import re
import shutil
import unicodedata
import uuid
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import F, Prefetch, Sum
from django.utils import timezone

from accounts.roles import has_finished_account, owned_organisations, pending_upload_requests, verified_email
from datarequests.models import DataRequestItem

from . import signals
from .models import FileShare, SharedFile, UploadRequest

logger = logging.getLogger(__name__)

READ_SIZE = 1024 * 1024  # stream uploads to disk 1 MB at a time


class ShareError(Exception):
    """A business-rule violation; `status` is the HTTP status to report."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def human_size(num):
    for unit in ("bytes", "KB", "MB", "GB"):
        if num < 1024 or unit == "GB":
            return f"{num:.0f} {unit}" if unit == "bytes" else f"{num:.1f} {unit}"
        num /= 1024
    return f"{num:.1f} TB"


def shares_root():
    root = Path(settings.SHARES_ROOT)
    root.mkdir(parents=True, exist_ok=True)
    return root


# --- Permissions -----------------------------------------------------------------


def can_create_share(user, request_item=None):
    """Who may share files. Raises ShareError.

    - SPC staff: anything.
    - Data owners (any organisation): standalone shares (not tied to a
      request), and deliveries for approved items of their organisations.
    - Someone an owner asked to upload (UploadRequest): that item only.
    Ordinary requesters can't, so the server isn't an open file host."""
    if not user or not user.is_authenticated:
        raise ShareError("Log in to share files.", 401)
    if user.is_staff:
        return
    if not has_finished_account(user):
        raise ShareError("Finish setting up your account (set a password) before sharing files.", 403)
    if request_item is None:
        if not owned_organisations(user).exists():
            raise ShareError("Only SPC staff and data owners can share files.", 403)
        return
    is_owner = owned_organisations(user).filter(pk=request_item.organisation_id).exists()
    if not is_owner and not _asked_to_upload(user, request_item):
        raise ShareError("You are not a data owner for this dataset.", 403)
    if request_item.status != DataRequestItem.Status.APPROVED:
        raise ShareError("Approve this dataset before sharing files for it.")


def _ensure_owner_or_staff(user, request_item):
    if user.is_staff:
        return
    if not has_finished_account(user):
        raise ShareError("Finish setting up your account (set a password) first.", 403)
    if not owned_organisations(user).filter(pk=request_item.organisation_id).exists():
        raise ShareError("You are not a data owner for this dataset.", 403)


# --- Upload requests (owner asks someone else to upload) --------------------------


def _asked_to_upload(user, request_item):
    return pending_upload_requests(user).filter(request_item=request_item).exists()


def _on_commit_send(signal, upload_request, **kwargs):
    transaction.on_commit(lambda: signal.send(sender=UploadRequest, upload_request=upload_request, **kwargs))


def request_upload(user, request_item, email, message=""):
    """Ask `email` to upload the files for an approved item. Replaces any
    open request for the item (that person is told it's no longer needed,
    unless it's the same address - then it's just a resend)."""
    _ensure_owner_or_staff(user, request_item)
    if request_item.status != DataRequestItem.Status.APPROVED:
        raise ShareError("Approve this dataset before asking someone to upload it.")
    email = (email or "").strip().lower()
    if not email:
        raise ShareError("Enter the email address of the person who will upload the data.")
    with transaction.atomic():
        previous = list(
            UploadRequest.objects.select_for_update().filter(
                request_item=request_item, status=UploadRequest.Status.OPEN
            )
        )
        for old in previous:
            old.status = UploadRequest.Status.CANCELLED
            old.save(update_fields=["status"])
            if old.email != email:
                _on_commit_send(signals.upload_request_cancelled, old, reason="replaced")
        upload_request = UploadRequest.objects.create(
            request_item=request_item, email=email, message=message, requested_by=user
        )
        _on_commit_send(signals.upload_requested, upload_request)
    return upload_request


def cancel_upload_request(user, request_item):
    _ensure_owner_or_staff(user, request_item)
    with transaction.atomic():
        upload_request = (
            UploadRequest.objects.select_for_update()
            .filter(request_item=request_item, status=UploadRequest.Status.OPEN)
            .first()
        )
        if upload_request is None:
            raise ShareError("Nobody is currently asked to upload this dataset.", 404)
        upload_request.status = UploadRequest.Status.CANCELLED
        upload_request.save(update_fields=["status"])
        _on_commit_send(signals.upload_request_cancelled, upload_request, reason="cancelled")
    return upload_request


def _close_upload_requests(share):
    """On publish: the uploader's own request is completed; anyone else still
    asked to upload this item is told it's no longer needed."""
    if share.request_item_id is None:
        return
    uploader_email = (verified_email(share.created_by) or "").lower() if share.created_by else ""
    now = timezone.now()
    for upload_request in UploadRequest.objects.select_for_update().filter(
        request_item_id=share.request_item_id, status=UploadRequest.Status.OPEN
    ):
        if uploader_email and upload_request.email.lower() == uploader_email:
            upload_request.status = UploadRequest.Status.COMPLETED
            upload_request.completed_at = now
            upload_request.completed_by = share.created_by
            upload_request.share = share
            upload_request.save(update_fields=["status", "completed_at", "completed_by", "share"])
            _on_commit_send(signals.upload_request_completed, upload_request)
        else:
            upload_request.status = UploadRequest.Status.CANCELLED
            upload_request.save(update_fields=["status"])
            _on_commit_send(signals.upload_request_cancelled, upload_request, reason="delivered")


def can_manage(user, share):
    return bool(user and user.is_authenticated and (user.is_staff or share.created_by_id == user.pk))


def visible_shares(user):
    """Shares a user can list: staff see all, others the ones they made."""
    shares = FileShare.objects.select_related(
        "created_by", "request_item__request"
    ).prefetch_related("files")
    return shares if user.is_staff else shares.filter(created_by=user)


# --- Creating and uploading ------------------------------------------------------


def create_share(user, title="", message="", request_item=None, recipient_email=""):
    can_create_share(user, request_item)
    if not title and request_item is not None:
        title = f"{request_item.request.reference} - {request_item.record_title or f'Record #{request_item.record_id}'}"
    if not title:
        raise ShareError("Give the share a title.")
    return FileShare.objects.create(
        title=title[:255],
        message=message,
        created_by=user,
        request_item=request_item,
        recipient_email=recipient_email,
    )


def update_draft(share, **changes):
    if share.status != FileShare.Status.DRAFT:
        raise ShareError("A published share can't be changed.", 409)
    if "title" in changes and not changes["title"].strip():
        raise ShareError("Give the share a title.")
    for field, value in changes.items():
        setattr(share, field, value[:255] if field == "title" else value)
    share.save(update_fields=list(changes) or None)
    return share


def clean_filename(name):
    """A safe display/download name: no directories, control characters or
    reserved characters."""
    name = unicodedata.normalize("NFC", str(name or ""))
    name = name.replace("\\", "/").split("/")[-1]
    name = re.sub(r'[\x00-\x1f\x7f<>:"|?*]', "_", name).strip(" .")
    if len(name) > 255:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: 250 - len(ext)] + dot + ext) if dot and len(ext) < 20 else name[:255]
    return name or "file"


def _bytes_still_owed():
    """Space promised to uploads in progress but not yet written."""
    owed = SharedFile.objects.filter(
        share__status=FileShare.Status.DRAFT, completed_at__isnull=True
    ).aggregate(total=Sum(F("size") - F("offset")))["total"]
    return owed or 0


def free_space():
    """Bytes a new upload may use: free disk minus the reserve and minus what
    uploads in progress will still write."""
    free = shutil.disk_usage(shares_root()).free
    return free - settings.SHARE_DISK_RESERVE - _bytes_still_owed()


def start_upload(share, name, size):
    if share.status != FileShare.Status.DRAFT:
        raise ShareError("This share has already been published - start a new one to add files.", 409)
    if size <= 0:
        raise ShareError("Empty files can't be shared.")
    if size > settings.SHARE_MAX_FILE_SIZE:
        raise ShareError(
            f"Files can be up to {human_size(settings.SHARE_MAX_FILE_SIZE)}; this one is {human_size(size)}.", 413
        )
    if size > free_space():
        raise ShareError(
            "Not enough storage space on the server for this file right now. Try again later or contact SPC.", 507
        )
    shared_file = SharedFile.objects.create(
        share=share,
        original_name=clean_filename(name),
        storage_name=f"{share.pk}/{uuid.uuid4().hex}",
        size=size,
    )
    shared_file.path.parent.mkdir(parents=True, exist_ok=True)
    shared_file.path.touch()
    return shared_file


def append_chunk(file_id, offset, stream, length):
    """Write `length` bytes from `stream` at `offset` (tus PATCH). The offset
    must match what's stored, so a retried or duplicated chunk can't corrupt
    the file. Returns the updated SharedFile."""
    with transaction.atomic():
        # Row lock: two PATCHes for one file can't interleave.
        shared_file = SharedFile.objects.select_for_update().select_related("share").get(pk=file_id)
        if shared_file.share.status != FileShare.Status.DRAFT:
            raise ShareError("This share has already been published.", 409)
        if offset != shared_file.offset:
            raise ShareError(f"Upload offset mismatch: the server has {shared_file.offset} bytes.", 409)
        if length is not None and offset + length > shared_file.size:
            raise ShareError("This chunk goes past the end of the file.", 413)

        remaining = shared_file.size - offset
        written = 0
        with open(shared_file.path, "r+b") as fh:
            fh.seek(offset)
            fh.truncate()  # drop any bytes an interrupted earlier write left unrecorded
            try:
                while written < remaining:
                    data = stream.read(min(READ_SIZE, remaining - written))
                    if not data:
                        break
                    fh.write(data)
                    written += len(data)
            except OSError:
                # Client went away mid-chunk: keep what arrived; the client
                # asks for the offset (HEAD) and resumes from there.
                logger.info("Upload of file %s interrupted after %s bytes", file_id, written)
            fh.flush()

        shared_file.offset = offset + written
        if shared_file.is_complete:
            shared_file.completed_at = timezone.now()
        shared_file.save(update_fields=["offset", "completed_at"])
    return shared_file


def remove_file(shared_file):
    if shared_file.share.status != FileShare.Status.DRAFT:
        raise ShareError("Files can't be removed from a published share - revoke it instead.", 409)
    shared_file.path.unlink(missing_ok=True)
    shared_file.delete()


def publish(share):
    """Make the link live. Its files are deleted SHARE_LIFETIME_DAYS later."""
    with transaction.atomic():
        share = FileShare.objects.select_for_update().get(pk=share.pk)
        if share.status != FileShare.Status.DRAFT:
            raise ShareError("This share has already been published.", 409)
        files = list(share.files.all())
        if not files:
            raise ShareError("Upload at least one file first.")
        if not all(f.is_complete for f in files):
            raise ShareError("Some files haven't finished uploading yet.")
        now = timezone.now()
        share.status = FileShare.Status.READY
        share.published_at = now
        share.expires_at = now + timedelta(days=settings.SHARE_LIFETIME_DAYS)
        share.save(update_fields=["status", "published_at", "expires_at"])
        _close_upload_requests(share)
        transaction.on_commit(
            lambda: signals.share_published.send(sender=FileShare, share=share)
        )
    return share


# --- Ending a share --------------------------------------------------------------


def _delete_files(share):
    shutil.rmtree(share.directory, ignore_errors=True)
    share.files_deleted_at = timezone.now()


def revoke(share):
    if share.status in (FileShare.Status.EXPIRED, FileShare.Status.REVOKED):
        return share
    _delete_files(share)
    share.status = FileShare.Status.REVOKED
    share.save(update_fields=["status", "files_deleted_at"])
    return share


def purge(now=None):
    """Delete expired shares' files (rows stay, for the record) and abandoned
    drafts. Returns (expired_count, drafts_deleted)."""
    now = now or timezone.now()
    expired = 0
    for share in FileShare.objects.filter(status=FileShare.Status.READY, expires_at__lte=now):
        _delete_files(share)
        share.status = FileShare.Status.EXPIRED
        share.save(update_fields=["status", "files_deleted_at"])
        expired += 1

    stale_before = now - timedelta(hours=settings.SHARE_DRAFT_TTL_HOURS)
    drafts = 0
    for share in FileShare.objects.filter(status=FileShare.Status.DRAFT, created_at__lte=stale_before):
        shutil.rmtree(share.directory, ignore_errors=True)
        share.delete()
        drafts += 1
    return expired, drafts


# --- Public (anyone with the link) -----------------------------------------------


def public_share(token):
    """The live share for a link, or ShareError (404 unknown, 410 gone)."""
    share = FileShare.objects.filter(token=token).prefetch_related("files").first()
    if share is None or share.status == FileShare.Status.DRAFT:
        raise ShareError("This link isn't valid. Check you copied all of it.", 404)
    if share.status == FileShare.Status.REVOKED:
        raise ShareError("These files are no longer available - the sender removed them.", 410)
    if not share.is_live:
        raise ShareError(
            f"This link has expired. Files are kept for {settings.SHARE_LIFETIME_DAYS} days; "
            "ask the sender to share them again.", 410
        )
    return share


def record_download(share, shared_file):
    now = timezone.now()
    FileShare.objects.filter(pk=share.pk).update(download_count=F("download_count") + 1, last_downloaded_at=now)
    SharedFile.objects.filter(pk=shared_file.pk).update(download_count=F("download_count") + 1)


def live_shares_prefetch():
    """Prefetch for DataRequestItem querysets: live shares as `live_shares`
    (used by datarequests serializers to show download links)."""
    return Prefetch(
        "shares",
        queryset=FileShare.objects.filter(
            status=FileShare.Status.READY, expires_at__gt=timezone.now()
        ).prefetch_related("files"),
        to_attr="live_shares",
    )
