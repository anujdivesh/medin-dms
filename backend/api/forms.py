from datetime import date, datetime

from django import forms
from django.core.files.storage import default_storage
from django.db.models import Model

from .models import FieldType, MetadataRecord

# Prefix that marks a form field as a template ("data") field.
DYNAMIC_PREFIX = "tpl__"

# The editable core fields shown on every record, in display order.
CORE_FIELDS = [
    "template",
    "metadata_type",
    "title",
    "abstract",
    "comment",
    "contact",
    "language",
    "version",
    "country",
    "boundary_type",
    "west_bounding_longitude",
    "east_bounding_longitude",
    "south_bounding_latitude",
    "north_bounding_latitude",
    "coordinate_reference_system",
    "publisher",
    "topic",
    "keywords",
    "data_type",
    "project",
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
]


def _empty_choice(required):
    return [] if required else [("", "---------")]


def build_form_field(field_def, value):
    """Turn a FieldDefinition into a Django form field, pre-filled with value."""
    ftype = field_def.field_type
    common = {
        "label": field_def.label or field_def.name,
        "required": field_def.required,
        "help_text": field_def.help_text,
        "initial": value,
    }

    if ftype == FieldType.TEXTAREA:
        return forms.CharField(widget=forms.Textarea(attrs={"rows": 3}), **common)
    if ftype == FieldType.INTEGER:
        return forms.IntegerField(**common)
    if ftype == FieldType.DECIMAL:
        return forms.FloatField(**common)
    if ftype == FieldType.BOOLEAN:
        common["required"] = False  # a checkbox is never "required" in HTML terms
        return forms.BooleanField(**common)
    if ftype == FieldType.DATE:
        return forms.DateField(widget=forms.DateInput(attrs={"type": "date"}), **common)
    if ftype == FieldType.DATETIME:
        return forms.DateTimeField(
            widget=forms.DateTimeInput(attrs={"type": "datetime-local"}), **common
        )
    if ftype == FieldType.URL:
        return forms.URLField(**common)
    if ftype == FieldType.EMAIL:
        return forms.EmailField(**common)
    if ftype == FieldType.SELECT:
        choices = _empty_choice(field_def.required) + [
            (c, c) for c in field_def.choices
        ]
        return forms.ChoiceField(choices=choices, **common)
    if ftype == FieldType.MULTISELECT:
        choices = [(c, c) for c in field_def.choices]
        return forms.MultipleChoiceField(choices=choices, **common)
    if ftype in (FieldType.FILE, FieldType.IMAGE):
        # Files aren't stored in `data` directly; the current value is shown as
        # a hint and only replaced when a new file is uploaded.
        file_field = forms.ImageField if ftype == FieldType.IMAGE else forms.FileField
        help_bits = [field_def.help_text]
        if value:
            help_bits.append(f"Current: {value}")
        return file_field(
            label=field_def.label or field_def.name,
            # Don't force a re-upload if a file is already stored.
            required=field_def.required and not value,
            help_text=" — ".join(b for b in help_bits if b),
        )
    return forms.CharField(**common)  # default: plain text


def _to_jsonable(value):
    """Convert form-cleaned Python values into JSON-storable primitives."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Model):
        return value.pk
    return value


def _store_upload(uploaded_file):
    """Save an uploaded file under MEDIA_ROOT and return its stored path."""
    return default_storage.save(f"metadata/{uploaded_file.name}", uploaded_file)


class MetadataRecordAdminForm(forms.ModelForm):
    """Base form. The template ("tpl__") fields are injected per-record by the
    admin's get_form(); here we just assemble and validate them into `data`."""

    class Meta:
        model = MetadataRecord
        fields = CORE_FIELDS

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # The form owns `data` validation (field-by-field), so switch off the
        # model's aggregate check to avoid duplicate errors on save.
        self.instance._skip_data_clean = True

    def clean(self):
        cleaned = super().clean()
        existing = self.instance.data or {}  # capture before we rebuild it

        # Collect every dynamic field back into the JSON `data` dict. The typed
        # form fields (required/choices/types) already validated each value, so
        # here we only need to assemble what passed.
        data = {}
        for name, field in self.fields.items():
            if not name.startswith(DYNAMIC_PREFIX):
                continue
            key = name[len(DYNAMIC_PREFIX):]
            value = cleaned.get(name)

            if isinstance(field, forms.FileField):
                if value:  # a new file was uploaded
                    data[key] = _store_upload(value)
                elif key in existing:  # nothing uploaded — keep the old file
                    data[key] = existing[key]
                continue

            if value in (None, "", []):
                continue
            data[key] = _to_jsonable(value)

        self.instance.data = data
        return cleaned
