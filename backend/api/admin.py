from django.contrib import admin, messages

from .elasticsearch_sync import resync_records_for
from .forms import (
    CORE_FIELDS,
    DYNAMIC_PREFIX,
    MetadataRecordAdminForm,
    build_form_field,
)
from .models import (
    Contact,
    CoordinateReferenceSystem,
    Country,
    DataType,
    ElasticsearchFieldMap,
    ElasticsearchIndex,
    FieldDefinition,
    Keyword,
    MetadataRecord,
    MetadataTemplate,
    MetadataType,
    Project,
    Publisher,
    SpatialRepresentationType,
    Topic,
)


@admin.action(description="Resync selected indexes to Elasticsearch")
def resync_all_to_elasticsearch(modeladmin, request, queryset):
    """Rebuild only the selected index(es), not every index - never touches
    indexes the admin didn't select."""
    total = 0
    for index in queryset:
        records = MetadataRecord.objects.filter(metadata_type=index.metadata_type)
        resync_records_for(records)
        total += records.count()
    modeladmin.message_user(
        request,
        f"Resynced {total} record(s) across {queryset.count()} index(es).",
        messages.SUCCESS,
    )


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["project_name", "project_code"]
    search_fields = ["project_name", "project_code", "comments"]


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ["lastname", "firstname", "email", "position", "organization"]
    search_fields = ["firstname", "lastname", "email", "organization"]


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = [
        "short_name",
        "long_name",
        "west_bound_longitude",
        "east_bound_longitude",
        "south_bound_latitude",
        "north_bound_latitude",
        "crs_name",
    ]
    search_fields = ["short_name", "long_name"]


@admin.register(CoordinateReferenceSystem)
class CoordinateReferenceSystemAdmin(admin.ModelAdmin):
    list_display = ["crs_value", "crs_description"]
    search_fields = ["crs_value", "crs_description"]


@admin.register(Publisher)
class PublisherAdmin(admin.ModelAdmin):
    list_display = ["publisher_value", "website", "email"]
    search_fields = ["publisher_value"]


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ["id", "topic_value"]
    search_fields = ["topic_value"]


@admin.register(Keyword)
class KeywordAdmin(admin.ModelAdmin):
    list_display = ["id", "keyword_value"]
    search_fields = ["keyword_value"]


@admin.register(SpatialRepresentationType)
class SpatialRepresentationTypeAdmin(admin.ModelAdmin):
    list_display = ["id", "spatial_representation_type_value"]
    search_fields = ["spatial_representation_type_value"]


@admin.register(DataType)
class DataTypeAdmin(admin.ModelAdmin):
    list_display = ["id", "data_type_value"]
    search_fields = ["data_type_value"]


@admin.register(MetadataType)
class MetadataTypeAdmin(admin.ModelAdmin):
    list_display = ["id", "metadata_type_value"]
    search_fields = ["metadata_type_value"]


class ElasticsearchFieldMapInline(admin.TabularInline):
    model = ElasticsearchFieldMap
    extra = 1
    ordering = ["order", "id"]


@admin.register(ElasticsearchIndex)
class ElasticsearchIndexAdmin(admin.ModelAdmin):
    list_display = ["name", "metadata_type", "index_name", "is_active"]
    list_filter = ["is_active", "metadata_type"]
    search_fields = ["name", "index_name"]
    inlines = [ElasticsearchFieldMapInline]
    actions = [resync_all_to_elasticsearch]


class FieldDefinitionInline(admin.TabularInline):
    model = FieldDefinition
    extra = 1
    ordering = ["order", "id"]


@admin.register(MetadataTemplate)
class MetadataTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "version", "is_active", "updated_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "description"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [FieldDefinitionInline]


@admin.register(MetadataRecord)
class MetadataRecordAdmin(admin.ModelAdmin):
    form = MetadataRecordAdminForm
    list_display = ["title", "metadata_type", "template", "country", "publisher", "updated_at"]
    list_filter = ["metadata_type", "template", "access_constraints", "country", "topic"]
    search_fields = ["title", "abstract"]
    readonly_fields = ["created_at", "updated_at"]
    autocomplete_fields = [
        "contact",
        "country",
        "coordinate_reference_system",
        "publisher",
        "topic",
        "spatial_representation_type",
        "data_type",
        "metadata_type",
    ]
    filter_horizontal = ["keywords"]

    class Media:
        js = (
            # Reloads the form with ?template=<id> when the dropdown changes.
            "api/metadata_record.js",
            # Draws the west/east/south/north_bounding_* fields as a
            # rectangle (zone) or marker (point) on a Leaflet map.
            "api/boundary_map.js",
        )

    def _template_for(self, request, obj):
        """The template driving the dynamic fields: the saved one, or — while
        adding — whichever is picked in the dropdown (POST on submit, ?template
        after selecting it in the UI)."""
        if obj is not None and obj.template_id is not None:
            return obj.template
        tid = request.POST.get("template") or request.GET.get("template")
        if tid:
            return (
                MetadataTemplate.objects.filter(pk=tid)
                .prefetch_related("fields")
                .first()
            )
        return None

    def _dynamic_names(self, template):
        if template is None:
            return []
        return [f"{DYNAMIC_PREFIX}{fd.name}" for fd in template.fields.all()]

    def get_changeform_initial_data(self, request):
        """Keep the dropdown showing the template picked via ?template."""
        initial = super().get_changeform_initial_data(request)
        tid = request.GET.get("template")
        if tid:
            initial["template"] = tid
        return initial

    def get_form(self, request, obj=None, change=False, **kwargs):
        """Inject one real form field per field of the active template.

        The dynamic fields are declared on a per-request form subclass so that
        modelform_factory accepts them; get_fieldsets() then lays them out.
        """
        template = self._template_for(request, obj)
        declared = {}
        if template is not None:
            existing = (obj.data if obj is not None else None) or {}
            for fd in template.fields.all():
                declared[f"{DYNAMIC_PREFIX}{fd.name}"] = build_form_field(
                    fd, existing.get(fd.name)
                )

        if declared:
            kwargs["form"] = type(
                "MetadataRecordAdminForm", (MetadataRecordAdminForm,), declared
            )
        return super().get_form(request, obj, change=change, **kwargs)

    def save_model(self, request, obj, form, change):
        """No approval workflow here - anything saved via the admin is live
        immediately, since admin access is itself the trust boundary now."""
        obj.status = MetadataRecord.Status.PUBLISHED
        super().save_model(request, obj, form, change)

    def get_fieldsets(self, request, obj=None):
        core = ("Core metadata", {"fields": CORE_FIELDS})
        template = self._template_for(request, obj)
        dynamic = self._dynamic_names(template)
        if not dynamic:
            note = (
                None,
                {
                    "fields": (),
                    "description": "Choose a template above — its fields will "
                    "appear here automatically.",
                },
            )
            return [core, note]
        template_section = (
            f"Template fields — {template.name}",
            {"fields": tuple(dynamic)},
        )
        return [core, template_section]
