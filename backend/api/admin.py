from django import forms
from django.contrib import admin, messages
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils.html import format_html

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
    LINK_AND_FILE_SOURCES,
    MetadataRecord,
    MetadataTemplate,
    MetadataType,
    Project,
    Publisher,
    RECORD_SOURCE_CHOICES,
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


class HiddenWhenPrivateWidget(forms.CheckboxSelectMultiple):
    """Checkboxes for MetadataRecord.hidden_when_private: sources the record's
    index doesn't send are rendered disabled (greyed out), and the default
    link/file picks are tagged for the "Default" quick-pick button."""

    def __init__(self, disabled_values=(), default_values=(), **kwargs):
        super().__init__(**kwargs)
        self.disabled_values = set(disabled_values)
        self.default_values = set(default_values)

    def create_option(self, name, value, *args, **kwargs):
        option = super().create_option(name, value, *args, **kwargs)
        option["attrs"] = dict(option["attrs"])
        if value in self.disabled_values:
            option["attrs"]["disabled"] = True
        if value in self.default_values:
            option["attrs"]["data-default"] = "1"
        return option


def _source_choices():
    """RECORD_SOURCE_CHOICES plus one `data.<name>` choice per field name
    currently defined on any template - so a field added to a template shows
    up here immediately, with no code change needed. Different templates can
    reuse the same field name with a different label; the first one wins."""
    labels_by_name = {}
    for name, label in FieldDefinition.objects.values_list("name", "label"):
        labels_by_name.setdefault(name, label)
    template_choices = [
        (f"data.{name}", f"data — {label or name}")
        for name, label in sorted(labels_by_name.items())
    ]
    return list(RECORD_SOURCE_CHOICES) + template_choices


class ElasticsearchFieldMapForm(forms.ModelForm):
    class Meta:
        model = ElasticsearchFieldMap
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        choices = _source_choices()
        current = self.instance.source if self.instance.pk else None
        if current and current not in dict(choices):
            # The template field (or template) behind this saved mapping was
            # since renamed/removed - keep it selectable so editing an
            # unrelated row on this index doesn't fail validation on it.
            choices = [(current, f"{current} (no longer defined)")] + choices
        self.fields["source"] = forms.ChoiceField(
            choices=choices,
            help_text=self.fields["source"].help_text,
        )


class ElasticsearchFieldMapInline(admin.TabularInline):
    model = ElasticsearchFieldMap
    form = ElasticsearchFieldMapForm
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
    list_display = ["title", "status_badge", "metadata_type", "template", "country", "publisher", "updated_at"]
    list_filter = ["status", "metadata_type", "template", "access_constraints", "country", "topic"]
    search_fields = ["title", "abstract"]
    readonly_fields = ["status_badge", "created_at", "updated_at"]
    autocomplete_fields = [
        "contact",
        "country",
        "coordinate_reference_system",
        "publisher",
        "topic",
        "spatial_representation_type",
        "data_type",
        "project",
        "metadata_type",
    ]
    filter_horizontal = ["keywords"]

    class Media:
        js = (
            # Reloads the form with ?template=<id> when the dropdown changes.
            "api/metadata_record.js",
            # Draws the west/east/south/north_bounding_* fields as a
            # rectangle (zone), marker (point) or polygon on a Leaflet map.
            "api/boundary_map.js",
            # Shows "Hidden when private" only while access is Private.
            "api/hidden_when_private.js",
        )
        css = {"all": ("api/hidden_when_private.css",)}

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

        choices, unmapped = self._hidden_field_choices(obj)
        declared["hidden_when_private"] = forms.MultipleChoiceField(
            choices=choices,
            required=False,
            widget=HiddenWhenPrivateWidget(
                disabled_values=unmapped, default_values=LINK_AND_FILE_SOURCES
            ),
            label="Hide when private",
            help_text="Ticked fields are not shown in pygeoapi "   
            "Greyed-out fields aren't part of this record's Elasticsearch "
            "index, so they're never sent anyway.",
        )
        kwargs["form"] = type(
            "MetadataRecordAdminForm", (MetadataRecordAdminForm,), declared
        )
        return super().get_form(request, obj, change=change, **kwargs)

    def _hidden_field_choices(self, obj):
        """Every possible source, grouped, plus the set of those this record's
        index doesn't send (shown greyed out). Before the record's metadata
        type - and so its index - is known, nothing is greyed out."""
        mapped = None
        if obj is not None and obj.metadata_type_id is not None:
            index = ElasticsearchIndex.objects.filter(metadata_type_id=obj.metadata_type_id).first()
            mapped = {} if index is None else {
                f.source: f.target_key for f in index.fields.filter(is_enabled=True)
            }
        sources = [source for source, _ in _source_choices()]
        saved = (obj.hidden_when_private if obj is not None else None) or []
        sources += [s for s in saved if s not in sources]
        unmapped = set() if mapped is None else {s for s in sources if s not in mapped}

        def option(source):
            # Last segment of the index key (or the source when unmapped), e.g.
            # "contacts.Contact_Email" -> "Contact Email", path underneath.
            target = (mapped or {}).get(source, source)
            name = target.rsplit(".", 1)[-1].replace("_", " ").strip() or source
            return (source, format_html(
                '<span class="hwp-name">{}</span><span class="hwp-source">{}</span>',
                name[:1].upper() + name[1:], source,
            ))

        links = [option(s) for s in sources if s in LINK_AND_FILE_SOURCES]
        others = [option(s) for s in sources if s not in LINK_AND_FILE_SOURCES]
        choices = [(group, opts) for group, opts in (
            ("Links & files", links), ("Other fields", others)
        ) if opts]
        return choices, unmapped

    def save_model(self, request, obj, form, change):
        """No approval workflow - "Save and publish" makes the record live
        (sent to the search index) straight away, since admin access is
        itself the trust boundary. "Save as draft" keeps it out of the index;
        "Save and continue editing" leaves the status as it was (a brand-new
        record starts as a draft)."""
        if "_save_draft" in request.POST:
            obj.status = MetadataRecord.Status.DRAFT
        elif "_continue" not in request.POST:
            obj.status = MetadataRecord.Status.PUBLISHED
        super().save_model(request, obj, form, change)

    def _draft_response(self, request, obj):
        self.message_user(
            request,
            f"“{obj}” was saved as a draft - it isn't published to the search "
            "index (pygeoapi) until you use “Save and publish”.",
            messages.WARNING,
        )
        return HttpResponseRedirect(
            reverse("admin:api_metadatarecord_change", args=[obj.pk])
        )

    def response_add(self, request, obj, post_url_continue=None):
        if "_save_draft" in request.POST:
            return self._draft_response(request, obj)
        return super().response_add(request, obj, post_url_continue)

    def response_change(self, request, obj):
        if "_save_draft" in request.POST:
            return self._draft_response(request, obj)
        return super().response_change(request, obj)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        published = obj.status == MetadataRecord.Status.PUBLISHED
        return format_html(
            '<span style="padding:2px 8px;border-radius:10px;font-size:11px;'
            'font-weight:600;color:#fff;background:{}">{}</span>',
            "#2e7d32" if published else "#9e9e9e",
            obj.get_status_display(),
        )

    def get_fieldsets(self, request, obj=None):
        core = ("Core metadata", {"fields": (["status_badge"] if obj else []) + CORE_FIELDS})
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
