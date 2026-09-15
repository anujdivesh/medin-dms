from django.db import migrations


def migrate_project_data(apps, schema_editor):
    """Move each record's `data['project']` (an id, from the old
    FieldType.PROJECT template field) onto the new core `project` FK, then
    drop the now-redundant FieldDefinition that offered it."""
    MetadataRecord = apps.get_model("api", "MetadataRecord")
    FieldDefinition = apps.get_model("api", "FieldDefinition")

    for record in MetadataRecord.objects.filter(data__has_key="project"):
        project_id = record.data.pop("project", None)
        if project_id not in (None, ""):
            record.project_id = int(project_id)
        record.save(update_fields=["project", "data"])

    FieldDefinition.objects.filter(field_type="project").delete()


def reverse_project_data(apps, schema_editor):
    """Best-effort reverse: put each record's project id back into `data`.
    The deleted FieldDefinition row is not recreated."""
    MetadataRecord = apps.get_model("api", "MetadataRecord")

    for record in MetadataRecord.objects.filter(project__isnull=False):
        record.data["project"] = record.project_id
        record.project = None
        record.save(update_fields=["project", "data"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_add_project_core_field"),
    ]

    operations = [
        migrations.RunPython(migrate_project_data, reverse_project_data),
    ]
