from django.db import migrations, models


def fill_dates(apps, schema_editor):
    """Existing records: the date they were last saved."""
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    for record in MetadataRecord.objects.only("pk", "updated_at"):
        MetadataRecord.objects.filter(pk=record.pk).update(
            metadata_date=record.updated_at.date()
        )


def add_rows(apps, schema_editor):
    """Give every template that has built-in rows a Metadata date row too, in
    the Metadata record section at #46."""
    MetadataTemplate = apps.get_model("api", "MetadataTemplate")
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    FormSection = apps.get_model("api", "FormSection")
    section = FormSection.objects.filter(slug="metadata_record").first()
    for template in MetadataTemplate.objects.filter(fields__field_type="builtin").distinct():
        if not template.fields.filter(name="metadata_date").exists():
            FieldDefinition.objects.create(
                template=template, name="metadata_date", label="Metadata date",
                field_type="builtin", required=False, section=section, order=46,
            )


def remove_rows(apps, schema_editor):
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    FieldDefinition.objects.filter(field_type="builtin", name="metadata_date").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0019_form_sections"),
    ]

    operations = [
        migrations.AddField(
            model_name="metadatarecord",
            name="metadata_date",
            field=models.DateField(
                auto_now=True, null=True,
                help_text="Date this record was last saved (yyyy-mm-dd). System-filled on every save.",
            ),
        ),
        migrations.RunPython(fill_dates, migrations.RunPython.noop),
        migrations.RunPython(add_rows, remove_rows),
    ]
