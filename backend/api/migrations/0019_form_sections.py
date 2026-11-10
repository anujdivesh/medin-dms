import django.db.models.deletion
from django.db import migrations, models


# The sections that were fixed choices until now, in order, as (slug, name).
SECTIONS = [
    ("identification", "Identification"),
    ("classification", "Classification"),
    ("responsible_parties", "Responsible parties"),
    ("spatial_extent", "Spatial extent"),
    ("temporal_extent", "Temporal extent"),
    ("spatial_reference", "Spatial reference and representation"),
    ("quality_and_lineage", "Data quality and lineage"),
    ("constraints", "Constraints"),
    ("distribution", "Distribution"),
    ("content_description", "Content description"),
    ("supporting_documentation", "Supporting documentation"),
    ("metadata_record", "Metadata record"),
]


def create_sections(apps, schema_editor):
    FormSection = apps.get_model("api", "FormSection")
    FormSection.objects.bulk_create([
        FormSection(slug=slug, name=name, order=(i + 1) * 10)
        for i, (slug, name) in enumerate(SECTIONS)
    ])


def link_sections(apps, schema_editor):
    """Old choice value -> the matching section ("template" -> none)."""
    FormSection = apps.get_model("api", "FormSection")
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    for section in FormSection.objects.all():
        FieldDefinition.objects.filter(section_key=section.slug).update(section=section)


def unlink_sections(apps, schema_editor):
    FieldDefinition = apps.get_model("api", "FieldDefinition")
    for field in FieldDefinition.objects.select_related("section"):
        field.section_key = field.section.slug if field.section else "template"
        field.save(update_fields=["section_key"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0018_report_link_or_file"),
    ]

    operations = [
        migrations.CreateModel(
            name="FormSection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255, unique=True)),
                ("slug", models.SlugField(
                    help_text="Built-in fields start in the section with their default slug (see BUILTIN_FIELD_SECTIONS) - changing it means new templates put those fields under Template fields instead.",
                    max_length=100, unique=True,
                )),
                ("order", models.PositiveIntegerField(default=0, help_text="Sections are shown lowest first")),
            ],
            options={"ordering": ["order", "id"]},
        ),
        migrations.RunPython(create_sections, migrations.RunPython.noop),
        migrations.RenameField(
            model_name="fielddefinition", old_name="section", new_name="section_key",
        ),
        migrations.AddField(
            model_name="fielddefinition",
            name="section",
            field=models.ForeignKey(
                blank=True, null=True,
                help_text="Section of the record form this field is shown in - empty for Template fields",
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="fields", to="api.formsection",
            ),
        ),
        migrations.RunPython(link_sections, unlink_sections),
        migrations.RemoveField(model_name="fielddefinition", name="section_key"),
    ]
