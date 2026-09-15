"""Read-compatibility shim for the frontend's existing lookup admin pages
(src/pages/Contact.jsx, Topic.jsx, etc.), which are staying pointed at
whichever backend is running rather than being rewritten. Those pages parse
legacy's `{status, msg, data: {<plural>: [...], total, paginated}}` envelope,
so this wraps DRF's list() output the same way.

Deliberately scoped to list() only: per the migration plan's Phase 5, new
lookup entries are added via Django admin now, not these pages, so
create/update/delete here don't need to replicate legacy's full contract
(soft-delete + dependency checks, admin-gating, /search, /names) - only
reads need to match so newly-admin-added values show up on these pages.
"""

from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.response import Response


class LegacyListEnvelopeMixin:
    legacy_data_key = None  # e.g. "contacts" - set per ViewSet

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        data = self.get_serializer(queryset, many=True).data
        return Response({
            "status": "success",
            "msg": f"{self.legacy_data_key.replace('_', ' ').title()} retrieved successfully",
            "data": {
                self.legacy_data_key: data,
                "total": len(data),
                "total_pages": 1,
                "paginated": False,
            },
        })


# Cosmetic only: MetadataRecord.Status values -> the legacy status strings
# Metadata.jsx's badge styling switches on (item.status === 'active'/
# 'declined'/'draft'). Not a real status-model migration, just enough so
# existing badges render sensibly instead of unstyled.
LEGACY_STATUS_DISPLAY = {
    "published": "active",
    "rejected": "declined",
    "draft": "draft",
    "pending_review": "draft",
    "archived": "deleted",
}


def legacy_metadata_dict(record):
    """Flatten a MetadataRecord into the legacy metadata list/detail page's
    flat field shape (src/pages/Metadata.jsx), so that page renders
    unmodified when pointed at Django.

    Deliberately simplified vs. legacy's own read_metadata(): no RBAC-based
    visibility filtering (merging in the current user's own pending
    MetadataPreApproval rows, admin/approver/owner rules) and no per-field
    `.lower()` transforms - metadata is managed via Django admin now, so
    this only needs to show what's in new_dms, not replicate legacy's
    approval-queue business rules.
    """
    project = record.project if record.project_id else None

    sr_type = record.spatial_representation_type if record.spatial_representation_type_id else None
    crs = record.coordinate_reference_system if record.coordinate_reference_system_id else None
    contact = record.contact if record.contact_id else None
    publisher = record.publisher if record.publisher_id else None
    country = record.country if record.country_id else None

    keyword_values = [k.keyword_value for k in record.keywords.all()]

    return {
        "id": record.pk,
        "title": record.title,
        "abstract": record.abstract,
        "comment": record.comment,
        "temporal_coverage_from": record.temporal_coverage_from,
        "temporal_coverage_to": record.temporal_coverage_to,
        "language": record.language,
        "version": record.version,
        "project_id": record.project_id,
        "project_name": project.project_name if project else None,
        "project_code": project.project_code if project else None,
        "west_bounding_longitude": record.west_bound_longitude,
        "east_bounding_longitude": record.east_bound_longitude,
        "south_bounding_latitude": record.south_bound_latitude,
        "north_bounding_latitude": record.north_bound_latitude,
        "boundary_type": record.boundary_type,
        "spatial_representation_type_id": record.spatial_representation_type_id,
        "spatial_representation_type": sr_type.spatial_representation_type_value if sr_type else None,
        "spatial_representation_type_value": sr_type.spatial_representation_type_value if sr_type else None,
        "data_type_id": record.data_type_id,
        "data_type_value": record.data_type.data_type_value if record.data_type_id else None,
        "metadata_type_id": record.metadata_type_id,
        "metadata_type_value": record.metadata_type.metadata_type_value if record.metadata_type_id else None,
        "crs_id": record.coordinate_reference_system_id,
        "crs_value": crs.crs_value if crs else None,
        "crs_description": crs.crs_description if crs else None,
        "contact_id": record.contact_id,
        "contact_first_name": contact.firstname if contact else None,
        "contact_last_name": contact.lastname if contact else None,
        "contact_position": contact.position if contact else None,
        "contact_email": contact.email if contact else None,
        "publisher_id": record.publisher_id,
        "publisher_value": publisher.publisher_value if publisher else None,
        "publisher_website": publisher.website if publisher else None,
        "publisher_email": publisher.email if publisher else None,
        "topic_id": record.topic_id,
        "topic_value": record.topic.topic_value if record.topic_id else None,
        "keywords": keyword_values,
        "keyword_value": keyword_values,
        "country_id": record.country_id,
        "country_short_name": country.short_name if country else None,
        "country_long_name": country.long_name if country else None,
        "access_constraints": record.access_constraints,
        "link_to_data": record.link_to_data,
        "license": record.license,
        "acknowledgement": record.acknowledgement,
        "history": record.history,
        "fundings": record.fundings,
        "references_": record.references,
        "acquisition_report_link": record.acquisition_report_link,
        "project_report_link": record.project_report_link,
        "factsheet": record.factsheet,
        "attribute": record.attribute,
        "metadata_standard_language": record.metadata_standard_language,
        "metadata_standard_version": record.metadata_standard_version,
        "metadata_standard_name": record.metadata_standard_name,
        "update_frequency": record.update_frequency,
        "data_format": record.data_format,
        "lineage": record.lineage,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "status": LEGACY_STATUS_DISPLAY.get(record.status, record.status),
        "file_name": record.file.name if record.file else None,
        "file_url": record.file.url if record.file else None,
        "file_description": record.file_description,
    }


class LegacyMetadataListMixin:
    """list()/retrieve()/search shim for MetadataRecordViewSet matching
    src/pages/Metadata.jsx's expected shape - see legacy_metadata_dict()."""

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        sort_by = request.query_params.get("sort_by", "id")
        sort_order = request.query_params.get("sort_order", "desc")
        sort_field = sort_by if sort_by in ("id", "title", "status", "created_at", "updated_at") else "id"
        if sort_order.lower() == "desc":
            sort_field = f"-{sort_field}"
        queryset = queryset.order_by(sort_field)

        total = queryset.count()
        page = request.query_params.get("page")
        per_page = request.query_params.get("per_page")
        paginated = bool(page and per_page)
        if paginated:
            page, per_page = int(page), int(per_page)
            start = (page - 1) * per_page
            queryset = queryset[start:start + per_page]
        total_pages = -(-total // int(per_page)) if paginated else 1

        records = [legacy_metadata_dict(r) for r in queryset]
        return Response({
            "status": "success",
            "msg": "Metadata retrieved successfully",
            "data": {
                "metadata": records,
                "total": total,
                "total_pages": total_pages,
                "paginated": paginated,
            },
        })

    def retrieve(self, request, *args, **kwargs):
        record = self.get_object()
        return Response({
            "status": "success",
            "msg": "Metadata retrieved successfully",
            "data": legacy_metadata_dict(record),
        })

    @action(detail=False, methods=["get"])
    def search(self, request):
        q = request.query_params.get("q", "")
        queryset = self.filter_queryset(self.get_queryset())
        if q:
            queryset = queryset.filter(
                Q(title__icontains=q) | Q(abstract__icontains=q) | Q(comment__icontains=q)
            )
        records = [legacy_metadata_dict(r) for r in queryset]
        return Response({
            "status": "success",
            "msg": "Metadata retrieved successfully",
            "data": {"metadata": records, "total": len(records), "search_query": q},
        })
