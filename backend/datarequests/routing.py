"""Who approves a requested record, and who to notify about it.

Owners are identified by their email being one of the organisation's emails
(see accounts.roles) - this module is the matching "outbound" side, used to
address notifications (phase 3).
"""


def approving_organisation(record):
    """The organisation that must approve requests for this record."""
    return record.data_owner


def organisation_emails(organisation):
    """The organisation's own email plus its contacts' emails, de-duplicated
    case-insensitively, in a stable order."""
    if organisation is None:
        return []
    seen, emails = set(), []
    candidates = [organisation.email] + list(
        organisation.contacts.order_by("id").values_list("email", flat=True)
    )
    for email in candidates:
        email = (email or "").strip()
        if email and email.lower() not in seen:
            seen.add(email.lower())
            emails.append(email)
    return emails


def recipients_for_item(item):
    """Addresses to notify about a request item (empty when unrouted)."""
    return organisation_emails(item.organisation)
