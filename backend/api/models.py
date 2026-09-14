from datetime import date, datetime
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class FieldType(models.TextChoices):
    """The kinds of fields a template can define."""

    TEXT = "text", "Text (single line)"
    TEXTAREA = "textarea", "Text (multi-line)"
    INTEGER = "integer", "Integer"
    DECIMAL = "decimal", "Decimal"
    BOOLEAN = "boolean", "Boolean (yes/no)"
    DATE = "date", "Date"
    DATETIME = "datetime", "Date & time"
    URL = "url", "URL"
    EMAIL = "email", "Email"
    SELECT = "select", "Select (one choice)"
    MULTISELECT = "multiselect", "Select (many choices)"
    FILE = "file", "File upload"
    IMAGE = "image", "Image upload"
    PROJECT = "project", "Project (lookup)"


class TimeStampedModel(models.Model):
    """Reusable created/updated timestamps."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class LegacyImportedModel(models.Model):
    """Mixin for models populated by the one-time legacy-DB ETL
    (api.management.commands.migrate_from_legacy). Storing the legacy row's
    id lets re-runs upsert by it instead of duplicating rows.
    """

    legacy_id = models.IntegerField(null=True, blank=True, unique=True, db_index=True)

    class Meta:
        abstract = True


class LegacyLookupTimestamps(models.Model):
    """created_at/updated_at for the lookup models the legacy frontend admin
    pages (src/pages/Contact.jsx etc.) render on every row - kept as its own
    mixin, not folded into LegacyImportedModel, because MetadataRecord
    already gets created_at/updated_at from TimeStampedModel and inheriting
    the same field name from two different abstract bases raises a field
    clash. Plain `default=timezone.now` (not auto_now/auto_now_add, which
    Django disallows combining with `default`) - `updated_at` won't
    auto-refresh on save, an acceptable simplification since these lookup
    rows are rarely edited after creation via the admin.
    """

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        abstract = True


class Contact(LegacyImportedModel, LegacyLookupTimestamps):
    """A person who can be contacted about a record."""

    firstname = models.CharField(max_length=150)
    lastname = models.CharField(max_length=150)
    email = models.EmailField()
    position = models.CharField(max_length=255, blank=True)
    organization = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["lastname", "firstname"]

    def __str__(self):
        return f"{self.firstname} {self.lastname}".strip()


class Country(LegacyImportedModel, LegacyLookupTimestamps):
    """A country plus the bounding box and CRS name that describe its extent."""

    short_name = models.CharField(max_length=10, unique=True, help_text="e.g. FJ")
    long_name = models.CharField(max_length=255, help_text="e.g. Fiji")
    west_bound_longitude = models.DecimalField(max_digits=9, decimal_places=5)
    east_bound_longitude = models.DecimalField(max_digits=9, decimal_places=5)
    south_bound_latitude = models.DecimalField(max_digits=9, decimal_places=5)
    north_bound_latitude = models.DecimalField(max_digits=9, decimal_places=5)
    crs_name = models.CharField(max_length=255, help_text="CRS the bounds are given in")

    class Meta:
        ordering = ["long_name"]
        verbose_name_plural = "countries"

    def __str__(self):
        return f"{self.long_name} ({self.short_name})"


class CoordinateReferenceSystem(LegacyImportedModel, LegacyLookupTimestamps):
    """A CRS a record's data is expressed in, e.g. EPSG:4326."""

    crs_value = models.CharField(max_length=100, unique=True)
    crs_description = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["crs_value"]
        verbose_name = "coordinate reference system"
        verbose_name_plural = "coordinate reference systems"

    def __str__(self):
        return self.crs_value


class Publisher(LegacyImportedModel, LegacyLookupTimestamps):
    """An organisation that publishes records."""

    publisher_value = models.CharField(max_length=255, unique=True)
    website = models.URLField(blank=True)
    email = models.EmailField(blank=True)

    class Meta:
        ordering = ["publisher_value"]

    def __str__(self):
        return self.publisher_value


class Topic(LegacyImportedModel, LegacyLookupTimestamps):
    """Controlled topic category (MEDIN / ISO topic category)."""

    topic_value = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ["topic_value"]

    def __str__(self):
        return self.topic_value


