from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: Literal["development", "testing", "production"] = "development"
    database_url: str = "postgresql+asyncpg://pilot:pilot@db:5432/pilot"
    catalog_provider: str = "mock"
    info_enterprise_bridge_url: str = ""
    info_enterprise_token: str = ""
    order_notification_email: str = "orders@example.com"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = "site@example.com"
    smtp_starttls: bool = False
    frontend_origin: str = "http://localhost:3000"
    admin_username: str = "pilot"
    admin_password: str = "change-me-locally"
    session_secret: str = "replace-with-a-random-string-at-least-32-characters"
    session_hours: int = 12
    cookie_secure: bool = False
    upload_dir: str = "/data/uploads"
    max_upload_bytes: int = 5_000_000
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.app_env != "production":
            return self
        if self.admin_password in {"change-me-now", "change-me-locally"} or len(self.admin_password) < 12:
            raise ValueError("ADMIN_PASSWORD must be changed for production")
        if self.session_secret.startswith("replace-with-") or len(self.session_secret) < 32:
            raise ValueError("SESSION_SECRET must be a random value of at least 32 characters")
        if not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be enabled for production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
