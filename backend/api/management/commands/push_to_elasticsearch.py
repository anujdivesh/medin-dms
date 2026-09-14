"""Send metadata records to Elasticsearch, one document per record.

Which fields are sent is decided entirely by the ElasticsearchIndex rows and
their field whitelist — this command never invents fields of its own.

    python manage.py push_to_elasticsearch --dry-run
    python manage.py push_to_elasticsearch --index dms-records --create-index
"""

import json

from django.core.management.base import BaseCommand, CommandError

from api.elasticsearch_sync import _doc_id, get_es_client
from api.models import ElasticsearchIndex


class Command(BaseCommand):
    help = "Push metadata records to the Elasticsearch indexes configured in the admin."

    def add_arguments(self, parser):
        parser.add_argument(
            "--index",
            dest="index_names",
            action="append",
            help="Only push this ElasticsearchIndex (by name); repeatable.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print the documents that would be sent and exit.",
        )
        parser.add_argument(
            "--create-index",
            action="store_true",
            help="Create the index with a mapping from the field types if missing.",
        )
        parser.add_argument(
            "--limit", type=int, default=None, help="Cap the number of records."
        )

    def handle(self, *args, **options):
        indexes = ElasticsearchIndex.objects.filter(is_active=True).prefetch_related(
            "fields"
        )
        if options["index_names"]:
            indexes = indexes.filter(name__in=options["index_names"])
        if not indexes:
            raise CommandError("No active ElasticsearchIndex matched.")

        client = None if options["dry_run"] else self._client()

        for index in indexes:
            records = index.records()
            if options["limit"]:
                records = records[: options["limit"]]

            if options["dry_run"]:
                self.stdout.write(f"# {index.name} -> {index.index_name}")
                for record in records:
                    self.stdout.write(
                        json.dumps(index.build_document(record), indent=2, default=str)
                    )
                continue

            if options["create_index"] and not client.indices.exists(
                index=index.index_name
            ):
                client.indices.create(index=index.index_name, **index.build_mapping())
                self.stdout.write(f"created index {index.index_name}")

            actions = [
                {
                    "_op_type": "index",
                    "_index": index.index_name,
                    "_id": _doc_id(record),
                    "_source": index.build_document(record),
                }
                for record in records
            ]
            if not actions:
                self.stdout.write(f"{index.name}: nothing to send")
                continue

            from elasticsearch.helpers import bulk

            written, errors = bulk(client, actions, raise_on_error=False)
            self.stdout.write(
                self.style.SUCCESS(
                    f"{index.name}: sent {written} document(s) to {index.index_name}"
                )
            )
            for error in errors:
                self.stderr.write(str(error))

    def _client(self):
        """Build an Elasticsearch client from settings, failing with a clear message."""
        try:
            return get_es_client()
        except RuntimeError as exc:
            raise CommandError(str(exc)) from exc
