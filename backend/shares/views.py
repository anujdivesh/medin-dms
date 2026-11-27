"""Share management for staff and data owners, and the public (anyone with
the link) page data and downloads. Uploads themselves are in shares/tus.py.

    GET/POST     shares                       list / create (draft)
    GET/DELETE   shares/<id>                  detail / revoke
    PATCH        shares/<id>                  edit title/message/recipient (drafts)
    POST         shares/<id>/publish          make the link live
    GET          upload-requests              datasets I was asked to upload
    GET          public/shares/<token>        share page data (no login)
    GET          public/shares/<token>/files/<file_id>   download (no login)
"""

import re
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.db.models import Q
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.utils import timezone
from django.utils.http import content_disposition_header
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from accounts.roles import verified_email

from . import services
from .models import UploadRequest
from .serializers import (
    FileShareCreateSerializer,
    FileShareSerializer,
    PublicShareSerializer,
    UploadRequestSerializer,
)


def _error(exc):
    return Response({"detail": exc.message}, status=exc.status)


class SharePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class ShareViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin,
                   mixins.UpdateModelMixin, viewsets.GenericViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    authentication_classes = [JWTAuthentication]  # see accounts/views.py JWT_ONLY
    permission_classes = [IsAuthenticated]
    serializer_class = FileShareSerializer
    pagination_class = SharePagination

    def get_queryset(self):
        shares = services.visible_shares(self.request.user)
        item = self.request.query_params.get("request_item")
        if item and item.isdigit():
            shares = shares.filter(request_item_id=int(item))
        return shares

    def create(self, request, *args, **kwargs):
        serializer = FileShareCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            share = services.create_share(
                request.user,
                title=data.get("title", ""),
                message=data.get("message", ""),
                request_item=data.get("request_item"),
                recipient_email=data.get("recipient_email", ""),
            )
        except services.ShareError as exc:
            return _error(exc)
        return Response(FileShareSerializer(self.get_queryset().get(pk=share.pk)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        """Edit title/message/recipient while the share is still a draft."""
        share = self.get_object()
        serializer = FileShareCreateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            services.update_draft(share, **{
                key: value for key, value in serializer.validated_data.items()
                if key in ("title", "message", "recipient_email")
            })
        except services.ShareError as exc:
            return _error(exc)
        return Response(FileShareSerializer(self.get_queryset().get(pk=share.pk)).data)

    def destroy(self, request, *args, **kwargs):
        share = services.revoke(self.get_object())
        return Response(FileShareSerializer(self.get_queryset().get(pk=share.pk)).data)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        try:
            share = services.publish(self.get_object())
        except services.ShareError as exc:
            return _error(exc)
        return Response(FileShareSerializer(self.get_queryset().get(pk=share.pk)).data)


class UploadRequestListView(APIView):
    """GET upload-requests: datasets owners asked this user (by verified
    email) to upload - open ones, plus those completed in the last 30 days."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        email = verified_email(request.user)
        if not email:
            return Response([])
        recent = timezone.now() - timedelta(days=30)
        upload_requests = (
            UploadRequest.objects.filter(email__iexact=email)
            .filter(Q(status=UploadRequest.Status.OPEN)
                    | Q(status=UploadRequest.Status.COMPLETED, completed_at__gte=recent))
            .select_related(
                "requested_by", "share", "request_item__organisation",
                "request_item__request__requester__profile",
            )
        )
        return Response(UploadRequestSerializer(upload_requests, many=True).data)


class ShareThrottle(SimpleRateThrottle):
    """Per-IP limit on the public share pages (rate: "share" in
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"])."""

    scope = "share"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class PublicShareView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ShareThrottle]

    def get(self, request, token):
        try:
            share = services.public_share(token)
        except services.ShareError as exc:
            return _error(exc)
        return Response(PublicShareSerializer(share).data)


# --- Download ---------------------------------------------------------------------

RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")
STREAM_BLOCK = 8 * 1024 * 1024


def _parse_range(header, size):
    """(start, end) for a single "bytes=a-b" range, None for the whole file,
    or "invalid" if it can't be satisfied. Multi-range requests get the
    whole file, which the HTTP spec allows."""
    match = RANGE_RE.match((header or "").strip())
    if not match or not (match[1] or match[2]):
        return None
    if match[1]:
        start = int(match[1])
        end = min(int(match[2]), size - 1) if match[2] else size - 1
    else:  # "bytes=-N": the last N bytes
        start, end = max(size - int(match[2]), 0), size - 1
    if start > end or start >= size:
        return "invalid"
    return start, end


def _stream(path, start, length):
    with open(path, "rb") as fh:
        fh.seek(start)
        remaining = length
        while remaining > 0:
            data = fh.read(min(STREAM_BLOCK, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


def public_download(request, token, file_id):
    """Anyone with the link. nginx sends the bytes when
    SHARE_ACCEL_REDIRECT_PREFIX is set; otherwise Django streams them, with
    Range support so browsers and download managers can resume."""
    if request.method not in ("GET", "HEAD"):
        return JsonResponse({"detail": "Method not allowed."}, status=405)
    try:
        share = services.public_share(token)
    except services.ShareError as exc:
        return JsonResponse({"detail": exc.message}, status=exc.status)
    shared_file = next((f for f in share.files.all() if f.pk == file_id and f.is_complete), None)
    if shared_file is None or not shared_file.path.exists():
        return JsonResponse({"detail": "File not found."}, status=404)

    range_header = request.headers.get("Range", "")
    # Resumes and parallel download-manager segments are one download.
    if request.method == "GET" and (not range_header or range_header.startswith("bytes=0-")):
        services.record_download(share, shared_file)

    disposition = content_disposition_header(True, shared_file.original_name)
    prefix = settings.SHARE_ACCEL_REDIRECT_PREFIX
    if prefix:
        response = HttpResponse(content_type="application/octet-stream")
        response["X-Accel-Redirect"] = prefix.rstrip("/") + "/" + quote(shared_file.storage_name)
        response["Content-Disposition"] = disposition
        return response

    size = shared_file.size
    byte_range = _parse_range(range_header, size)
    if byte_range == "invalid":
        response = HttpResponse(status=416)
        response["Content-Range"] = f"bytes */{size}"
        return response
    start, end = byte_range or (0, size - 1)
    length = end - start + 1
    response = StreamingHttpResponse(
        _stream(shared_file.path, start, length) if request.method == "GET" else iter(()),
        status=206 if byte_range else 200,
        content_type="application/octet-stream",
    )
    response["Content-Length"] = str(length)
    response["Accept-Ranges"] = "bytes"
    response["Content-Disposition"] = disposition
    response["Cache-Control"] = "private, no-store"
    if byte_range:
        response["Content-Range"] = f"bytes {start}-{end}/{size}"
    return response
