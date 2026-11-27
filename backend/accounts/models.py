"""Per-user data that Django's built-in User doesn't hold.

A 1:1 profile rather than a custom AUTH_USER_MODEL: swapping the user model
after MetadataRecord.owner/reviewed_by FKs and their migrations already exist
is a painful migration, and nothing here needs to change how Django itself
authenticates.
"""

from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    class AuthProvider(models.TextChoices):
        PASSWORD = "password", "Email & password"
        GOOGLE = "google", "Google"
        EMAIL_LINK = "email_link", "Emailed sign-in link"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, related_name="profile", on_delete=models.CASCADE
    )
    email_verified = models.BooleanField(
        default=False,
        help_text="Proven ownership of the account's email (verification link or "
        "Google sign-in). Required before the user is recognised as an "
        "organisation's data owner - see accounts.roles.",
    )
    auth_provider = models.CharField(
        max_length=20, choices=AuthProvider.choices, default=AuthProvider.PASSWORD
    )
    affiliation = models.CharField(
        max_length=255, blank=True, help_text="Organisation/institution the user belongs to."
    )
    country = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "user profile"

    def __str__(self):
        return f"Profile of {self.user}"


class MagicLink(models.Model):
    """A one-time sign-in link sent by email - e.g. to an organisation contact
    so they can review a data request without having an account yet.

    Only a SHA-256 hash of the token is stored; the raw token exists only in
    the email. See accounts.magic_links.
    """

    class Purpose(models.TextChoices):
        OWNER_REVIEW = "owner_review", "Review data requests"
        UPLOAD_REQUEST = "upload_request", "Upload requested data"

    email = models.EmailField(db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)
    purpose = models.CharField(max_length=30, choices=Purpose.choices, default=Purpose.OWNER_REVIEW)
    next_path = models.CharField(max_length=500, blank=True, help_text="Where to go after signing in.")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "magic sign-in link"

    def __str__(self):
        return f"{self.get_purpose_display()} link for {self.email}"


def get_profile(user):
    """The user's profile, created on demand for accounts that predate this app
    (e.g. superusers made before it was installed)."""
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def create_profile_for_new_user(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.get_or_create(user=instance)
