from datetime import date, datetime

from django import forms
from django.core.files.storage import default_storage
from django.db.models import Model

from .models import (
    AUTO_BUILTIN_MEMBERS,
    BUILTIN_FIELDS,
    LINK_OR_FILE_FIELDS,
    FieldType,
    MetadataRecord,
)

# Prefix that marks a form field as a template ("data") field.
DYNAMIC_PREFIX = "tpl__"

# The editable core fields shown on a record with no template picked yet, in
# display order: the two always-shown pickers, then every built-in field
# (bar the system-filled ones, which the admin shows read-only).
CORE_FIELDS = ["template", "metadata_type"] + [
    member for _, _, members in BUILTIN_FIELDS for member in members
    if member not in AUTO_BUILTIN_MEMBERS
]

# Values of a link-or-upload radio (LINK_OR_FILE_FIELDS): a typed link/path,
# or an uploaded file.
LINK_TO_DATA_LINK = "link"
LINK_TO_DATA_FILE = "file"


def _link_or_file_radio(label, help_text, link_field, file_fields):
    """A link-or-upload radio. Not stored - it picks which of the two columns
    the record keeps (see clean()); link_to_data.js reads the data-* attrs to
    show only the picked one."""
    return forms.ChoiceField(
        label=label,
        choices=[(LINK_TO_DATA_LINK, "Link"), (LINK_TO_DATA_FILE, "File upload")],
        initial=LINK_TO_DATA_LINK,
        required=False,  # not sent -> neither column is cleared
        widget=forms.RadioSelect(attrs={
            "data-link-field": link_field,
            "data-file-fields": " ".join(file_fields),
        }),
        help_text=help_text,
    )


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
        if isinstance(value, str):  # a default typed as "a, b"
            common["initial"] = [v.strip() for v in value.split(",") if v.strip()]
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
            help_text="- ".join(b for b in help_bits if b),
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

    link_to_data_source = _link_or_file_radio(
        "Link to data as",
        "Either type a link/path to the data, or upload the data file.",
        "link_to_data", ["file", "file_description"],
    )
    acquisition_report_source = _link_or_file_radio(
        "Acquisition report as",
        "Either link to the acquisition report, or upload it.",
        "acquisition_report_link", ["acquisition_report_file"],
    )
    project_report_source = _link_or_file_radio(
        "Project report as",
        "Either link to the project report, or upload it.",
        "project_report_link", ["project_report_file"],
    )

    # The link-or-upload radios whose field the record's template marks
    # required - set by the admin.
    required_sources = frozenset()

    class Meta:
        model = MetadataRecord
        fields = CORE_FIELDS
        # Short free-text columns entered on one line rather than as a
        # multi-line box (still TextFields, so no length limit).
        widgets = {
            name: forms.TextInput(attrs={"class": "vTextField"})
            for name in ("link_to_data", "acquisition_report_link", "project_report_link")
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for radio, _, upload, _ in LINK_OR_FILE_FIELDS:
            if radio in self.fields and getattr(self.instance, upload):
                self.fields[radio].initial = LINK_TO_DATA_FILE
        # The form owns `data` validation (field-by-field), so switch off the
        # model's aggregate check to avoid duplicate errors on save.
        self.instance._skip_data_clean = True

    def clean(self):
        cleaned = super().clean()
        existing = self.instance.data or {}  # capture before we rebuild it

        # Keep only the picked source of each link-or-upload field. A file
        # widget cleans to the new upload, the stored file, or False when
        # cleared.
        for radio, link, upload, extras in LINK_OR_FILE_FIELDS:
            source = cleaned.get(radio)
            required = radio in self.required_sources
            if source == LINK_TO_DATA_FILE:
                cleaned[link] = ""
                if required and not cleaned.get(upload):
                    self.add_error(upload, "Upload a file, or switch "
                        f"“{self.fields[radio].label}” to Link.")
            elif source == LINK_TO_DATA_LINK:
                if required and not (cleaned.get(link) or "").strip():
                    self.add_error(link, "This field is required.")
                cleaned[upload] = False  # clears any stored file
                for extra in extras:
                    cleaned[extra] = ""

        # Greyed-out (disabled) picks aren't submitted by the browser - keep
        # the saved ones so they still apply if that field is mapped later.
        hidden_field = self.fields.get("hidden_when_private")
        if hidden_field is not None and "hidden_when_private" in cleaned:
            disabled = getattr(hidden_field.widget, "disabled_values", set())
            kept = [v for v in (self.instance.hidden_when_private or []) if v in disabled]
            cleaned["hidden_when_private"] = list(
                dict.fromkeys(list(cleaned["hidden_when_private"]) + kept)
            )

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
                elif key in existing:  # nothing uploaded- keep the old file
                    data[key] = existing[key]
                continue

            if value in (None, "", []):
                continue
            data[key] = _to_jsonable(value)

        self.instance.data = data
        return cleaned
