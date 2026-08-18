import asyncio
import logging
import smtplib
from email.message import EmailMessage

from .config import get_settings

logger = logging.getLogger(__name__)


async def notify_new_order(
    public_code: str,
    customer_name: str,
    phone: str,
    total: int,
    items: list[tuple[str, int]],
    recipient: str,
) -> None:
    settings = get_settings()
    if not settings.smtp_host or recipient == "orders@example.ru":
        return
    message = EmailMessage()
    message["Subject"] = f"Новый заказ {public_code}"
    message["From"] = settings.smtp_from
    message["To"] = recipient
    item_lines = "\n".join(f"• {name} — {quantity} шт." for name, quantity in items)
    message.set_content(
        f"Покупатель: {customer_name}\n"
        f"Телефон: {phone}\n\n"
        f"{item_lines}\n\n"
        f"Сумма: {total} ₽\n"
        "Откройте админку магазина для подтверждения."
    )

    def send() -> None:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)

    for attempt in range(3):
        try:
            await asyncio.to_thread(send)
            return
        except (OSError, smtplib.SMTPException):
            logger.exception("Failed to send order notification on attempt %s", attempt + 1)
            if attempt < 2:
                await asyncio.sleep(2**attempt)
