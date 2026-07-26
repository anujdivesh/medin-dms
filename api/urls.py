from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "api"

router = DefaultRouter()
router.register("templates", views.MetadataTemplateViewSet, basename="template")
router.register("records", views.MetadataRecordViewSet, basename="record")
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

urlpatterns = [
    path("health/", views.health, name="health"),
    path("", include(router.urls)),
]
