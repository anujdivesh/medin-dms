"""Cart, requester-side data requests, and the owner (approver) endpoints."""

from django.db import transaction
from django.db.models import Prefetch
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from accounts.permissions import IsOrganisationOwner
from accounts.roles import owned_organisations
from shares import services as share_services
from shares.models import UploadRequest
from shares.services import live_shares_prefetch

from . import services
from .models import DataRequest, DataRequestItem
from .serializers import (
    CartAddSerializer,
    CartItemSerializer,
    CartMergeSerializer,
    DataRequestCreateSerializer,
    DataRequestSerializer,
    DecisionSerializer,
    UploadRequestInputSerializer,
    OwnerRequestItemSerializer,
)


def _error(exc):
    return Response({"detail": exc.message, **exc.extra}, status=status.HTTP_400_BAD_REQUEST)


def _cart_response(user, **extra):
    items = CartItemSerializer(services.cart_items(user), many=True).data
    return Response({"items": items, "count": len(items), **extra})


class CartView(APIView):
    """GET the cart, POST {record_id} to add, DELETE to empty it."""

    authentication_classes = [JWTAuthentication]  # see accounts/views.py JWT_ONLY
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return _cart_response(request.user)

    def post(self, request):
        serializer = CartAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.add_to_cart(request.user, serializer.validated_data["record_id"])
        except services.DataRequestError as exc:
            return _error(exc)
        return _cart_response(request.user)

    def delete(self, request):
        services.clear_cart(request.user)
        return _cart_response(request.user)


class CartItemView(APIView):
    """DELETE cart/<record_id> removes one record."""

    authentication_classes = [JWTAuthentication]  # see accounts/views.py JWT_ONLY
    permission_classes = [IsAuthenticated]

    def delete(self, request, record_id):
        services.remove_from_cart(request.user, record_id)
        return _cart_response(request.user)


class CartMergeView(APIView):
    """POST {record_ids} - fold the browser (anonymous) cart into this
    user's server cart after login. Returns the merged cart plus any ids
    that were skipped because they can't be requested."""

    authentication_classes = [JWTAuthentication]  # see accounts/views.py JWT_ONLY
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CartMergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        skipped = services.merge_cart(request.user, serializer.validated_data["record_ids"])
        return _cart_response(request.user, skipped=skipped)


class DataRequestPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class DataRequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                         mixins.CreateModelMixin, viewsets.GenericViewSet):
    """The current user's own data requests."""

    authentication_classes = [JWTAuthentication]  # see accounts/views.py JWT_ONLY
    permission_classes = [IsAuthenticated]
    pagination_class = DataRequestPagination
    serializer_class = DataRequestSerializer

    def get_queryset(self):
        return (
            DataRequest.objects.filter(requester=self.request.user)
            .prefetch_related(Prefetch(
                "items",
                queryset=DataRequestItem.objects.select_related(
                    "organisation", "record__metadata_type"
                ).prefetch_related(live_shares_prefetch()),
            ))
        )

    def create(self, request, *args, **kwargs):
        serializer = DataRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            data_request = services.submit_request(
                request.user,
                purpose=data["purpose"],
                record_ids=data.get("record_ids"),
            )
        except services.DataRequestError as exc:
            return _error(exc)
        data_request = self.get_queryset().get(pk=data_request.pk)
        return Response(DataRequestSerializer(data_request).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        data_request = self.get_object()
        try:
            services.cancel_request(data_request, request.user)
        except services.DataRequestError as exc:
            return _error(exc)
        return Response(DataRequestSerializer(self.get_queryset().get(pk=data_request.pk)).data)


class OwnerRequestItemPagination(DataRequestPagination):
    page_size = 100
    max_page_size = 200


class OwnerRequestItemViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Request items routed to organisations the user is a data owner of.

    GET  owner/request-items?status=pending|decided|all&request=<id>
    POST owner/request-items/<id>/decision {decision: approved|declined, note,
                                           upload_request?: {email, message}}
    POST/DELETE owner/request-items/<id>/upload-request {email, message}
    """

    authentication_classes = [JWTAuthentication]  # see accounts/views.py JWT_ONLY
    permission_classes = [IsAuthenticated, IsOrganisationOwner]
    serializer_class = OwnerRequestItemSerializer
    pagination_class = OwnerRequestItemPagination

    STATUS_FILTERS = {
        "pending": [DataRequestItem.Status.PENDING],
        "decided": [DataRequestItem.Status.APPROVED, DataRequestItem.Status.DECLINED],
        "all": [DataRequestItem.Status.PENDING, DataRequestItem.Status.APPROVED,
                DataRequestItem.Status.DECLINED, DataRequestItem.Status.CANCELLED],
    }

    def get_queryset(self):
        qs = (
            DataRequestItem.objects.filter(organisation__in=owned_organisations(self.request.user))
            .select_related("organisation", "decided_by", "request__requester__profile")
            .prefetch_related(
                live_shares_prefetch(),
                Prefetch(
                    "upload_requests",
                    queryset=UploadRequest.objects.filter(status=UploadRequest.Status.OPEN),
                    to_attr="open_upload_requests",
                ),
            )
            .order_by("-request__created_at", "request_id", "id")
        )
        if self.action == "list":
            statuses = self.STATUS_FILTERS.get(self.request.query_params.get("status", "pending"))
            if statuses is None:
                statuses = self.STATUS_FILTERS["pending"]
            qs = qs.filter(status__in=statuses)
            request_id = self.request.query_params.get("request")
            if request_id and request_id.isdigit():
                qs = qs.filter(request_id=int(request_id))
        return qs

    @action(detail=True, methods=["post"])
    def decision(self, request, pk=None):
        item = self.get_object()
        serializer = DecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            # One transaction: if asking the uploader fails, the approval is
            # undone too - and the approval email (sent on commit) can say
            # who will upload the data.
            with transaction.atomic():
                services.decide_item(item, request.user, data["decision"], data.get("note", ""))
                if data.get("upload_request"):
                    item.refresh_from_db()
                    share_services.request_upload(
                        request.user, item,
                        data["upload_request"]["email"], data["upload_request"].get("message", ""),
                    )
        except services.DataRequestError as exc:
            return _error(exc)
        except share_services.ShareError as exc:
            return Response({"detail": exc.message}, status=exc.status)
        return Response(OwnerRequestItemSerializer(self.get_queryset().get(pk=item.pk)).data)

    @action(detail=True, methods=["post", "delete"], url_path="upload-request")
    def upload_request(self, request, pk=None):
        """POST {email, message}: ask someone to upload the data (replaces
        any open request). DELETE: cancel the open request."""
        item = self.get_object()
        try:
            if request.method == "DELETE":
                share_services.cancel_upload_request(request.user, item)
            else:
                serializer = UploadRequestInputSerializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                share_services.request_upload(
                    request.user, item,
                    serializer.validated_data["email"], serializer.validated_data.get("message", ""),
                )
        except share_services.ShareError as exc:
            return Response({"detail": exc.message}, status=exc.status)
        return Response(OwnerRequestItemSerializer(self.get_queryset().get(pk=item.pk)).data)
