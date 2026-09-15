from rest_framework import serializers

from .models import (
    Contact,
    CoordinateReferenceSystem,
    Country,
    DataType,
    FieldDefinition,
    Keyword,
    MetadataRecord,
    MetadataTemplate,
    MetadataType,
    Project,
    Publisher,
    SpatialRepresentationType,
    Topic,
    validate_record_data,
)


# Read-only aliases below (e.g. `value = ...source="publisher_value"`) exist
# solely so the frontend's existing lookup admin pages (src/pages/*.jsx),
# which render legacy's field names, keep working unmodified when pointed at
# Django - see LegacyListEnvelopeMixin in legacy_compat.py for the matching
# list()-response-shape half of this compatibility layer.


class ProjectSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(source="comments", read_only=True)

    class Meta:
        model = Project
        fields = ["id", "project_name", "project_code", "comments", "comment", "created_at", "updated_at"]


class ContactSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source="firstname", read_only=True)
    last_name = serializers.CharField(source="lastname", read_only=True)

    class Meta:
        model = Contact
        fields = [
            "id", "firstname", "lastname", "first_name", "last_name",
            "email", "position", "organization", "created_at", "updated_at",
        ]


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = [
            "id",
            "short_name",
            "long_name",
            "west_bound_longitude",
            "east_bound_longitude",
            "south_bound_latitude",
            "north_bound_latitude",
            "crs_name",
            "created_at",
            "updated_at",
        ]


class CoordinateReferenceSystemSerializer(serializers.ModelSerializer):
    value = serializers.CharField(source="crs_value", read_only=True)
    description = serializers.CharField(source="crs_description", read_only=True)

    class Meta:
        model = CoordinateReferenceSystem
        fields = ["id", "crs_value", "crs_description", "value", "description", "created_at", "updated_at"]


class PublisherSerializer(serializers.ModelSerializer):
    value = serializers.CharField(source="publisher_value", read_only=True)

    class Meta:
        model = Publisher
        fields = ["id", "publisher_value", "value", "website", "email", "created_at", "updated_at"]


class TopicSerializer(serializers.ModelSerializer):
    topic_id = serializers.IntegerField(source="id", read_only=True)
    value = serializers.CharField(source="topic_value", read_only=True)

    class Meta:
        model = Topic
        fields = ["id", "topic_id", "topic_value", "value", "created_at", "updated_at"]


class KeywordSerializer(serializers.ModelSerializer):
    keyword_id = serializers.IntegerField(source="id", read_only=True)
    value = serializers.CharField(source="keyword_value", read_only=True)

    class Meta:
        model = Keyword
        fields = ["id", "keyword_id", "keyword_value", "value", "created_at", "updated_at"]


class SpatialRepresentationTypeSerializer(serializers.ModelSerializer):
    spatial_representation_type_id = serializers.IntegerField(
        source="id", read_only=True
    )
    value = serializers.CharField(source="spatial_representation_type_value", read_only=True)

    class Meta:
        model = SpatialRepresentationType
        fields = [
            "id",
            "spatial_representation_type_id",
            "spatial_representation_type_value",
            "value",
            "created_at",
            "updated_at",
        ]


class DataTypeSerializer(serializers.ModelSerializer):
    data_type_id = serializers.IntegerField(source="id", read_only=True)
    value = serializers.CharField(source="data_type_value", read_only=True)

    class Meta:
        model = DataType
        fields = ["id", "data_type_id", "data_type_value", "value", "created_at", "updated_at"]


class MetadataTypeSerializer(serializers.ModelSerializer):
    metadata_type_id = serializers.IntegerField(source="id", read_only=True)
    value = serializers.CharField(source="metadata_type_value", read_only=True)

    class Meta:
        model = MetadataType
        fields = ["id", "metadata_type_id", "metadata_type_value", "value", "created_at", "updated_at"]


class FieldDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldDefinition
        fields = [
            "id",
            "name",
            "label",
            "help_text",
            "field_type",
            "required",
            "choices",
            "default",
            "order",
        ]


