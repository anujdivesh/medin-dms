"""Minimal JWT auth, matching the legacy backend's /auth/login, /auth/refresh
and /auth/logout request/response shapes closely enough that
frontend/src/lib/auth.js needs no changes.

Scope (deliberately minimal for this migration step): issues/refreshes JWTs
for Django's own User accounts. Legacy user accounts and their bcrypt
password hashes are NOT migrated here - that's a separate follow-up task.
Logout doesn't do server-side access-token revocation (legacy blacklists the
access token's jti in a DB table on every request; SimpleJWT's default
JWTAuthentication deliberately avoids a per-request DB lookup for
performance) - the frontend already discards its stored tokens on logout
regardless, which is sufficient for this step.
"""

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth import logout as django_logout
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.tokens import user_data as _user_data

User = get_user_model()

# Registration, Google sign-in, /auth/me and email verification live in the
# `accounts` app (accounts/views.py), sharing accounts.tokens with this login.


@api_view(["POST"])
@authentication_classes([])  # no session/CSRF - see accounts/views.py
@permission_classes([AllowAny])
def login(request):
    identifier = request.data.get("username") or request.POST.get("username")
    password = request.data.get("password") or request.POST.get("password")

    # Legacy accepts either a username or an email in this field - Django's
    # default ModelBackend only matches `username`, so resolve it ourselves.
    user = None
    if identifier:
        account = User.objects.filter(username=identifier).first() or User.objects.filter(email__iexact=identifier).first()
        if account and not account.has_usable_password():
            # Created via "Sign in with Google" and no password set yet -
            # point them at Google (or the reset link) instead of a generic
            # "wrong password". `code` lets the frontend show the Google button.
            return Response({
                "status": "error",
                "code": "google_account",
                "msg": "This account signs in with Google. Use “Sign in with Google”, "
                       "or set a password via “Forgot password?”.",
            })
        if account:
            user = authenticate(request, username=account.username, password=password)

    if user is None:
        return Response({"status": "error", "msg": "Incorrect username/email or password"})
    if not user.is_active:
        return Response({"status": "error", "msg": "User account is inactive"})

    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    refresh = RefreshToken.for_user(user)
    return Response({
        "status": "success",
        "msg": "Login successful",
        "data": {
            "access_token": str(refresh.access_token),
            "refresh_token": str(refresh),
            "token_type": "bearer",
            "user": _user_data(user),
        },
    })


@api_view(["POST"])
@authentication_classes([])  # no session/CSRF - see accounts/views.py
@permission_classes([AllowAny])
def refresh_token_view(request):
    token_str = request.query_params.get("refresh_token") or request.data.get("refresh_token")
    if not token_str:
        return Response({"status": "error", "msg": "Invalid refresh token"})

    try:
        refresh = RefreshToken(token_str)
        user = User.objects.get(pk=refresh["user_id"])
    except (TokenError, User.DoesNotExist, KeyError):
        return Response({"status": "error", "msg": "Invalid refresh token"})

    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    return Response({
        "status": "success",
        "msg": "Token refreshed successfully",
        "data": {
            "access_token": str(refresh.access_token),
            "token_type": "bearer",
            "last_login": user.last_login,
        },
    })


@api_view(["POST"])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def logout(request):
    # Also end the Django admin session the SPA may have opened via
    # /auth/admin-session, so logging out of the site logs out of the admin too.
    django_logout(request._request)
    return Response({"status": "success", "msg": "Logout successful"})
