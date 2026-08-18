from functools import lru_cache

from ..config import get_settings
from .base import CatalogProvider
from .info_enterprise import InfoEnterpriseProvider
from .mock import MockCatalogProvider


@lru_cache
def get_catalog_provider() -> CatalogProvider:
    settings = get_settings()
    if settings.catalog_provider == "info-enterprise":
        return InfoEnterpriseProvider(settings.info_enterprise_bridge_url, settings.info_enterprise_token)
    return MockCatalogProvider()
