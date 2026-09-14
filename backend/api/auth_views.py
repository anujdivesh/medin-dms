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
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


def _user_data(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "created_at": user.date_joined,
        "updated_at": user.date_joined,
        "last_login": user.last_login,
    }


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    identifier = request.data.get("username") or request.POST.get("username")
    password = request.data.get("password") or request.POST.get("password")

    # Legacy accepts either a username or an email in this field - Django's
    # default ModelBackend only matches `username`, so resolve it ourselves.
    user = None
    if identifier:
        account = User.objects.filter(username=identifier).first() or User.objects.filter(email__iexact=identifier).first()
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
@permission_classes([IsAuthenticated])
def logout(request):
    return Response({"status": "success", "msg": "Logout successful"})
