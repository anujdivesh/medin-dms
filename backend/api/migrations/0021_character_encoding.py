from django.db import migrations, models


def add_rows(apps, schema_editor):
    """Give every template that has built-in rows a Character encoding row
    too, in the Metadata record section at #45."""
    MetadataTemplate = apps.get_model("api", "MetadataTemplate")
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    FormSection = apps.get_model("api", "FormSection")
    section = FormSection.objects.filter(slug="metadata_record").first()
    for template in MetadataTemplate.objects.filter(fields__field_type="builtin").distinct():
        if not template.fields.filter(name="character_encoding").exists():
            FieldDefinition.objects.create(
                template=template, name="character_encoding", label="Character encoding",
                field_type="builtin", required=False, section=section, order=45,
            )


def remove_rows(apps, schema_editor):
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    FieldDefinition.objects.filter(field_type="builtin", name="character_encoding").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0020_metadata_date"),
    ]

    operations = [
        # Existing records get the default, utf8.
        migrations.AddField(
            model_name="metadatarecord",
            name="character_encoding",
            field=models.CharField(
                blank=True, default="utf8", max_length=50,
                help_text="Character encoding of the data, e.g. utf8. Pre-filled - change only if the data uses another encoding.",
            ),
        ),
        migrations.RunPython(add_rows, remove_rows),
        # Help text only: "System-filled - leave as is." dropped.
        migrations.AlterField(
            model_name="metadatarecord",
            name="metadata_standard_name",
            field=models.CharField(blank=True, default="MEDIN", help_text="", max_length=100),
        ),
        migrations.AlterField(
            model_name="metadatarecord",
            name="metadata_standard_version",
            field=models.CharField(blank=True, default="3.1.2", help_text="", max_length=50),
        ),
        migrations.AlterField(
            model_name="metadatarecord",
            name="metadata_standard_language",
            field=models.CharField(blank=True, default="English", help_text="Language of this metadata record. ", max_length=100),
        ),
    ]
