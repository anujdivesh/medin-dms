from rest_framework import serializers

from .models import (
    Contact,
    CoordinateReferenceSystem,
    Country,
    FieldDefinition,
    Keyword,
    MetadataRecord,
    MetadataTemplate,
    Project,
    Publisher,
    SpatialRepresentationType,
    Topic,
    validate_record_data,
)


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "project_name", "project_code", "comments"]


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = ["id", "firstname", "lastname", "email", "position", "organization"]


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
        ]


class CoordinateReferenceSystemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoordinateReferenceSystem
        fields = ["id", "crs_value", "crs_description"]


class PublisherSerializer(serializers.ModelSerializer):
    class Meta:
        model = Publisher
        fields = ["id", "publisher_value", "website", "email"]


class TopicSerializer(serializers.ModelSerializer):
    topic_id = serializers.IntegerField(source="id", read_only=True)

    class Meta:
        model = Topic
        fields = ["id", "topic_id", "topic_value"]


class KeywordSerializer(serializers.ModelSerializer):
    keyword_id = serializers.IntegerField(source="id", read_only=True)

    class Meta:
        model = Keyword
        fields = ["id", "keyword_id", "keyword_value"]


class SpatialRepresentationTypeSerializer(serializers.ModelSerializer):
    spatial_representation_type_id = serializers.IntegerField(
        source="id", read_only=True
    )

    class Meta:
        model = SpatialRepresentationType
        fields = [
            "id",
            "spatial_representation_type_id",
            "spatial_representation_type_value",
        ]


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
            "spatial_representation_type",
            "spatial_representation_type_detail",
            "data",
            "status",
            "owner",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["owner", "created_at", "updated_at"]

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
