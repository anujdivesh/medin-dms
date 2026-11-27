from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import MagicLink, UserProfile


@admin.register(MagicLink)
class MagicLinkAdmin(admin.ModelAdmin):
    """Audit trail of emailed sign-in links (tokens themselves aren't stored)."""

    list_display = ["email", "purpose", "created_at", "expires_at", "used_at"]
    list_filter = ["purpose", "used_at"]
    search_fields = ["email"]
    readonly_fields = ["email", "purpose", "next_path", "created_at", "expires_at", "used_at"]
    exclude = ["token_hash"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

User = get_user_model()


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    fk_name = "user"
    fields = ["email_verified", "auth_provider", "affiliation", "country"]


admin.site.unregister(User)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["username", "email", "first_name", "last_name", "is_staff", "email_verified"]

    @admin.display(boolean=True, description="Email verified")
    def email_verified(self, obj):
        profile = getattr(obj, "profile", None)
        return bool(profile and profile.email_verified)

    def get_inlines(self, request, obj):
        # Only when editing: on the add form the post_save signal already
        # creates the profile, and the inline would try to create a second.
        return [UserProfileInline] if obj else []

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("profile")