class DataType(LegacyImportedModel, LegacyLookupTimestamps):
    """Controlled data type category, e.g. LiDAR, Bathymetry."""

    data_type_value = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ["data_type_value"]
        verbose_name = "data type"
        verbose_name_plural = "data types"

    def __str__(self):
        return self.data_type_value


class MetadataType(LegacyLookupTimestamps):
    """Top-level category of metadata record, e.g. Oceanography, Drone.

    No `LegacyImportedModel` here - unlike the other lookups, this one has
    no legacy equivalent to map from; every row is created fresh in this
    backend.
    """

    metadata_type_value = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ["metadata_type_value"]
        verbose_name = "metadata type"
        verbose_name_plural = "metadata types"

    def __str__(self):
        return self.metadata_type_value


class Keyword(LegacyImportedModel, LegacyLookupTimestamps):
    """Controlled keyword a record can be tagged with."""

    keyword_value = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ["keyword_value"]

    def __str__(self):
        return self.keyword_value


class Project(LegacyImportedModel, LegacyLookupTimestamps):
    """A project a record can be attributed to.

    Not core metadata — templates opt in by declaring a field of type
    `FieldType.PROJECT`, whose value is stored in the record's `data` as the
    project's id.
    """

    project_name = models.CharField(max_length=255)
    project_code = models.CharField(max_length=50, unique=True)
    comments = models.TextField(blank=True)

    class Meta:
        ordering = ["project_name"]

    def __str__(self):
        return f"{self.project_name} ({self.project_code})"


class SpatialRepresentationType(LegacyImportedModel, LegacyLookupTimestamps):
    """How the data is spatially represented, e.g. vector, grid, textTable."""

    spatial_representation_type_value = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["spatial_representation_type_value"]
        verbose_name = "spatial representation type"
        verbose_name_plural = "spatial representation types"

    def __str__(self):
        return self.spatial_representation_type_value


class AccessConstraints(models.TextChoices):
    PRIVATE = "private", "Private"
    OPEN = "open", "Open"


class BoundaryType(models.TextChoices):
    ZONE = "zone", "Zone (bounding box)"
    POINT = "point", "Point"


