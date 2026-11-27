"""Data request cart and requests.

Flow: records go into a user's cart (CartItem) -> checkout creates one
DataRequest with one DataRequestItem per record -> each item is routed to the
record's `data_owner` organisation, whose owners (accounts.roles) approve or
decline it individually -> the request's overall status follows its items.

All state changes go through datarequests.services so views, the admin and
(later) email notifications share the same rules and signals.
"""

from django.conf import settings
from django.db import models

from api.models import MetadataRecord, Organisation


class CartItem(models.Model):
    """Server-side cart line. Anonymous users keep their cart in the browser
    and it is merged into this table when they log in."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="cart_items", on_delete=models.CASCADE
    )
    record = models.ForeignKey(
        MetadataRecord, related_name="cart_items", on_delete=models.CASCADE
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["added_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["user", "record"], name="unique_cart_item_per_user"),
        ]

    def __str__(self):
        return f"{self.user} - {self.record}"


class DataRequest(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        IN_REVIEW = "in_review", "In review"
        PARTIALLY_APPROVED = "partially_approved", "Partially approved"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"
        CANCELLED = "cancelled", "Cancelled"

    reference = models.CharField(
        max_length=32, unique=True, null=True, blank=True, editable=False,
        help_text="Human-friendly id, e.g. DR-2026-00042.",
    )
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="data_requests", on_delete=models.PROTECT
    )
    purpose = models.TextField(help_text="Why the data is needed (required).")
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.SUBMITTED, db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.reference or f"Data request #{self.pk}"

    def assign_reference(self):
        if not self.reference and self.pk:
            self.reference = f"DR-{self.created_at:%Y}-{self.pk:05d}"
            self.save(update_fields=["reference"])

    def refresh_status(self, save=True):
        """Derive the overall status from the items' statuses."""
        if self.status == self.Status.CANCELLED:
            return self.status

        statuses = [s for s in self.items.values_list("status", flat=True)
                    if s != DataRequestItem.Status.CANCELLED]
        open_ = {DataRequestItem.Status.PENDING, DataRequestItem.Status.UNROUTED}
        decided = [s for s in statuses if s not in open_]

        if not statuses or not decided:
            new = self.Status.SUBMITTED
        elif len(decided) < len(statuses):
            new = self.Status.IN_REVIEW
        elif all(s == DataRequestItem.Status.APPROVED for s in decided):
            new = self.Status.APPROVED
        elif all(s == DataRequestItem.Status.DECLINED for s in decided):
            new = self.Status.DECLINED
        else:
            new = self.Status.PARTIALLY_APPROVED

        if new != self.status:
            self.status = new
            if save:
                self.save(update_fields=["status", "updated_at"])
        return self.status


class DataRequestItem(models.Model):
    """One requested record, decided on by the owning organisation."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        UNROUTED = "unrouted", "Unrouted (no data owner)"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"
        CANCELLED = "cancelled", "Cancelled"

    request = models.ForeignKey(DataRequest, related_name="items", on_delete=models.CASCADE)
    record = models.ForeignKey(
        MetadataRecord, related_name="data_request_items", on_delete=models.PROTECT
    )
    record_title = models.CharField(
        max_length=500, blank=True,
        help_text="Snapshot of the record title when the request was made.",
    )
    organisation = models.ForeignKey(
        Organisation,
        related_name="data_request_items",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text="Approving organisation - the record's data owner at the time "
        "of the request. Empty means unrouted (handled by an admin).",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="decided_data_request_items",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True, help_text="Shown to the requester.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["request", "record"], name="unique_record_per_request"),
        ]
        indexes = [
            models.Index(fields=["organisation", "status"], name="dr_item_org_status_idx"),
        ]

    def __str__(self):
        return f"{self.request} - {self.record_title or self.record_id}"

    @property
    def is_open(self):
        return self.status in (self.Status.PENDING, self.Status.UNROUTED)
