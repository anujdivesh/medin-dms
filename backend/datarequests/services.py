"""Every state change for carts and data requests.

Views, the admin and future integrations (owner dashboard, emails) call these
rather than touching the models directly, so the rules - which records can be
requested, how items are routed, which signals fire - live in one place.
"""

from django.db import transaction
from django.utils import timezone

from accounts.roles import owned_organisations
from api.models import MetadataRecord

from . import signals
from .models import CartItem, DataRequest, DataRequestItem
from .routing import approving_organisation


class DataRequestError(Exception):
    """A business-rule violation, reported to the client as a 400."""

    def __init__(self, message, **extra):
        super().__init__(message)
        self.message = message
        self.extra = extra


def requestable_records():
    """Records a user may add to a cart / request: published ones only."""
    return MetadataRecord.objects.filter(status=MetadataRecord.Status.PUBLISHED)


def _unique_ids(record_ids):
    seen, ids = set(), []
    for raw in record_ids or []:
        try:
            rid = int(raw)
        except (TypeError, ValueError):
            continue
        if rid not in seen:
            seen.add(rid)
            ids.append(rid)
    return ids


# --- Cart -------------------------------------------------------------------

def cart_items(user):
    return (
        CartItem.objects.filter(user=user)
        .select_related("record", "record__metadata_type", "record__data_owner")
    )


def add_to_cart(user, record_id):
    record = requestable_records().filter(pk=record_id).first()
    if record is None:
        raise DataRequestError("This record isn't available to request.", record_id=record_id)
    item, _ = CartItem.objects.get_or_create(user=user, record=record)
    return item


def remove_from_cart(user, record_id):
    CartItem.objects.filter(user=user, record_id=record_id).delete()


def clear_cart(user):
    CartItem.objects.filter(user=user).delete()


def merge_cart(user, record_ids):
    """Add a browser cart's records to the user's server cart. Unknown or
    unpublished ids are skipped (and reported) rather than failing the merge."""
    ids = _unique_ids(record_ids)
    valid = set(requestable_records().filter(pk__in=ids).values_list("pk", flat=True))
    CartItem.objects.bulk_create(
        [CartItem(user=user, record_id=rid) for rid in ids if rid in valid],
        ignore_conflicts=True,
    )
    return [rid for rid in ids if rid not in valid]


# --- Requests ---------------------------------------------------------------

def submit_request(user, purpose, record_ids=None):
    """Create a DataRequest for `record_ids` (default: the user's whole server
    cart), route each item to its record's data owner, and remove those
    records from the cart."""
    if record_ids is None:
        record_ids = list(CartItem.objects.filter(user=user).values_list("record_id", flat=True))
    purpose = (purpose or "").strip()
    if not purpose:
        raise DataRequestError("Please give the purpose of your request.")
    ids = _unique_ids(record_ids)
    if not ids:
        raise DataRequestError("Your cart is empty.")

    records = {
        r.pk: r
        for r in requestable_records().filter(pk__in=ids).select_related("data_owner")
    }
    unavailable = [rid for rid in ids if rid not in records]
    if unavailable:
        raise DataRequestError(
            "Some records are no longer available to request. Remove them and try again.",
            unavailable=unavailable,
        )

    with transaction.atomic():
        data_request = DataRequest.objects.create(
            requester=user, purpose=purpose
        )
        data_request.assign_reference()
        items = []
        for rid in ids:
            record = records[rid]
            organisation = approving_organisation(record)
            items.append(DataRequestItem(
                request=data_request,
                record=record,
                record_title=(record.title or "")[:500],
                organisation=organisation,
                status=(DataRequestItem.Status.PENDING if organisation
                        else DataRequestItem.Status.UNROUTED),
            ))
        DataRequestItem.objects.bulk_create(items)
        CartItem.objects.filter(user=user, record_id__in=ids).delete()

        transaction.on_commit(lambda: signals.request_submitted.send(
            sender=DataRequest, request=data_request
        ))
    return data_request


