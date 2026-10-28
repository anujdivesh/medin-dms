from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0010_boundary_polygon"),
    ]

    operations = [
        migrations.AlterField(
            model_name="metadatarecord",
            name="boundary_type",
            field=models.CharField(
                choices=[
                    ("zone", "Bounding box"),
                    ("point", "Point"),
                    ("polygon", "Polygon"),
                ],
                default="zone",
                help_text="Whether this record's own boundary (if set) is a zone (bounding box), a single point or a polygon",
                max_length=10,
            ),
        ),
    ]
