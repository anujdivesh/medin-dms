from django.conf import settings
from django.db import migrations


def create_missing_profiles(apps, schema_editor):
    app_label, model_name = settings.AUTH_USER_MODEL.split(".")
    User = apps.get_model(app_label, model_name)
    UserProfile = apps.get_model("accounts", "UserProfile")
    existing = set(UserProfile.objects.values_list("user_id", flat=True))
    UserProfile.objects.bulk_create(
        [UserProfile(user_id=pk) for pk in User.objects.values_list("pk", flat=True) if pk not in existing]
    )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_missing_profiles, migrations.RunPython.noop),
    ]
