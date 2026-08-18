from abc import ABC, abstractmethod

from ..schemas import Product


class CatalogProvider(ABC):
    """Stable boundary between the web shop and any stock system."""

    @abstractmethod
    async def list_products(self) -> list[Product]: ...

    @abstractmethod
    async def reserve(self, items: list[tuple[int, int]]) -> None: ...

    @abstractmethod
    async def release(self, items: list[tuple[int, int]]) -> None: ...

    @abstractmethod
    async def healthcheck(self) -> dict[str, str]: ...
