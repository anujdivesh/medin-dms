"""Mounted under /api/. See shares/views.py and shares/tus.py."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from . import tus, views

router = DefaultRouter(trailing_slash=False)
router.include_root_view = False
router.register("shares", views.ShareViewSet, basename="share")

urlpatterns = [
    # Trailing slash on the creation URL matters: upload URLs are returned
    # relative to it (Location: "<file_id>").
    path("shares/<int:share_id>/uploads/", tus.create_upload, name="share-upload-create"),
    path("shares/<int:share_id>/uploads/<int:file_id>", tus.upload, name="share-upload"),
    path("upload-requests", views.UploadRequestListView.as_view(), name="upload-requests"),
    path("public/shares/<str:token>", views.PublicShareView.as_view(), name="public-share"),
    path("public/shares/<str:token>/files/<int:file_id>", views.public_download, name="public-share-download"),
] + router.urls
