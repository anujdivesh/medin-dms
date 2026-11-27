"""File share emails, connected in SharesConfig.ready():

- share published         -> the requester / recipient gets the download link
- upload requested        -> the person asked to upload (own sign-in link)
- upload request cancelled -> that person: no longer needed
- upload request completed -> the owner who asked: data uploaded

Best-effort, like datarequests.notifications: a mail outage never breaks
anything - links can still be copied from the site."""

import logging

from django.conf import settings
from django.utils import timezone

from accounts.emails import send_plain_email
from accounts.magic_links import LINK_LIFETIME, create_link
from accounts.models import MagicLink

from . import signals
from .models import FileShare, UploadRequest
from .services import human_size

logger = logging.getLogger(__name__)


def _send(subject, body, to):
    to = sorted({address.strip().lower() for address in to if address})
    if not to:
        return
    try:
        send_plain_email(subject, body, to)
    except Exception:  # noqa: BLE001 - notifications are best-effort
        logger.exception("Failed to send file share email %r to %s", subject, to)


def _body(share, intro):
    files = list(share.files.all())
    expires = timezone.localtime(share.expires_at).strftime("%d %B %Y, %H:%M %Z")
    sender = share.created_by.get_full_name().strip() if share.created_by else ""
    lines = [intro, ""]
    if share.message:
        lines += [f"Message from {sender or 'the sender'}:", share.message, ""]
    lines += [f"{len(files)} file(s), {human_size(sum(f.size for f in files))} in total:"]
    lines += [f"  - {f.original_name} ({human_size(f.size)})" for f in files]
    lines += [
        "",
        f"Download here:\n{share.url}",
        "",
        f"The link works until {expires}. After that the files are deleted from our servers, "
        "so please download them before then.",
    ]
    return "\n".join(lines) + "\n"


def on_share_published(sender, share, **kwargs):
    share = FileShare.objects.select_related(
        "created_by", "request_item__request__requester"
    ).prefetch_related("files").get(pk=share.pk)
    item = share.request_item
    if item is not None:
        data_request = item.request
        dataset = item.record_title or f"Record #{item.record_id}"
        _send(
            f"Your data for {data_request.reference} is ready to download",
            _body(share, f"The data you requested in {data_request.reference} ({dataset}) is ready."),
            [data_request.requester.email],
        )
    if share.recipient_email and (item is None or share.recipient_email.lower() != item.request.requester.email.lower()):
        _send(
            f"Files shared with you: {share.title}",
            _body(share, f"Files have been shared with you: {share.title}"),
            [share.recipient_email],
        )


# --- Upload requests ----------------------------------------------------------------


def _frontend(path):
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _name(user):
    if user is None:
        return "A data owner"
    return user.get_full_name().strip() or user.email


def _load(upload_request):
    return UploadRequest.objects.select_related(
        "requested_by", "completed_by", "share",
        "request_item__organisation", "request_item__request__requester__profile",
    ).get(pk=upload_request.pk)


def _dataset(item):
    return item.record_title or f"Record #{item.record_id}"


def on_upload_requested(sender, upload_request, **kwargs):
    upload_request = _load(upload_request)
    item = upload_request.request_item
    data_request = item.request
    requester = data_request.requester
    affiliation = getattr(getattr(requester, "profile", None), "affiliation", "")
    owner = _name(upload_request.requested_by)
    organisation = f" ({item.organisation.name})" if item.organisation_id else ""
    token = create_link(
        upload_request.email,
        next_path=f"/uploads?item={item.pk}",
        purpose=MagicLink.Purpose.UPLOAD_REQUEST,
    )
    message = f"\nMessage from {owner}:\n{upload_request.message}\n" if upload_request.message else ""
    _send(
        f"Please upload the data for {data_request.reference}: {_dataset(item)}",
        f"{owner}{organisation} approved a data request and asked you to upload the data for it.\n\n"
        f"Request:   {data_request.reference}\n"
        f"Dataset:   {_dataset(item)}\n"
        f"Requester: {requester.get_full_name().strip() or requester.email}"
        f"{f', {affiliation}' if affiliation else ''}\n\n"
        f"Purpose of the request:\n{data_request.purpose}\n"
        f"{message}\n"
        f"Upload the files here:\n{_frontend(f'/auth/link?token={token}&for=upload')}\n\n"
        f"If you don't have an account yet, this link lets you create one for {upload_request.email} first. "
        f"It works once and expires in {LINK_LIFETIME.days} days; after that, log in at {_frontend('/login')} "
        f"with this email address and open \"Data to upload\".\n\n"
        f"When you finish, the requester is emailed a download link. Files are kept for "
        f"{settings.SHARE_LIFETIME_DAYS} days, then deleted.\n",
        [upload_request.email],
    )


CANCEL_REASONS = {
    "replaced": "The data owner has asked someone else to upload it instead.",
    "cancelled": "The data owner has cancelled the request.",
    "delivered": "The data has already been sent to the requester.",
}


def on_upload_request_cancelled(sender, upload_request, reason="cancelled", **kwargs):
    upload_request = _load(upload_request)
    item = upload_request.request_item
    _send(
        f"Upload no longer needed: {item.request.reference} ({_dataset(item)})",
        f"You no longer need to upload the data for {item.request.reference} ({_dataset(item)}).\n\n"
        f"{CANCEL_REASONS.get(reason, CANCEL_REASONS['cancelled'])}\n",
        [upload_request.email],
    )


def on_upload_request_completed(sender, upload_request, **kwargs):
    upload_request = _load(upload_request)
    if upload_request.requested_by is None or upload_request.share is None:
        return
    item = upload_request.request_item
    share = FileShare.objects.prefetch_related("files").get(pk=upload_request.share_id)
    files = list(share.files.all())
    expires = timezone.localtime(share.expires_at).strftime("%d %B %Y")
    _send(
        f"Data uploaded for {item.request.reference}: {_dataset(item)}",
        f"{_name(upload_request.completed_by)} uploaded {len(files)} file(s) "
        f"({human_size(sum(f.size for f in files))}) for {item.request.reference} ({_dataset(item)}).\n\n"
        f"The requester has been emailed the download link, which works until {expires}:\n{share.url}\n\n"
        f"Review requests: {_frontend('/owner')}\n",
        [upload_request.requested_by.email],
    )


def connect():
    signals.share_published.connect(on_share_published, dispatch_uid="shares.notify_published")
    signals.upload_requested.connect(on_upload_requested, dispatch_uid="shares.notify_upload_requested")
    signals.upload_request_cancelled.connect(on_upload_request_cancelled, dispatch_uid="shares.notify_upload_cancelled")
    signals.upload_request_completed.connect(on_upload_request_completed, dispatch_uid="shares.notify_upload_completed")