def can_decide(user, item):
    """Owners of the item's organisation, or staff, may decide on it."""
    if not user or not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    return (
        item.organisation_id is not None
        and owned_organisations(user).filter(pk=item.organisation_id).exists()
    )


def decide_item(item, user, decision, note=""):
    """Approve or decline one request item (phase 2 owner dashboard)."""
    allowed = {DataRequestItem.Status.APPROVED, DataRequestItem.Status.DECLINED}
    if decision not in allowed:
        raise DataRequestError("Decision must be 'approved' or 'declined'.")
    if not can_decide(user, item):
        raise DataRequestError("You can't decide on this request item.")
    if item.organisation_id is None:
        raise DataRequestError("This item hasn't been routed to an organisation yet.")
    if not item.is_open:
        raise DataRequestError("This item has already been decided.")
    if decision == DataRequestItem.Status.DECLINED and not (note or "").strip():
        raise DataRequestError("Please give the requester a reason for declining.", field="note")

    with transaction.atomic():
        item.status = decision
        item.decided_by = user
        item.decided_at = timezone.now()
        item.decision_note = (note or "").strip()
        item.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"])
        item.request.refresh_status()
        transaction.on_commit(lambda: signals.request_item_decided.send(
            sender=DataRequestItem, item=item, decision=decision, by=user
        ))
    return item


def reopen_item(item, user):
    """Undo a decision (SPC staff, from the admin): the item goes back to
    waiting for its owner (or for routing). The requester isn't emailed -
    they'll hear about the new decision when it's made."""
    if not (user and user.is_staff):
        raise DataRequestError("Only SPC staff can reopen a decision.")
    if item.is_open:
        raise DataRequestError("This item hasn't been decided yet.")
    if item.request.status == DataRequest.Status.CANCELLED:
        raise DataRequestError("The requester cancelled this request.")
    with transaction.atomic():
        item.status = (
            DataRequestItem.Status.PENDING if item.organisation_id else DataRequestItem.Status.UNROUTED
        )
        item.decided_by = None
        item.decided_at = None
        item.decision_note = ""
        item.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"])
        item.request.refresh_status()
    return item


def cancel_request(data_request, user):
    """The requester withdraws a request; undecided items are cancelled,
    already-decided ones keep their decision."""
    if data_request.requester_id != user.pk:
        raise DataRequestError("Only the requester can cancel this request.")
    if data_request.status not in (DataRequest.Status.SUBMITTED, DataRequest.Status.IN_REVIEW):
        raise DataRequestError("This request can no longer be cancelled.")

    with transaction.atomic():
        data_request.items.filter(
            status__in=[DataRequestItem.Status.PENDING, DataRequestItem.Status.UNROUTED]
        ).update(status=DataRequestItem.Status.CANCELLED, updated_at=timezone.now())
        data_request.status = DataRequest.Status.CANCELLED
        data_request.save(update_fields=["status", "updated_at"])
        transaction.on_commit(lambda: signals.request_cancelled.send(
            sender=DataRequest, request=data_request
        ))
    return data_request


def route_unrouted_items(items):
    """Re-route unrouted items using their record's *current* data owner -
    for an admin who has since filled in the record's data_owner. Returns how
    many were routed."""
    routed = []
    with transaction.atomic():
        for item in items.filter(status=DataRequestItem.Status.UNROUTED).select_related("record"):
            organisation = approving_organisation(item.record)
            if organisation is None:
                continue
            item.organisation = organisation
            item.status = DataRequestItem.Status.PENDING
            item.save(update_fields=["organisation", "status", "updated_at"])
            routed.append(item.pk)
        announce_routed(routed)
    return len(routed)


def announce_routed(item_ids):
    """Tell listeners (owner notification emails) that these items have just
    been assigned to an organisation - after an admin routes them."""
    item_ids = list(item_ids)
    if not item_ids:
        return
    transaction.on_commit(lambda: signals.request_items_routed.send(
        sender=DataRequestItem,
        items=list(DataRequestItem.objects.filter(pk__in=item_ids)),
    ))
