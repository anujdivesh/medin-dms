from rest_framework import serializers

from datarequests.models import DataRequestItem

from .models import FileShare, SharedFile, UploadRequest


class SharedFileSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="original_name")
    complete = serializers.BooleanField(source="is_complete")

    class Meta:
        model = SharedFile
        fields = ["id", "name", "size", "offset", "complete", "download_count"]


class FileShareSerializer(serializers.ModelSerializer):
    """A share as its creator (or SPC staff) sees it."""

    status = serializers.CharField(source="effective_status")
    url = serializers.SerializerMethodField()
    files = SharedFileSerializer(many=True, read_only=True)
    total_size = serializers.SerializerMethodField()
    created_by = serializers.EmailField(source="created_by.email", default=None)
    request_reference = serializers.CharField(source="request_item.request.reference", default=None)
    request_id = serializers.IntegerField(source="request_item.request_id", default=None)
    record_title = serializers.CharField(source="request_item.record_title", default=None)

    class Meta:
        model = FileShare
        fields = [
            "id", "title", "message", "status", "url", "files", "total_size",
            "request_item", "request_id", "request_reference", "record_title", "recipient_email",
            "created_by", "created_at", "published_at", "expires_at",
            "download_count", "last_downloaded_at",
        ]

    def get_url(self, share):
        return share.url if share.status != FileShare.Status.DRAFT else None

    def get_total_size(self, share):
        return sum(f.size for f in share.files.all())


class FileShareCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    message = serializers.CharField(max_length=5000, required=False, allow_blank=True)
    request_item = serializers.PrimaryKeyRelatedField(
        queryset=DataRequestItem.objects.select_related("request"), required=False, allow_null=True
    )
    recipient_email = serializers.EmailField(required=False, allow_blank=True)


class PublicShareSerializer(serializers.ModelSerializer):
    """What anyone with the link sees."""

    files = serializers.SerializerMethodField()
    total_size = serializers.SerializerMethodField()

    class Meta:
        model = FileShare
        fields = ["title", "message", "published_at", "expires_at", "files", "total_size"]

    def get_files(self, share):
        return [{"id": f.id, "name": f.original_name, "size": f.size} for f in share.files.all()]

    def get_total_size(self, share):
        return sum(f.size for f in share.files.all())


class ItemShareSerializer(serializers.ModelSerializer):
    """A live share on a request item (requester's and owner's views)."""

    url = serializers.CharField()
    total_size = serializers.SerializerMethodField()
    file_count = serializers.SerializerMethodField()

    class Meta:
        model = FileShare
        fields = ["id", "title", "url", "expires_at", "total_size", "file_count", "download_count"]

    def get_total_size(self, share):
        return sum(f.size for f in share.files.all())

    def get_file_count(self, share):
        return len(share.files.all())


class UploadRequestSerializer(serializers.ModelSerializer):
    """An upload request as the person asked to upload sees it."""

    item = serializers.SerializerMethodField()
    request = serializers.SerializerMethodField()
    requester = serializers.SerializerMethodField()
    requested_by = serializers.SerializerMethodField()
    share_url = serializers.SerializerMethodField()

    class Meta:
        model = UploadRequest
        fields = [
            "id", "status", "message", "created_at", "completed_at",
            "item", "request", "requester", "requested_by", "share_url",
        ]

    def get_item(self, obj):
        item = obj.request_item
        return {"id": item.id, "record": item.record_id, "record_title": item.record_title}

    def get_request(self, obj):
        data_request = obj.request_item.request
        return {"id": data_request.id, "reference": data_request.reference, "purpose": data_request.purpose}

    def get_requester(self, obj):
        user = obj.request_item.request.requester
        profile = getattr(user, "profile", None)
        return {
            "name": user.get_full_name().strip() or user.email,
            "affiliation": getattr(profile, "affiliation", ""),
            "country": getattr(profile, "country", ""),
        }

    def get_requested_by(self, obj):
        user = obj.requested_by
        organisation = obj.request_item.organisation
        return {
            "name": (user.get_full_name().strip() or user.email) if user else None,
            "email": user.email if user else None,
            "organisation": organisation.name if organisation else None,
        }

    def get_share_url(self, obj):
        return obj.share.url if obj.share_id and obj.share.is_live else None
