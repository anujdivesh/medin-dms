"""Manually regenerate pygeoapi's config from the ElasticsearchIndex rows in
the database - the same thing that happens automatically whenever an index
is saved/deleted in the admin (see api/signals.py, api/pygeoapi_sync.py).

Useful after editing indexes directly in a shell/migration, or to bring
pygeoapi's config back in sync without touching any index record:

    python manage.py sync_pygeoapi_config
    python manage.py sync_pygeoapi_config --no-restart
"""

from django.core.management.base import BaseCommand

from api import pygeoapi_sync


class Command(BaseCommand):
    help = "Regenerate pygeoapi-config.yml (+ .local/.docker) from ElasticsearchIndex rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-restart",
            action="store_true",
            help="Regenerate the config files only; don't restart pygeoapi.",
        )

    def handle(self, *args, **options):
        pygeoapi_sync.regenerate_all()
        self.stdout.write(self.style.SUCCESS("Regenerated pygeoapi config."))

        if options["no_restart"]:
            return
        pygeoapi_sync.restart_pygeoapi()
        self.stdout.write(self.style.SUCCESS("Requested pygeoapi restart."))
