from django.db import migrations, models


# Frozen copy of BUILTIN_FIELDS as of this migration: (name, label, required).
BUILTIN_FIELDS = [
    ("title", "Title", True),
    ("abstract", "Abstract", True),
    ("comment", "Comment", False),
    ("contact", "Contact", True),
    ("language", "Language", True),
    ("version", "Version", True),
    ("country", "Country", True),
    ("boundary", "Boundary", True),
    ("coordinate_reference_system", "Coordinate reference system", True),
    ("publisher", "Publisher", True),
    ("topic", "Topic", True),
    ("keywords", "Keywords", False),
    ("data_type", "Data type", False),
    ("project", "Project", False),
    ("access_constraints", "Access constraints", True),
    ("license", "License", True),
    ("temporal_coverage_from", "Temporal coverage from", False),
    ("temporal_coverage_to", "Temporal coverage to", False),
    ("metadata_standard_name", "Metadata standard name", True),
    ("metadata_standard_version", "Metadata standard version", True),
    ("metadata_standard_language", "Metadata standard language", True),
    ("update_frequency", "Update frequency", False),
    ("lineage", "Lineage", True),
    ("data_format", "Data format", True),
    ("spatial_representation_type", "Spatial representation type", True),
    ("link_to_data", "Link to data", False),
    ("acknowledgement", "Acknowledgement", False),
    ("history", "History", False),
    ("fundings", "Fundings", False),
    ("references", "References", False),
    ("acquisition_report_file", "Acquisition report file", False),
    ("project_report_link", "Project report link", False),
    ("factsheet", "Factsheet", False),
    ("attribute", "Attribute", False),
    ("additional_information", "Additional information", False),
    ("additional_information_file", "Additional information file", False),
]


def add_builtin_rows(apps, schema_editor):
    """List every built-in field on existing templates, ahead of their own
    fields (shifted down so they keep their relative order)."""
    MetadataTemplate = apps.get_model("api", "MetadataTemplate")
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    shift = len(BUILTIN_FIELDS)
    for template in MetadataTemplate.objects.all():
        existing = set(template.fields.values_list("name", flat=True))
        template.fields.update(order=models.F("order") + shift)
        FieldDefinition.objects.bulk_create([
            FieldDefinition(
                template=template, name=name, label=label,
                field_type="builtin", required=required, order=i,
            )
            for i, (name, label, required) in enumerate(BUILTIN_FIELDS)
            if name not in existing
        ])


def remove_builtin_rows(apps, schema_editor):
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    FieldDefinition.objects.filter(field_type="builtin").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0012_metadatarecord_hidden_when_private"),
    ]

    operations = [
        migrations.AlterField(
            model_name="fielddefinition",
            name="field_type",
            field=models.CharField(
                choices=[
                    ("text", "Text (single line)"),
                    ("textarea", "Text (multi-line)"),
                    ("integer", "Integer"),
                    ("decimal", "Decimal"),
                    ("boolean", "Boolean (yes/no)"),
                    ("date", "Date"),
                    ("datetime", "Date & time"),
                    ("url", "URL"),
                    ("email", "Email"),
                    ("select", "Select (one choice)"),
                    ("multiselect", "Select (many choices)"),
                    ("file", "File upload"),
                    ("image", "Image upload"),
                    ("builtin", "Built-in field"),
                ],
                default="text",
                max_length=20,
            ),
        ),
        migrations.RunPython(add_builtin_rows, remove_builtin_rows),
    ]
