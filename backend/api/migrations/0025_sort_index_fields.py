"""Renumbers every Elasticsearch index's field maps 1, 2, 3, ... in Dataset
Metadata Template order, so the admin lists them as pygeoapi shows them.
Frozen copy of ElasticsearchIndex.sort_fields_by_document()."""

from django.db import migrations

POSITIONS = {
    "title": 1, "abstract": 2, "resource_identifier": 3, "data_type": 4, "version": 5,
    "language": 6, "project": 7, "topic": 8, "keywords": 9, "contact": 10,
    "publisher": 11, "originator": 12, "custodian": 13, "owner": 14, "fundings": 15,
    "country": 16, "boundary": 17, "temporal_coverage_from": 22, "temporal_coverage_to": 23,
    "coordinate_reference_system": 25, "spatial_representation_type": 26,
    "spatial_resolution": 27, "lineage": 28, "history": 29, "update_frequency": 30,
    "access_constraints": 31, "acknowledgement": 32, "link_to_data": 33, "protocol": 34,
    "data_format": 35, "attribute": 38, "references": 39, "additional_information": 40,
    "comment": 41, "metadata_standard_name": 42, "metadata_standard_version": 43,
    "metadata_standard_language": 44, "character_encoding": 45, "metadata_date": 46,
    "acquisition_report_file": 47, "project_report_link": 48, "factsheet": 49,
    "additional_information_file": 50, "license": 51,
}

# Column (first part of a source path) -> the field it belongs to.
SOURCE_FIELDS = {
    "boundary_type": "boundary", "west_bounding_longitude": "boundary",
    "east_bounding_longitude": "boundary", "south_bounding_latitude": "boundary",
    "north_bounding_latitude": "boundary", "boundary_polygon": "boundary",
    "west_bound_longitude": "boundary", "east_bound_longitude": "boundary",
    "south_bound_latitude": "boundary", "north_bound_latitude": "boundary",
    "crs_name": "country",
    "access_constraints_label": "access_constraints",
    "link_to_data_url": "link_to_data", "file": "link_to_data", "file_url": "link_to_data",
    "file_description": "link_to_data",
    "acquisition_report_link": "acquisition_report_file",
    "acquisition_report_url": "acquisition_report_file",
    "project_report_file": "project_report_link", "project_report_url": "project_report_link",
    "additional_information_value": "additional_information",
}

LAST = 10 ** 6


def sort_fields(apps, schema_editor):
    ElasticsearchIndex = apps.get_model("api", "ElasticsearchIndex")
    ElasticsearchFieldMap = apps.get_model("api", "ElasticsearchFieldMap")
    FieldDefinition = apps.get_model("api", "FieldDefinition")

    positions = dict(POSITIONS)
    for name, order in FieldDefinition.objects.values_list("name", "order"):
        positions[name] = min(positions.get(name, order), order)

    def key(field_map):
        source = field_map.source
        if source.startswith("data."):
            name = source[len("data."):]
        else:
            root = source.split(".", 1)[0]
            name = SOURCE_FIELDS.get(root, root)
        return positions.get(name, LAST)

    for index in ElasticsearchIndex.objects.all():
        fields = sorted(
            ElasticsearchFieldMap.objects.filter(index=index).order_by("order", "id"), key=key
        )
        for number, field_map in enumerate(fields, start=1):
            if field_map.order != number:
                field_map.order = number
                field_map.save(update_fields=["order"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0024_identifier_parties_resolution"),
    ]

    operations = [
        migrations.RunPython(sort_fields, migrations.RunPython.noop),
    ]
