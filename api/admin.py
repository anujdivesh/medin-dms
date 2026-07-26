from django.contrib import admin

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
    FieldDefinition,
    Keyword,
    MetadataRecord,
    MetadataTemplate,
    Project,
    Publisher,
    SpatialRepresentationType,
    Topic,
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
    list_display = ["title", "template", "status", "country", "publisher", "updated_at"]
    list_filter = ["status", "template", "access_constraints", "country", "topic"]
    search_fields = ["title", "abstract"]
    readonly_fields = ["created_at", "updated_at"]
    autocomplete_fields = [
        "contact",
        "country",
        "coordinate_reference_system",
        "publisher",
        "topic",
        "spatial_representation_type",
    ]
    filter_horizontal = ["keywords"]

    class Media:
        # Reloads the form with ?template=<id> when the dropdown changes.
        js = ("api/metadata_record.js",)

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
