from django import template
from django.conf import settings

register = template.Library()


@register.simple_tag
def frontend_url(path=""):
    """A page of the frontend SPA, e.g. {% frontend_url "/shares" %} - uploads
    and share links are managed there (they need the resumable uploader)."""
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"
