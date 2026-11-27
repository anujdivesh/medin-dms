"""Registration, Google sign-in, the current user, and email verification.

Password login/refresh/logout stay in api/auth_views.py (legacy response
envelope); everything here uses plain DRF responses with real status codes.
All successful logins return the same body as accounts.tokens.issue_tokens.
"""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth import login as django_login
from django.db import transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError

from .emails import send_password_reset_email, send_verification_email
from .magic_links import MagicLinkError, check_link, consume_link
from .models import UserProfile, get_profile
from .roles import has_finished_account
from .serializers import (
    GoogleLoginSerializer,
    MagicLinkRegisterSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    me_payload,
)
from .tokens import email_verification_token, issue_tokens

logger = logging.getLogger(__name__)
User = get_user_model()

# The SPA authenticates with JWT bearer tokens only. Session auth is left
# out on purpose: a Django-admin session cookie for the same host (cookies
# ignore ports, so localhost:8000 admin -> localhost:5173 SPA) would make
# DRF enforce CSRF and reject these calls with "Origin checking failed".
PUBLIC = []  # endpoints that need no identity at all
JWT_ONLY = [JWTAuthentication]


class AuthThrottle(SimpleRateThrottle):
    """Per-IP limit on the unauthenticated auth endpoints (rate: the "auth"
    entry of REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"])."""

    scope = "auth"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


def _login_response(user, http_status=status.HTTP_200_OK):
    body = issue_tokens(user)
    body["user"] = me_payload(user)
    return Response(body, status=http_status)


def _user_from_uid(uid):
    """The user an emailed link's base64 `uid` refers to, or None."""
    try:
        return User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return None


def _send_verification_safely(user):
    try:
        send_verification_email(user)
    except Exception:  # noqa: BLE001 - a mail outage mustn't block sign-up
        logger.exception("Failed to send verification email to user %s", user.pk)


@api_view(["POST"])
@authentication_classes(PUBLIC)
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        user = serializer.save()
    _send_verification_safely(user)
    return _login_response(user, status.HTTP_201_CREATED)


