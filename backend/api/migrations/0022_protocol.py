from django.db import migrations, models

# Link scheme -> protocol, for existing records with a link.
SCHEMES = {"https": "HTTPS", "http": "HTTP", "ftp": "FTP", "sftp": "SFTP", "s3": "S3"}


def fill_protocols(apps, schema_editor):
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    for record in MetadataRecord.objects.exclude(link_to_data="").only("pk", "link_to_data"):
        scheme = (record.link_to_data or "").strip().split("://", 1)[0].lower()
        if scheme in SCHEMES:
            MetadataRecord.objects.filter(pk=record.pk).update(protocol=SCHEMES[scheme])


def add_rows(apps, schema_editor):
    """Give every template that has built-in rows a Protocol row too, in the
    Distribution section at #34."""
    MetadataTemplate = apps.get_model("api", "MetadataTemplate")
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    FormSection = apps.get_model("api", "FormSection")
    section = FormSection.objects.filter(slug="distribution").first()
    for template in MetadataTemplate.objects.filter(fields__field_type="builtin").distinct():
        if not template.fields.filter(name="protocol").exists():
            FieldDefinition.objects.create(
                template=template, name="protocol", label="Protocol",
                field_type="builtin", required=False, section=section, order=34,
            )


def remove_rows(apps, schema_editor):
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    FieldDefinition.objects.filter(field_type="builtin", name="protocol").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0021_character_encoding"),
    ]

    operations = [
        migrations.AddField(
            model_name="metadatarecord",
            name="protocol",
            field=models.CharField(
                blank=True, max_length=20,
                choices=[
                    ("HTTPS", "HTTPS"), ("HTTP", "HTTP"), ("FTP", "FTP"), ("SFTP", "SFTP"),
                    ("S3", "Amazon S3"), ("OPeNDAP", "OPeNDAP"), ("THREDDS", "THREDDS"),
                    ("ERDDAP", "ERDDAP"), ("OGC:WMS", "OGC WMS (Web Map Service)"),
                    ("OGC:WMTS", "OGC WMTS (Web Map Tile Service)"),
                    ("OGC:WFS", "OGC WFS (Web Feature Service)"),
                    ("OGC:WCS", "OGC WCS (Web Coverage Service)"),
                    ("OGC:API", "OGC API (Features / Records / ...)"), ("DOI", "DOI"),
                ],
                help_text="Needed with a Link to data. Picked from the link (https, ftp, s3) - change it for services such as OPeNDAP, WMS, WFS, THREDDS.",
            ),
        ),
        migrations.RunPython(fill_protocols, migrations.RunPython.noop),
        migrations.RunPython(add_rows, remove_rows),
        # Help text only.
        migrations.AlterField(
            model_name="metadatarecord",
            name="character_encoding",
            field=models.CharField(
                blank=True, default="utf8", max_length=50,
                help_text="Character encoding of the data, e.g. utf8. Pre-filled - ",
            ),
        ),
    ]
