from copy import deepcopy

from ..schemas import Product
from .base import CatalogProvider

SEED = [
    Product(id=1, name="Фильтр масляный W 914/2", brand="MANN-FILTER", article="W914/2", category="Фильтры", vehicle="ВАЗ, LADA", price=890, stock=12, icon="filter"),
    Product(id=2, name="Колодки тормозные передние", brand="TRIALLI", article="PF 970", category="Тормозная система", vehicle="LADA Granta, Kalina", price=2790, stock=6, icon="brakes"),
    Product(id=3, name="Свеча зажигания BPR6ES", brand="NGK", article="7822", category="Зажигание", vehicle="ВАЗ 2108–2115", price=480, stock=24, icon="spark"),
    Product(id=4, name="Масло Genesis Armortech 5W-40, 4 л", brand="LUKOIL", article="3148675", category="Масла и жидкости", vehicle="Бензиновые двигатели", price=3490, stock=9, icon="oil"),
    Product(id=5, name="Аккумулятор 60 А·ч, обратная полярность", brand="АКОМ", article="60VL", category="Электрика", vehicle="LADA, Renault, Hyundai", price=6990, stock=3, icon="battery"),
    Product(id=6, name="Ремень генератора 6PK1110", brand="GATES", article="6PK1110", category="Двигатель", vehicle="Renault Logan, Largus", price=1180, stock=7, icon="belt"),
    Product(id=7, name="Подшипник передней ступицы", brand="SKF", article="VKBA 1307", category="Подвеска", vehicle="ВАЗ 2108–2115", price=3290, stock=4, icon="bearing"),
    Product(id=8, name="Щётка стеклоочистителя 600 мм", brand="BOSCH", article="AR600U", category="Аксессуары", vehicle="Универсальная, Toyota", price=890, stock=15, icon="wiper"),
]


class MockCatalogProvider(CatalogProvider):
    def __init__(self) -> None:
        self._products = {product.id: deepcopy(product) for product in SEED}

    async def list_products(self) -> list[Product]:
        return list(self._products.values())

    async def reserve(self, items: list[tuple[int, int]]) -> None:
        return None

    async def release(self, items: list[tuple[int, int]]) -> None:
        return None

    async def healthcheck(self) -> dict[str, str]:
        return {"provider": "mock", "status": "ok"}
