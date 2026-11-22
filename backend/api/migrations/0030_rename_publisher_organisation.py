from django.db import migrations

# Record columns that point at an organisation - their field-map sources
# read its name, which was publisher_value.
COLUMNS = ["publisher", "originator", "custodian", "data_owner"]


def _rename_sources(apps, old, new):
    ElasticsearchFieldMap = apps.get_model("api", "ElasticsearchFieldMap")
    for column in COLUMNS:
        ElasticsearchFieldMap.objects.filter(source=f"{column}.{old}").update(
            source=f"{column}.{new}"
        )


def sources_to_name(apps, schema_editor):
    _rename_sources(apps, "publisher_value", "name")


def sources_to_publisher_value(apps, schema_editor):
    _rename_sources(apps, "name", "publisher_value")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0029_publisher_responsible_parties'),
    ]

    operations = [
        migrations.RenameModel('Publisher', 'Organisation'),
        migrations.RenameField('organisation', 'publisher_value', 'name'),
        migrations.AlterModelOptions(name='organisation', options={'ordering': ['name']}),
        migrations.RunPython(sources_to_name, sources_to_publisher_value),
    ]
