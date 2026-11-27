from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import get_profile
from .roles import has_finished_account, owned_organisations, pending_upload_requests, user_roles
from .tokens import user_data

User = get_user_model()


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    affiliation = serializers.CharField(max_length=255, required=False, allow_blank=True)
    country = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists() or User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists. Log in instead "
                "(or use \"Sign in with Google\" if you registered that way)."
            )
        return value

    def validate(self, attrs):
        candidate = User(
            username=attrs["email"],
            email=attrs["email"],
            first_name=attrs["first_name"],
            last_name=attrs["last_name"],
        )
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["email"],
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
        )
        profile = get_profile(user)
        profile.affiliation = validated_data.get("affiliation", "")
        profile.country = validated_data.get("country", "")
        profile.save()
        return user


class MagicLinkRegisterSerializer(serializers.Serializer):
    """Create the account for the address an emailed sign-in link was sent
    to (the email comes from the link, not from the form)."""

    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    affiliation = serializers.CharField(max_length=255, required=False, allow_blank=True)
    country = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_password_for(self, email):
        """Run Django's password validators against the final user details.
        Called by the view once it knows the link's email."""
        attrs = self.validated_data
        candidate = User(
            username=email, email=email, first_name=attrs["first_name"], last_name=attrs["last_name"]
        )
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})


class GoogleLoginSerializer(serializers.Serializer):
    credential = serializers.CharField(help_text="Google Identity Services ID token (JWT).")


def _validated_new_password(password, user):
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({"new_password": list(exc.messages)})
    return password


class PasswordChangeSerializer(serializers.Serializer):
    """Set a first password (Google-only accounts) or change an existing one.
    Pass the user as context["user"]."""

    current_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, trim_whitespace=False
    )
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = self.context["user"]
        if user.has_usable_password():
            current = attrs.get("current_password") or ""
            if not current:
                raise serializers.ValidationError({"current_password": ["Enter your current password."]})
            if not user.check_password(current):
                raise serializers.ValidationError({"current_password": ["Your current password is incorrect."]})
        _validated_new_password(attrs["new_password"], user)
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)


class ProfileUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    affiliation = serializers.CharField(max_length=255, required=False, allow_blank=True)
    country = serializers.CharField(max_length=100, required=False, allow_blank=True)


def me_payload(user):
    """Everything the frontend needs to render the logged-in state."""
    profile = get_profile(user)
    owned = list(owned_organisations(user))
    owner_pending_count = 0
    if owned:
        from datarequests.models import DataRequestItem  # lazy: datarequests imports accounts

        owner_pending_count = DataRequestItem.objects.filter(
            organisation__in=owned, status=DataRequestItem.Status.PENDING
        ).count()
    return {
        **user_data(user),
        "profile": {
            "email_verified": profile.email_verified,
            "auth_provider": profile.auth_provider,
            # False for accounts created via Google that haven't set one yet.
            "has_password": user.has_usable_password(),
            # False for accounts made by an emailed sign-in link that never
            # set a password; they can't review requests until they do.
            "account_finished": has_finished_account(user),
            "affiliation": profile.affiliation,
            "country": profile.country,
        },
        "roles": user_roles(user),
        "owned_organisations": [{"id": org.id, "name": org.name} for org in owned],
        # Request items waiting for this user's decision (owner dashboard badge).
        "owner_pending_count": owner_pending_count,
        # Datasets an owner asked this user to upload ("Data to upload" badge).
        "upload_pending_count": pending_upload_requests(user).count(),
    }
