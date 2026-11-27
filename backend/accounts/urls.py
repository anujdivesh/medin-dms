"""Mounted under /api/ next to api.urls' auth/login, auth/refresh, auth/logout."""

from django.urls import path

from . import views

urlpatterns = [
    path("auth/register", views.register, name="auth-register"),
    path("auth/google", views.google_login, name="auth-google"),
    path("auth/magic-link", views.magic_link_login, name="auth-magic-link"),
    path("auth/magic-link/register", views.magic_link_register, name="auth-magic-link-register"),
    path("auth/me", views.me, name="auth-me"),
    path("auth/verify-email", views.verify_email, name="auth-verify-email"),
    path("auth/resend-verification", views.resend_verification, name="auth-resend-verification"),
    path("auth/admin-session", views.admin_session, name="auth-admin-session"),
    path("auth/password", views.change_password, name="auth-password"),
    path("auth/password-reset", views.password_reset_request, name="auth-password-reset"),
    path("auth/password-reset/confirm", views.password_reset_confirm, name="auth-password-reset-confirm"),
]
