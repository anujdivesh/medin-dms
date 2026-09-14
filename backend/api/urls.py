from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import auth_views, views

app_name = "api"

# trailing_slash=False matches the legacy backend's URL convention
# (`/contacts`, not `/contacts/`) - apiEndpoints.js's paths have no trailing
# slash, so this keeps the frontend's existing lookup admin pages working
# unmodified when pointed at Django.
router = DefaultRouter(trailing_slash=False)
router.register("templates", views.MetadataTemplateViewSet, basename="template")
router.register("metadata", views.MetadataRecordViewSet, basename="metadata")
router.register("contacts", views.ContactViewSet, basename="contact")
router.register("countries", views.CountryViewSet, basename="country")
router.register(
    "coordinate-reference-systems",
    views.CoordinateReferenceSystemViewSet,
    basename="coordinate-reference-system",
)
router.register("publishers", views.PublisherViewSet, basename="publisher")
router.register("topics", views.TopicViewSet, basename="topic")
router.register("keywords", views.KeywordViewSet, basename="keyword")
router.register("projects", views.ProjectViewSet, basename="project")
router.register(
    "spatial-representation-types",
    views.SpatialRepresentationTypeViewSet,
    basename="spatial-representation-type",
)
router.register("data-types", views.DataTypeViewSet, basename="data-type")
router.register("metadata-types", views.MetadataTypeViewSet, basename="metadata-type")

urlpatterns = [
    path("health/", views.health, name="health"),
    path("auth/login", auth_views.login, name="auth-login"),
    path("auth/refresh", auth_views.refresh_token_view, name="auth-refresh"),
    path("auth/logout", auth_views.logout, name="auth-logout"),
    path(
        "downloads/acquisition_reports/<str:filename>",
        views.acquisition_report,
        name="acquisition-report",
    ),
    # legacy's own path shape (id after the static "history" segment) - must
    # come before the router include so it's matched first.
    path("metadata/history/<int:pk>", views.metadata_history, name="metadata-history"),
    path("", include(router.urls)),
]
