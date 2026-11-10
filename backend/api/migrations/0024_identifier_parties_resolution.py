"""Adds the standard fields Unique resource identifier (#3), Originator
(#12), Custodian (#13), Owner (#14) and Spatial resolution (#27) to every
existing template that has the default fields. They're added unticked so
existing records stay valid; existing records get the SPC defaults."""

from django.db import migrations

# Frozen copy of the STANDARD_FIELDS entries: name -> (label, help, default,
# section slug, order).
FIELDS = {
    "resource_identifier": ("Unique resource identifier",
                            "Organisation code or DOI. Must be unique and contain no spaces.",
                            None, "identification", 3),
    "originator": ("Originator", "Organisation that collected or produced the data.",
                   "SPC", "responsible_parties", 12),
    "custodian": ("Custodian", "Organisation that holds and manages the data.",
                  "SPC", "responsible_parties", 13),
    "owner": ("Owner", "Organisation that owns the data.", None, "responsible_parties", 14),
    "spatial_resolution": ("Spatial resolution",
                           "Point spacing, pixel size or station spacing in metres - "
                           "'Not applicable' for single points.",
                           None, "spatial_reference", 27),
}


def add_fields(apps, schema_editor):
    MetadataTemplate = apps.get_model("api", "MetadataTemplate")
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    FormSection = apps.get_model("api", "FormSection")
    sections = {s.slug: s for s in FormSection.objects.all()}

    for template in MetadataTemplate.objects.filter(fields__field_type="builtin").distinct():
        existing = set(template.fields.values_list("name", flat=True))
        added = {}
        for name, (label, help_text, default, section, order) in FIELDS.items():
            if name in existing:
                continue
            FieldDefinition.objects.create(
                template=template, name=name, label=label, help_text=help_text,
                field_type="text", required=False, default=default,
                section=sections.get(section), order=order,
            )
            if default:
                added[name] = default
        if added:
            for record in MetadataRecord.objects.filter(template=template).only("pk", "data"):
                data = {**added, **(record.data or {})}
                MetadataRecord.objects.filter(pk=record.pk).update(data=data)


def remove_fields(apps, schema_editor):
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    FieldDefinition.objects.filter(name__in=FIELDS, field_type="text").delete()
    for record in MetadataRecord.objects.only("pk", "data"):
        data = {k: v for k, v in (record.data or {}).items() if k not in FIELDS}
        if data != (record.data or {}):
            MetadataRecord.objects.filter(pk=record.pk).update(data=data)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0023_standard_template_fields"),
    ]

    operations = [
        migrations.RunPython(add_fields, remove_fields),
    ]
