import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from secrets import randbelow, token_urlsafe

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .auth import COOKIE_NAME, authenticate, create_session_token, require_admin
from .config import get_settings
from .database import SessionFactory, get_session
from .models import AppSettingModel, OrderEventModel, OrderItemModel, OrderModel, ProductModel
from .notifier import notify_new_order
from .providers import get_catalog_provider
from .providers.info_enterprise import InfoEnterpriseProvider
from .schemas import (
    AdminIdentity,
    LoginRequest,
    Order,
    OrderCreate,
    OrderStatus,
    Product,
    ProductUpdate,
    PublicOrder,
    StatusChange,
    StoreSettings,
)
from .settings_store import read_store_settings, write_store_settings

STATUS_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.NEW: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.READY, OrderStatus.CANCELLED},
    OrderStatus.READY: {OrderStatus.COMPLETED, OrderStatus.CANCELLED},
    OrderStatus.COMPLETED: set(),
    OrderStatus.CANCELLED: set(),
}


async def seed_catalog(session: AsyncSession) -> None:
    if await session.scalar(select(ProductModel.id).limit(1)):
        return
    products = await get_catalog_provider().list_products()
    session.add_all(
        [ProductModel(**product.model_dump(exclude={"is_active", "image_key"}), image_key=product.image_key, is_active=product.is_active) for product in products]
    )
    await session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Path(get_settings().upload_dir).mkdir(parents=True, exist_ok=True)
    async with SessionFactory() as session:
        await seed_catalog(session)
    yield


