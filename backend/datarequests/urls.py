"""Mounted under /api/.

    GET/POST/DELETE  cart
    DELETE           cart/<record_id>
    POST             cart/merge
    GET/POST         data-requests
    GET              data-requests/<id>
    POST             data-requests/<id>/cancel

    GET              owner/request-items?status=pending|decided|all&request=<id>
    POST             owner/request-items/<id>/decision
    POST/DELETE      owner/request-items/<id>/upload-request
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=False)
router.include_root_view = False
router.register("data-requests", views.DataRequestViewSet, basename="data-request")
router.register("owner/request-items", views.OwnerRequestItemViewSet, basename="owner-request-item")

urlpatterns = [
    path("cart", views.CartView.as_view(), name="cart"),
    path("cart/merge", views.CartMergeView.as_view(), name="cart-merge"),
    path("cart/<int:record_id>", views.CartItemView.as_view(), name="cart-item"),
] + router.urls
