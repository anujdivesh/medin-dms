import copy
import json

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
    BUILTIN_FIELD_MEMBERS,
    BUILTIN_FIELD_SECTIONS,
    BUILTIN_FIELDS,
    Contact,
    CoordinateReferenceSystem,
    Country,
    DataType,
    ElasticsearchFieldMap,
    ElasticsearchIndex,
    FieldDefinition,
    FormSection,
    FieldType,
    Keyword,
    LINK_AND_FILE_SOURCES,
    LINK_OR_FILE_RADIOS,
    MetadataRecord,
    MetadataTemplate,
    MetadataType,
    Project,
    Publisher,
    RECORD_SOURCE_CHOICES,
    SpatialRepresentationType,
    Topic,
    default_field_definitions,
    template_builtin_rows,
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
    custom = FieldDefinition.objects.exclude(field_type=FieldType.BUILTIN)
    for name, label in custom.values_list("name", "label"):
        labels_by_name.setdefault(name, label)
    template_choices = [
        (f"data.{name}", f"data- {label or name}")
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


class FieldDefinitionForm(forms.ModelForm):
    # Typed as plain text rather than JSON: choices comma-separated, default
    # as the value itself (e.g. English, not "English").
    choices = forms.CharField(
        required=False,
        help_text="Select fields: the options, comma-separated.",
        widget=forms.TextInput(attrs={"size": 30}),
    )
    default = forms.CharField(
        required=False,
        help_text="Pre-filled on new records.",
        widget=forms.TextInput(attrs={"size": 12}),
    )

    class Meta:
        model = FieldDefinition
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        choices = self.initial.get("choices")
        if isinstance(choices, list):
            self.initial["choices"] = ", ".join(map(str, choices))
        default = self.initial.get("default")
        if default is not None and not isinstance(default, str):
            self.initial["default"] = json.dumps(default)
        # Read by builtin_field_picker.js to offer the built-in fields as a
        # dropdown in place of the Name box (and preset their section).
        section_ids = dict(FormSection.objects.values_list("slug", "pk"))
        self.fields["field_type"].widget.attrs["data-builtins"] = json.dumps([
            [name, label, section_ids.get(BUILTIN_FIELD_SECTIONS[name], "")]
            for name, label, _ in BUILTIN_FIELDS
        ])

    def clean_choices(self):
        value = (self.cleaned_data.get("choices") or "").strip()
        if value.startswith("["):  # a JSON list still works
            try:
                return [str(v) for v in json.loads(value)]
            except ValueError:
                raise forms.ValidationError("Not a valid list.")
        return [part.strip() for part in value.split(",") if part.strip()]

    def clean_default(self):
        return (self.cleaned_data.get("default") or "").strip() or None

    def clean(self):
        cleaned = super().clean()
        default, choices = cleaned.get("default"), cleaned.get("choices")
        if (
            cleaned.get("field_type") == FieldType.SELECT
            and default is not None and choices and default not in choices
        ):
            self.add_error("default", "Must be one of the choices.")
        return cleaned

    def has_changed(self):
        # The rows pre-filled on a new template save even untouched.
        return super().has_changed() or (
            self.instance.pk is None and bool(self.initial.get("name"))
        )


class FieldDefinitionFormSet(forms.BaseInlineFormSet):
    def __init__(self, *args, **kwargs):
        instance = kwargs.get("instance")
        if instance is None or instance.pk is None:
            # New template: start from every built-in and standard field, in
            # document order.
            kwargs["initial"] = [
                {
                    "name": row.name,
                    "label": row.label,
                    "help_text": row.help_text,
                    "field_type": row.field_type,
                    "required": row.required,
                    "choices": row.choices,
                    "default": row.default,
                    "section": row.section_id,
                    "order": row.order,
                }
                for row in default_field_definitions(None)
            ]
        super().__init__(*args, **kwargs)


class FieldDefinitionInline(admin.TabularInline):
    """A template's fields: its "Built-in field" rows stand for the record's
    own columns (only label/help text/required/order apply; delete one to
    hide it), the rest - the standard MEDIN ones included - are ordinary
    fields stored in the record's `data`."""

    model = FieldDefinition
    form = FieldDefinitionForm
    formset = FieldDefinitionFormSet
    ordering = ["order", "id"]

    def get_extra(self, request, obj=None, **kwargs):
        return 1 if obj is not None else len(default_field_definitions(None)) + 1


@admin.register(FormSection)
class FormSectionAdmin(admin.ModelAdmin):
    """The record form's sections. Deleting one moves its fields to Template
    fields (they aren't deleted)."""

    list_display = ["name", "order", "field_count"]
    list_editable = ["order"]
    search_fields = ["name"]
    prepopulated_fields = {"slug": ("name",)}

    @admin.display(description="Template fields using it")
    def field_count(self, obj):
        return obj.fields.count()


@admin.register(MetadataTemplate)
class MetadataTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "version", "is_active", "updated_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "description"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [FieldDefinitionInline]

    class Media:
        # Name becomes a built-in field dropdown when the type is "Built-in".
        js = ("api/builtin_field_picker.js",)


@admin.register(MetadataRecord)
class MetadataRecordAdmin(admin.ModelAdmin):
    form = MetadataRecordAdminForm
    list_display = ["title", "status_badge", "metadata_type", "template", "country", "publisher", "updated_at"]
    list_filter = ["status", "metadata_type", "template", "access_constraints", "country", "topic"]
    search_fields = ["title", "data__abstract"]
    # metadata_date is system-filled on every save (auto_now) - shown as
    # yyyy-mm-dd via metadata_date_display (see get_fieldsets).
    readonly_fields = ["status_badge", "created_at", "updated_at", "metadata_date_display"]
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
            # "api/hidden_when_private.js",
            # Shows either the Link to data text box or the file upload.
            "api/link_to_data.js",
            # "Sections" panel beside the form for jumping between sections.
            "api/section_nav.js",
        )
        # css = {"all": ("api/hidden_when_private.css",)}
        css = {"all": ("api/section_nav.css",)}

    def _template_for(self, request, obj):
        """The template driving the dynamic fields: the saved one, or- while
        adding- whichever is picked in the dropdown (POST on submit, ?template
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

    def _core_fields(self, template):
        """The record's column fields to show: all of them until a template
        is picked, then just the ones its built-in rows list."""
        if template is None:
            return CORE_FIELDS
        return ["template", "metadata_type"] + [
            member
            for fd in template_builtin_rows(template)
            for member in BUILTIN_FIELD_MEMBERS[fd.name]
        ]

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
                if fd.is_builtin:
                    continue
                # A new record starts from each field's default.
                value = existing.get(fd.name) if obj is not None else fd.default
                declared[f"{DYNAMIC_PREFIX}{fd.name}"] = build_form_field(fd, value)

        # "Hide when private" picker - off for now: private records hide a
        # fixed set instead (PRIVATE_HIDDEN_SOURCES in models.py).
        # choices, unmapped = self._hidden_field_choices(obj)
        # declared["hidden_when_private"] = forms.MultipleChoiceField(
        #     choices=choices,
        #     required=False,
        #     widget=HiddenWhenPrivateWidget(
        #         disabled_values=unmapped, default_values=LINK_AND_FILE_SOURCES
        #     ),
        #     label="Hide when private",
        #     help_text="Ticked fields are not shown in pygeoapi "
        #     "Greyed-out fields aren't part of this record's Elasticsearch "
        #     "index, so they're never sent anyway.",
        # )
        kwargs["form"] = type(
            "MetadataRecordAdminForm", (MetadataRecordAdminForm,), declared
        )
        form = super().get_form(request, obj, change=change, **kwargs)

        # Declared fields (the Link to data radio, Hide when private) are on
        # the form regardless - drop them when their built-in row is removed.
        shown = set(self._core_fields(template))
        for name in sorted(LINK_OR_FILE_RADIOS) + ["hidden_when_private"]:
            if name not in shown:
                form.base_fields.pop(name, None)

        # Apply the template's label / help text / required to the first
        # field each built-in row covers (copied - declared fields are shared
        # with the base form class). No template: just the default required.
        for fd in template_builtin_rows(template):
            member = BUILTIN_FIELD_MEMBERS[fd.name][0]
            if member not in form.base_fields:
                continue
            field = form.base_fields[member] = copy.deepcopy(form.base_fields[member])
            if template is not None:
                field.label = fd.label
                if fd.help_text:
                    field.help_text = fd.help_text
            if member in LINK_OR_FILE_RADIOS:
                if fd.required:
                    form.required_sources = form.required_sources | {member}
            elif fd.name != "boundary":  # boundary_type always has a value
                field.required = fd.required
        return form

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

    @admin.display(description="Metadata date")
    def metadata_date_display(self, obj):
        if obj is None or obj.metadata_date is None:
            return "Filled in with today's date when saved (yyyy-mm-dd)"
        return obj.metadata_date.isoformat()

    def get_fieldsets(self, request, obj=None):
        """One fieldset per FormSection (in its order) holding the template's
        fields - built-in and custom - in their row order, then the fields
        with no section under "Template fields". With no template yet, every
        built-in field in its default section."""
        template = self._template_for(request, obj)
        top = (None, {
            "fields": (["status_badge"] if obj else []) + ["template", "metadata_type"]
        })
        rows = template_builtin_rows(None) if template is None else template.fields.all()
        by_section = {}
        for fd in rows:
            names = (
                BUILTIN_FIELD_MEMBERS[fd.name] if fd.is_builtin
                else [f"{DYNAMIC_PREFIX}{fd.name}"]
            )
            names = [
                "metadata_date_display" if name == "metadata_date" else name
                for name in names
            ]
            by_section.setdefault(fd.section_id, []).extend(names)

        fieldsets = [top]
        if template is None:
            fieldsets.append((None, {
                "fields": (),
                "description": "Choose a template above- its fields will "
                "appear here automatically.",
            }))
        for section in FormSection.objects.all():
            if by_section.get(section.pk):
                fieldsets.append((section.name, {"fields": by_section[section.pk]}))
        if by_section.get(None):
            label = f"Template fields - {template.name}" if template else "Other fields"
            fieldsets.append((label, {"fields": by_section[None]}))
        return fieldsets