class CoreMetadata(models.Model):
    """Mandatory metadata present on EVERY record, regardless of template.

    Modelled on MEDIN. These are real columns, so they are always enforced by
    the database, searchable, and editable in the admin. Values that belong to
    a controlled list (contact, country, CRS, publisher, topic, keywords,
    spatial representation type) are foreign keys to their own models rather
    than free text, so they stay consistent across records.

    Geographic bounds and the bounds' CRS name default to the related
    `country`'s, but a record can override them with its own precise
    zone (bounding box) or point via `boundary_type` + the
    `*_bounding_*` fields below - see the west/east/south/north_bound_*
    properties for the override-or-fallback resolution.
    """

    title = models.CharField(max_length=500)
    abstract = models.TextField()
    contact = models.ForeignKey(
        Contact,
        related_name="%(class)ss",
        on_delete=models.PROTECT,
        help_text="Person to contact about this record",
    )
    language = models.CharField(max_length=100, default="English")
    version = models.CharField(max_length=50, default="1.0.0")
    country = models.ForeignKey(
        Country,
        related_name="%(class)ss",
        on_delete=models.PROTECT,
        help_text="Supplies the geographic bounding box and its CRS name, unless overridden below",
    )
    boundary_type = models.CharField(
        max_length=10,
        choices=BoundaryType.choices,
        default=BoundaryType.ZONE,
        help_text="Whether this record's own boundary (if set) is a zone (bounding box) or a single point",
    )
    west_bounding_longitude = models.DecimalField(
        max_digits=9, decimal_places=5, null=True, blank=True,
        help_text="Zone: west edge. Point: the point's longitude.",
    )
    east_bounding_longitude = models.DecimalField(
        max_digits=9, decimal_places=5, null=True, blank=True,
        help_text="Zone only: east edge. Ignored for a point.",
    )
    south_bounding_latitude = models.DecimalField(
        max_digits=9, decimal_places=5, null=True, blank=True,
        help_text="Zone: south edge. Point: the point's latitude.",
    )
    north_bounding_latitude = models.DecimalField(
        max_digits=9, decimal_places=5, null=True, blank=True,
        help_text="Zone only: north edge. Ignored for a point.",
    )
    coordinate_reference_system = models.ForeignKey(
        CoordinateReferenceSystem,
        related_name="%(class)ss",
        on_delete=models.PROTECT,
    )
    publisher = models.ForeignKey(
        Publisher, related_name="%(class)ss", on_delete=models.PROTECT
    )
    topic = models.ForeignKey(Topic, related_name="%(class)ss", on_delete=models.PROTECT)
    keywords = models.ManyToManyField(Keyword, related_name="%(class)ss", blank=True)
    access_constraints = models.CharField(
        max_length=20,
        choices=AccessConstraints.choices,
        default=AccessConstraints.PRIVATE,
    )
    license = models.CharField(max_length=255, default="Other (Not Open)")
    temporal_coverage_from = models.DateField(null=True, blank=True)
    temporal_coverage_to = models.DateField(
        null=True, blank=True, help_text="Leave empty if coverage is ongoing"
    )
    metadata_standard_name = models.CharField(max_length=100, default="MEDIN")
    metadata_standard_version = models.CharField(max_length=50, default="3.1.2")
    metadata_standard_language = models.CharField(max_length=100, default="English")
    update_frequency = models.CharField(max_length=255, blank=True)
    lineage = models.TextField(default="none")
    data_format = models.CharField(max_length=100, default="GIS")
    spatial_representation_type = models.ForeignKey(
        SpatialRepresentationType,
        related_name="%(class)ss",
        on_delete=models.PROTECT,
    )
    data_type = models.ForeignKey(
        DataType,
        related_name="%(class)ss",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    metadata_type = models.ForeignKey(
        MetadataType,
        related_name="%(class)ss",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text="Top-level category of this record, e.g. Oceanography, Drone",
    )

    # --- Fields ported from the legacy backend's flat Metadata table ---
    comment = models.TextField(blank=True)
    link_to_data = models.TextField(blank=True)
    acknowledgement = models.TextField(blank=True)
    history = models.TextField(blank=True)
    fundings = models.TextField(blank=True)
    references = models.TextField(blank=True)
    acquisition_report_link = models.TextField(blank=True)
    project_report_link = models.TextField(blank=True)
    factsheet = models.TextField(blank=True)
    attribute = models.TextField(blank=True)

    # --- Uploaded file ---
    file = models.FileField(upload_to="metadata_files/", null=True, blank=True)
    file_description = models.TextField(blank=True)

    class Meta:
        abstract = True

    # --- Bounds and CRS name: the record's own zone/point if set, else the
    # related country's ---

    @property
    def has_custom_boundary(self):
        if self.boundary_type == BoundaryType.POINT:
            return self.west_bounding_longitude is not None and self.south_bounding_latitude is not None
        return None not in (
            self.west_bounding_longitude, self.east_bounding_longitude,
            self.south_bounding_latitude, self.north_bounding_latitude,
        )

    @property
    def west_bound_longitude(self):
        if self.has_custom_boundary:
            return self.west_bounding_longitude
        return self.country.west_bound_longitude

    @property
    def east_bound_longitude(self):
        if self.has_custom_boundary:
            return self.west_bounding_longitude if self.boundary_type == BoundaryType.POINT else self.east_bounding_longitude
        return self.country.east_bound_longitude

    @property
    def south_bound_latitude(self):
        if self.has_custom_boundary:
            return self.south_bounding_latitude
        return self.country.south_bound_latitude

    @property
    def north_bound_latitude(self):
        if self.has_custom_boundary:
            return self.south_bounding_latitude if self.boundary_type == BoundaryType.POINT else self.north_bounding_latitude
        return self.country.north_bound_latitude

    @property
    def crs_name(self):
        return self.country.crs_name

    @property
    def geojson_geometry(self):
        """The precise GeoJSON geometry for this record: a Point when it has
        its own point boundary, otherwise a Polygon built from the bounding
        box (the record's own zone if set, else its country's)."""
        if self.boundary_type == BoundaryType.POINT and self.has_custom_boundary:
            return {
                "type": "Point",
                "coordinates": [float(self.west_bounding_longitude), float(self.south_bounding_latitude)],
            }
        west, east, south, north = (
            self.west_bound_longitude, self.east_bound_longitude,
            self.south_bound_latitude, self.north_bound_latitude,
        )
        if None in (west, east, south, north):
            return None
        west, east, south, north = float(west), float(east), float(south), float(north)
        return {
            "type": "Polygon",
            "coordinates": [[
                [west, south], [west, north], [east, north], [east, south], [west, south],
            ]],
        }

    def clean_temporal_coverage(self):
        if (
            self.temporal_coverage_from
            and self.temporal_coverage_to
            and self.temporal_coverage_to < self.temporal_coverage_from
        ):
            raise ValidationError(
                {"temporal_coverage_to": "Must be on or after 'temporal coverage from'."}
            )


class MetadataTemplate(TimeStampedModel):
    """A named schema: the set of extra fields a record of this kind carries."""

    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    description = models.TextField(blank=True)
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} (v{self.version})"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class FieldDefinition(models.Model):
    """One field belonging to a template — this defines the form/schema."""

    template = models.ForeignKey(
        MetadataTemplate, related_name="fields", on_delete=models.CASCADE
    )
    name = models.SlugField(max_length=100, help_text="Machine key used inside record data")
    label = models.CharField(max_length=255, help_text="Human-friendly label")
    help_text = models.CharField(max_length=500, blank=True)
    field_type = models.CharField(
        max_length=20, choices=FieldType.choices, default=FieldType.TEXT
    )
    required = models.BooleanField(default=False)
    choices = models.JSONField(
        default=list, blank=True, help_text="Allowed values for (multi)select fields"
    )
    default = models.JSONField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["template", "order", "id"]
        unique_together = ("template", "name")

    def __str__(self):
        return f"{self.template.name}.{self.name}"