settings = get_settings()
origins = [origin.strip() for origin in settings.frontend_origin.split(",") if origin.strip()]
app = FastAPI(title="PILOT Auto Parts API", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["content-type", "idempotency-key"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "pilot-api", "version": "0.3.0"}


@app.post("/api/auth/login", response_model=AdminIdentity)
async def login(payload: LoginRequest, response: Response) -> AdminIdentity:
    if not authenticate(payload.username, payload.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(payload.username),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_hours * 3600,
        path="/",
    )
    return AdminIdentity(username=payload.username)


@app.get("/api/auth/me", response_model=AdminIdentity)
async def current_admin(admin: AdminIdentity = Depends(require_admin)) -> AdminIdentity:
    return admin


@app.post("/api/auth/logout", status_code=204)
async def logout(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


@app.get("/api/products")
async def list_products(session: AsyncSession = Depends(get_session)) -> dict[str, list[Product]]:
    rows = list((await session.scalars(select(ProductModel).where(ProductModel.is_active).order_by(ProductModel.id))).all())
    return {"products": [Product.model_validate(row) for row in rows]}


@app.patch("/api/products/{product_id}")
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    _: AdminIdentity = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Product]:
    product = await session.get(ProductModel, product_id)
    if not product:
        raise HTTPException(404, "Товар не найден")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    await session.commit()
    await session.refresh(product)
    return {"product": Product.model_validate(product)}


def safe_upload_path(key: str) -> Path:
    root = Path(settings.upload_dir).resolve()
    path = (root / key).resolve()
    if not path.is_relative_to(root):
        raise HTTPException(400, "Некорректный ключ файла")
    return path


@app.get("/api/product-image")
async def get_product_image(key: str) -> FileResponse:
    path = safe_upload_path(key)
    if not path.is_file():
        raise HTTPException(404, "Изображение не найдено")
    return FileResponse(path, headers={"cache-control": "public, max-age=3600"})


@app.post("/api/product-image", status_code=201)
async def upload_product_image(
    productId: str = Form(...),
    file: UploadFile = File(...),
    _: AdminIdentity = Depends(require_admin),
) -> dict[str, str]:
    allowed = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Разрешены только JPG, PNG и WebP")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(400, "Файл больше 5 МБ")
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
            detected_format = image.format
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(400, "Файл не является корректным изображением") from error
    expected_formats = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
    if detected_format != expected_formats[file.content_type]:
        raise HTTPException(400, "Формат файла не совпадает с Content-Type")
    clean_product_id = "".join(character for character in productId if character.isalnum() or character in "_-") or "product"
    key = f"products/{clean_product_id}-{token_urlsafe(12)}{allowed[file.content_type]}"
    path = safe_upload_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(path.write_bytes, content)
    return {"key": key, "url": f"/api/product-image?key={key}"}


def order_query():
    return select(OrderModel).options(selectinload(OrderModel.items), selectinload(OrderModel.history))


@app.get("/api/orders")
async def list_orders(
    _: AdminIdentity = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, list[Order]]:
    rows = list((await session.scalars(order_query().order_by(OrderModel.created_at.desc()))).unique().all())
    return {"orders": [Order.model_validate(row) for row in rows]}


@app.get("/api/orders/status")
async def public_order_status(
    code: str,
    phoneLast4: str,
    session: AsyncSession = Depends(get_session),
) -> dict[str, PublicOrder]:
    code_digits = "".join(character for character in code if character.isdigit())[-4:]
    phone_digits = "".join(character for character in phoneLast4 if character.isdigit())[-4:]
    if len(code_digits) != 4 or len(phone_digits) != 4:
        raise HTTPException(400, "Укажите последние 4 цифры заказа и телефона")
    rows = list((await session.scalars(order_query().where(OrderModel.public_code.endswith(code_digits)))).unique().all())
    order = next((row for row in rows if "".join(character for character in row.phone if character.isdigit()).endswith(phone_digits)), None)
    if not order:
        raise HTTPException(404, "Заказ не найден. Проверьте номер и телефон.")
    return {"order": PublicOrder.model_validate(order)}


async def unique_order_code(session: AsyncSession) -> str:
    date_part = datetime.now(UTC).strftime("%y%m%d")
    for _ in range(20):
        code = f"ПЛТ-{date_part}-{1000 + randbelow(9000)}"
        if not await session.scalar(select(OrderModel.id).where(OrderModel.public_code == code)):
            return code
    raise HTTPException(503, "Не удалось создать номер заказа. Повторите попытку.")


@app.post("/api/orders", status_code=201)
async def create_order(
    payload: OrderCreate,
    background: BackgroundTasks,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Order]:
    if idempotency_key:
        existing = await session.scalar(order_query().where(OrderModel.request_key == idempotency_key))
        if existing:
            return {"order": Order.model_validate(existing)}
    product_ids = [item.product_id for item in payload.items]
    if len(set(product_ids)) != len(product_ids):
        raise HTTPException(400, "Один товар добавлен в заказ несколько раз")
    products = list((await session.scalars(select(ProductModel).where(ProductModel.id.in_(product_ids)).with_for_update())).all())
    if len(products) != len(product_ids):
        raise HTTPException(400, "Неизвестный товар")
    by_id = {product.id: product for product in products}
    unavailable = next((item for item in payload.items if by_id[item.product_id].stock < item.quantity), None)
    if unavailable:
        product = by_id[unavailable.product_id]
        raise HTTPException(409, f"В наличии только {product.stock} шт. товара «{product.name}»")
    order = OrderModel(
        public_code=await unique_order_code(session),
        request_key=idempotency_key,
        customer_name=payload.customer_name,
        phone=payload.phone,
        comment=payload.comment,
        status=OrderStatus.NEW,
        total=sum(by_id[item.product_id].price * item.quantity for item in payload.items),
    )
    order.items = [
        OrderItemModel(product_id=product.id, name=product.name, article=product.article, price=product.price, quantity=item.quantity)
        for item in payload.items
        for product in [by_id[item.product_id]]
    ]
    order.history = [OrderEventModel(from_status=None, to_status=OrderStatus.NEW, actor="customer", note="Заказ оформлен на сайте")]
    session.add(order)
    await session.commit()
    order = await session.scalar(order_query().where(OrderModel.id == order.id))
    assert order is not None
    store_settings = await read_store_settings(session)
    background.add_task(
        notify_new_order,
        order.public_code,
        order.customer_name,
        order.phone,
        order.total,
        [(item.name, item.quantity) for item in order.items],
        str(store_settings.notification_email),
    )
    return {"order": Order.model_validate(order)}


async def catalog_provider_for_session(session: AsyncSession):
    store_settings = await read_store_settings(session, include_secret=True)
    if store_settings.provider == "mock":
        return get_catalog_provider()
    return InfoEnterpriseProvider(store_settings.sync_url, store_settings.sync_token)


async def apply_status_change(
    order_id: str,
    payload: StatusChange,
    admin: AdminIdentity,
    session: AsyncSession,
) -> OrderModel:
    order = await session.scalar(order_query().where(OrderModel.id == order_id).with_for_update())
    if not order:
        raise HTTPException(404, "Заказ не найден")
    current = OrderStatus(order.status)
    if payload.status == current:
        return order
    if payload.status not in STATUS_TRANSITIONS[current]:
        raise HTTPException(409, f"Нельзя изменить статус с «{current}» на «{payload.status}»")

    product_ids = [item.product_id for item in order.items]
    product_rows = list((await session.scalars(select(ProductModel).where(ProductModel.id.in_(product_ids)).with_for_update())).all())
    products = {product.id: product for product in product_rows}
    stock_items = [(item.product_id, item.quantity) for item in order.items]

    if payload.status == OrderStatus.CONFIRMED:
        unavailable = next((item for item in order.items if item.product_id not in products or products[item.product_id].stock < item.quantity), None)
        if unavailable:
            raise HTTPException(409, f"Недостаточно товара «{unavailable.name}» для подтверждения")
        try:
            await (await catalog_provider_for_session(session)).reserve(stock_items)
        except (KeyError, ValueError, RuntimeError) as error:
            raise HTTPException(409, str(error)) from error
        for item in order.items:
            products[item.product_id].stock -= item.quantity
        order.confirmed_at = datetime.now(UTC)

    if payload.status == OrderStatus.CANCELLED and current in {OrderStatus.CONFIRMED, OrderStatus.READY}:
        try:
            await (await catalog_provider_for_session(session)).release(stock_items)
        except (KeyError, ValueError, RuntimeError) as error:
            raise HTTPException(409, str(error)) from error
        for item in order.items:
            if item.product_id in products:
                products[item.product_id].stock += item.quantity
        order.cancelled_at = datetime.now(UTC)

    order.status = payload.status
    order.history.append(OrderEventModel(from_status=current, to_status=payload.status, actor=admin.username, note=payload.note))
    await session.commit()
    refreshed = await session.scalar(order_query().where(OrderModel.id == order.id))
    assert refreshed is not None
    return refreshed




@app.patch("/api/orders/{order_id}/status", response_model=Order)
async def change_order_status(
    order_id: str,
    payload: StatusChange,
    admin: AdminIdentity = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> Order:
    return Order.model_validate(await apply_status_change(order_id, payload, admin, session))


@app.get("/api/settings")
async def get_store_settings(
    _: AdminIdentity = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, StoreSettings]:
    return {"settings": await read_store_settings(session)}


@app.put("/api/settings")
async def update_store_settings(
    payload: StoreSettings,
    _: AdminIdentity = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, StoreSettings]:
    return {"settings": await write_store_settings(session, payload)}


@app.post("/api/sync")
async def sync_catalog(
    admin: AdminIdentity = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int | str]:
    store_settings = await read_store_settings(session, include_secret=True)
    provider = get_catalog_provider() if store_settings.provider == "mock" else InfoEnterpriseProvider(store_settings.sync_url, store_settings.sync_token)
    incoming = await provider.list_products()
    existing = {product.article: product for product in (await session.scalars(select(ProductModel))).all()}
    for product in incoming:
        row = existing.get(product.article)
        if row:
            for field in ("name", "brand", "category", "vehicle", "price", "stock", "icon", "is_active"):
                setattr(row, field, getattr(product, field))
        else:
            session.add(ProductModel(**product.model_dump(exclude={"is_active", "image_key"}), image_key=product.image_key, is_active=product.is_active))
    session.add(AppSettingModel(key=f"lastSyncBy:{admin.username}", value=datetime.now(UTC).isoformat()))
    await session.commit()
    return {"status": "ok", "products": len(incoming)}
