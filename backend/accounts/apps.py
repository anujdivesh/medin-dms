from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "accounts"
    verbose_name = "Accounts"

    def ready(self):
        from django.contrib.auth import get_user_model
        from django.db.models.signals import post_save

        from .models import create_profile_for_new_user

        post_save.connect(
            create_profile_for_new_user,
            sender=get_user_model(),
            dispatch_uid="accounts.create_profile_for_new_user",
        )