class MetadataRecord(CoreMetadata, TimeStampedModel, LegacyImportedModel):
    """A filled-in metadata record: core fields + template-specific values."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        PUBLISHED = "published", "Published"
        REJECTED = "rejected", "Rejected"
        ARCHIVED = "archived", "Archived"

    template = models.ForeignKey(
        MetadataTemplate, related_name="records", on_delete=models.PROTECT
    )
    data = models.JSONField(
        default=dict, blank=True, help_text="Values for the template's fields"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="metadata_records",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who created/submitted this record",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="reviewed_metadata_records",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Who approved or rejected this record, if any",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    action_history = models.JSONField(
        default=list,
        blank=True,
        help_text="Audit log of submit/approve/reject actions on this record",
    )

    class Meta:
        ordering = ["-created_at"]
        permissions = [
            ("approve_metadatarecord", "Can approve or reject metadata records"),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        """Validate `data` against the template's field definitions.

        Runs automatically in the admin (full_clean) and is invoked explicitly
        by the API serializer, so admin and API validation stay identical.
        """
        self.clean_temporal_coverage()
        if self.template_id is None or getattr(self, "_skip_data_clean", False):
            return
        errors = validate_record_data(self.template, self.data)
        if errors:
            # ValidationError needs strings/lists per key, not a nested dict.
            raise ValidationError(
                {"data": [f"{name}: {msg}" for name, msg in errors.items()]}
            )


# Every field of a metadata record that may be sent to Elasticsearch, as
# (path, label) pairs. Only core record fields are offered — values held in a
# record's `data` (i.e. template-defined fields) are deliberately excluded.
RECORD_SOURCE_CHOICES = [
    ("id", "id"),
    ("title", "title"),
    ("abstract", "abstract"),
    ("contact.firstname", "contact — firstname"),
    ("contact.lastname", "contact — lastname"),
    ("contact.email", "contact — email"),
    ("contact.position", "contact — position"),
    ("contact.organization", "contact — organization"),
    ("language", "language"),
    ("version", "version"),
    ("country.short_name", "country — short_name"),
    ("country.long_name", "country — long_name"),
    ("west_bound_longitude", "west_bound_longitude"),
    ("east_bound_longitude", "east_bound_longitude"),
    ("south_bound_latitude", "south_bound_latitude"),
    ("north_bound_latitude", "north_bound_latitude"),
    ("boundary_type", "boundary_type (zone/point)"),
    ("crs_name", "crs_name"),
    ("coordinate_reference_system.crs_value", "crs_value"),
    ("coordinate_reference_system.crs_description", "crs_description"),
    ("publisher.publisher_value", "publisher — publisher_value"),
    ("publisher.website", "publisher — website"),
    ("publisher.email", "publisher — email"),
    ("topic.topic_value", "topic — topic_value"),
    ("keywords.keyword_value", "keywords — keyword_value (list)"),
    ("access_constraints", "access_constraints"),
    ("license", "license"),
    ("temporal_coverage_from", "temporal_coverage_from"),
    ("temporal_coverage_to", "temporal_coverage_to"),
    ("metadata_standard_name", "metadata_standard_name"),
    ("metadata_standard_version", "metadata_standard_version"),
    ("metadata_standard_language", "metadata_standard_language"),
    ("update_frequency", "update_frequency"),
    ("lineage", "lineage"),
    (
        "spatial_representation_type.spatial_representation_type_value",
        "spatial_representation_type_value",
    ),
    ("status", "status"),
    ("created_at", "created_at"),
    ("updated_at", "updated_at"),
    ("comment", "comment"),
    ("link_to_data", "link_to_data"),
    ("acquisition_report_link", "acquisition_report_link"),
    ("project_report_link", "project_report_link"),
    ("factsheet", "factsheet"),
    ("fundings", "fundings"),
    ("references", "references"),
    ("acknowledgement", "acknowledgement"),
    ("history", "history"),
    ("data_type.data_type_value", "data_type — data_type_value"),
    ("metadata_type.metadata_type_value", "metadata_type — metadata_type_value"),
]


class ElasticsearchIndex(TimeStampedModel):
    """An Elasticsearch index and the whitelist of record fields to send to it.

    One index per `MetadataType` (enforced by the one-to-one below) - e.g.
    "Oceanography" records go to the `oceanography` index, "Drone" records
    to `drone`, each its own pygeoapi collection. A record is only ever
    pushed with the fields listed in `fields` — nothing else leaves the
    database. Only core record fields can be listed; values a record holds
    for its template's fields (`data`) are never sent.
    """

    name = models.CharField(max_length=255, unique=True, help_text="Internal label")
    metadata_type = models.OneToOneField(
        MetadataType,
        on_delete=models.CASCADE,
        related_name="elasticsearch_index",
        help_text="Records of this type sync to this index, and no other",
    )
    index_name = models.CharField(
        max_length=255, help_text="Elasticsearch index to write into, e.g. oceanography"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Elasticsearch index"
        verbose_name_plural = "Elasticsearch indexes"

    def __str__(self):
        return f"{self.name} -> {self.index_name}"

    def records(self):
        """The records this index covers - every record of this type,
        regardless of status."""
        return MetadataRecord.objects.filter(metadata_type=self.metadata_type)

    def build_document(self, record):
        """Return the OGC-API-Records-shaped GeoJSON Feature to send to
        Elasticsearch for `record` (this is what makes it pygeoapi-
        readable, via the "type: record" ElasticsearchCatalogue provider).

        The envelope (id/type/geometry/time) is always built the same way
        for every index; `properties` is whatever this index's configurable
        field whitelist (`fields`) resolves to - deliberately simpler than
        the legacy backend's field-by-field capitalisation/renaming, since
        that's no longer something this project is trying to replicate
        byte-for-byte (see the migration plan, Phase 9).
        """
        geometry = record.geojson_geometry

        properties = {}
        for field in self.fields.filter(is_enabled=True).order_by("order", "id"):
            value = resolve_source(record, field.source)
            if value not in (None, "", [], {}):
                properties[field.target_key] = value

        # Only expose a direct data link for records marked open - mirrors
        # legacy's privacy-sensitive gating (private data's link_to_data
        # shouldn't be a publicly discoverable URL in the search index).
        links = []
        if record.link_to_data and record.access_constraints == AccessConstraints.OPEN:
            links.append({"href": record.link_to_data, "rel": "item"})

        doc_id = str(record.legacy_id if record.legacy_id is not None else record.pk)
        return {
            "id": doc_id,
            "conformsTo": ["http://www.opengis.net/spec/ogcapi-records-1/1.0/conf/record-core"],
            "type": "Feature",
            "time": {
                "interval": [
                    record.temporal_coverage_from.isoformat() if record.temporal_coverage_from else None,
                    record.temporal_coverage_to.isoformat() if record.temporal_coverage_to else None,
                ]
            },
            "geometry": geometry,
            "properties": properties,
            "links": links,
        }

    def build_mapping(self):
        """Return an Elasticsearch mapping body for the enabled fields."""
        properties = {
            f.target_key: {"type": f.es_type}
            for f in self.fields.all()
            if f.is_enabled
        }
        return {"mappings": {"properties": properties}}


class ElasticsearchFieldMap(models.Model):
    """One field of a record to include in its Elasticsearch document."""

    class ESType(models.TextChoices):
        TEXT = "text", "text"
        KEYWORD = "keyword", "keyword"
        INTEGER = "integer", "integer"
        FLOAT = "float", "float"
        BOOLEAN = "boolean", "boolean"
        DATE = "date", "date"
        GEO_SHAPE = "geo_shape", "geo_shape"

    index = models.ForeignKey(
        ElasticsearchIndex, related_name="fields", on_delete=models.CASCADE
    )
    source = models.CharField(
        max_length=200,
        choices=RECORD_SOURCE_CHOICES,
        help_text="Field of the metadata record to send",
    )
    target = models.CharField(
        max_length=200,
        blank=True,
        help_text="Key in the Elasticsearch document; defaults to the source path "
        "with dots replaced by underscores",
    )
    es_type = models.CharField(
        max_length=20, choices=ESType.choices, default=ESType.TEXT
    )
    is_enabled = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["index", "order", "id"]
        unique_together = ("index", "source")
        verbose_name = "Elasticsearch field"
        verbose_name_plural = "Elasticsearch fields"

    def __str__(self):
        return f"{self.source} -> {self.target_key}"

    @property
    def target_key(self):
        return self.target or self.source.replace(".", "_")


def resolve_source(record, path):
    """Resolve a `source` path against a record into a JSON-safe value.

    Handles plain columns and computed properties (`title`, `crs_name`), one
    hop through a related lookup (`country.long_name`) and many-to-many hops
    (`keywords.keyword_value`, which returns a list).
    """
    value = record
    for part in path.split("."):
        if value is None:
            return None
        if hasattr(value, "all"):  # related manager: fan out over the rows
            value = [getattr(v, part, None) for v in value.all()]
        else:
            value = getattr(value, part, None)
    return _jsonable(value)


def _jsonable(value):
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, models.Model):
        return str(value)
    return value


def validate_record_data(template, data):
    """Return a dict of {field_name: error} for a record's data vs its template.

    Shared by the model's clean() and the DRF serializer so validation is
    identical whether records are created via the admin or the API.
    """
    errors = {}
    if not isinstance(data, dict):
        return {"__all__": "Data must be an object mapping field names to values."}

    field_defs = {f.name: f for f in template.fields.all()}

    # Reject values that don't correspond to any field on the template.
    for key in data:
        if key not in field_defs:
            errors[key] = "Unknown field for this template."

    for name, field in field_defs.items():
        value = data.get(name, None)
        missing = value in (None, "", [], {})

        if field.required and missing:
            errors[name] = "This field is required."
            continue
        if missing:
            continue

        error = _validate_value(field, value)
        if error:
            errors[name] = error

    return errors


def _validate_value(field, value):
    ftype = field.field_type
    if ftype in (FieldType.TEXT, FieldType.TEXTAREA, FieldType.URL, FieldType.EMAIL):
        if not isinstance(value, str):
            return "Expected a string."
    elif ftype == FieldType.INTEGER:
        if isinstance(value, bool) or not isinstance(value, int):
            return "Expected an integer."
    elif ftype == FieldType.DECIMAL:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return "Expected a number."
    elif ftype == FieldType.BOOLEAN:
        if not isinstance(value, bool):
            return "Expected true or false."
    elif ftype in (FieldType.DATE, FieldType.DATETIME):
        if not isinstance(value, str):
            return "Expected an ISO date/datetime string."
    elif ftype in (FieldType.FILE, FieldType.IMAGE):
        if not isinstance(value, str):
            return "Expected a stored file path."
    elif ftype == FieldType.SELECT:
        if value not in field.choices:
            return f"Must be one of: {', '.join(map(str, field.choices))}."
    elif ftype == FieldType.MULTISELECT:
        if not isinstance(value, list) or any(v not in field.choices for v in value):
            return f"Must be a list of: {', '.join(map(str, field.choices))}."
    elif ftype == FieldType.PROJECT:
        try:
            pk = int(value)
        except (TypeError, ValueError):
            return "Expected the id of a project."
        if not Project.objects.filter(pk=pk).exists():
            return f"No project with id {pk}."
    return None
