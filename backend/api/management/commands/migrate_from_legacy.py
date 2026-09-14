"""One-time ETL: import the legacy FastAPI backend's Postgres data into
this backend's schema.

    python manage.py migrate_from_legacy --dry-run
    python manage.py migrate_from_legacy

Idempotent: every migrated row carries `legacy_id`, so re-running upserts by
it instead of duplicating - safe to re-run as the schema evolves.

Known, accepted gaps (see the migration plan, Phase 2/4/8):
- Legacy's PostGIS `bounding_box` geometry column is not imported (it's
  redundant with the four west/east/south/north_bounding_* float columns,
  which ARE imported into the matching fields on MetadataRecord as a "zone"
  boundary - see BOUNDARY_FIELDS below). This command still warns when a
  record's legacy bounds differ meaningfully from its country's, though that
  drift is no longer lost - it's preserved as the record's own zone.
- `elasticsearch_columns` (a rare per-record ES field override - only ~1 of
  248 legacy records used it) is not imported; the new sync always uses the
  standard field set.
- Legacy users are not migrated (out of scope) - `owner`/`reviewed_by` are
  left unset; the original `created_by`/`approved_by`/`rejected_by`
  usernames are preserved as text inside `action_history` instead.
"""

import json
import re

import psycopg2
import psycopg2.extras
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import (
    AccessConstraints,
    BoundaryType,
    Contact,
    Country,
    CoordinateReferenceSystem,
    DataType,
    FieldDefinition,
    FieldType,
    Keyword,
    MetadataRecord,
    MetadataTemplate,
    MetadataType,
    Project,
    Publisher,
    SpatialRepresentationType,
    Topic,
)

# Legacy `metadata.status_id` -> MetadataRecord.Status. Per the Phase 1 audit
# of the real prod backup, this corrects CLAUDE.md's stale documentation:
# it's 1=active/2=deleted/3=draft/4=declined, not "3=unknown/pending".
METADATA_STATUS_MAP = {
    1: MetadataRecord.Status.PUBLISHED,
    2: MetadataRecord.Status.ARCHIVED,
    3: MetadataRecord.Status.DRAFT,
    4: MetadataRecord.Status.REJECTED,
}

# Legacy free-text access_constraints -> this backend's choices.
ACCESS_MAP = {
    "public": AccessConstraints.OPEN,
    "private": AccessConstraints.PRIVATE,
}

# Bounding-box drift beyond this (in degrees) between a record's own legacy
# box and its assigned country's box gets flagged - just a sanity threshold,
# not a precise tolerance.
BBOX_DRIFT_THRESHOLD = 0.5

LEGACY_TEMPLATE_NAME = "Legacy"

BOUNDARY_FIELDS = (
    "boundary_type",
    "west_bounding_longitude",
    "east_bounding_longitude",
    "south_bounding_latitude",
    "north_bounding_latitude",
)


def clean_str(value):
    """Trim stray whitespace legacy data carries (Phase 1 audit found
    "english ", "unknown ", etc. on many free-text columns)."""
    if value is None:
        return None
    value = value.strip()
    return value or None


