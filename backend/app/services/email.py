import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    pass


_TEMPLATES = {
    "en": {
        "subject": "Your DocArchive verification code",
        "greeting": "Hello {name},",
        "intro": "Use the code below to finish creating your DocArchive account.",
        "code_label": "Verification code",
        "expires": "This code expires in {minutes} minutes. If you didn't request it, you can ignore this email.",
        "footer": "DocArchive · AI",
    },
    "az": {
        "subject": "DocArchive təsdiq kodunuz",
        "greeting": "Salam {name},",
        "intro": "DocArchive hesabınızı yaratmağı tamamlamaq üçün aşağıdakı kodu istifadə edin.",
        "code_label": "Təsdiq kodu",
        "expires": "Bu kodun etibarlılıq müddəti {minutes} dəqiqədir. Əgər bu sorğunu siz göndərməmisinizsə, bu məktubu nəzərə almayın.",
        "footer": "DocArchive · AI",
    },
    "ru": {
        "subject": "Ваш код подтверждения DocArchive",
        "greeting": "Здравствуйте, {name},",
        "intro": "Используйте код ниже, чтобы завершить создание учётной записи DocArchive.",
        "code_label": "Код подтверждения",
        "expires": "Срок действия кода — {minutes} минут. Если вы не запрашивали этот код, просто проигнорируйте это письмо.",
        "footer": "DocArchive · AI",
    },
}


def _render(language: str, name: str, code: str) -> tuple[str, str, str]:
    t = _TEMPLATES.get(language, _TEMPLATES["en"])
    subject = t["subject"]
    greeting = t["greeting"].format(name=name or "")
    expires = t["expires"].format(minutes=settings.otp_ttl_minutes)

    text = (
        f"{greeting}\n\n"
        f"{t['intro']}\n\n"
        f"{t['code_label']}: {code}\n\n"
        f"{expires}\n\n"
        f"— {t['footer']}\n"
    )

    html = f"""\
<!doctype html>
<html>
  <body style="font-family:Calibri,Arial,sans-serif;background:#f6f4ee;color:#1f1f1f;margin:0;padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e6e1d3;padding:32px;">
      <div style="font:600 11px/1 monospace;letter-spacing:0.22em;text-transform:uppercase;color:#7db542;margin-bottom:24px;">
        {t['footer']}
      </div>
      <p style="font-size:15px;margin:0 0 12px 0;">{greeting}</p>
      <p style="font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 24px 0;">{t['intro']}</p>
      <div style="font:600 10px/1 monospace;letter-spacing:0.24em;text-transform:uppercase;color:#7d7466;margin-bottom:6px;">
        {t['code_label']}
      </div>
      <div style="font:600 32px/1 monospace;letter-spacing:0.24em;color:#2d5016;background:#f6f4ee;border:1px solid #e6e1d3;padding:18px 20px;text-align:center;margin-bottom:24px;">
        {code}
      </div>
      <p style="font-size:12.5px;line-height:1.6;color:#7d7466;margin:0;">{expires}</p>
    </div>
  </body>
</html>
"""
    return subject, text, html


async def send_verification_email(
    *,
    to_email: str,
    full_name: str,
    code: str,
    language: str,
) -> None:
    if not settings.smtp_host:
        # Dev fallback — no SMTP configured. Surface the code in the logs so a developer
        # can complete the flow locally without setting up a mail server.
        logger.info(
            "[email/dev] verification code for %s (%s): %s",
            to_email,
            language,
            code,
        )
        return

    subject, text, html = _render(language, full_name, code)

    msg = EmailMessage()
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    # smtp_secure=true → implicit SSL (use_tls); otherwise upgrade with STARTTLS.
    tls_kwargs = (
        {"use_tls": True} if settings.smtp_secure else {"start_tls": True}
    )

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_pass or None,
            **tls_kwargs,
        )
    except Exception as e:
        logger.exception("Failed to send verification email to %s", to_email)
        raise EmailDeliveryError(str(e)) from e
