from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import AppSettingModel
from .schemas import StoreSettings

SETTING_KEYS = {
    "provider": "provider",
    "syncUrl": "sync_url",
    "syncToken": "sync_token",
    "notificationEmail": "notification_email",
    "syncInterval": "sync_interval",
}


async def read_store_settings(session: AsyncSession, *, include_secret: bool = False) -> StoreSettings:
    rows = list((await session.scalars(select(AppSettingModel))).all())
    values = {row.key: row.value for row in rows}
    defaults = get_settings()
    token = values.get("syncToken", defaults.info_enterprise_token) if include_secret else ""
    return StoreSettings(
        provider=values.get("provider", defaults.catalog_provider),
        sync_url=values.get("syncUrl", defaults.info_enterprise_bridge_url),
        sync_token=token,
        notification_email=values.get("notificationEmail", defaults.order_notification_email),
        sync_interval=values.get("syncInterval", "15"),
    )


async def write_store_settings(session: AsyncSession, payload: StoreSettings) -> StoreSettings:
    incoming = payload.model_dump(by_alias=True)
    rows = {row.key: row for row in (await session.scalars(select(AppSettingModel))).all()}
    for key in SETTING_KEYS:
        value = str(incoming.get(key, ""))
        if key == "syncToken" and not value:
            continue
        if key in rows:
            rows[key].value = value
        else:
            session.add(AppSettingModel(key=key, value=value))
    await session.commit()
    return await read_store_settings(session)
