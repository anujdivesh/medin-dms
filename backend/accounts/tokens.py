"""Token helpers shared by every way of logging in (password, registration,
Google), so they all hand the frontend the same shape."""

from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken


def user_data(user):
    """Legacy-compatible user dict (see api/auth_views.py)."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "created_at": user.date_joined,
        "updated_at": user.date_joined,
        "last_login": user.last_login,
    }


def issue_tokens(user):
    """Mark the login and return a fresh SimpleJWT pair plus the user."""
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    refresh = RefreshToken.for_user(user)
    return {
        "access_token": str(refresh.access_token),
        "refresh_token": str(refresh),
        "token_type": "bearer",
        "user": user_data(user),
    }


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Like Django's password-reset tokens, but invalidated by verifying (or
    changing the email) instead of by logging in/changing the password."""

    key_salt = "accounts.tokens.EmailVerificationTokenGenerator"

    def _make_hash_value(self, user, timestamp):
        from .models import get_profile

        return f"{user.pk}{user.email}{get_profile(user).email_verified}{timestamp}"


email_verification_token = EmailVerificationTokenGenerator()