class MetadataTemplateSerializer(serializers.ModelSerializer):
    """Template with its field definitions nested for read and write."""

    fields = FieldDefinitionSerializer(many=True)

    class Meta:
        model = MetadataTemplate
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "version",
            "is_active",
            "fields",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["slug", "created_at", "updated_at"]

    def create(self, validated_data):
        fields_data = validated_data.pop("fields", [])
        template = MetadataTemplate.objects.create(**validated_data)
        FieldDefinition.objects.bulk_create(
            [FieldDefinition(template=template, **f) for f in fields_data]
        )
        return template

    def update(self, instance, validated_data):
        fields_data = validated_data.pop("fields", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Replace the field set wholesale when provided.
        if fields_data is not None:
            instance.fields.all().delete()
            FieldDefinition.objects.bulk_create(
                [FieldDefinition(template=instance, **f) for f in fields_data]
            )
        return instance


class MetadataRecordSerializer(serializers.ModelSerializer):
    """Records are written by lookup id (`contact`, `country`, …) and read back
    with the full lookup objects nested alongside (`contact_detail`, …)."""

    template_name = serializers.CharField(source="template.name", read_only=True)

    contact_detail = ContactSerializer(source="contact", read_only=True)
    country_detail = CountrySerializer(source="country", read_only=True)
    coordinate_reference_system_detail = CoordinateReferenceSystemSerializer(
        source="coordinate_reference_system", read_only=True
    )
    publisher_detail = PublisherSerializer(source="publisher", read_only=True)
    topic_detail = TopicSerializer(source="topic", read_only=True)
    keywords_detail = KeywordSerializer(source="keywords", many=True, read_only=True)
    spatial_representation_type_detail = SpatialRepresentationTypeSerializer(
        source="spatial_representation_type", read_only=True
    )
    data_type_detail = DataTypeSerializer(source="data_type", read_only=True)
    project_detail = ProjectSerializer(source="project", read_only=True)
    metadata_type_detail = MetadataTypeSerializer(source="metadata_type", read_only=True)

    # Denormalised convenience fields, all sourced from the related country.
    country_short_name = serializers.CharField(source="country.short_name", read_only=True)
    country_long_name = serializers.CharField(source="country.long_name", read_only=True)
    west_bound_longitude = serializers.DecimalField(
        max_digits=9, decimal_places=5, read_only=True
    )
    east_bound_longitude = serializers.DecimalField(
        max_digits=9, decimal_places=5, read_only=True
    )
    south_bound_latitude = serializers.DecimalField(
        max_digits=9, decimal_places=5, read_only=True
    )
    north_bound_latitude = serializers.DecimalField(
        max_digits=9, decimal_places=5, read_only=True
    )
    crs_name = serializers.CharField(read_only=True)
    crs_value = serializers.CharField(
        source="coordinate_reference_system.crs_value", read_only=True
    )
    crs_description = serializers.CharField(
        source="coordinate_reference_system.crs_description", read_only=True
    )

    class Meta:
        model = MetadataRecord
        fields = [
            "id",
            "template",
            "template_name",
            "title",
            "abstract",
            "contact",
            "contact_detail",
            "language",
            "version",
            "country",
            "country_detail",
            "country_short_name",
            "country_long_name",
            "west_bound_longitude",
            "east_bound_longitude",
            "south_bound_latitude",
            "north_bound_latitude",
            "boundary_type",
            "west_bounding_longitude",
            "east_bounding_longitude",
            "south_bounding_latitude",
            "north_bounding_latitude",
            "crs_name",
            "coordinate_reference_system",
            "coordinate_reference_system_detail",
            "crs_value",
            "crs_description",
            "publisher",
            "publisher_detail",
            "topic",
            "topic_detail",
            "keywords",
            "keywords_detail",
            "access_constraints",
            "license",
            "temporal_coverage_from",
            "temporal_coverage_to",
            "metadata_standard_name",
            "metadata_standard_version",
            "metadata_standard_language",
            "update_frequency",
            "lineage",
            "data_format",
            "spatial_representation_type",
            "spatial_representation_type_detail",
            "data_type",
            "data_type_detail",
            "project",
            "project_detail",
            "metadata_type",
            "metadata_type_detail",
            "comment",
            "link_to_data",
            "acknowledgement",
            "history",
            "fundings",
            "references",
            "acquisition_report_file",
            "project_report_link",
            "factsheet",
            "attribute",
            "additional_information",
            "additional_information_file",
            "file",
            "file_description",
            "data",
            "status",
            "owner",
            "reviewed_by",
            "reviewed_at",
            "action_history",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "owner",
            "status",
            "reviewed_by",
            "reviewed_at",
            "action_history",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        """Validate `data` against the (possibly new) template's fields, and the
        temporal coverage range."""
        template = attrs.get("template") or getattr(self.instance, "template", None)
        data = attrs.get("data", getattr(self.instance, "data", {}))
        if template is not None:
            errors = validate_record_data(template, data)
            if errors:
                raise serializers.ValidationError({"data": errors})

        start = attrs.get(
            "temporal_coverage_from",
            getattr(self.instance, "temporal_coverage_from", None),
        )
        end = attrs.get(
            "temporal_coverage_to", getattr(self.instance, "temporal_coverage_to", None)
        )
        if start and end and end < start:
            raise serializers.ValidationError(
                {"temporal_coverage_to": "Must be on or after 'temporal_coverage_from'."}
            )
        return attrs
