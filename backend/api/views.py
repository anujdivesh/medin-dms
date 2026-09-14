from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from django.shortcuts import get_object_or_404

from .legacy_compat import LegacyListEnvelopeMixin, LegacyMetadataListMixin
from .models import (
    Contact,
    CoordinateReferenceSystem,
    Country,
    DataType,
    Keyword,
    MetadataRecord,
    MetadataTemplate,
    MetadataType,
    Project,
    Publisher,
    SpatialRepresentationType,
    Topic,
)
from .serializers import (
    ContactSerializer,
    CoordinateReferenceSystemSerializer,
    CountrySerializer,
    DataTypeSerializer,
    FieldDefinitionSerializer,
    KeywordSerializer,
    MetadataRecordSerializer,
    MetadataTemplateSerializer,
    MetadataTypeSerializer,
    ProjectSerializer,
    PublisherSerializer,
    SpatialRepresentationTypeSerializer,
    TopicSerializer,
)


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Simple health-check endpoint."""
    return Response({"status": "ok"})


def acquisition_report(request, filename):
    """`/downloads/acquisition_reports/{filename}` - migrated as-is from the
    legacy backend's static route, since existing `acquisition_report_link`
    values already point at this path. `Path(filename).name` strips any
    directory components so a `../` in the URL can't escape reports_dir."""
    reports_dir = Path(settings.MEDIA_ROOT) / "acquisition_reports"
    file_path = reports_dir / Path(filename).name
    if not file_path.is_file():
        raise Http404(f"File not found: {filename}")
    return FileResponse(open(file_path, "rb"), filename=file_path.name)


# --- Controlled-vocabulary lookups behind the core metadata fields ---
# These populate the dropdowns on a record form, so they need to be listable.


class ContactViewSet(LegacyListEnvelopeMixin, viewsets.ModelViewSet):
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer
    legacy_data_key = "contacts"


class CountryViewSet(LegacyListEnvelopeMixin, viewsets.ModelViewSet):
    queryset = Country.objects.all()
    serializer_class = CountrySerializer
    legacy_data_key = "countries"


class CoordinateReferenceSystemViewSet(LegacyListEnvelopeMixin, viewsets.ModelViewSet):
    queryset = CoordinateReferenceSystem.objects.all()
    serializer_class = CoordinateReferenceSystemSerializer
    legacy_data_key = "coordinate_reference_systems"


class PublisherViewSet(LegacyListEnvelopeMixin, viewsets.ModelViewSet):
    queryset = Publisher.objects.all()
    serializer_class = PublisherSerializer
    legacy_data_key = "publishers"


class TopicViewSet(LegacyListEnvelopeMixin, viewsets.ModelViewSet):
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer
    legacy_data_key = "topics"


class KeywordViewSet(LegacyListEnvelopeMixin, viewsets.ModelViewSet):
    queryset = Keyword.objects.all()
    serializer_class = KeywordSerializer
    legacy_data_key = "keywords"


class SpatialRepresentationTypeViewSet(viewsets.ModelViewSet):
    # Not used by any current frontend page (SPATIAL_REPRESENTATION_TYPES is
    # defined in apiEndpoints.js but never called) - no compat shim needed.
    queryset = SpatialRepresentationType.objects.all()
    serializer_class = SpatialRepresentationTypeSerializer


class DataTypeViewSet(LegacyListEnvelopeMixin, viewsets.ModelViewSet):
    queryset = DataType.objects.all()
    serializer_class = DataTypeSerializer
    legacy_data_key = "data_types"


class MetadataTypeViewSet(viewsets.ModelViewSet):
    # New field, no legacy precedent/frontend page to match - plain DRF shape.
    queryset = MetadataType.objects.all()
    serializer_class = MetadataTypeSerializer


class ProjectViewSet(LegacyListEnvelopeMixin, viewsets.ModelViewSet):
    """Projects a template's `project` field can point at."""

    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    legacy_data_key = "projects"


