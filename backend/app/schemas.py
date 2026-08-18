from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class OrderStatus(StrEnum):
    NEW = "new"
    CONFIRMED = "confirmed"
    READY = "ready"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Product(ApiModel):
    id: int
    name: str
    brand: str
    article: str
    category: str
    vehicle: str = ""
    price: int = Field(ge=0)
    stock: int = Field(ge=0)
    icon: str = "filter"
    image_key: str | None = None
    is_active: bool = True

class ProductUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=300)
    category: str | None = Field(default=None, min_length=1, max_length=160)
    price: int | None = Field(default=None, ge=0)
    stock: int | None = Field(default=None, ge=0)
    image_key: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class CartItem(ApiModel):
    product_id: int
    quantity: int = Field(ge=1, le=99)


class OrderCreate(ApiModel):
    customer_name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=7, max_length=40)
    comment: str = Field(default="", max_length=1000)
    items: list[CartItem] = Field(min_length=1)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        digits = "".join(character for character in value if character.isdigit())
        if len(digits) != 11 or digits[0] not in {"7", "8"}:
            raise ValueError("Введите российский номер телефона полностью")
        return value


class OrderItem(ApiModel):
    id: int
    product_id: int
    name: str
    article: str
    price: int
    quantity: int


class OrderEvent(ApiModel):
    id: int
    from_status: OrderStatus | None = None
    to_status: OrderStatus
    actor: str
    note: str = ""
    created_at: datetime


class Order(ApiModel):
    id: str
    public_code: str
    customer_name: str
    phone: str
    comment: str
    status: OrderStatus
    total: int
    created_at: datetime
    confirmed_at: datetime | None = None
    cancelled_at: datetime | None = None
    items: list[OrderItem]
    history: list[OrderEvent] = Field(default_factory=list)


class PublicOrder(ApiModel):
    public_code: str
    status: OrderStatus
    total: int
    created_at: datetime
    items: list[OrderItem]


class StatusChange(ApiModel):
    status: OrderStatus
    note: str = Field(default="", max_length=500)


class LoginRequest(ApiModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=300)


class AdminIdentity(ApiModel):
    username: str


class StoreSettings(ApiModel):
    provider: str = "mock"
    sync_url: str = ""
    sync_token: str = ""
    notification_email: EmailStr | str = "orders@example.ru"
    sync_interval: str = "15"
