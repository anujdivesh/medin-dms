from django.db import migrations


def backfill(apps, schema_editor):
    """Point the new `acquisition_report_file` upload field at the file that
    already exists on disk for each record's old `acquisition_report_link`
    text path (e.g. "/downloads/acquisition_reports/499_....pdf" -> the same
    filename under MEDIA_ROOT/acquisition_reports/, set directly via
    FileField.name rather than re-uploading anything)."""
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    for record in MetadataRecord.objects.exclude(acquisition_report_link=""):
        filename = record.acquisition_report_link.rsplit("/", 1)[-1]
        record.acquisition_report_file.name = f"acquisition_reports/{filename}"
        record.save(update_fields=["acquisition_report_file"])


def reverse(apps, schema_editor):
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    for record in MetadataRecord.objects.exclude(acquisition_report_file=""):
        record.acquisition_report_file = None
        record.save(update_fields=["acquisition_report_file"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0007_upload_acquisition_and_additional_info"),
    ]

    operations = [
        migrations.RunPython(backfill, reverse),
    ]
