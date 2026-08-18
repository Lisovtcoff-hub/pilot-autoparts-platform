import httpx

from ..schemas import Product
from .base import CatalogProvider


class InfoEnterpriseProvider(CatalogProvider):
    """Connects to the outbound bridge installed on the shop computer.

    The bridge contract stays independent of a particular Инфо-Предприятие
    version. Only this adapter changes when the actual installation is known.
    """

    def __init__(self, bridge_url: str, token: str) -> None:
        if not bridge_url or not token:
            raise RuntimeError("Info-Enterprise bridge is not configured")
        self._url = bridge_url.rstrip("/")
        self._headers = {"authorization": f"Bearer {token}"}

    async def list_products(self) -> list[Product]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"{self._url}/v1/catalog", headers=self._headers)
            response.raise_for_status()
            return [Product.model_validate(item) for item in response.json()["products"]]

    async def reserve(self, items: list[tuple[int, int]]) -> None:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(f"{self._url}/v1/reservations", headers=self._headers, json={"items": [{"product_id": product_id, "quantity": quantity} for product_id, quantity in items]})
            response.raise_for_status()

    async def release(self, items: list[tuple[int, int]]) -> None:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(f"{self._url}/v1/reservations/release", headers=self._headers, json={"items": [{"product_id": product_id, "quantity": quantity} for product_id, quantity in items]})
            response.raise_for_status()

    async def healthcheck(self) -> dict[str, str]:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{self._url}/health", headers=self._headers)
            response.raise_for_status()
            return {"provider": "info-enterprise", "status": "ok"}
