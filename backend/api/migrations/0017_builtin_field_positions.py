from django.db import migrations


# Frozen copy of BUILTIN_FIELD_POSITIONS as of this migration: each built-in
# field's number in the Dataset Metadata Template.
POSITIONS = {
    "title": 1,
    "abstract": 2,
    "data_type": 4,
    "version": 5,
    "language": 6,
    "project": 7,
    "topic": 8,
    "keywords": 9,
    "contact": 10,
    "publisher": 11,
    "fundings": 15,
    "country": 16,
    "boundary": 17,
    "temporal_coverage_from": 22,
    "temporal_coverage_to": 23,
    "coordinate_reference_system": 25,
    "spatial_representation_type": 26,
    "lineage": 28,
    "history": 29,
    "update_frequency": 30,
    "access_constraints": 31,
    "acknowledgement": 32,
    "link_to_data": 33,
    "data_format": 35,
    "attribute": 38,
    "references": 39,
    "additional_information": 40,
    "comment": 41,
    "metadata_standard_name": 42,
    "metadata_standard_version": 43,
    "metadata_standard_language": 44,
    "acquisition_report_file": 47,
    "project_report_link": 48,
    "factsheet": 49,
    "additional_information_file": 50,
    "license": 51,
}


def number_builtin_rows(apps, schema_editor):
    """Existing templates' built-in rows take their document number (custom
    rows keep theirs)."""
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    for name, position in POSITIONS.items():
        FieldDefinition.objects.filter(field_type="builtin", name=name).update(order=position)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0016_field_sections"),
    ]

    operations = [
        migrations.RunPython(number_builtin_rows, migrations.RunPython.noop),
    ]