class MetadataTemplateViewSet(viewsets.ModelViewSet):
    """CRUD for templates and their field definitions."""

    queryset = MetadataTemplate.objects.prefetch_related("fields").all()
    serializer_class = MetadataTemplateSerializer

    @action(detail=True, methods=["get"])
    def schema(self, request, pk=None):
        """Return just the ordered field definitions — useful for form builders."""
        template = self.get_object()
        serializer = FieldDefinitionSerializer(template.fields.all(), many=True)
        return Response(serializer.data)


class MetadataRecordViewSet(LegacyMetadataListMixin, viewsets.ModelViewSet):
    """CRUD for filled-in metadata records.

    No approval workflow - create/update require the standard Django model
    permissions (`api.add_metadatarecord` etc.); delete requires the
    separate `api.approve_metadatarecord` permission — mirrors the legacy
    backend's approver-only delete gate.
    """

    queryset = MetadataRecord.objects.select_related(
        "template",
        "owner",
        "reviewed_by",
        "contact",
        "country",
        "coordinate_reference_system",
        "publisher",
        "topic",
        "spatial_representation_type",
        "data_type",
    ).prefetch_related("keywords")
    serializer_class = MetadataRecordSerializer
    permission_classes = [permissions.DjangoModelPermissionsOrAnonReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        template = self.request.query_params.get("template")
        status_ = self.request.query_params.get("status")
        if template:
            qs = qs.filter(template_id=template)
        if status_:
            qs = qs.filter(status=status_)
        return qs

    def _log_action(self, record, action_name, user, comments=""):
        record.action_history.append({
            "action": action_name,
            "actioned_by": user.username if user and user.is_authenticated else None,
            "actioned_at": timezone.now().isoformat(),
            "comments": comments,
        })

    def get_permissions(self):
        # destroy checks `approve_metadatarecord` itself (matching legacy/the
        # frontend's approver-only delete gate) instead of the generic
        # `delete_metadatarecord` model permission the class default implies.
        if self.action == "destroy":
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def perform_create(self, serializer):
        # No approval workflow - a record is live as soon as it's created,
        # same as the admin (MetadataRecordAdmin.save_model).
        user = self.request.user if self.request.user.is_authenticated else None
        record = serializer.save(owner=user, status=MetadataRecord.Status.PUBLISHED)
        self._log_action(record, "create", user)
        record.save()

    def perform_update(self, serializer):
        record = serializer.save()
        user = self.request.user if self.request.user.is_authenticated else None
        self._log_action(record, "edit", user)
        record.save()

    def destroy(self, request, *args, **kwargs):
        if not request.user.has_perm("api.approve_metadatarecord"):
            return Response(
                {"status": "error", "msg": "You do not have permission to delete records."},
                status=403,
            )
        record = self.get_object()
        # Legacy's delete is a soft-delete (status -> inactive), not a real
        # row deletion - keeps history/references intact.
        record.status = MetadataRecord.Status.ARCHIVED
        self._log_action(record, "delete", request.user)
        record.save()
        return Response({"status": "success", "msg": "Metadata deleted successfully"})


@api_view(["GET"])
def metadata_history(request, pk):
    """`/metadata/history/{id}` - legacy's own path shape (the id comes
    after the static "history" segment), which doesn't fit a DRF router
    detail-action, hence a plain view wired directly in urls.py."""
    record = get_object_or_404(MetadataRecord, pk=pk)
    history = record.action_history if isinstance(record.action_history, list) else []
    items = [
        {
            "action": entry.get("action"),
            "actioned_by": entry.get("actioned_by"),
            "actioned_by_name": entry.get("actioned_by"),
            "action_date": entry.get("actioned_at"),
            "comments": entry.get("comments", ""),
        }
        for entry in history
    ]
    return Response({"status": "success", "msg": "History retrieved successfully", "data": items})
