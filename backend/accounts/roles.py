"""Single source of truth for "levels of login".

- requester: any authenticated user - can build a cart and submit requests.
- owner: a user whose *verified* email is one of an Organisation's emails
  (its own `email` or any of its contacts' emails). They decide on request
  items routed to that organisation (a record's `data_owner`).
- admin: Django staff.

Owner status is derived, not granted: add/remove the person as a contact of
the organisation in the admin and their access follows. Verification is
required so nobody can claim an owner's rights just by registering with the
owner's address.

To add more levels later (e.g. an SPC reviewer), extend `user_roles()` - the
frontend gates its menus/routes on that dict.
"""

from django.db.models import Q

from api.models import Organisation

from .models import UserProfile, get_profile


def verified_email(user):
    """The user's email if they've proven they own it, else None."""
    if not user or not user.is_authenticated or not user.email:
        return None
    if not get_profile(user).email_verified:
        return None
    return user.email


def owned_organisations(user):
    """Organisations this user can act for as data owner."""
    email = verified_email(user)
    if not email:
        return Organisation.objects.none()
    return Organisation.objects.filter(
        Q(email__iexact=email) | Q(contacts__email__iexact=email)
    ).distinct()


def has_finished_account(user):
    """True once the user can sign in on their own: they have a password, or
    signed up with Google. Accounts created by an emailed sign-in link alone
    (auth_provider "email_link", no password) aren't finished, and can't
    decide on data requests until they are."""
    if not user or not user.is_authenticated:
        return False
    if user.has_usable_password():
        return True
    return get_profile(user).auth_provider != UserProfile.AuthProvider.EMAIL_LINK


def is_owner(user):
    return owned_organisations(user).exists()


def pending_upload_requests(user):
    """Open "please upload the data" requests (shares.UploadRequest) sent to
    the user's verified email - what makes them an uploader."""
    from shares.models import UploadRequest  # lazy: shares imports accounts

    email = verified_email(user)
    if not email:
        return UploadRequest.objects.none()
    return UploadRequest.objects.filter(email__iexact=email, status=UploadRequest.Status.OPEN)


def user_roles(user):
    return {
        "requester": bool(user and user.is_authenticated),
        "owner": is_owner(user),
        # Asked by a data owner to upload data for a request (any address).
        "uploader": pending_upload_requests(user).exists(),
        "admin": bool(user and user.is_authenticated and user.is_staff),
    }
