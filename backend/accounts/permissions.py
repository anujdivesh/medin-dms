from rest_framework.permissions import BasePermission

from .roles import has_finished_account, owned_organisations, verified_email


class IsEmailVerified(BasePermission):
    message = "Please verify your email address first."

    def has_permission(self, request, view):
        return verified_email(request.user) is not None


class IsOrganisationOwner(BasePermission):
    """For the owner endpoints: the user must own at least one organisation
    and have a finished account (a password or Google - see
    roles.has_finished_account), and an object with an `organisation`
    attribute (e.g. a DataRequestItem) must be routed to one of theirs."""

    NOT_OWNER = "You are not a data owner for this organisation."
    UNFINISHED = "Finish setting up your account (set a password) before reviewing requests."
    message = NOT_OWNER

    def has_permission(self, request, view):
        if not owned_organisations(request.user).exists():
            self.message = self.NOT_OWNER
            return False
        if not has_finished_account(request.user):
            self.message = self.UNFINISHED
            return False
        return True

    def has_object_permission(self, request, view, obj):
        self.message = self.NOT_OWNER
        org_id = getattr(obj, "organisation_id", None)
        return org_id is not None and owned_organisations(request.user).filter(pk=org_id).exists()
