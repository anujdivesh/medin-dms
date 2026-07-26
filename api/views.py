from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import (
    Contact,
    CoordinateReferenceSystem,
    Country,
    Keyword,
    MetadataRecord,
    MetadataTemplate,
    Project,
    Publisher,
    SpatialRepresentationType,
    Topic,
)
from .serializers import (
    ContactSerializer,
    CoordinateReferenceSystemSerializer,
    CountrySerializer,
    FieldDefinitionSerializer,
    KeywordSerializer,
    MetadataRecordSerializer,
    MetadataTemplateSerializer,
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


# --- Controlled-vocabulary lookups behind the core metadata fields ---
# These populate the dropdowns on a record form, so they need to be listable.


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer


class CountryViewSet(viewsets.ModelViewSet):
    queryset = Country.objects.all()
    serializer_class = CountrySerializer


class CoordinateReferenceSystemViewSet(viewsets.ModelViewSet):
    queryset = CoordinateReferenceSystem.objects.all()
    serializer_class = CoordinateReferenceSystemSerializer


class PublisherViewSet(viewsets.ModelViewSet):
    queryset = Publisher.objects.all()
    serializer_class = PublisherSerializer


class TopicViewSet(viewsets.ModelViewSet):
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer


class KeywordViewSet(viewsets.ModelViewSet):
    queryset = Keyword.objects.all()
    serializer_class = KeywordSerializer


class SpatialRepresentationTypeViewSet(viewsets.ModelViewSet):
    queryset = SpatialRepresentationType.objects.all()
    serializer_class = SpatialRepresentationTypeSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    """Projects a template's `project` field can point at."""

    queryset = Project.objects.all()
    serializer_class = ProjectSerializer


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


class MetadataRecordViewSet(viewsets.ModelViewSet):
    """CRUD for filled-in metadata records."""

    queryset = MetadataRecord.objects.select_related(
        "template",
        "owner",
        "contact",
        "country",
        "coordinate_reference_system",
        "publisher",
        "topic",
        "spatial_representation_type",
    ).prefetch_related("keywords")
    serializer_class = MetadataRecordSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        template = self.request.query_params.get("template")
        status_ = self.request.query_params.get("status")
        if template:
            qs = qs.filter(template_id=template)
        if status_:
            qs = qs.filter(status=status_)
        return qs

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(owner=user)
