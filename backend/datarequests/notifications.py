"""Emails for data requests, driven by datarequests.signals (connected in
DataRequestsConfig.ready()).

- new request      -> each owning organisation's emails (own magic sign-in
                      link each), a confirmation to the requester, and an
                      alert to SPC for items with no data owner
- items routed     -> the newly assigned organisation's emails
- item decided     -> the requester

Signals fire on transaction commit; every send is best-effort (logged, never
raised) so a mail outage can't break submitting or deciding.
"""

import logging
from collections import defaultdict

from django.conf import settings

from accounts.emails import send_plain_email
from accounts.magic_links import LINK_LIFETIME, create_link

from . import signals
from .models import DataRequestItem
from .routing import organisation_emails

logger = logging.getLogger(__name__)


def _frontend(path):
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _person(user):
    name = user.get_full_name().strip()
    return f"{name} <{user.email}>" if name else user.email


def _requester_line(data_request):
    user = data_request.requester
    affiliation = getattr(getattr(user, "profile", None), "affiliation", "")
    return _person(user) + (f", {affiliation}" if affiliation else "")


def _bullets(items):
    return "\n".join(f"  - {item.record_title or f'Record #{item.record_id}'}" for item in items)


def _send(subject, body, to):
    to = [address for address in to if address]
    if not to:
        return
    try:
        send_plain_email(subject, body, to)
    except Exception:  # noqa: BLE001 - notifications are best-effort
        logger.exception("Failed to send data request email %r to %s", subject, to)


def _admin_recipients():
    address = getattr(settings, "DATA_REQUEST_ADMIN_EMAIL", "") or getattr(settings, "EMAIL_REPLY_TO", "")
    return [address] if address else []


# --- Owners -------------------------------------------------------------------

def notify_owners(data_request, organisation, items):
    """Ask an organisation's people to review `items`. Each address gets its
    own one-time sign-in link straight to the request on the owner dashboard.
    Returns False when the organisation has no email addresses at all."""
    recipients = organisation_emails(organisation)
    if not recipients:
        return False

    days = LINK_LIFETIME.days
    for email in recipients:
        token = create_link(email, next_path=f"/owner?request={data_request.pk}")
        _send(
            f"Data request {data_request.reference} needs your review",
            f"Hello,\n\n"
            f"{_requester_line(data_request)} has requested access to {len(items)} dataset(s) "
            f"owned by {organisation.name}:\n\n"
            f"{_bullets(items)}\n\n"
            f"Purpose of the request:\n{data_request.purpose}\n\n"
            f"Review the request and approve or decline each dataset here:\n"
            f"{_frontend(f'/auth/link?token={token}')}\n\n"
            f"If you don't have an account yet, this link lets you create one for {email} "
            f"(with a password or Google) before you review. It works once and expires in "
            f"{days} days. After that, log in at {_frontend('/login')} with this email address.\n",
            [email],
        )
    return True


def _notify_admin_unassigned(data_request, items, reason):
    _send(
        f"Data request {data_request.reference}: {len(items)} dataset(s) need routing",
        f"Data request {data_request.reference} from {_requester_line(data_request)} includes "
        f"dataset(s) that can't be sent to an owner yet ({reason}):\n\n"
        f"{_bullets(items)}\n\n"
        f"Set the record's data owner (and the organisation's email/contacts), then in the Django "
        f"admin open Data requests -> {data_request.reference} and route the items.\n",
        _admin_recipients(),
    )


# --- Signal receivers -------------------------------------------------------------

def on_request_submitted(sender, request, **kwargs):
    data_request = request
    items = list(data_request.items.select_related("organisation").order_by("id"))

    by_org = defaultdict(list)
    for item in items:
        if item.status == DataRequestItem.Status.PENDING and item.organisation_id:
            by_org[item.organisation].append(item)

    no_contacts = []
    for organisation, org_items in by_org.items():
        if not notify_owners(data_request, organisation, org_items):
            no_contacts.extend(org_items)

    unrouted = [i for i in items if i.status == DataRequestItem.Status.UNROUTED]
    if unrouted:
        _notify_admin_unassigned(data_request, unrouted, "the records have no data owner")
    if no_contacts:
        _notify_admin_unassigned(data_request, no_contacts, "the owning organisation has no email or contacts")

    lines = "\n".join(
        f"  - {i.record_title or f'Record #{i.record_id}'}: "
        + (f"reviewed by {i.organisation.name}" if i.organisation_id else "owner being identified by SPC")
        for i in items
    )
    _send(
        f"We received your data request {data_request.reference}",
        f"Hi {data_request.requester.first_name or data_request.requester.email},\n\n"
        f"Thanks - your request {data_request.reference} has been sent for review:\n\n{lines}\n\n"
        f"Each dataset's owner will approve or decline it. You'll get an email for each decision, "
        f"and you can follow progress here:\n{_frontend(f'/my-requests/{data_request.pk}')}\n",
        [data_request.requester.email],
    )


def on_items_routed(sender, items, **kwargs):
    grouped = defaultdict(list)
    for item in DataRequestItem.objects.filter(pk__in=[i.pk for i in items]).select_related(
        "organisation", "request__requester"
    ):
        if item.organisation_id and item.status == DataRequestItem.Status.PENDING:
            grouped[(item.request, item.organisation)].append(item)
    for (data_request, organisation), org_items in grouped.items():
        if not notify_owners(data_request, organisation, org_items):
            _notify_admin_unassigned(data_request, org_items, "the owning organisation has no email or contacts")


def on_item_decided(sender, item, decision, **kwargs):
    data_request = item.request
    approved = decision == DataRequestItem.Status.APPROVED
    owner = item.organisation.name if item.organisation_id else "The data owner"
    note = f"\n\nMessage from {owner}:\n{item.decision_note}" if item.decision_note else ""
    if approved:
        from shares.models import UploadRequest  # lazy: shares imports datarequests

        uploader = item.upload_requests.filter(status=UploadRequest.Status.OPEN).first()
        next_step = (
            f"{uploader.email} will upload the data, and you'll be emailed a download link when it's ready."
            if uploader else
            "You'll be emailed a download link when the data is ready (or the data owner will contact you)."
        )
    else:
        next_step = "If you have questions, reply to this email."
    _send(
        f"{data_request.reference}: \"{item.record_title}\" was {'approved' if approved else 'declined'}",
        f"Hi {data_request.requester.first_name or data_request.requester.email},\n\n"
        f"{owner} has {'approved' if approved else 'declined'} your request for:\n"
        f"  {item.record_title or f'Record #{item.record_id}'}{note}\n\n"
        f"{next_step}\n\n"
        f"See the full request: {_frontend(f'/my-requests/{data_request.pk}')}\n",
        [data_request.requester.email],
    )


def connect():
    signals.request_submitted.connect(on_request_submitted, dispatch_uid="datarequests.notify_submitted")
    signals.request_items_routed.connect(on_items_routed, dispatch_uid="datarequests.notify_routed")
    signals.request_item_decided.connect(on_item_decided, dispatch_uid="datarequests.notify_decided")
