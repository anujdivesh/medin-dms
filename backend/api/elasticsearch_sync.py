"""Real-time Postgres -> Elasticsearch sync for MetadataRecord.

Each record's `metadata_type` determines which Elasticsearch index (if any)
it syncs to - one index per type (api.models.ElasticsearchIndex), each
index's document shape/fields driven by its configurable
ElasticsearchFieldMap rows (see ElasticsearchIndex.build_document). Wired
via post_save/post_delete signals in api/signals.py.

This replaces the earlier design where every record synced to one shared
"metadata" index with a hard-coded document shape - see the migration plan,
Phase 9, for why: indexes are now split per metadata type (e.g.
oceanography/drone), each its own pygeoapi collection.
"""

import logging

from django.conf import settings

from .models import ElasticsearchIndex

logger = logging.getLogger(__name__)


def get_es_client():
    """Build an Elasticsearch client from settings.

    Raises RuntimeError with a clear message if the package isn't installed
    or no URL is configured, rather than letting an ImportError/AttributeError
    surface from deep inside a signal handler.
    """
    try:
        from elasticsearch import Elasticsearch
    except ImportError as exc:
        raise RuntimeError(
            "The elasticsearch package is not installed - run `pip install elasticsearch`."
        ) from exc

    url = getattr(settings, "ELASTICSEARCH_URL", None)
    if not url:
        raise RuntimeError("Set ELASTICSEARCH_URL in settings/environment.")

    kwargs = {}
    api_key = getattr(settings, "ELASTICSEARCH_API_KEY", None)
    username = getattr(settings, "ELASTICSEARCH_USERNAME", None)
    password = getattr(settings, "ELASTICSEARCH_PASSWORD", None)
    if api_key:
        kwargs["api_key"] = api_key
    elif username and password:
        kwargs["basic_auth"] = (username, password)
    return Elasticsearch(url, **kwargs)


def _doc_id(record):
    """Records imported from the legacy backend (Phase 4's ETL) carry their
    original legacy numeric id in `legacy_id` - reusing it means a migrated
    record's document *replaces* the one legacy already wrote for it,
    instead of duplicating under Django's own (unrelated) pk. Records
    created fresh in the new backend have no `legacy_id`, so they fall back
    to `pk`.
    """
    return str(record.legacy_id if record.legacy_id is not None else record.pk)


def _index_for(record):
    """The ElasticsearchIndex configured for `record`'s metadata_type, if any."""
    if not record.metadata_type_id:
        return None
    return getattr(record.metadata_type, "elasticsearch_index", None)


def _delete_from(index, doc_id):
    try:
        from elasticsearch import NotFoundError

        client = get_es_client()
        try:
            client.delete(index=index.index_name, id=doc_id)
        except NotFoundError:
            pass
    except Exception:
        logger.exception("Failed to remove doc %s from Elasticsearch index %s", doc_id, index.index_name)


def sync_record(record):
    """Index (or re-index) `record` in its type's ES index, if an active
    index is configured for that type; otherwise remove it. Every record is
    sent regardless of status - there's no published-only gate.

    Also cleans up any *other* index that might hold a stale copy - e.g. if
    a record's metadata_type is reassigned after it was already indexed
    under the old type.
    """
    doc_id = _doc_id(record)
    current_index = _index_for(record)

    for index in ElasticsearchIndex.objects.exclude(pk=getattr(current_index, "pk", None)):
        _delete_from(index, doc_id)

    should_index = current_index is not None and current_index.is_active
    if not should_index:
        if current_index is not None:
            _delete_from(current_index, doc_id)
        return

    try:
        client = get_es_client()
        client.index(
            index=current_index.index_name,
            id=doc_id,
            document=current_index.build_document(record),
        )
    except Exception:
        logger.exception("Failed to sync MetadataRecord %s to Elasticsearch", record.pk)


def remove_record(record):
    """Remove `record` from every configured Elasticsearch index."""
    doc_id = _doc_id(record)
    for index in ElasticsearchIndex.objects.all():
        _delete_from(index, doc_id)


def resync_records_for(queryset):
    """Re-sync every record in `queryset` - used when a referenced lookup
    (contact/country/topic/etc.) changes. Mirrors legacy's
    `updated_columns_send_elastic_search`.
    """
    for record in queryset.all():
        sync_record(record)
