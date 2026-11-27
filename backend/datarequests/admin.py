from django import forms
from django.contrib import admin, messages
from django.db import transaction
from django.template.response import TemplateResponse
from django.urls import reverse
from django.utils.html import format_html

from shares import services as share_services

from . import services
from .models import CartItem, DataRequest, DataRequestItem

# Decisions are never edited as plain fields here: saving a status directly
# would skip the requester's email, "decided by", the request's overall
# status and the upload request. Staff use the Approve / Decline / Reopen
# actions on the request items list instead, which go through
# datarequests.services exactly like the owner's Review requests page.
DECISION_FIELDS = ["status", "decided_by", "decided_at", "decision_note"]


class DataRequestItemInline(admin.TabularInline):
    model = DataRequestItem
    extra = 0
    fields = ["record", "record_title", "organisation", "status", "decided_by", "decided_at", "decision_note", "decide"]
    readonly_fields = ["record", "record_title", "decide", *DECISION_FIELDS]
    autocomplete_fields = ["organisation"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    @admin.display(description="")
    def decide(self, obj):
        if not obj.pk:
            return ""
        url = reverse("admin:datarequests_datarequestitem_changelist") + f"?request__id__exact={obj.request_id}"
        return format_html('<a href="{}">Approve / decline...</a>', url)


@admin.register(DataRequest)
class DataRequestAdmin(admin.ModelAdmin):
    list_display = ["reference", "requester", "status", "item_count", "unrouted_count", "created_at"]
    list_filter = ["status", "created_at", "items__organisation"]
    search_fields = ["reference", "requester__email", "requester__username", "purpose", "items__record_title"]
    # Status follows the items (DataRequest.refresh_status).
    readonly_fields = ["reference", "requester", "status", "created_at", "updated_at"]
    fields = ["reference", "requester", "status", "purpose", "created_at", "updated_at"]
    inlines = [DataRequestItemInline]
    actions = ["route_unrouted"]
    date_hierarchy = "created_at"

    @admin.display(description="Items")
    def item_count(self, obj):
        return obj.items.count()

    @admin.display(description="Unrouted")
    def unrouted_count(self, obj):
        return obj.items.filter(status=DataRequestItem.Status.UNROUTED).count()

    @admin.action(description="Route unrouted items to their record's current data owner")
    def route_unrouted(self, request, queryset):
        routed = services.route_unrouted_items(DataRequestItem.objects.filter(request__in=queryset))
        for data_request in queryset:
            data_request.refresh_status()
        self.message_user(
            request,
            f"Routed {routed} item(s). Items whose record still has no data owner were left unrouted - "
            "set the record's data owner, or pick an organisation on the item directly.",
            messages.SUCCESS if routed else messages.WARNING,
        )

    def save_formset(self, request, form, formset, change):
        # An admin picking (or changing) the organisation of an undecided item
        # routes it there - and its owners are emailed (datarequests.notifications).
        routed = []
        for item_form in formset.forms:
            item = item_form.instance
            if (item.pk and "organisation" in item_form.changed_data
                    and item.organisation_id is not None and item.is_open):
                item.status = DataRequestItem.Status.PENDING
                routed.append(item.pk)
        super().save_formset(request, form, formset, change)
        form.instance.refresh_status()
        services.announce_routed(routed)


# --- Decision actions --------------------------------------------------------------


class ApproveForm(forms.Form):
    note = forms.CharField(
        label="Message to the requester (optional)", required=False, widget=forms.Textarea(attrs={"rows": 3})
    )
    upload_email = forms.EmailField(
        label="Ask someone to upload the data (optional)", required=False,
        help_text="Their email address. They're emailed a sign-in link; when they upload the files, "
                  "the requester gets the download link. Leave empty to share files later.",
    )
    upload_message = forms.CharField(
        label="Message to the uploader (optional)", required=False, widget=forms.Textarea(attrs={"rows": 2})
    )


class DeclineForm(forms.Form):
    note = forms.CharField(label="Reason (sent to the requester)", widget=forms.Textarea(attrs={"rows": 3}))


class ConfirmForm(forms.Form):
    pass


@admin.register(DataRequestItem)
class DataRequestItemAdmin(admin.ModelAdmin):
    list_display = ["request", "record_title", "organisation", "status", "decided_by", "decided_at", "upload_status"]
    list_filter = ["status", "organisation"]
    search_fields = ["record_title", "request__reference", "request__requester__email"]
    raw_id_fields = ["request", "record"]
    autocomplete_fields = ["organisation"]
    readonly_fields = DECISION_FIELDS
    actions = ["approve_items", "decline_items", "reopen_items"]

    @admin.display(description="Upload")
    def upload_status(self, obj):
        open_request = obj.upload_requests.filter(status="open").first()
        if open_request:
            return f"Waiting for {open_request.email}"
        return ""

    def save_model(self, request, obj, form, change):
        # Same rule as the request page's inline: choosing an organisation
        # for an undecided item routes it there and emails its owners.
        routed = change and "organisation" in form.changed_data and obj.organisation_id and obj.is_open
        if routed:
            obj.status = DataRequestItem.Status.PENDING
        super().save_model(request, obj, form, change)
        obj.request.refresh_status()
        if routed:
            services.announce_routed([obj.pk])

    def _with_form(self, request, queryset, form_class, *, title, intro, submit, apply):
        """Admin action with an intermediate page (reason, uploader...).
        Returns None (back to the list) once applied."""
        if "apply" in request.POST:
            form = form_class(request.POST)
            if form.is_valid():
                apply(form.cleaned_data)
                return None
        else:
            form = form_class()
        return TemplateResponse(request, "admin/datarequests/datarequestitem/decision_action.html", {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": title,
            "intro": intro,
            "submit": submit,
            "form": form,
            "items": queryset.select_related("request", "organisation"),
            "action": request.POST.get("action"),
        })

    def _report(self, request, done, verb, errors):
        if done:
            self.message_user(request, f"{verb} {done} item(s).", messages.SUCCESS)
        for error in errors:
            self.message_user(request, error, messages.ERROR)

    @admin.action(description="Approve selected items (emails the requester)")
    def approve_items(self, request, queryset):
        def apply(data):
            done, errors = 0, []
            for item in queryset.select_related("request"):
                try:
                    with transaction.atomic():
                        services.decide_item(item, request.user, DataRequestItem.Status.APPROVED, data["note"])
                        if data["upload_email"]:
                            item.refresh_from_db()
                            share_services.request_upload(
                                request.user, item, data["upload_email"], data["upload_message"]
                            )
                except (services.DataRequestError, share_services.ShareError) as exc:
                    errors.append(f"{item.request.reference} - {item.record_title}: {exc.message}")
                    continue
                done += 1
                extra = f"; asked {data['upload_email']} to upload" if data["upload_email"] else ""
                self.log_change(request, item, f"Approved{extra}.")
            self._report(request, done, "Approved", errors)

        return self._with_form(
            request, queryset, ApproveForm, apply=apply, submit="Approve",
            title="Approve request items",
            intro="The requester is emailed for each item, exactly as when the data owner approves.",
        )

    @admin.action(description="Decline selected items (emails the requester)")
    def decline_items(self, request, queryset):
        def apply(data):
            done, errors = 0, []
            for item in queryset.select_related("request"):
                try:
                    services.decide_item(item, request.user, DataRequestItem.Status.DECLINED, data["note"])
                except services.DataRequestError as exc:
                    errors.append(f"{item.request.reference} - {item.record_title}: {exc.message}")
                    continue
                done += 1
                self.log_change(request, item, "Declined.")
            self._report(request, done, "Declined", errors)

        return self._with_form(
            request, queryset, DeclineForm, apply=apply, submit="Decline",
            title="Decline request items",
            intro="The requester is emailed the reason for each item.",
        )

    @admin.action(description="Reopen selected decisions (back to the data owner)")
    def reopen_items(self, request, queryset):
        def apply(data):
            done, errors = 0, []
            for item in queryset.select_related("request"):
                try:
                    with transaction.atomic():
                        services.reopen_item(item, request.user)
                        if item.upload_requests.filter(status="open").exists():
                            share_services.cancel_upload_request(request.user, item)
                except (services.DataRequestError, share_services.ShareError) as exc:
                    errors.append(f"{item.request.reference} - {item.record_title}: {exc.message}")
                    continue
                done += 1
                self.log_change(request, item, "Reopened decision.")
            self._report(request, done, "Reopened", errors)

        return self._with_form(
            request, queryset, ConfirmForm, apply=apply, submit="Reopen",
            title="Reopen decisions",
            intro="These items go back to waiting for the data owner's decision. Who decided, when and the "
                  "message are cleared, and anyone asked to upload the data is told it's no longer needed. "
                  "Download links already sent keep working until they expire.",
        )


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ["user", "record", "added_at"]
    search_fields = ["user__email", "record__title"]
    raw_id_fields = ["user", "record"]
