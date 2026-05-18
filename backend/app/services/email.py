"""SMTP email delivery — verification OTP + event-based transactional emails.

The verification OTP path (``send_verification_email``) raises ``EmailDeliveryError``
because /auth/register is a hard fail if mail doesn't go out. Every other site
calls ``send_event_email`` / ``email_users`` which swallow exceptions and log
them — the request flow must not fail just because SMTP is down.

Templates use ``str.format``; the caller supplies a ``context`` dict whose keys
match the placeholders. Missing keys raise ``KeyError`` at send time so broken
templates surface during dev rather than ship silently.
"""

import logging
import uuid
from email.message import EmailMessage
from typing import Any, Iterable, Optional

import aiosmtplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    pass


# ── Verification OTP (existing flow — unchanged behaviour) ─────────────────

_VERIFICATION_TEMPLATES = {
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


def _verification_render(language: str, name: str, code: str) -> tuple[str, str, str]:
    t = _VERIFICATION_TEMPLATES.get(language, _VERIFICATION_TEMPLATES["en"])
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
    body_html = f"""
      <p style="font-size:15px;margin:0 0 12px 0;">{greeting}</p>
      <p style="font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 24px 0;">{t['intro']}</p>
      <div style="font:600 10px/1 monospace;letter-spacing:0.24em;text-transform:uppercase;color:#7d7466;margin-bottom:6px;">{t['code_label']}</div>
      <div style="font:600 32px/1 monospace;letter-spacing:0.24em;color:#2d5016;background:#f6f4ee;border:1px solid #e6e1d3;padding:18px 20px;text-align:center;margin-bottom:24px;">{code}</div>
      <p style="font-size:12.5px;line-height:1.6;color:#7d7466;margin:0;">{expires}</p>
    """
    return subject, text, _wrap_html(language, body_html)


async def send_verification_email(
    *,
    to_email: str,
    full_name: str,
    code: str,
    language: str,
) -> None:
    if not settings.smtp_host:
        logger.info("[email/dev] verification code for %s (%s): %s", to_email, language, code)
        return
    subject, text, html = _verification_render(language, full_name, code)
    try:
        await _send(to_email, subject, text, html)
    except EmailDeliveryError:
        raise
    except Exception as e:
        logger.exception("Failed to send verification email to %s", to_email)
        raise EmailDeliveryError(str(e)) from e


# ── Generic transport ──────────────────────────────────────────────────────


_HTML_CHROME = {
    "en": {"footer": "DocArchive · AI", "view": "Open DocArchive"},
    "az": {"footer": "DocArchive · AI", "view": "DocArchive-i aç"},
    "ru": {"footer": "DocArchive · AI", "view": "Открыть DocArchive"},
}


def _wrap_html(language: str, body_html: str) -> str:
    chrome = _HTML_CHROME.get(language, _HTML_CHROME["en"])
    return f"""\
<!doctype html>
<html>
  <body style="font-family:Calibri,Arial,sans-serif;background:#f6f4ee;color:#1f1f1f;margin:0;padding:32px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e6e1d3;padding:32px;">
      <div style="font:600 11px/1 monospace;letter-spacing:0.22em;text-transform:uppercase;color:#7db542;margin-bottom:24px;">
        {chrome['footer']}
      </div>
      {body_html}
    </div>
  </body>
</html>
"""


async def _send(to_email: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    tls_kwargs = (
        {"use_tls": True} if settings.smtp_secure else {"start_tls": True}
    )
    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_pass or None,
        **tls_kwargs,
    )


# ── Event templates ────────────────────────────────────────────────────────
#
# Shape: EVENT_TEMPLATES[event][lang] = {subject, text, html_body}
# Subject/text/html_body run through str.format with the caller's context dict.
# Common context keys: full_name, actor_name, doc_title, doc_url, reason,
#                       invite_url, reset_url, code, dept_name, old_role,
#                       new_role, status, rules_summary, comment_preview.

EVENT_TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    "invite": {
        "en": {
            "subject": "You're invited to DocArchive",
            "text": (
                "Hello {full_name},\n\n"
                "{actor_name} has invited you to DocArchive. "
                "Click the link below to set your password and finish creating your account.\n\n"
                "{invite_url}\n\n"
                "This invite expires in 7 days.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> has invited you to DocArchive. "
                "Click the button below to set your password and finish creating your account.</p>"
                "<p style='margin:24px 0;'><a href='{invite_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;'>Set my password</a></p>"
                "<p style='font-size:12.5px;color:#7d7466;margin:0;'>Or paste this URL in your browser: {invite_url}</p>"
                "<p style='font-size:12px;color:#7d7466;margin:18px 0 0 0;'>This invite expires in 7 days.</p>"
            ),
        },
        "az": {
            "subject": "Sizi DocArchive-ə dəvət etdik",
            "text": (
                "Salam {full_name},\n\n"
                "{actor_name} sizi DocArchive-ə dəvət etdi. "
                "Şifrənizi təyin etmək və hesabınızı tamamlamaq üçün aşağıdakı linkə daxil olun.\n\n"
                "{invite_url}\n\n"
                "Bu dəvətin etibarlılıq müddəti 7 gündür.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> sizi DocArchive-ə dəvət etdi. "
                "Şifrənizi təyin etmək və hesabınızı tamamlamaq üçün aşağıdakı düyməyə klikləyin.</p>"
                "<p style='margin:24px 0;'><a href='{invite_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;'>Şifrəni təyin et</a></p>"
                "<p style='font-size:12.5px;color:#7d7466;margin:0;'>Və ya bu URL-i brauzerə yapışdırın: {invite_url}</p>"
                "<p style='font-size:12px;color:#7d7466;margin:18px 0 0 0;'>Bu dəvətin etibarlılıq müddəti 7 gündür.</p>"
            ),
        },
        "ru": {
            "subject": "Вас пригласили в DocArchive",
            "text": (
                "Здравствуйте, {full_name},\n\n"
                "{actor_name} пригласил(а) вас в DocArchive. "
                "Перейдите по ссылке ниже, чтобы задать пароль и завершить создание учётной записи.\n\n"
                "{invite_url}\n\n"
                "Приглашение действительно 7 дней.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> пригласил(а) вас в DocArchive. "
                "Нажмите на кнопку ниже, чтобы задать пароль и завершить создание учётной записи.</p>"
                "<p style='margin:24px 0;'><a href='{invite_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;'>Задать пароль</a></p>"
                "<p style='font-size:12.5px;color:#7d7466;margin:0;'>Или вставьте этот URL в браузер: {invite_url}</p>"
                "<p style='font-size:12px;color:#7d7466;margin:18px 0 0 0;'>Приглашение действительно 7 дней.</p>"
            ),
        },
    },
    "password_reset_code": {
        "en": {
            "subject": "Your DocArchive password reset code",
            "text": (
                "Hello {full_name},\n\nUse the code below to reset your DocArchive password.\n\n"
                "Reset code: {code}\n\nThis code expires in 15 minutes. If you didn't request it, you can ignore this email.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "Use the code below to reset your DocArchive password.</p>"
                "<div style='font:600 10px/1 monospace;letter-spacing:0.24em;text-transform:uppercase;color:#7d7466;margin-bottom:6px;'>Reset code</div>"
                "<div style='font:600 32px/1 monospace;letter-spacing:0.24em;color:#2d5016;background:#f6f4ee;border:1px solid #e6e1d3;padding:18px 20px;text-align:center;margin-bottom:18px;'>{code}</div>"
                "<p style='font-size:12.5px;color:#7d7466;margin:0;'>This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>"
            ),
        },
        "az": {
            "subject": "DocArchive şifrə sıfırlama kodunuz",
            "text": (
                "Salam {full_name},\n\nDocArchive şifrənizi sıfırlamaq üçün aşağıdakı kodu istifadə edin.\n\n"
                "Sıfırlama kodu: {code}\n\nBu kodun etibarlılıq müddəti 15 dəqiqədir. Əgər bu sorğunu siz göndərməmisinizsə, bu məktubu nəzərə almayın.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "DocArchive şifrənizi sıfırlamaq üçün aşağıdakı kodu istifadə edin.</p>"
                "<div style='font:600 10px/1 monospace;letter-spacing:0.24em;text-transform:uppercase;color:#7d7466;margin-bottom:6px;'>Sıfırlama kodu</div>"
                "<div style='font:600 32px/1 monospace;letter-spacing:0.24em;color:#2d5016;background:#f6f4ee;border:1px solid #e6e1d3;padding:18px 20px;text-align:center;margin-bottom:18px;'>{code}</div>"
                "<p style='font-size:12.5px;color:#7d7466;margin:0;'>Bu kodun etibarlılıq müddəti 15 dəqiqədir. Əgər bu sorğunu siz göndərməmisinizsə, bu məktubu nəzərə almayın.</p>"
            ),
        },
        "ru": {
            "subject": "Ваш код сброса пароля DocArchive",
            "text": (
                "Здравствуйте, {full_name},\n\nИспользуйте код ниже, чтобы сбросить пароль в DocArchive.\n\n"
                "Код сброса: {code}\n\nСрок действия кода — 15 минут. Если вы не запрашивали сброс, просто проигнорируйте это письмо.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "Используйте код ниже, чтобы сбросить пароль в DocArchive.</p>"
                "<div style='font:600 10px/1 monospace;letter-spacing:0.24em;text-transform:uppercase;color:#7d7466;margin-bottom:6px;'>Код сброса</div>"
                "<div style='font:600 32px/1 monospace;letter-spacing:0.24em;color:#2d5016;background:#f6f4ee;border:1px solid #e6e1d3;padding:18px 20px;text-align:center;margin-bottom:18px;'>{code}</div>"
                "<p style='font-size:12.5px;color:#7d7466;margin:0;'>Срок действия кода — 15 минут. Если вы не запрашивали сброс, просто проигнорируйте это письмо.</p>"
            ),
        },
    },
    "password_changed": {
        "en": {
            "subject": "Your DocArchive password was changed",
            "text": (
                "Hello {full_name},\n\nYour DocArchive password was just changed. "
                "If this was you, no action is needed. If not, contact your administrator immediately.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "Your DocArchive password was just changed. If this was you, no action is needed. "
                "If not, contact your administrator immediately.</p>"
            ),
        },
        "az": {
            "subject": "DocArchive şifrəniz dəyişdirildi",
            "text": (
                "Salam {full_name},\n\nDocArchive şifrəniz indicə dəyişdirildi. "
                "Bunu siz etmisinizsə, heç bir tədbir lazım deyil. Əksinə isə, dərhal administratorunuzla əlaqə saxlayın.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "DocArchive şifrəniz indicə dəyişdirildi. Bunu siz etmisinizsə, heç bir tədbir lazım deyil. "
                "Əksinə isə, dərhal administratorunuzla əlaqə saxlayın.</p>"
            ),
        },
        "ru": {
            "subject": "Ваш пароль DocArchive был изменён",
            "text": (
                "Здравствуйте, {full_name},\n\nВаш пароль DocArchive был только что изменён. "
                "Если это сделали вы — никаких действий не требуется. Если нет — немедленно свяжитесь с администратором.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "Ваш пароль DocArchive был только что изменён. Если это сделали вы — никаких действий не требуется. "
                "Если нет — немедленно свяжитесь с администратором.</p>"
            ),
        },
    },
    "role_changed": {
        "en": {
            "subject": "Your DocArchive role was updated",
            "text": (
                "Hello {full_name},\n\n{actor_name} changed your role from \"{old_role}\" to \"{new_role}\".\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> changed your role from "
                "<strong>{old_role}</strong> to <strong>{new_role}</strong>.</p>"
            ),
        },
        "az": {
            "subject": "DocArchive rolunuz yeniləndi",
            "text": (
                "Salam {full_name},\n\n{actor_name} rolunuzu \"{old_role}\" → \"{new_role}\" olaraq dəyişdi.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> rolunuzu "
                "<strong>{old_role}</strong> → <strong>{new_role}</strong> olaraq dəyişdi.</p>"
            ),
        },
        "ru": {
            "subject": "Ваша роль в DocArchive обновлена",
            "text": (
                "Здравствуйте, {full_name},\n\n{actor_name} изменил(а) вашу роль с «{old_role}» на «{new_role}».\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> изменил(а) вашу роль с "
                "<strong>«{old_role}»</strong> на <strong>«{new_role}»</strong>.</p>"
            ),
        },
    },
    "activation_changed": {
        "en": {
            "subject": "Your DocArchive account was {status}",
            "text": (
                "Hello {full_name},\n\n{actor_name} {status} your DocArchive account.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> {status} your DocArchive account.</p>"
            ),
        },
        "az": {
            "subject": "DocArchive hesabınız {status}",
            "text": (
                "Salam {full_name},\n\n{actor_name} DocArchive hesabınızı {status}.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> DocArchive hesabınızı {status}.</p>"
            ),
        },
        "ru": {
            "subject": "Ваша учётная запись DocArchive {status}",
            "text": (
                "Здравствуйте, {full_name},\n\n{actor_name} {status} вашу учётную запись DocArchive.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> {status} вашу учётную запись DocArchive.</p>"
            ),
        },
    },
    "member_assigned": {
        "en": {
            "subject": "You've been added to {dept_name}",
            "text": (
                "Hello {full_name},\n\n{actor_name} added you to the \"{dept_name}\" department.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> added you to the <strong>{dept_name}</strong> department.</p>"
            ),
        },
        "az": {
            "subject": "Siz {dept_name} şöbəsinə əlavə edildiniz",
            "text": (
                "Salam {full_name},\n\n{actor_name} sizi \"{dept_name}\" şöbəsinə əlavə etdi.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> sizi <strong>{dept_name}</strong> şöbəsinə əlavə etdi.</p>"
            ),
        },
        "ru": {
            "subject": "Вы добавлены в отдел {dept_name}",
            "text": (
                "Здравствуйте, {full_name},\n\n{actor_name} добавил(а) вас в отдел «{dept_name}».\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> добавил(а) вас в отдел <strong>{dept_name}</strong>.</p>"
            ),
        },
    },
    "manager_assigned": {
        "en": {
            "subject": "You're now a manager of {dept_name}",
            "text": (
                "Hello {full_name},\n\n{actor_name} assigned you as a manager of \"{dept_name}\". "
                "You'll now receive approval requests for documents uploaded to this department.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> assigned you as a manager of <strong>{dept_name}</strong>. "
                "You'll now receive approval requests for documents uploaded to this department.</p>"
            ),
        },
        "az": {
            "subject": "Siz indi {dept_name} şöbəsinin meneceriyiniz",
            "text": (
                "Salam {full_name},\n\n{actor_name} sizi \"{dept_name}\" şöbəsinin meneceri olaraq təyin etdi. "
                "Bu şöbəyə yüklənən sənədlər üçün təsdiq sorğularını alacaqsınız.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> sizi <strong>{dept_name}</strong> şöbəsinin meneceri olaraq təyin etdi. "
                "Bu şöbəyə yüklənən sənədlər üçün təsdiq sorğularını alacaqsınız.</p>"
            ),
        },
        "ru": {
            "subject": "Вы назначены менеджером отдела {dept_name}",
            "text": (
                "Здравствуйте, {full_name},\n\n{actor_name} назначил(а) вас менеджером отдела «{dept_name}». "
                "Вы будете получать запросы на согласование документов, загружаемых в этот отдел.\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> назначил(а) вас менеджером отдела <strong>{dept_name}</strong>. "
                "Вы будете получать запросы на согласование документов, загружаемых в этот отдел.</p>"
            ),
        },
    },
    "approval_requested": {
        "en": {
            "subject": "New document awaiting approval: {doc_title}",
            "text": (
                "Hello {full_name},\n\n{actor_name} uploaded \"{doc_title}\" to a department you manage. "
                "Please review and approve.\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> uploaded <strong>{doc_title}</strong> to a department you manage. "
                "Please review and approve.</p>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Review document</a></p>"
            ),
        },
        "az": {
            "subject": "Təsdiq gözləyən yeni sənəd: {doc_title}",
            "text": (
                "Salam {full_name},\n\n{actor_name} idarə etdiyiniz şöbəyə \"{doc_title}\" sənədini yüklədi. "
                "Zəhmət olmasa nəzərdən keçirin və təsdiqləyin.\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> idarə etdiyiniz şöbəyə <strong>{doc_title}</strong> sənədini yüklədi. "
                "Zəhmət olmasa nəzərdən keçirin və təsdiqləyin.</p>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Sənədi aç</a></p>"
            ),
        },
        "ru": {
            "subject": "Новый документ на согласование: {doc_title}",
            "text": (
                "Здравствуйте, {full_name},\n\n{actor_name} загрузил(а) «{doc_title}» в отдел, которым вы управляете. "
                "Пожалуйста, проверьте и согласуйте.\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> загрузил(а) <strong>{doc_title}</strong> в отдел, которым вы управляете. "
                "Пожалуйста, проверьте и согласуйте.</p>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Открыть документ</a></p>"
            ),
        },
    },
    "document_approved": {
        "en": {
            "subject": "Your document was approved: {doc_title}",
            "text": "Hello {full_name},\n\n{actor_name} approved \"{doc_title}\".\n\n{doc_url}\n",
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> approved <strong>{doc_title}</strong>.</p>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Open document</a></p>"
            ),
        },
        "az": {
            "subject": "Sənədiniz təsdiq edildi: {doc_title}",
            "text": "Salam {full_name},\n\n{actor_name} \"{doc_title}\" sənədini təsdiq etdi.\n\n{doc_url}\n",
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> <strong>{doc_title}</strong> sənədini təsdiq etdi.</p>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Sənədi aç</a></p>"
            ),
        },
        "ru": {
            "subject": "Ваш документ одобрен: {doc_title}",
            "text": "Здравствуйте, {full_name},\n\n{actor_name} одобрил(а) «{doc_title}».\n\n{doc_url}\n",
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 18px 0;'>"
                "<strong>{actor_name}</strong> одобрил(а) <strong>{doc_title}</strong>.</p>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Открыть документ</a></p>"
            ),
        },
    },
    "document_rejected": {
        "en": {
            "subject": "Your document was rejected: {doc_title}",
            "text": (
                "Hello {full_name},\n\n{actor_name} rejected \"{doc_title}\".\n\nReason: {reason}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> rejected <strong>{doc_title}</strong>.</p>"
                "<div style='background:#f6f4ee;border-left:3px solid #c0392b;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'><strong>Reason:</strong> {reason}</div>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Open document</a></p>"
            ),
        },
        "az": {
            "subject": "Sənədiniz rədd edildi: {doc_title}",
            "text": (
                "Salam {full_name},\n\n{actor_name} \"{doc_title}\" sənədini rədd etdi.\n\nSəbəb: {reason}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> <strong>{doc_title}</strong> sənədini rədd etdi.</p>"
                "<div style='background:#f6f4ee;border-left:3px solid #c0392b;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'><strong>Səbəb:</strong> {reason}</div>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Sənədi aç</a></p>"
            ),
        },
        "ru": {
            "subject": "Ваш документ отклонён: {doc_title}",
            "text": (
                "Здравствуйте, {full_name},\n\n{actor_name} отклонил(а) «{doc_title}».\n\nПричина: {reason}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> отклонил(а) <strong>{doc_title}</strong>.</p>"
                "<div style='background:#f6f4ee;border-left:3px solid #c0392b;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'><strong>Причина:</strong> {reason}</div>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Открыть документ</a></p>"
            ),
        },
    },
    "revision_requested": {
        "en": {
            "subject": "Revision requested: {doc_title}",
            "text": (
                "Hello {full_name},\n\n{actor_name} requested a revision of \"{doc_title}\".\n\nNotes: {reason}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> requested a revision of <strong>{doc_title}</strong>.</p>"
                "<div style='background:#f6f4ee;border-left:3px solid #ef9f27;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'><strong>Notes:</strong> {reason}</div>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Open document</a></p>"
            ),
        },
        "az": {
            "subject": "Düzəliş tələb olundu: {doc_title}",
            "text": (
                "Salam {full_name},\n\n{actor_name} \"{doc_title}\" sənədinə düzəliş tələb etdi.\n\nQeydlər: {reason}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> <strong>{doc_title}</strong> sənədinə düzəliş tələb etdi.</p>"
                "<div style='background:#f6f4ee;border-left:3px solid #ef9f27;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'><strong>Qeydlər:</strong> {reason}</div>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Sənədi aç</a></p>"
            ),
        },
        "ru": {
            "subject": "Запрошен пересмотр: {doc_title}",
            "text": (
                "Здравствуйте, {full_name},\n\n{actor_name} запросил(а) пересмотр «{doc_title}».\n\nКомментарий: {reason}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> запросил(а) пересмотр <strong>{doc_title}</strong>.</p>"
                "<div style='background:#f6f4ee;border-left:3px solid #ef9f27;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'><strong>Комментарий:</strong> {reason}</div>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Открыть документ</a></p>"
            ),
        },
    },
    "comment_mention": {
        "en": {
            "subject": "{actor_name} mentioned you on {doc_title}",
            "text": (
                "Hello {full_name},\n\n{actor_name} mentioned you in a comment on \"{doc_title}\":\n\n"
                "  {comment_preview}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> mentioned you in a comment on <strong>{doc_title}</strong>:</p>"
                "<blockquote style='background:#f6f4ee;border-left:3px solid #7db542;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'>{comment_preview}</blockquote>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>View comment</a></p>"
            ),
        },
        "az": {
            "subject": "{actor_name} {doc_title} sənədində sizi qeyd etdi",
            "text": (
                "Salam {full_name},\n\n{actor_name} \"{doc_title}\" sənədinə şərhdə sizi qeyd etdi:\n\n"
                "  {comment_preview}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> <strong>{doc_title}</strong> sənədinə şərhdə sizi qeyd etdi:</p>"
                "<blockquote style='background:#f6f4ee;border-left:3px solid #7db542;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'>{comment_preview}</blockquote>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Şərhə bax</a></p>"
            ),
        },
        "ru": {
            "subject": "{actor_name} упомянул(а) вас в {doc_title}",
            "text": (
                "Здравствуйте, {full_name},\n\n{actor_name} упомянул(а) вас в комментарии к «{doc_title}»:\n\n"
                "  {comment_preview}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> упомянул(а) вас в комментарии к <strong>{doc_title}</strong>:</p>"
                "<blockquote style='background:#f6f4ee;border-left:3px solid #7db542;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'>{comment_preview}</blockquote>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Открыть комментарий</a></p>"
            ),
        },
    },
    "comment_added": {
        "en": {
            "subject": "New comment on {doc_title}",
            "text": (
                "Hello {full_name},\n\n{actor_name} commented on \"{doc_title}\":\n\n  {comment_preview}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> commented on <strong>{doc_title}</strong>:</p>"
                "<blockquote style='background:#f6f4ee;border-left:3px solid #7db542;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'>{comment_preview}</blockquote>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>View comment</a></p>"
            ),
        },
        "az": {
            "subject": "{doc_title} sənədinə yeni şərh",
            "text": (
                "Salam {full_name},\n\n{actor_name} \"{doc_title}\" sənədinə şərh yazdı:\n\n  {comment_preview}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> <strong>{doc_title}</strong> sənədinə şərh yazdı:</p>"
                "<blockquote style='background:#f6f4ee;border-left:3px solid #7db542;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'>{comment_preview}</blockquote>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Şərhə bax</a></p>"
            ),
        },
        "ru": {
            "subject": "Новый комментарий к «{doc_title}»",
            "text": (
                "Здравствуйте, {full_name},\n\n{actor_name} оставил(а) комментарий к «{doc_title}»:\n\n  {comment_preview}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{actor_name}</strong> оставил(а) комментарий к <strong>{doc_title}</strong>:</p>"
                "<blockquote style='background:#f6f4ee;border-left:3px solid #7db542;padding:10px 14px;color:#3a3a3a;font-size:13px;margin:0 0 18px 0;'>{comment_preview}</blockquote>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Открыть комментарий</a></p>"
            ),
        },
    },
    "validation_failed": {
        "en": {
            "subject": "Validation failed: {doc_title}",
            "text": (
                "Hello {full_name},\n\nThe document \"{doc_title}\" failed {failed_count} validation rule(s):\n\n"
                "{rules_summary}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Hello {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "The document <strong>{doc_title}</strong> failed <strong>{failed_count}</strong> validation rule(s):</p>"
                "<pre style='background:#f6f4ee;border-left:3px solid #c0392b;padding:10px 14px;color:#3a3a3a;font-size:12.5px;font-family:Calibri,Arial,sans-serif;white-space:pre-wrap;margin:0 0 18px 0;'>{rules_summary}</pre>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Open document</a></p>"
            ),
        },
        "az": {
            "subject": "Validasiya uğursuz oldu: {doc_title}",
            "text": (
                "Salam {full_name},\n\n\"{doc_title}\" sənədi {failed_count} validasiya qaydasından keçə bilmədi:\n\n"
                "{rules_summary}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Salam {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "<strong>{doc_title}</strong> sənədi <strong>{failed_count}</strong> validasiya qaydasından keçə bilmədi:</p>"
                "<pre style='background:#f6f4ee;border-left:3px solid #c0392b;padding:10px 14px;color:#3a3a3a;font-size:12.5px;font-family:Calibri,Arial,sans-serif;white-space:pre-wrap;margin:0 0 18px 0;'>{rules_summary}</pre>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Sənədi aç</a></p>"
            ),
        },
        "ru": {
            "subject": "Не пройдена валидация: {doc_title}",
            "text": (
                "Здравствуйте, {full_name},\n\nДокумент «{doc_title}» не прошёл {failed_count} правил(а) валидации:\n\n"
                "{rules_summary}\n\n{doc_url}\n"
            ),
            "html_body": (
                "<p style='font-size:15px;margin:0 0 12px 0;'>Здравствуйте, {full_name},</p>"
                "<p style='font-size:14px;line-height:1.6;color:#3a3a3a;margin:0 0 12px 0;'>"
                "Документ <strong>{doc_title}</strong> не прошёл <strong>{failed_count}</strong> правил(а) валидации:</p>"
                "<pre style='background:#f6f4ee;border-left:3px solid #c0392b;padding:10px 14px;color:#3a3a3a;font-size:12.5px;font-family:Calibri,Arial,sans-serif;white-space:pre-wrap;margin:0 0 18px 0;'>{rules_summary}</pre>"
                "<p style='margin:24px 0;'><a href='{doc_url}' "
                "style='display:inline-block;background:#2d5016;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;'>Открыть документ</a></p>"
            ),
        },
    },
}


