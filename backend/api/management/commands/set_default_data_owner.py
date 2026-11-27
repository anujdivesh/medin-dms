"""Give every metadata record that has no data owner the SPC organisation
(api.models.default_organisation - the one whose name contains "(SPC)").

Dry run by default - it only reports what it would change:

    python manage.py set_default_data_owner
    python manage.py set_default_data_owner --apply

--apply also routes data-request items that were waiting with no owner
("unrouted") to SPC's owners, who are emailed as usual. Afterwards run
push_to_elasticsearch so the search index shows the new owner.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import MetadataRecord, Organisation, default_organisation
from datarequests.models import DataRequestItem
from datarequests.services import route_unrouted_items


class Command(BaseCommand):
    help = "Set data_owner to the SPC organisation on records that have none."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Make the change (default: dry run).")
        parser.add_argument(
            "--organisation-id", type=int, default=None,
            help="Use this organisation instead of the one named '(SPC)'.",
        )

    def handle(self, *args, apply=False, organisation_id=None, **options):
        if organisation_id is not None:
            spc = Organisation.objects.filter(pk=organisation_id).first()
        else:
            spc = default_organisation()
        if spc is None:
            raise CommandError("No SPC organisation found (no name containing '(SPC)'); pass --organisation-id.")

        records = MetadataRecord.objects.filter(data_owner__isnull=True)
        unrouted = DataRequestItem.objects.filter(
            status=DataRequestItem.Status.UNROUTED, record__data_owner__isnull=True,
        )
        self.stdout.write(f"Organisation: {spc} (id {spc.pk})")
        self.stdout.write(f"Records without a data owner: {records.count()} "
                          f"(of {MetadataRecord.objects.count()})")
        self.stdout.write(f"Unrouted data-request items for them: {unrouted.count()}")

        if not apply:
            self.stdout.write(self.style.WARNING("Dry run - nothing changed. Re-run with --apply."))
            return

        with transaction.atomic():
            unrouted_ids = list(unrouted.values_list("pk", flat=True))
            updated = records.update(data_owner=spc)
            routed = route_unrouted_items(DataRequestItem.objects.filter(pk__in=unrouted_ids))
        self.stdout.write(self.style.SUCCESS(
            f"Set data owner on {updated} record(s); routed {routed} request item(s) to {spc}."
        ))
        self.stdout.write("Now run: python manage.py push_to_elasticsearch")
