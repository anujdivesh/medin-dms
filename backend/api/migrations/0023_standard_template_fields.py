"""The plain MEDIN fields stop being record columns and become ordinary
template fields kept in each record's `data`:

- each template's built-in row for one becomes a normal row of its new type,
  with its default / choices / help text (label, required, section and order
  are kept);
- each record's column value is copied into `data` when its template has
  that field;
- Elasticsearch field maps reading the column now read `data.<name>`, under
  the same document key;
- the columns are dropped.

Reversible.
"""

from django.db import migrations, models

UPDATE_FREQUENCY_CHOICES = [
    "continual", "daily", "weekly", "fortnightly", "monthly", "quarterly",
    "biannually", "annually", "asNeeded", "irregular", "notPlanned", "unknown",
]
PROTOCOL_CHOICES = [
    "HTTPS", "HTTP", "FTP", "SFTP", "SMB", "S3", "OPeNDAP", "THREDDS", "ERDDAP",
    "OGC:WMS", "OGC:WMTS", "OGC:WFS", "OGC:WCS", "OGC:API", "DOI",
]

# Frozen copy of STANDARD_FIELDS (models.py): name -> (type, help, default, choices).
FIELDS = {
    "abstract": ("textarea", "At least 100 characters; must not repeat the title.", None, []),
    "version": ("text", "Dataset edition or release number.", "1.0.0", []),
    "language": ("text", "Resource language, as an ISO 639-2 code (e.g. eng).", "English", []),
    "fundings": ("text", "Funding body and grant or project number.", None, []),
    "lineage": ("textarea", "Sources, collection and processing methods, quality control "
                "and standards followed.", "none", []),
    "history": ("text", "Version or processing history.", None, []),
    "update_frequency": ("select", "How often the data is updated.", None, UPDATE_FREQUENCY_CHOICES),
    "acknowledgement": ("text", "Required acknowledgement or citation text.", None, []),
    "license": ("text", "", "Other (Not Open)", []),
    "protocol": ("select", "Needed with a Link to data. Picked from the link (https, ftp, s3) - "
                 "change it for services such as OPeNDAP, WMS, WFS, THREDDS.", None, PROTOCOL_CHOICES),
    "data_format": ("text", "e.g. NetCDF, CSV, GeoTIFF, LAS.", "GIS", []),
    "attribute": ("text", "Variables: name, units and description (CF standard name for "
                  "ocean data).", None, []),
    "references": ("textarea", "Related publications (citation or DOI).", None, []),
    "comment": ("textarea", "General remarks.", None, []),
    "factsheet": ("textarea", "Summary factsheet for the dataset.", None, []),
    "metadata_standard_name": ("text", "", "MEDIN", []),
    "metadata_standard_version": ("text", "", "3.1.2", []),
    "metadata_standard_language": ("text", "Language of this metadata record.", "English", []),
    "character_encoding": ("text", "Character encoding of the data, e.g. utf8.", "utf8", []),
}


def to_template_fields(apps, schema_editor):
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    ElasticsearchFieldMap = apps.get_model("api", "ElasticsearchFieldMap")

    rows = FieldDefinition.objects.filter(field_type="builtin", name__in=FIELDS)
    fields_by_template = {}
    for row in rows:
        fields_by_template.setdefault(row.template_id, set()).add(row.name)

    # Values into `data`, for the fields the record's template has.
    records = MetadataRecord.objects.all().only("pk", "template_id", "data", *FIELDS)
    seen_choices = {}  # (template id, name) -> values in use
    for record in records.iterator():
        names = fields_by_template.get(record.template_id, set())
        data = dict(record.data or {})
        for name in names:
            value = getattr(record, name)
            if value in (None, "") or name in data:
                continue
            data[name] = value
            if FIELDS[name][0] == "select":
                seen_choices.setdefault((record.template_id, name), set()).add(value)
        if data != (record.data or {}):
            MetadataRecord.objects.filter(pk=record.pk).update(data=data)

    for row in rows:
        field_type, help_text, default, choices = FIELDS[row.name]
        choices = list(choices)
        # Values already in use stay valid choices.
        choices += sorted(seen_choices.get((row.template_id, row.name), set()) - set(choices))
        row.field_type = field_type
        row.choices = choices
        row.default = default
        row.help_text = row.help_text or help_text
        row.save(update_fields=["field_type", "choices", "default", "help_text"])

    # Same document key as before (it defaulted to the column name).
    for fmap in ElasticsearchFieldMap.objects.filter(source__in=FIELDS):
        new_source = f"data.{fmap.source}"
        if ElasticsearchFieldMap.objects.filter(index_id=fmap.index_id, source=new_source).exists():
            fmap.delete()
            continue
        fmap.target = fmap.target or fmap.source
        fmap.source = new_source
        fmap.save(update_fields=["source", "target"])


def to_columns(apps, schema_editor):
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    ElasticsearchFieldMap = apps.get_model("api", "ElasticsearchFieldMap")

    for record in MetadataRecord.objects.all().iterator():
        data = dict(record.data or {})
        updates = {}
        for name in FIELDS:
            if name not in data:
                continue
            value = data.pop(name)
            if value in (None, ""):
                continue
            field = MetadataRecord._meta.get_field(name)
            value = str(value)
            if field.max_length:
                value = value[:field.max_length]
            updates[name] = value
        if updates or data != (record.data or {}):
            MetadataRecord.objects.filter(pk=record.pk).update(data=data, **updates)

    FieldDefinition.objects.filter(name__in=FIELDS).exclude(field_type="builtin").update(
        field_type="builtin", choices=[], default=None,
    )

    for fmap in ElasticsearchFieldMap.objects.filter(source__in=[f"data.{n}" for n in FIELDS]):
        fmap.source = fmap.source[len("data."):]
        if fmap.target == fmap.source:
            fmap.target = ""
        fmap.save(update_fields=["source", "target"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0022_protocol"),
    ]

    operations = [
        migrations.RunPython(to_template_fields, to_columns),
    ] + [
        migrations.RemoveField(model_name="metadatarecord", name=name)
        for name in FIELDS
    ]
