from django.apps import AppConfig


class DataRequestsConfig(AppConfig):
    name = "datarequests"
    verbose_name = "Data requests"

    def ready(self):
        # Emails to owners/requesters/SPC on submit, routing and decisions.
        from . import notifications

        notifications.connect()
