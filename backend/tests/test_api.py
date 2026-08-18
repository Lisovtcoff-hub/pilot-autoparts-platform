import httpx


async def create_order(client: httpx.AsyncClient, *, quantity: int = 1, key: str = "test-order-1") -> dict:
    products = (await client.get("/api/products")).json()["products"]
    response = await client.post(
        "/api/orders",
        headers={"Idempotency-Key": key},
        json={
            "customerName": "Алексей",
            "phone": "+7 (999) 123-45-67",
            "comment": "Тест",
            "items": [{"productId": products[0]["id"], "quantity": quantity}],
        },
    )
    assert response.status_code == 201
    return response.json()["order"]


async def test_health_and_products_are_public(client: httpx.AsyncClient):
    health = await client.get("/health")
    products = await client.get("/api/products")
    assert health.status_code == 200
    assert health.json()["version"] == "0.3.0"
    assert products.status_code == 200
    assert len(products.json()["products"]) >= 3


async def test_admin_requires_login(client: httpx.AsyncClient):
    assert (await client.get("/api/orders")).status_code == 401
    assert (await client.patch("/api/products/1", json={"stock": 2})).status_code == 401
    bad_login = await client.post("/api/auth/login", json={"username": "cashier", "password": "wrong"})
    assert bad_login.status_code == 401


async def test_idempotency_and_public_status(client: httpx.AsyncClient):
    order = await create_order(client, key="same-click")
    duplicate = await client.post(
        "/api/orders",
        headers={"Idempotency-Key": "same-click"},
        json={
            "customerName": "Алексей",
            "phone": "+7 (999) 123-45-67",
            "items": [{"productId": order["items"][0]["productId"], "quantity": 1}],
        },
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["order"]["id"] == order["id"]
    status = await client.get(
        "/api/orders/status",
        params={"code": order["publicCode"][-4:], "phoneLast4": "4567"},
    )
    assert status.status_code == 200
    assert status.json()["order"]["status"] == "new"
    assert (await client.get("/api/orders/status", params={"code": order["publicCode"][-4:], "phoneLast4": "0000"})).status_code == 404


async def test_quantity_over_stock_is_rejected(client: httpx.AsyncClient):
    products = (await client.get("/api/products")).json()["products"]
    product = products[0]
    response = await client.post(
        "/api/orders",
        json={
            "customerName": "Алексей",
            "phone": "+7 (999) 123-45-67",
            "items": [{"productId": product["id"], "quantity": product["stock"] + 1}],
        },
    )
    assert response.status_code == 409


async def test_strict_status_flow_and_stock_restore(admin_client: httpx.AsyncClient):
    products_before = (await admin_client.get("/api/products")).json()["products"]
    initial_stock = products_before[0]["stock"]
    order = await create_order(admin_client, quantity=2, key="status-flow")

    confirmed = await admin_client.patch(f"/api/orders/{order['id']}/status", json={"status": "confirmed"})
    assert confirmed.status_code == 200
    stock_after_confirm = (await admin_client.get("/api/products")).json()["products"][0]["stock"]
    assert stock_after_confirm == initial_stock - 2

    invalid = await admin_client.patch(f"/api/orders/{order['id']}/status", json={"status": "completed"})
    assert invalid.status_code == 409
    ready = await admin_client.patch(f"/api/orders/{order['id']}/status", json={"status": "ready"})
    assert ready.status_code == 200
    cancelled = await admin_client.patch(f"/api/orders/{order['id']}/status", json={"status": "cancelled", "note": "Клиент отказался"})
    assert cancelled.status_code == 200
    assert cancelled.json()["order"]["status"] == "cancelled"
    assert len(cancelled.json()["order"]["history"]) == 4
    stock_after_cancel = (await admin_client.get("/api/products")).json()["products"][0]["stock"]
    assert stock_after_cancel == initial_stock
    assert (await admin_client.patch(f"/api/orders/{order['id']}/status", json={"status": "new"})).status_code == 409


async def test_settings_are_persistent_and_protected(admin_client: httpx.AsyncClient):
    payload = {
        "provider": "mock",
        "syncUrl": "http://bridge.local",
        "syncToken": "secret",
        "notificationEmail": "cashier@example.ru",
        "syncInterval": "5",
    }
    saved = await admin_client.put("/api/settings", json=payload)
    loaded = await admin_client.get("/api/settings")
    assert saved.status_code == 200
    assert saved.json()["settings"]["syncToken"] == ""
    assert loaded.json()["settings"] == {**payload, "syncToken": ""}

    preserved = await admin_client.put(
        "/api/settings",
        json={**payload, "syncToken": "", "syncInterval": "30"},
    )
    assert preserved.status_code == 200
    assert preserved.json()["settings"]["syncToken"] == ""


async def test_admin_can_update_product(admin_client: httpx.AsyncClient):
    products = (await admin_client.get("/api/products")).json()["products"]
    product = products[0]
    response = await admin_client.patch(
        f"/api/products/{product['id']}",
        json={"stock": 17, "price": 990},
    )
    assert response.status_code == 200
    assert response.json()["product"]["stock"] == 17
    assert response.json()["product"]["price"] == 990
