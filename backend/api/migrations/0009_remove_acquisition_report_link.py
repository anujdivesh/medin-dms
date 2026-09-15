from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0008_backfill_acquisition_report_file"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="metadatarecord",
            name="acquisition_report_link",
        ),
    ]
