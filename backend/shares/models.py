"""Temporary file shares: files uploaded by SPC staff or a data owner, handed
out with an anyone-with-the-link URL that expires (and whose files are
deleted) settings.SHARE_LIFETIME_DAYS after publishing.

Lifecycle: draft (files uploading) -> ready (published, link works) ->
expired (purged by `manage.py purge_shares`) or revoked (deleted early).
"""

import secrets
from pathlib import Path

from django.conf import settings
from django.db import models
from django.utils import timezone


def new_token():
    return secrets.token_urlsafe(24)


class FileShare(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Uploading"
        READY = "ready", "Ready"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    # The link *is* the permission (like WeTransfer), so it's kept in plain
    # text for the uploader to copy again; 24 random bytes can't be guessed.
    token = models.CharField(max_length=64, unique=True, default=new_token, editable=False)
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True, help_text="Shown to the recipient with the files.")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="file_shares"
    )
    request_item = models.ForeignKey(
        "datarequests.DataRequestItem", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="shares", help_text="The approved request item these files deliver, if any.",
    )
    recipient_email = models.EmailField(blank=True, help_text="Also emailed the link when published.")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    files_deleted_at = models.DateTimeField(null=True, blank=True)
    download_count = models.PositiveIntegerField(default=0)
    last_downloaded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "expires_at"])]

    def __str__(self):
        return self.title

    @property
    def is_live(self):
        return self.status == self.Status.READY and self.expires_at and self.expires_at > timezone.now()

    @property
    def effective_status(self):
        """Status as people should see it: a ready share past its expiry is
        expired even before the hourly purge has run."""
        if self.status == self.Status.READY and not self.is_live:
            return self.Status.EXPIRED
        return self.status

    @property
    def url(self):
        return f"{settings.FRONTEND_URL.rstrip('/')}/s/{self.token}"

    @property
    def directory(self):
        return Path(settings.SHARES_ROOT) / str(self.pk)


class SharedFile(models.Model):
    share = models.ForeignKey(FileShare, related_name="files", on_delete=models.CASCADE)
    original_name = models.CharField(max_length=255)
    # "<share id>/<random hex>" under settings.SHARES_ROOT - never the
    # uploader's file name, so names can't escape the directory.
    storage_name = models.CharField(max_length=100, unique=True)
    size = models.BigIntegerField()
    offset = models.BigIntegerField(default=0, help_text="Bytes received so far.")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    download_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.original_name

    @property
    def is_complete(self):
        return self.offset >= self.size

    @property
    def path(self):
        return Path(settings.SHARES_ROOT) / self.storage_name


class UploadRequest(models.Model):
    """A data owner asking someone else (any email address) to upload the
    files for an approved request item. That person signs in with that
    address (accounts.roles.verified_email), uploads on their "Data to
    upload" page, and publishing the share completes the request.
    At most one open request per item; no deadline."""

    class Status(models.TextChoices):
        OPEN = "open", "Waiting for upload"
        COMPLETED = "completed", "Uploaded"
        CANCELLED = "cancelled", "Cancelled"

    request_item = models.ForeignKey(
        "datarequests.DataRequestItem", on_delete=models.CASCADE, related_name="upload_requests"
    )
    email = models.EmailField()
    message = models.TextField(blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="upload_requests_made"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="upload_requests_completed",
    )
    share = models.ForeignKey(FileShare, null=True, blank=True, on_delete=models.SET_NULL, related_name="upload_requests")

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["request_item"], condition=models.Q(status="open"), name="one_open_upload_request_per_item"
            )
        ]
        indexes = [models.Index(fields=["email", "status"])]

    def __str__(self):
        return f"{self.email} - {self.request_item}"
