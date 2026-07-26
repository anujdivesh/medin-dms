from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
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


class Contact(models.Model):
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


class Country(models.Model):
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


class CoordinateReferenceSystem(models.Model):
    """A CRS a record's data is expressed in, e.g. EPSG:4326."""

    crs_value = models.CharField(max_length=100, unique=True)
    crs_description = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["crs_value"]
        verbose_name = "coordinate reference system"
        verbose_name_plural = "coordinate reference systems"

    def __str__(self):
        return self.crs_value


class Publisher(models.Model):
    """An organisation that publishes records."""

    publisher_value = models.CharField(max_length=255, unique=True)
    website = models.URLField(blank=True)
    email = models.EmailField(blank=True)

    class Meta:
        ordering = ["publisher_value"]

    def __str__(self):
        return self.publisher_value


class Topic(models.Model):
    """Controlled topic category (MEDIN / ISO topic category)."""

    topic_value = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ["topic_value"]

    def __str__(self):
        return self.topic_value


class Keyword(models.Model):
    """Controlled keyword a record can be tagged with."""

    keyword_value = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ["keyword_value"]

    def __str__(self):
        return self.keyword_value


class Project(models.Model):
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


class SpatialRepresentationType(models.Model):
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


class CoreMetadata(models.Model):
    """Mandatory metadata present on EVERY record, regardless of template.

    Modelled on MEDIN. These are real columns, so they are always enforced by
    the database, searchable, and editable in the admin. Values that belong to
    a controlled list (contact, country, CRS, publisher, topic, keywords,
    spatial representation type) are foreign keys to their own models rather
    than free text, so they stay consistent across records.

    Geographic bounds and the bounds' CRS name are not stored per record —
    they are read from the related `country`.
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
        help_text="Supplies the geographic bounding box and its CRS name",
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
    spatial_representation_type = models.ForeignKey(
        SpatialRepresentationType,
        related_name="%(class)ss",
        on_delete=models.PROTECT,
    )

    class Meta:
        abstract = True

    # --- Bounds and CRS name, sourced from the related country ---

    @property
    def west_bound_longitude(self):
        return self.country.west_bound_longitude

    @property
    def east_bound_longitude(self):
        return self.country.east_bound_longitude

    @property
    def south_bound_latitude(self):
        return self.country.south_bound_latitude

    @property
    def north_bound_latitude(self):
        return self.country.north_bound_latitude

    @property
    def crs_name(self):
        return self.country.crs_name

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


class MetadataRecord(CoreMetadata, TimeStampedModel):
    """A filled-in metadata record: core fields + template-specific values."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
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
    )

    class Meta:
        ordering = ["-created_at"]

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