@api_view(["POST"])
@authentication_classes(PUBLIC)
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def google_login(request):
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    if not client_id:
        return Response(
            {"detail": "Google sign-in is not configured on this server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = GoogleLoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    # Imported lazily so the rest of the API still works if google-auth
    # isn't installed in some environment.
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        claims = id_token.verify_oauth2_token(
            serializer.validated_data["credential"], google_requests.Request(), client_id
        )
    except ValueError:
        return Response({"detail": "Invalid Google credential."}, status=status.HTTP_401_UNAUTHORIZED)

    email = (claims.get("email") or "").strip().lower()
    if not email or not claims.get("email_verified"):
        return Response(
            {"detail": "Your Google account has no verified email address."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    with transaction.atomic():
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            user = User(
                username=email,
                email=email,
                first_name=claims.get("given_name", "")[:150],
                last_name=claims.get("family_name", "")[:150],
            )
            user.set_unusable_password()
            user.save()
            profile = get_profile(user)
            profile.auth_provider = UserProfile.AuthProvider.GOOGLE
        else:
            profile = get_profile(user)
            if profile.auth_provider == UserProfile.AuthProvider.EMAIL_LINK:
                # Finishing an account an emailed sign-in link created.
                profile.auth_provider = UserProfile.AuthProvider.GOOGLE
                user.first_name = user.first_name or claims.get("given_name", "")[:150]
                user.last_name = user.last_name or claims.get("family_name", "")[:150]
                user.save(update_fields=["first_name", "last_name"])
        # Google has proven the user controls this address.
        profile.email_verified = True
        profile.save()

    if not user.is_active:
        return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)
    return _login_response(user)


@api_view(["POST"])
@authentication_classes(PUBLIC)
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def magic_link_login(request):
    """Sign in with a one-time emailed link (accounts.magic_links). Owners
    reviewing data requests arrive this way.

    Only people with a finished account (a password, or Google) are signed
    in; the link is then used up. Anyone else gets
    {"needs_account": true, "email", "first_name", "last_name", "next",
    "purpose"} and
    the link stays usable for POST auth/magic-link/register (or they sign up
    with Google for that address)."""
    try:
        link = check_link(request.data.get("token", ""))
    except MagicLinkError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email__iexact=link.email).first()
    if user is None or not has_finished_account(user):
        return Response({
            "needs_account": True,
            "email": link.email,
            "first_name": user.first_name if user else "",
            "last_name": user.last_name if user else "",
            "next": link.next_path,
            "purpose": link.purpose,
        })
    if not user.is_active:
        return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)

    with transaction.atomic():
        try:
            consume_link(request.data["token"])
        except MagicLinkError as exc:  # used up by a concurrent request
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        # The link was delivered to this address, so they control it.
        profile = get_profile(user)
        profile.email_verified = True
        profile.save()

    response = _login_response(user)
    response.data["next"] = link.next_path
    response.data["purpose"] = link.purpose
    return response


@api_view(["POST"])
@authentication_classes(PUBLIC)
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def magic_link_register(request):
    """Create the account for an emailed sign-in link's address (name +
    password), then sign in. The email is the one the link was sent to, and
    is verified by it. Also finishes an account the old link flow created
    without a password."""
    serializer = MagicLinkRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        link = check_link(data["token"])
    except MagicLinkError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    existing = User.objects.filter(email__iexact=link.email).first()
    if existing is not None and has_finished_account(existing):
        return Response(
            {"detail": "An account with this email already exists. Log in instead."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if existing is not None and not existing.is_active:
        return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)
    serializer.validate_password_for(link.email)

    with transaction.atomic():
        try:
            consume_link(data["token"])
        except MagicLinkError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        user = existing or User(username=link.email, email=link.email)
        user.first_name = data["first_name"]
        user.last_name = data["last_name"]
        user.set_password(data["password"])
        user.save()
        profile = get_profile(user)
        profile.auth_provider = UserProfile.AuthProvider.PASSWORD
        profile.email_verified = True
        for field in ("affiliation", "country"):
            if data.get(field):
                setattr(profile, field, data[field])
        profile.save()

    response = _login_response(user, status.HTTP_201_CREATED)
    response.data["next"] = link.next_path
    response.data["purpose"] = link.purpose
    return response


@api_view(["GET", "PATCH"])
@authentication_classes(JWT_ONLY)
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    if request.method == "PATCH":
        serializer = ProfileUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        for field in ("first_name", "last_name"):
            if field in data:
                setattr(user, field, data[field])
        user.save()
        profile = get_profile(user)
        for field in ("affiliation", "country"):
            if field in data:
                setattr(profile, field, data[field])
        profile.save()
    return Response(me_payload(user))


@api_view(["POST"])
@authentication_classes(PUBLIC)
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def verify_email(request):
    user = _user_from_uid(request.data.get("uid", ""))
    if user is None or not email_verification_token.check_token(user, request.data.get("token", "")):
        return Response(
            {"detail": "This verification link is invalid or has expired."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    profile = get_profile(user)
    if not profile.email_verified:
        profile.email_verified = True
        profile.save(update_fields=["email_verified", "updated_at"])
    return Response({"detail": "Email verified.", "email": user.email})


@api_view(["POST"])
@authentication_classes(JWT_ONLY)
@permission_classes([IsAuthenticated])
@throttle_classes([AuthThrottle])
def resend_verification(request):
    if get_profile(request.user).email_verified:
        return Response({"detail": "Your email is already verified."})
    _send_verification_safely(request.user)
    return Response({"detail": "Verification email sent."})


@api_view(["POST"])
@authentication_classes(JWT_ONLY)
@permission_classes([IsAuthenticated])
def admin_session(request):
    """Single sign-on into the Django admin for staff already logged in to the
    SPA: exchange the JWT for a Django session cookie, so opening /admin/
    doesn't ask for the password again.

    Only reachable with a bearer token (never a cookie), so it can't be
    triggered cross-site. api.auth_views.logout ends the session again.
    """
    user = request.user
    if not (user.is_active and user.is_staff):
        return Response(
            {"detail": "Your account doesn't have access to the admin."},
            status=status.HTTP_403_FORBIDDEN,
        )
    django_login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
    return Response({"detail": "Admin session started."})


@api_view(["POST"])
@authentication_classes(JWT_ONLY)
@permission_classes([IsAuthenticated])
def change_password(request):
    """Set a first password (Google-only accounts: no current password
    needed - the Google-issued JWT already proves who they are) or change an
    existing one (current password required)."""
    user = request.user
    serializer = PasswordChangeSerializer(data=request.data, context={"user": user})
    serializer.is_valid(raise_exception=True)
    user.set_password(serializer.validated_data["new_password"])
    user.save(update_fields=["password"])
    return Response(me_payload(user))


PASSWORD_RESET_SENT = (
    "If an account exists for that email, we've sent a link to reset its password."
)


@api_view(["POST"])
@authentication_classes(PUBLIC)
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def password_reset_request(request):
    """Email a reset link. Always answers the same way so it can't be used to
    discover which emails have accounts. Also how a Google-only user sets a
    first password without logging in."""
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = User.objects.filter(
        email__iexact=serializer.validated_data["email"].strip(), is_active=True
    ).first()
    if user is not None:
        try:
            send_password_reset_email(user)
        except Exception:  # noqa: BLE001 - same response either way
            logger.exception("Failed to send password reset email to user %s", user.pk)
    return Response({"detail": PASSWORD_RESET_SENT})


@api_view(["POST"])
@authentication_classes(PUBLIC)
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def password_reset_confirm(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    user = _user_from_uid(data["uid"])
    if user is None or not user.is_active or not default_token_generator.check_token(user, data["token"]):
        return Response(
            {"detail": "This password reset link is invalid or has expired. Please request a new one."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        validate_password(data["new_password"], user=user)
    except DjangoValidationError as exc:
        return Response({"new_password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        user.set_password(data["new_password"])
        user.save(update_fields=["password"])
        # Following the emailed link proves they control the address.
        profile = get_profile(user)
        if not profile.email_verified:
            profile.email_verified = True
            profile.save(update_fields=["email_verified", "updated_at"])
    return Response({"detail": "Your password has been set. You can now log in.", "email": user.email})
