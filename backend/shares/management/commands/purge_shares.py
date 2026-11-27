from django.core.management.base import BaseCommand

from shares import services


class Command(BaseCommand):
    help = (
        "Delete the files of expired shares and remove abandoned (never "
        "published) uploads. Run hourly - the share-cleaner service in "
        "docker-compose.yml does."
    )

    def handle(self, *args, **options):
        expired, drafts = services.purge()
        self.stdout.write(f"Expired {expired} share(s); removed {drafts} abandoned upload(s).")
