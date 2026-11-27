"""Minimal tus 1.0 server (https://tus.io/protocols/resumable-upload) for
share uploads - "core" plus the "creation" and "termination" extensions,
which is what tus-js-client needs.

    OPTIONS/POST  shares/<share_id>/uploads/              create an upload
    HEAD          shares/<share_id>/uploads/<file_id>     current offset (resume)
    PATCH         shares/<share_id>/uploads/<file_id>     append a chunk
    DELETE        shares/<share_id>/uploads/<file_id>     remove the file (drafts only)

Plain Django views, not DRF: chunks are streamed straight to disk from the
request (request.read), never loaded into memory, which DRF parsers and
request.body (DATA_UPLOAD_MAX_MEMORY_SIZE) would do. Authentication is the
same JWT bearer token as the rest of the SPA's API.
"""

import base64

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from . import services
from .models import FileShare, SharedFile

TUS_VERSION = "1.0.0"


def _response(status=204, message="", **headers):
    response = HttpResponse(message, status=status, content_type="text/plain; charset=utf-8")
    response["Tus-Resumable"] = TUS_VERSION
    response["Cache-Control"] = "no-store"
    for name, value in headers.items():
        response[name.replace("_", "-")] = str(value)
    return response


def _options():
    return _response(
        204,
        Tus_Version=TUS_VERSION,
        Tus_Extension="creation,termination",
        Tus_Max_Size=settings.SHARE_MAX_FILE_SIZE,
    )


def _user(request):
    try:
        result = JWTAuthentication().authenticate(request)
    except (AuthenticationFailed, InvalidToken, TokenError):
        return None
    return result[0] if result else None


def _share_for(request, share_id):
    """(share, None) if the caller may upload to it, else (None, error response)."""
    user = _user(request)
    if user is None:
        return None, _response(401, "Log in to upload files.")
    share = FileShare.objects.filter(pk=share_id).first()
    if share is None or not services.can_manage(user, share):
        return None, _response(404, "Share not found.")
    return share, None


def _int_header(request, name):
    try:
        value = int(request.headers.get(name, ""))
    except ValueError:
        return None
    return value if value >= 0 else None


def _metadata(header):
    """tus Upload-Metadata: "key base64value,key2 base64value2"."""
    result = {}
    for pair in (header or "").split(","):
        key, _, value = pair.strip().partition(" ")
        if not key:
            continue
        try:
            result[key] = base64.b64decode(value).decode("utf-8") if value else ""
        except (ValueError, UnicodeDecodeError):
            result[key] = ""
    return result


@csrf_exempt
def create_upload(request, share_id):
    if request.method == "OPTIONS":
        return _options()
    if request.method != "POST":
        return _response(405, "Method not allowed.")
    share, error = _share_for(request, share_id)
    if error:
        return error
    length = _int_header(request, "Upload-Length")
    if length is None:
        return _response(400, "Upload-Length header required.")
    name = _metadata(request.headers.get("Upload-Metadata")).get("filename", "")
    try:
        shared_file = services.start_upload(share, name, length)
    except services.ShareError as exc:
        return _response(exc.status, exc.message)
    # Relative to the creation URL (".../uploads/"), so it's right behind any
    # proxy prefix; tus-js-client resolves it against that URL.
    return _response(201, Location=str(shared_file.pk), Upload_Offset=0)


@csrf_exempt
def upload(request, share_id, file_id):
    if request.method == "OPTIONS":
        return _options()
    share, error = _share_for(request, share_id)
    if error:
        return error
    shared_file = SharedFile.objects.filter(pk=file_id, share=share).first()
    if shared_file is None:
        return _response(404, "Upload not found.")

    if request.method == "HEAD":
        return _response(200, Upload_Offset=shared_file.offset, Upload_Length=shared_file.size)

    if request.method == "PATCH":
        if request.headers.get("Content-Type", "").split(";")[0].strip() != "application/offset+octet-stream":
            return _response(415, "Content-Type must be application/offset+octet-stream.")
        offset = _int_header(request, "Upload-Offset")
        if offset is None:
            return _response(400, "Upload-Offset header required.")
        try:
            shared_file = services.append_chunk(
                shared_file.pk, offset, request, _int_header(request, "Content-Length")
            )
        except services.ShareError as exc:
            return _response(exc.status, exc.message)
        return _response(204, Upload_Offset=shared_file.offset)

    if request.method == "DELETE":
        try:
            services.remove_file(shared_file)
        except services.ShareError as exc:
            return _response(exc.status, exc.message)
        return _response(204)

    return _response(405, "Method not allowed.")
