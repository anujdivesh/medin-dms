from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0009_remove_acquisition_report_link"),
    ]

    operations = [
        migrations.AddField(
            model_name="metadatarecord",
            name="boundary_polygon",
            field=models.JSONField(
                blank=True,
                help_text="Polygon only: the outer ring as [[lng, lat], ...]. The "
                "bounding fields are filled in from its extent on save.",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="metadatarecord",
            name="boundary_type",
            field=models.CharField(
                choices=[
                    ("zone", "Zone (bounding box)"),
                    ("point", "Point"),
                    ("polygon", "Polygon"),
                ],
                default="zone",
                help_text="Whether this record's own boundary (if set) is a zone (bounding box), a single point or a polygon",
                max_length=10,
            ),
        ),
    ]
