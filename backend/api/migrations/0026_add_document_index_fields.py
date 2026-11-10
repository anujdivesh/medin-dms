"""Adds search-index field maps for every Dataset Metadata Template field
each Elasticsearch index doesn't send yet (one it already covers in any
form, or whose key is taken, is left alone), then renumbers each index's
fields in document order. Frozen copy of
ElasticsearchIndex.add_document_fields() / sort_fields_by_document()."""

from django.db import migrations

DOCUMENT_INDEX_FIELDS = [
    ("title", [("title", "", "text")]),
    ("abstract", [("data.abstract", "abstract", "text")]),
    ("resource_identifier", [("data.resource_identifier", "resource_identifier", "keyword")]),
    ("data_type", [("data_type.data_type_value", "data_type_value", "keyword")]),
    ("version", [("data.version", "version", "text")]),
    ("language", [("data.language", "language", "keyword")]),
    ("project", [("project.project_name", "project_name", "text")]),
    ("topic", [("topic.topic_value", "topic_value", "keyword")]),
    ("keywords", [("keywords.keyword_value", "keywords", "keyword")]),
    ("contact", [
        ("contact.organization", "contact_organization", "text"),
        ("contact.email", "contact_email", "keyword"),
    ]),
    ("publisher", [("publisher.publisher_value", "publisher_value", "keyword")]),
    ("originator", [("data.originator", "originator", "text")]),
    ("custodian", [("data.custodian", "custodian", "text")]),
    ("owner", [("data.owner", "owner", "text")]),
    ("fundings", [("data.fundings", "fundings", "text")]),
    ("country", [("country.long_name", "country_long_name", "keyword")]),
    ("west_bound", [("west_bound_longitude", "west_bounding_longitude", "float")]),
    ("east_bound", [("east_bound_longitude", "east_bounding_longitude", "float")]),
    ("south_bound", [("south_bound_latitude", "south_bounding_latitude", "float")]),
    ("north_bound", [("north_bound_latitude", "north_bounding_latitude", "float")]),
    ("temporal_coverage_from", [("temporal_coverage_from", "", "date")]),
    ("temporal_coverage_to", [("temporal_coverage_to", "", "date")]),
    ("coordinate_reference_system", [("coordinate_reference_system.crs_value", "crs_value", "keyword")]),
    ("spatial_representation_type", [(
        "spatial_representation_type.spatial_representation_type_value",
        "spatial_representation_type", "keyword",
    )]),
    ("spatial_resolution", [("data.spatial_resolution", "spatial_resolution", "text")]),
    ("lineage", [("data.lineage", "lineage", "text")]),
    ("history", [("data.history", "history", "text")]),
    ("update_frequency", [("data.update_frequency", "update_frequency", "keyword")]),
    ("access_constraints", [("access_constraints_label", "access_constraints", "keyword")]),
    ("acknowledgement", [("data.acknowledgement", "acknowledgement", "text")]),
    ("link_to_data", [("link_to_data_url", "link_to_data", "text")]),
    ("protocol", [("data.protocol", "protocol", "keyword")]),
    ("data_format", [("data.data_format", "data_format", "keyword")]),
    ("file", [("file_url", "", "text")]),
    ("file_description", [("file_description", "", "text")]),
    ("attribute", [("data.attribute", "attribute", "text")]),
    ("references", [("data.references", "references", "text")]),
    ("additional_information", [("additional_information_value", "additional_information", "text")]),
    ("comment", [("data.comment", "comment", "text")]),
    ("metadata_standard_name", [("data.metadata_standard_name", "metadata_standard_name", "text")]),
    ("metadata_standard_version", [("data.metadata_standard_version", "metadata_standard_version", "keyword")]),
    ("metadata_standard_language", [("data.metadata_standard_language", "metadata_standard_language", "keyword")]),
    ("character_encoding", [("data.character_encoding", "character_encoding", "keyword")]),
    ("metadata_date", [("metadata_date", "", "date")]),
    ("acquisition_report", [("acquisition_report_url", "acquisition_report", "text")]),
    ("project_report", [("project_report_url", "project_report", "text")]),
    ("factsheet", [("data.factsheet", "factsheet", "text")]),
]

