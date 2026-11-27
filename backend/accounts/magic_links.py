"""One-time emailed sign-in links ("magic links").

create_link() returns the raw token to put in an email; only its SHA-256 hash
is stored. check_link() validates one without using it up; consume_link()
validates and burns it. Using a link proves the person controls the email
address, so their account is marked verified - which is what makes an
organisation contact an owner (accounts.roles).

A link only signs in someone who already has a finished account. Anyone else
must first create one (name + password, or Google) - see
accounts.views.magic_link_login and magic_link_register.
"""

import hashlib
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import MagicLink

LINK_LIFETIME = timedelta(days=7)


class MagicLinkError(Exception):
    pass


def _hash(raw_token):
    return hashlib.sha256(raw_token.encode()).hexdigest()


def create_link(email, next_path="", purpose=MagicLink.Purpose.OWNER_REVIEW):
    raw = secrets.token_urlsafe(32)
    MagicLink.objects.create(
        email=email.strip().lower(),
        token_hash=_hash(raw),
        purpose=purpose,
        next_path=next_path,
        expires_at=timezone.now() + LINK_LIFETIME,
    )
    return raw


def _valid_link(raw_token, lock=False):
    if not raw_token:
        raise MagicLinkError("This sign-in link is invalid.")
    links = MagicLink.objects.select_for_update() if lock else MagicLink.objects
    link = links.filter(token_hash=_hash(raw_token)).first()
    if link is None:
        raise MagicLinkError("This sign-in link is invalid.")
    if link.used_at is not None:
        raise MagicLinkError("This sign-in link has already been used.")
    if link.expires_at <= timezone.now():
        raise MagicLinkError("This sign-in link has expired.")
    return link


def check_link(raw_token):
    """Return the link if it's usable, without burning it. Raises
    MagicLinkError if it's unknown, already used or expired."""
    return _valid_link(raw_token)


def consume_link(raw_token):
    """Burn the link and return it; raises MagicLinkError like check_link().
    Inside an outer transaction the burn rolls back with it, so a later
    failure leaves the link usable."""
    with transaction.atomic():
        link = _valid_link(raw_token, lock=True)
        link.used_at = timezone.now()
        link.save(update_fields=["used_at"])
    return link
