"""Wires MetadataRecord (and the lookups it references) to Elasticsearch.

Connected in api/apps.py::ApiConfig.ready(). Kept separate from
elasticsearch_sync.py so that module stays import-safe (no signal
side-effects) for use from management commands/tests.
"""

from django.db.models.signals import post_delete, post_save

from . import elasticsearch_sync, pygeoapi_sync
from .models import (
    Contact,
    CoordinateReferenceSystem,
    Country,
    DataType,
    ElasticsearchIndex,
    MetadataRecord,
    Publisher,
    SpatialRepresentationType,
    Topic,
)


def _on_record_saved(sender, instance, **kwargs):
    elasticsearch_sync.sync_record(instance)


def _on_record_deleted(sender, instance, **kwargs):
    elasticsearch_sync.remove_record(instance)


def _on_lookup_saved(sender, instance, **kwargs):
    """A referenced lookup changed - re-sync every record that points at it,
    mirroring legacy's updated_columns_send_elastic_search."""
    elasticsearch_sync.resync_records_for(instance.metadatarecords)


def _on_elasticsearch_index_changed(sender, instance, **kwargs):
    """An index was created/edited/deleted in the admin - regenerate
    pygeoapi's config (and restart it locally) so its set of collections
    stays a 1:1 mirror of the active ElasticsearchIndex rows."""
    pygeoapi_sync.sync_pygeoapi()


def connect():
    post_save.connect(_on_record_saved, sender=MetadataRecord, dispatch_uid="api.sync_metadatarecord_saved")
    post_delete.connect(_on_record_deleted, sender=MetadataRecord, dispatch_uid="api.sync_metadatarecord_deleted")

    post_save.connect(
        _on_elasticsearch_index_changed,
        sender=ElasticsearchIndex,
        dispatch_uid="api.sync_pygeoapi_on_index_saved",
    )
    post_delete.connect(
        _on_elasticsearch_index_changed,
        sender=ElasticsearchIndex,
        dispatch_uid="api.sync_pygeoapi_on_index_deleted",
    )

    for model in (
        Contact,
        Country,
        Publisher,
        Topic,
        SpatialRepresentationType,
        CoordinateReferenceSystem,
        DataType,
    ):
        post_save.connect(
            _on_lookup_saved,
            sender=model,
            dispatch_uid=f"api.resync_on_{model.__name__.lower()}_saved",
        )
