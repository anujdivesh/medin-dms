from rest_framework import serializers

from .models import CartItem, DataRequest, DataRequestItem


class RecordSummarySerializer(serializers.Serializer):
    """Just enough of a MetadataRecord to list it in a cart/request."""

    id = serializers.IntegerField()
    title = serializers.CharField()
    metadata_type = serializers.CharField(source="metadata_type.metadata_type_value", default=None)
    data_owner = serializers.CharField(source="data_owner.name", default=None)
    access_constraints = serializers.CharField()


class CartItemSerializer(serializers.ModelSerializer):
    record = RecordSummarySerializer(read_only=True)

    class Meta:
        model = CartItem
        fields = ["record", "added_at"]


class CartAddSerializer(serializers.Serializer):
    record_id = serializers.IntegerField()


class CartMergeSerializer(serializers.Serializer):
    record_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=True, max_length=500)


class LiveSharesMixin(serializers.Serializer):
    """`shares`: live download links delivering this item (shares app).
    Querysets should use shares.services.live_shares_prefetch()."""

    shares = serializers.SerializerMethodField()

    def get_shares(self, item):
        from shares.serializers import ItemShareSerializer  # shares imports datarequests

        live = getattr(item, "live_shares", None)
        if live is None:
            live = [s for s in item.shares.prefetch_related("files") if s.is_live]
        return ItemShareSerializer(live, many=True).data


class DataRequestItemSerializer(LiveSharesMixin, serializers.ModelSerializer):
    organisation = serializers.CharField(source="organisation.name", default=None)
    metadata_type = serializers.CharField(source="record.metadata_type.metadata_type_value", default=None)

    class Meta:
        model = DataRequestItem
        fields = [
            "id", "record", "record_title", "metadata_type", "organisation",
            "status", "decided_at", "decision_note", "shares",
        ]


class DataRequestSerializer(serializers.ModelSerializer):
    items = DataRequestItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(source="items.count", read_only=True)

    class Meta:
        model = DataRequest
        fields = [
            "id", "reference", "status", "purpose",
            "item_count", "items", "created_at", "updated_at",
        ]


class RequesterSerializer(serializers.Serializer):
    name = serializers.SerializerMethodField()
    email = serializers.EmailField()
    affiliation = serializers.CharField(source="profile.affiliation", default="")
    country = serializers.CharField(source="profile.country", default="")

    def get_name(self, user):
        return user.get_full_name().strip()


class OwnerRequestSummarySerializer(serializers.ModelSerializer):
    requester = RequesterSerializer(read_only=True)

    class Meta:
        model = DataRequest
        fields = ["id", "reference", "status", "purpose", "created_at", "requester"]


class OwnerRequestItemSerializer(LiveSharesMixin, serializers.ModelSerializer):
    """A request item as its data owner sees it (owner dashboard)."""

    organisation = serializers.CharField(source="organisation.name", default=None)
    request = OwnerRequestSummarySerializer(read_only=True)
    decided_by = serializers.EmailField(source="decided_by.email", default=None)
    upload_request = serializers.SerializerMethodField()

    class Meta:
        model = DataRequestItem
        fields = [
            "id", "record", "record_title", "organisation", "status",
            "decision_note", "decided_at", "decided_by", "request", "shares", "upload_request",
        ]

    def get_upload_request(self, item):
        """The open "please upload" request for this item, if any. Querysets
        should prefetch it as `open_upload_requests`."""
        open_requests = getattr(item, "open_upload_requests", None)
        if open_requests is None:
            open_requests = list(item.upload_requests.filter(status="open"))
        if not open_requests:
            return None
        upload_request = open_requests[0]
        return {
            "id": upload_request.id,
            "email": upload_request.email,
            "message": upload_request.message,
            "created_at": serializers.DateTimeField().to_representation(upload_request.created_at),
        }


class UploadRequestInputSerializer(serializers.Serializer):
    """Ask someone else (any email) to upload the data (shares.UploadRequest)."""

    email = serializers.EmailField()
    message = serializers.CharField(max_length=5000, required=False, allow_blank=True)


class DecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approved", "declined"])
    note = serializers.CharField(max_length=5000, required=False, allow_blank=True)
    # Approving only: also ask this person to upload the data.
    upload_request = UploadRequestInputSerializer(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs.get("upload_request") and attrs["decision"] != "approved":
            raise serializers.ValidationError({"upload_request": ["Only an approved dataset can be uploaded."]})
        return attrs


class DataRequestCreateSerializer(serializers.Serializer):
    # Required and non-blank (DRF trims whitespace, so "   " is rejected too).
    purpose = serializers.CharField(max_length=5000)
    record_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=False, max_length=500,
        help_text="Records to request. Omit to request everything in the server cart.",
    )
