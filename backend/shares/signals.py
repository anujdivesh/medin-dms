"""Sent with transaction.on_commit, so receivers only see committed data.

    share_published  kwargs: share (FileShare) - files are uploaded and the
                     link is live; shares.notifications emails the recipient.
"""

from django.dispatch import Signal

share_published = Signal()

# Upload requests (shares.models.UploadRequest) - all kwargs: upload_request.
upload_requested = Signal()  # email the person asked to upload
upload_request_completed = Signal()  # they published the files - tell the owner
# kwargs also: reason ("replaced" | "cancelled" | "delivered")
upload_request_cancelled = Signal()
