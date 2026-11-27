"""Account emails. Sent through whatever EMAIL_BACKEND settings.py picked -
SendGrid SMTP when SENDGRID_SMTP_HOST is set, otherwise the console backend
(the message and its link are printed in the Django server's output)."""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMessage
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .tokens import email_verification_token


def send_plain_email(subject, body, to):
    """Send a plain-text email from DEFAULT_FROM_EMAIL with the configured
    Reply-To. Shared by account emails and (later) data-request notifications."""
    reply_to = [settings.EMAIL_REPLY_TO] if getattr(settings, "EMAIL_REPLY_TO", "") else None
    EmailMessage(
        subject=subject,
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=list(to),
        reply_to=reply_to,
    ).send(fail_silently=False)


def _frontend_link(path, user, token):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/{path}?uid={uid}&token={token}"


def verification_link(user):
    return _frontend_link("verify-email", user, email_verification_token.make_token(user))


def password_reset_link(user):
    # Django's own reset tokens: invalid once the password changes or the user
    # logs in again, and after settings.PASSWORD_RESET_TIMEOUT (3 days).
    return _frontend_link("reset-password", user, default_token_generator.make_token(user))


def send_password_reset_email(user):
    link = password_reset_link(user)
    name = user.first_name or user.email
    if user.has_usable_password():
        intro = "We received a request to reset the password for your account."
    else:
        intro = ("Your account currently signs in with Google. You can also set a "
                 "password so you can log in with your email address.")
    send_plain_email(
        "Reset your password",
        f"Hi {name},\n\n{intro}\n\n"
        "Open the link below to choose a new password:\n\n"
        f"{link}\n\n"
        "If you didn't ask for this, you can ignore this email - your password won't change.\n",
        [user.email],
    )


def send_verification_email(user):
    link = verification_link(user)
    name = user.first_name or user.email
    send_plain_email(
        "Verify your email address",
        f"Hi {name},\n\n"
        "Please confirm your email address by opening the link below:\n\n"
        f"{link}\n\n"
        "If you didn't create an account, you can ignore this email.\n",
        [user.email],
    )