class Command(BaseCommand):
    help = "One-time import of the legacy backend's Postgres data into this backend."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true", help="Report counts, write nothing."
        )
        parser.add_argument(
            "--limit", type=int, default=None, help="Cap the number of metadata rows imported."
        )

    def handle(self, *args, **options):
        self.dry_run = options["dry_run"]
        self.limit = options["limit"]
        self.skipped = []

        conn = psycopg2.connect(
            dbname=settings.LEGACY_DB_NAME,
            user=settings.LEGACY_DB_USER,
            password=settings.LEGACY_DB_PASSWORD,
            host=settings.LEGACY_DB_HOST,
            port=settings.LEGACY_DB_PORT,
        )
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                contact_map = self._import_contacts(cur)
                crs_map, crs_values = self._import_crs(cur)
                country_map, country_bounds = self._import_countries(cur, crs_values)
                publisher_map = self._import_publishers(cur)
                topic_map = self._import_topics(cur)
                keyword_map = self._import_keywords(cur)
                data_type_map = self._import_data_types(cur)
                sr_type_map = self._import_spatial_representation_types(cur)
                project_map = self._import_projects(cur)
                template = self._get_or_create_legacy_template()
                oceanography_type = self._get_default_metadata_type()

                maps = dict(
                    contact_map=contact_map,
                    country_map=country_map,
                    country_bounds=country_bounds,
                    crs_map=crs_map,
                    publisher_map=publisher_map,
                    topic_map=topic_map,
                    keyword_map=keyword_map,
                    data_type_map=data_type_map,
                    sr_type_map=sr_type_map,
                    project_map=project_map,
                    template=template,
                    default_metadata_type=oceanography_type,
                )
                self._import_metadata(cur, **maps)
                self._import_pre_approvals(cur, **maps)
        finally:
            conn.close()

        if self.skipped:
            self.stdout.write(self.style.WARNING(f"\n{len(self.skipped)} row(s) skipped:"))
            for reason in self.skipped:
                self.stdout.write(f"  - {reason}")

    # --- Simple 1:1 lookups ---------------------------------------------

    def _import_simple_lookup(self, cur, table, value_column, model, value_field):
        cur.execute(f"SELECT id, {value_column} FROM {table} ORDER BY id")
        rows = cur.fetchall()
        id_map = {}
        for row in rows:
            value = clean_str(row[value_column]) or f"(legacy #{row['id']})"
            if not self.dry_run:
                obj, _ = model.objects.update_or_create(
                    legacy_id=row["id"], defaults={value_field: value}
                )
                id_map[row["id"]] = obj.pk
            else:
                id_map[row["id"]] = None
        self._report(model.__name__, len(rows))
        return id_map

    def _import_contacts(self, cur):
        cur.execute("SELECT id, first_name, last_name, position, email FROM contact ORDER BY id")
        rows = cur.fetchall()
        id_map = {}
        for row in rows:
            defaults = {
                "firstname": clean_str(row["first_name"]) or "",
                "lastname": clean_str(row["last_name"]) or "",
                "email": clean_str(row["email"]) or "",
                "position": clean_str(row["position"]) or "",
            }
            if not self.dry_run:
                obj, _ = Contact.objects.update_or_create(legacy_id=row["id"], defaults=defaults)
                id_map[row["id"]] = obj.pk
            else:
                id_map[row["id"]] = None
        self._report("Contact", len(rows))
        return id_map

    def _import_crs(self, cur):
        cur.execute("SELECT id, value, description FROM coordinate_reference_system ORDER BY id")
        rows = cur.fetchall()
        id_map, values = {}, {}
        for row in rows:
            value = clean_str(row["value"]) or f"(legacy #{row['id']})"
            values[row["id"]] = value
            if not self.dry_run:
                obj, _ = CoordinateReferenceSystem.objects.update_or_create(
                    legacy_id=row["id"],
                    defaults={"crs_value": value, "crs_description": clean_str(row["description"]) or ""},
                )
                id_map[row["id"]] = obj.pk
            else:
                id_map[row["id"]] = None
        self._report("CoordinateReferenceSystem", len(rows))
        return id_map, values

    def _import_countries(self, cur, crs_values):
        cur.execute(
            "SELECT id, short_name, long_name, west_bound_longitude, east_bound_longitude, "
            "south_bound_latitude, north_bound_latitude, crs_id FROM country ORDER BY id"
        )
        rows = cur.fetchall()
        id_map, bounds = {}, {}
        for row in rows:
            bounds[row["id"]] = (
                row["west_bound_longitude"], row["east_bound_longitude"],
                row["south_bound_latitude"], row["north_bound_latitude"],
            )
            defaults = {
                "short_name": clean_str(row["short_name"]) or f"L{row['id']}",
                "long_name": clean_str(row["long_name"]) or f"(legacy #{row['id']})",
                "west_bound_longitude": row["west_bound_longitude"] or 0,
                "east_bound_longitude": row["east_bound_longitude"] or 0,
                "south_bound_latitude": row["south_bound_latitude"] or 0,
                "north_bound_latitude": row["north_bound_latitude"] or 0,
                "crs_name": crs_values.get(row["crs_id"], "unknown"),
            }
            if not self.dry_run:
                obj, _ = Country.objects.update_or_create(legacy_id=row["id"], defaults=defaults)
                id_map[row["id"]] = obj.pk
            else:
                id_map[row["id"]] = None
        self._report("Country", len(rows))
        return id_map, bounds

    def _import_publishers(self, cur):
        cur.execute("SELECT id, value, website, email FROM publisher ORDER BY id")
        rows = cur.fetchall()
        id_map = {}
        for row in rows:
            defaults = {
                "publisher_value": clean_str(row["value"]) or f"(legacy #{row['id']})",
                "website": clean_str(row["website"]) or "",
                "email": clean_str(row["email"]) or "",
            }
            if not self.dry_run:
                obj, _ = Publisher.objects.update_or_create(legacy_id=row["id"], defaults=defaults)
                id_map[row["id"]] = obj.pk
            else:
                id_map[row["id"]] = None
        self._report("Publisher", len(rows))
        return id_map

    def _import_topics(self, cur):
        return self._import_simple_lookup(cur, "topic", "value", Topic, "topic_value")

    def _import_keywords(self, cur):
        return self._import_simple_lookup(cur, "keyword", "value", Keyword, "keyword_value")

    def _import_data_types(self, cur):
        return self._import_simple_lookup(cur, "data_type", "value", DataType, "data_type_value")

    def _import_spatial_representation_types(self, cur):
        return self._import_simple_lookup(
            cur, "spatial_representation_type", "value", SpatialRepresentationType,
            "spatial_representation_type_value",
        )

    def _import_projects(self, cur):
        cur.execute("SELECT id, project_code, project_name, comment FROM project ORDER BY id")
        rows = cur.fetchall()
        id_map = {}
        for row in rows:
            defaults = {
                "project_name": clean_str(row["project_name"]) or f"(legacy #{row['id']})",
                "project_code": clean_str(row["project_code"]) or f"LEGACY-{row['id']}",
                "comments": clean_str(row["comment"]) or "",
            }
            if not self.dry_run:
                obj, _ = Project.objects.update_or_create(legacy_id=row["id"], defaults=defaults)
                id_map[row["id"]] = obj.pk
            else:
                id_map[row["id"]] = None
        self._report("Project", len(rows))
        return id_map

    def _get_or_create_legacy_template(self):
        """A single template covering every legacy record: all its data lived
        in real Metadata columns except `project_id`, which this backend
        models as a template FieldType.PROJECT field (see models.py's
        Project docstring) - so this template declares exactly that one
        extra field."""
        if self.dry_run:
            return None
        template, _ = MetadataTemplate.objects.get_or_create(
            name=LEGACY_TEMPLATE_NAME,
            defaults={"description": "Records imported from the legacy FastAPI backend."},
        )
        FieldDefinition.objects.update_or_create(
            template=template,
            name="project",
            defaults={
                "label": "Project",
                "field_type": FieldType.PROJECT,
                "required": False,
                "order": 0,
            },
        )
        return template

    def _get_default_metadata_type(self):
        """Every legacy record predates the metadata_type field - all of it
        is oceanographic data, per the same call made for the initial import
        (see migration 0014_seed_metadata_types)."""
        if self.dry_run:
            return None
        metadata_type, _ = MetadataType.objects.get_or_create(metadata_type_value="Oceanography")
        return metadata_type

    # --- Metadata / MetadataPreApproval -----------------------------------

    def _record_kwargs(self, row, contact_map, country_map, country_bounds, crs_map,
                        publisher_map, topic_map, keyword_map, data_type_map, sr_type_map,
                        project_map, template):
        """Build the MetadataRecord field dict shared by both legacy tables.
        Returns None (and records a skip reason) if a required lookup FK is
        missing in the legacy row."""
        required_fk_map = {
            "contact": (row.get("contact_id"), contact_map),
            "country": (row.get("country_id"), country_map),
            "coordinate_reference_system": (row.get("crs_id"), crs_map),
            "publisher": (row.get("publisher_id"), publisher_map),
            "topic": (row.get("topic_id"), topic_map),
            "spatial_representation_type": (row.get("spatial_representation_type_id"), sr_type_map),
        }
        resolved = {}
        for field, (legacy_fk, id_map) in required_fk_map.items():
            if legacy_fk is None or legacy_fk not in id_map:
                self.skipped.append(
                    f"legacy id {row['id']}: missing required {field} (legacy fk={legacy_fk!r})"
                )
                return None
            resolved[f"{field}_id"] = id_map[legacy_fk]

        own_west = row.get("west_bounding_longitude")
        own_east = row.get("east_bounding_longitude")
        own_south = row.get("south_bounding_latitude")
        own_north = row.get("north_bounding_latitude")

        # Bounding-box drift check (record's own box vs its country's) - just
        # a log message, the actual per-record box is stored below now.
        if row["country_id"] in country_bounds:
            c_west, c_east, c_south, c_north = country_bounds[row["country_id"]]
            for label, own, country_val in (
                ("west", own_west, c_west),
                ("east", own_east, c_east),
                ("south", own_south, c_south),
                ("north", own_north, c_north),
            ):
                if own is not None and country_val is not None and abs(own - country_val) > BBOX_DRIFT_THRESHOLD:
                    self.stdout.write(self.style.WARNING(
                        f"  bbox drift: legacy metadata id {row['id']} {label} bound "
                        f"{own} differs from country's {country_val} by >{BBOX_DRIFT_THRESHOLD}"
                    ))

        # Legacy always stored a full 4-corner box (never a point) - carry it
        # over as this record's own zone, so the map/pygeoapi show its real
        # precise extent instead of falling back to the country's box.
        if None not in (own_west, own_east, own_south, own_north):
            resolved["boundary_type"] = BoundaryType.ZONE
            resolved["west_bounding_longitude"] = own_west
            resolved["east_bounding_longitude"] = own_east
            resolved["south_bounding_latitude"] = own_south
            resolved["north_bounding_latitude"] = own_north

        access = ACCESS_MAP.get(
            clean_str(row.get("access_constraints") or "").lower() if row.get("access_constraints") else None,
            AccessConstraints.PRIVATE,
        )

        data_type_legacy = row.get("data_type_id")
        if data_type_legacy is not None and data_type_legacy in data_type_map:
            resolved["data_type_id"] = data_type_map[data_type_legacy]

        project_legacy = row.get("project_id")
        data = {}
        if project_legacy is not None and project_legacy in project_map:
            data["project"] = project_map[project_legacy]

        resolved.update(dict(
            template=template,
            data=data,
            title=clean_str(row.get("title")) or f"(untitled, legacy #{row['id']})",
            abstract=clean_str(row.get("abstract")) or "",
            comment=clean_str(row.get("comment")) or "",
            language=clean_str(row.get("language")) or "English",
            version=clean_str(row.get("version")) or "1.0.0",
            access_constraints=access,
            license=clean_str(row.get("license")) or "Other (Not Open)",
            temporal_coverage_from=row.get("temporal_coverage_from"),
            temporal_coverage_to=row.get("temporal_coverage_to"),
            metadata_standard_language=clean_str(row.get("metadata_standard_language")) or "English",
            metadata_standard_version=clean_str(row.get("metadata_standard_version")) or "3.1.2",
            metadata_standard_name=clean_str(row.get("metadata_standard_name")) or "MEDIN",
            update_frequency=clean_str(row.get("update_frequency")) or "",
            data_format=clean_str(row.get("data_format")) or "GIS",
            lineage=clean_str(row.get("lineage")) or "none",
            link_to_data=clean_str(row.get("link_to_data")) or "",
            acknowledgement=clean_str(row.get("acknowledgement")) or "",
            history=clean_str(row.get("history")) or "",
            fundings=clean_str(row.get("fundings")) or "",
            references=clean_str(row.get("references_")) or "",
            acquisition_report_link=clean_str(row.get("acquisition_report_link")) or "",
            project_report_link=clean_str(row.get("project_report_link")) or "",
            factsheet=clean_str(row.get("factsheet")) or "",
            attribute=clean_str(row.get("attribute")) or "",
            # Legacy's file_name/file_path pointed at files on the legacy
            # server's disk, not something this ETL can copy - `file` is a
            # real upload field now, populated only via the admin going
            # forward.
            file_description=clean_str(row.get("file_description")) or "",
        ))

        keyword_ids = []
        keywords_raw = row.get("keywords")
        if keywords_raw:
            for kid in re.findall(r"\d+", keywords_raw):
                new_pk = keyword_map.get(int(kid))
                if new_pk:
                    keyword_ids.append(new_pk)

        action_history = []
        raw_history = row.get("action_history")
        if raw_history:
            try:
                action_history = json.loads(raw_history) if isinstance(raw_history, str) else raw_history
            except (json.JSONDecodeError, TypeError):
                action_history = []
        action_history.append({
            "action": "legacy_import",
            "actioned_by": None,
            "actioned_at": timezone.now().isoformat(),
            "comments": f"Imported from legacy metadata id {row['id']}",
        })
        resolved["action_history"] = action_history

        return resolved, keyword_ids

    def _import_metadata(self, cur, default_metadata_type=None, **maps):
        query = "SELECT * FROM metadata ORDER BY id"
        if self.limit:
            query += f" LIMIT {int(self.limit)}"
        cur.execute(query)
        rows = cur.fetchall()

        imported = 0
        for row in rows:
            built = self._record_kwargs(row, **maps)
            if built is None:
                continue
            fields, keyword_ids = built
            fields["status"] = METADATA_STATUS_MAP.get(row["status_id"], MetadataRecord.Status.DRAFT)
            if row.get("approved_by"):
                fields["action_history"].append({
                    "action": "legacy_approved_by",
                    "actioned_by": row["approved_by"],
                    "actioned_at": row["approved_at"].isoformat() if row.get("approved_at") else None,
                    "comments": "Preserved from legacy metadata.approved_by/approved_at",
                })
            if row.get("created_by"):
                fields["action_history"].insert(0, {
                    "action": "legacy_created_by",
                    "actioned_by": row["created_by"],
                    "actioned_at": row["created_at"].isoformat() if row.get("created_at") else None,
                    "comments": "Preserved from legacy metadata.created_by",
                })

            if not self.dry_run:
                existing = MetadataRecord.objects.filter(legacy_id=row["id"]).first()
                if existing is None and default_metadata_type is not None:
                    # Only stamp brand-new imports - never clobber a type an
                    # admin has since (re)assigned on an already-migrated row.
                    fields["metadata_type"] = default_metadata_type
                if existing is not None and existing.has_custom_boundary:
                    # Admin has since drawn their own boundary on the map (or
                    # a prior run of this same backfill already set it) -
                    # never overwrite it with the legacy raw value.
                    for key in BOUNDARY_FIELDS:
                        fields.pop(key, None)
                record, _ = MetadataRecord.objects.update_or_create(
                    legacy_id=row["id"], defaults=fields
                )
                record.keywords.set(keyword_ids)
            imported += 1
        self._report("MetadataRecord (from metadata)", imported)

    def _import_pre_approvals(self, cur, default_metadata_type=None, **maps):
        cur.execute("SELECT * FROM metadata_pre_approval ORDER BY id")
        rows = cur.fetchall()

        imported = 0
        for row in rows:
            # legacy_id namespace for pre-approvals is offset so it can never
            # collide with a real metadata.id (both are independent integer
            # sequences in the legacy schema).
            legacy_id = -row["id"]
            built = self._record_kwargs(row, **maps)
            if built is None:
                continue
            fields, keyword_ids = built
            fields["status"] = (
                MetadataRecord.Status.REJECTED if row.get("rejected_at")
                else MetadataRecord.Status.PENDING_REVIEW
            )
            if row.get("created_by"):
                fields["action_history"].insert(0, {
                    "action": "legacy_created_by",
                    "actioned_by": row["created_by"],
                    "actioned_at": row["created_at"].isoformat() if row.get("created_at") else None,
                    "comments": f"Preserved from legacy metadata_pre_approval.created_by "
                                f"(action_type={row.get('action_type')})",
                })
            if row.get("rejected_by"):
                fields["action_history"].append({
                    "action": "legacy_rejected_by",
                    "actioned_by": row["rejected_by"],
                    "actioned_at": row["rejected_at"].isoformat() if row.get("rejected_at") else None,
                    "comments": "Preserved from legacy metadata_pre_approval.rejected_by/rejected_at",
                })

            if not self.dry_run:
                existing = MetadataRecord.objects.filter(legacy_id=legacy_id).first()
                if existing is None and default_metadata_type is not None:
                    fields["metadata_type"] = default_metadata_type
                if existing is not None and existing.has_custom_boundary:
                    for key in BOUNDARY_FIELDS:
                        fields.pop(key, None)
                record, _ = MetadataRecord.objects.update_or_create(
                    legacy_id=legacy_id, defaults=fields
                )
                record.keywords.set(keyword_ids)
            imported += 1
        self._report("MetadataRecord (from metadata_pre_approval)", imported)

    def _report(self, label, count):
        suffix = " (dry-run, nothing written)" if self.dry_run else " imported"
        self.stdout.write(self.style.SUCCESS(f"{label}: {count}{suffix}"))