# Source roots -> the DOCUMENT_INDEX_FIELDS key they count as, beyond
# `data.<key>` and a root named like the key.
_INDEX_FIELD_ROOTS = {
    "crs_name": "country",
    "boundary_type": "boundary", "boundary_polygon": "boundary",
    "west_bound_longitude": "west_bound", "east_bound_longitude": "east_bound",
    "south_bound_latitude": "south_bound", "north_bound_latitude": "north_bound",
    "west_bounding_longitude": "west_bound", "east_bounding_longitude": "east_bound",
    "south_bounding_latitude": "south_bound", "north_bounding_latitude": "north_bound",
    "access_constraints_label": "access_constraints",
    "link_to_data_url": "link_to_data",
    "file_url": "file",
    "acquisition_report_link": "acquisition_report",
    "acquisition_report_file": "acquisition_report",
    "acquisition_report_url": "acquisition_report",
    "project_report_link": "project_report",
    "project_report_file": "project_report",
    "project_report_url": "project_report",
    "additional_information_file": "additional_information",
    "additional_information_value": "additional_information",
}


def _index_field_key(source):
    if source.startswith("data."):
        return source[len("data."):]
    root = source.split(".", 1)[0]
    return _INDEX_FIELD_ROOTS.get(root, root)


POSITIONS = {
    "title": 1, "abstract": 2, "resource_identifier": 3, "data_type": 4, "version": 5,
    "language": 6, "project": 7, "topic": 8, "keywords": 9, "contact": 10,
    "publisher": 11, "originator": 12, "custodian": 13, "owner": 14, "fundings": 15,
    "country": 16, "boundary": 17,
    "west_bound": 18, "east_bound": 19, "south_bound": 20, "north_bound": 21, "temporal_coverage_from": 22, "temporal_coverage_to": 23,
    "coordinate_reference_system": 25, "spatial_representation_type": 26,
    "spatial_resolution": 27, "lineage": 28, "history": 29, "update_frequency": 30,
    "access_constraints": 31, "acknowledgement": 32, "link_to_data": 33, "protocol": 34,
    "data_format": 35, "file": 36, "file_description": 37, "attribute": 38,
    "references": 39, "additional_information": 40, "comment": 41,
    "metadata_standard_name": 42, "metadata_standard_version": 43,
    "metadata_standard_language": 44, "character_encoding": 45, "metadata_date": 46,
    "acquisition_report": 47, "project_report": 48, "factsheet": 49, "license": 51,
}
LAST = 10 ** 6


def add_fields(apps, schema_editor):
    ElasticsearchIndex = apps.get_model("api", "ElasticsearchIndex")
    ElasticsearchFieldMap = apps.get_model("api", "ElasticsearchFieldMap")
    FieldDefinition = apps.get_model("api", "FieldDefinition")

    positions = dict(POSITIONS)
    for name, order in FieldDefinition.objects.values_list("name", "order"):
        positions[name] = min(positions.get(name, order), order)

    for index in ElasticsearchIndex.objects.all():
        existing = list(ElasticsearchFieldMap.objects.filter(index=index))
        covered = {_index_field_key(f.source) for f in existing}
        sources = {f.source for f in existing}
        keys = {f.target or f.source.replace(".", "_") for f in existing}
        for key, maps in DOCUMENT_INDEX_FIELDS:
            if key in covered:
                continue
            for source, target, es_type in maps:
                target_key = target or source.replace(".", "_")
                if source in sources or target_key in keys:
                    continue
                ElasticsearchFieldMap.objects.create(
                    index=index, source=source, target=target, es_type=es_type,
                )
                sources.add(source)
                keys.add(target_key)

        fields = sorted(
            ElasticsearchFieldMap.objects.filter(index=index).order_by("order", "id"),
            key=lambda f: positions.get(_index_field_key(f.source), LAST),
        )
        for number, field_map in enumerate(fields, start=1):
            if field_map.order != number:
                field_map.order = number
                field_map.save(update_fields=["order"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0025_sort_index_fields"),
    ]

    operations = [
        migrations.RunPython(add_fields, migrations.RunPython.noop),
    ]