def _pick_lang(language: Optional[str]) -> str:
    lang = (language or "en").lower()
    return lang if lang in ("en", "az", "ru") else "en"


async def send_event_email(
    *,
    to_email: str,
    full_name: str,
    language: str,
    event: str,
    context: dict[str, Any],
) -> None:
    """Render and send a transactional email. Never raises — logs failures."""
    if not settings.smtp_host:
        logger.info("[email/dev] event=%s to=%s lang=%s context=%s", event, to_email, language, context)
        return

    try:
        templates = EVENT_TEMPLATES[event]
    except KeyError:
        logger.error("Unknown email event %r", event)
        return

    tpl = templates.get(_pick_lang(language), templates["en"])
    ctx = {"full_name": full_name or "", **context}
    try:
        subject = tpl["subject"].format(**ctx)
        text = tpl["text"].format(**ctx)
        html = _wrap_html(_pick_lang(language), tpl["html_body"].format(**ctx))
    except KeyError as e:
        logger.exception("Missing template key %s for event %s", e, event)
        return

    try:
        await _send(to_email, subject, text, html)
    except Exception:
        logger.exception("send_event_email failed event=%s to=%s", event, to_email)


async def email_users(
    db: AsyncSession,
    *,
    user_ids: Iterable[uuid.UUID],
    event: str,
    context: dict[str, Any],
    exclude_user_id: Optional[uuid.UUID] = None,
) -> None:
    """Fetch active recipients, dedupe, skip the actor, send `event` to each."""
    ids = {uid for uid in user_ids if uid is not None and uid != exclude_user_id}
    if not ids:
        return
    users = list(
        await db.scalars(
            select(User).where(User.id.in_(ids), User.is_active.is_(True))
        )
    )
    for u in users:
        await send_event_email(
            to_email=u.email,
            full_name=u.full_name,
            language=u.language_preference or "en",
            event=event,
            context=context,
        )


async def email_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    event: str,
    context: dict[str, Any],
) -> None:
    """Single-recipient convenience around send_event_email."""
    user = await db.scalar(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )
    if user is None:
        return
    await send_event_email(
        to_email=user.email,
        full_name=user.full_name,
        language=user.language_preference or "en",
        event=event,
        context=context,
    )
