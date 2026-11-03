from django.db import migrations, models

import api.models


# Frozen copy of LINK_AND_FILE_SOURCES as of this migration.
LINK_AND_FILE_SOURCES = [
    "link_to_data",
    "link_to_data_url",
    "acquisition_report_file",
    "acquisition_report_url",
    "additional_information",
    "additional_information_file",
    "additional_information_value",
    "project_report_link",
    "project_report_url",
    "file",
    "file_url",
]


def hide_links_and_files(apps, schema_editor):
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    MetadataRecord.objects.update(hidden_when_private=LINK_AND_FILE_SOURCES)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0011_boundary_type_label"),
    ]

    operations = [
        migrations.AddField(
            model_name="metadatarecord",
            name="hidden_when_private",
            field=models.JSONField(
                blank=True,
                default=api.models.default_hidden_when_private,
                help_text="Fields left out of the search index (pygeoapi) while this record's access constraint is private.",
            ),
        ),
        migrations.RunPython(hide_links_and_files, migrations.RunPython.noop),
    ]
