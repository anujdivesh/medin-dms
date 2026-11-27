"""Events other code can react to - chiefly the phase-3 email notifications.

Receivers get `sender=DataRequest` / `DataRequestItem` plus the instance:

    from django.dispatch import receiver
    from datarequests.signals import request_submitted

    @receiver(request_submitted)
    def notify_owners(sender, request, **kwargs):
        for item in request.items.select_related("organisation"):
            send_mail(..., recipient_list=recipients_for_item(item))

They're sent with transaction.on_commit, so receivers only ever see
committed data and a failing receiver can't roll back the request.
"""

from django.dispatch import Signal

# kwargs: request (DataRequest)
request_submitted = Signal()
# kwargs: item (DataRequestItem), decision ("approved"/"declined"), by (User)
request_item_decided = Signal()
# kwargs: request (DataRequest)
request_cancelled = Signal()
# kwargs: items (list of DataRequestItem) - unrouted items an admin has just
# assigned to an organisation, so its owners need to hear about them.
request_items_routed = Signal()
