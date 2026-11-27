from django.contrib import admin, messages
from django.utils.html import format_html

from . import services
from .models import FileShare, SharedFile, UploadRequest


class SharedFileInline(admin.TabularInline):
    model = SharedFile
    extra = 0
    can_delete = False
    fields = ["original_name", "size_display", "progress", "download_count", "completed_at"]
    readonly_fields = fields

    @admin.display(description="Size")
    def size_display(self, obj):
        return services.human_size(obj.size)

    @admin.display(description="Uploaded")
    def progress(self, obj):
        return f"{obj.offset * 100 // obj.size if obj.size else 100}%"

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(FileShare)
class FileShareAdmin(admin.ModelAdmin):
    """Read-only overview; shares are created from the site (File shares /
    the owner review page). Revoke deletes the files immediately."""

    list_display = ["title", "status", "created_by", "request_item", "published_at", "expires_at", "download_count"]
    list_filter = ["status"]
    search_fields = ["title", "token", "recipient_email", "created_by__email", "request_item__request__reference"]
    readonly_fields = [
        "title", "message", "status", "link", "created_by", "request_item", "recipient_email",
        "created_at", "published_at", "expires_at", "files_deleted_at", "download_count", "last_downloaded_at",
    ]
    exclude = ["token"]
    inlines = [SharedFileInline]
    actions = ["revoke_shares"]

    @admin.display(description="Link")
    def link(self, obj):
        if obj.status == FileShare.Status.DRAFT:
            return "- (still uploading; finish it on the File shares page)"
        return format_html('<a href="{0}" target="_blank" rel="noreferrer">{0}</a>', obj.url)

    @admin.action(description="Revoke (delete files now)")
    def revoke_shares(self, request, queryset):
        for share in queryset:
            services.revoke(share)
        self.message_user(request, f"Revoked {queryset.count()} share(s).", messages.SUCCESS)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(UploadRequest)
class UploadRequestAdmin(admin.ModelAdmin):
    """Read-only: owners ask people to upload from the Review requests page."""

    list_display = ["request_item", "email", "status", "requested_by", "created_at", "completed_at"]
    list_filter = ["status"]
    search_fields = ["email", "request_item__request__reference", "request_item__record_title"]
    readonly_fields = [
        "request_item", "email", "message", "status", "requested_by",
        "created_at", "completed_at", "completed_by", "share",
    ]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
