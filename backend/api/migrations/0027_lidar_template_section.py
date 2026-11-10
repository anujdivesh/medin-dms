"""Adds the "LiDAR Template" form section and moves the LiDAR template's
Acquisition report, Project report, Factsheet and Additional information file
rows into it. Those four are no longer default fields (OPTIONAL_FIELD_NAMES):
a template only has them when it adds them, and they're listed and editable
on the template. Other templates keep their rows (and records their values)."""

from django.db import migrations
from django.db.models import Q

SLUG = "lidar_template"
NAME = "LiDAR Template"
FIELDS = ["acquisition_report_file", "project_report_link", "factsheet", "additional_information_file"]


def forwards(apps, schema_editor):
    FormSection = apps.get_model("api", "FormSection")
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    MetadataTemplate = apps.get_model("api", "MetadataTemplate")

    section = FormSection.objects.filter(Q(slug=SLUG) | Q(name__iexact=NAME)).first()
    if section is None:
        last = FormSection.objects.order_by("-order").values_list("order", flat=True).first() or 0
        section = FormSection.objects.create(name=NAME, slug=SLUG, order=last + 10)

    lidar = MetadataTemplate.objects.filter(Q(slug__iexact="lidar") | Q(name__iexact="lidar"))
    FieldDefinition.objects.filter(template__in=lidar, name__in=FIELDS).update(section=section)


def backwards(apps, schema_editor):
    FormSection = apps.get_model("api", "FormSection")
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    section = FormSection.objects.filter(slug=SLUG).first()
    if section is None:
        return
    supporting = FormSection.objects.filter(slug="supporting_documentation").first()
    FieldDefinition.objects.filter(section=section, name__in=FIELDS).update(section=supporting)
    if not FieldDefinition.objects.filter(section=section).exists():
        section.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0026_add_document_index_fields"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
