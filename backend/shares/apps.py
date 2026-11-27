from django.apps import AppConfig


class SharesConfig(AppConfig):
    name = "shares"
    verbose_name = "File shares"

    def ready(self):
        # Email the recipient when a share is published.
        from . import notifications

        notifications.connect()
