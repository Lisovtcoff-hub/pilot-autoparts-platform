"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { statusLabels, type OrderStatus, type Product } from "../../lib/catalog";
import { apiFetch } from "../../lib/api";

type OrderItem = { id: number; name: string; article: string; price: number; quantity: number };
type OrderEvent = { id: number; fromStatus: OrderStatus | null; toStatus: OrderStatus; actor: string; note: string; createdAt: string };
type Order = { id: string; publicCode: string; customerName: string; phone: string; comment: string; status: OrderStatus; total: number; createdAt: string; items: OrderItem[]; history?: OrderEvent[] };
type Settings = { provider: string; syncUrl: string; syncToken: string; notificationEmail: string; syncInterval: string };

const money = new Intl.NumberFormat("ru-RU");
const time = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const allowedStatuses: Record<OrderStatus, OrderStatus[]> = {
  new: ["new", "confirmed", "cancelled"],
  confirmed: ["confirmed", "ready", "cancelled"],
  ready: ["ready", "completed", "cancelled"],
  completed: ["completed"],
  cancelled: ["cancelled"],
};

export default function AdminPage() {
  const [tab, setTab] = useState<"orders" | "products" | "integration">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings>({ provider: "mock", syncUrl: "", syncToken: "", notificationEmail: "orders@example.ru", syncInterval: "15" });
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [adminUser, setAdminUser] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ordersResponse, productsResponse, settingsResponse] = await Promise.all([
      apiFetch("/api/orders"), apiFetch("/api/products"), apiFetch("/api/settings"),
    ]);
    if (ordersResponse.ok) setOrders(((await ordersResponse.json()) as { orders: Order[] }).orders);
    if (productsResponse.ok) setProducts(((await productsResponse.json()) as { products: Product[] }).products);
    if (settingsResponse.ok) setSettings(((await settingsResponse.json()) as { settings: Settings }).settings);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function initialize() {
      const response = await apiFetch("/api/auth/me");
      if (!response.ok) {
        setAuthState("unauthenticated");
        setLoading(false);
        return;
      }
      const identity = (await response.json()) as { username: string };
      setAdminUser(identity.username);
      setAuthState("authenticated");
      await loadData();
    }
    initialize().catch(() => { setAuthState("unauthenticated"); setLoading(false); });
  }, [loadData]);

  const newCount = orders.filter((order) => order.status === "new").length;
  const revenue = orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0);
  const lowStock = products.filter((product) => product.stock <= 4).length;
  const selected = orders.find((order) => order.id === selectedOrder) ?? null;
  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category))).sort(), [products]);

  async function updateStatus(order: Order, status: OrderStatus) {
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item));
    const response = await apiFetch(`/api/orders/${order.id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: order.status } : item));
    const error = response.ok ? "" : ((await response.json().catch(() => ({}))) as { detail?: string }).detail;
    setNotice(response.ok ? `Заказ ${order.publicCode}: ${statusLabels[status].toLowerCase()}` : error || "Не удалось изменить статус");
    if (response.ok) await loadData();
    setTimeout(() => setNotice(""), 2600);
  }

  function changeProduct(id: number, field: keyof Product, value: string | number) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, [field]: value } : product));
  }

  async function saveProduct(product: Product) {
    const response = await apiFetch(`/api/products/${product.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(product) });
    setNotice(response.ok ? `Товар «${product.name}» сохранён` : "Не удалось сохранить товар");
    setTimeout(() => setNotice(""), 2600);
  }

  async function uploadImage(product: Product, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setNotice("Загружаем фотографию…");
    const body = new FormData();
    body.set("file", file);
    body.set("productId", String(product.id));
    const upload = await apiFetch("/api/product-image", { method: "POST", body });
    if (!upload.ok) { setNotice("Не удалось загрузить фотографию"); return; }
    const { key } = await upload.json() as { key: string };
    changeProduct(product.id, "imageKey", key);
    await apiFetch(`/api/products/${product.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageKey: key }) });
    setNotice("Фотография обновлена");
    setTimeout(() => setNotice(""), 2600);
  }

  async function saveSettings() {
    const response = await apiFetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
    setNotice(response.ok ? "Настройки сохранены" : "Не удалось сохранить настройки");
    setTimeout(() => setNotice(""), 2600);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    const data = new FormData(event.currentTarget);
    const response = await apiFetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
    if (!response.ok) {
      setLoginError("Неверный логин или пароль");
      setLoginLoading(false);
      return;
    }
    const identity = (await response.json()) as { username: string };
    setAdminUser(identity.username);
    setAuthState("authenticated");
    setLoginLoading(false);
    await loadData();
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setOrders([]);
    setAuthState("unauthenticated");
  }

  async function syncNow() {
    setNotice("Синхронизируем каталог…");
    const response = await apiFetch("/api/sync", { method: "POST" });
    const result = (await response.json().catch(() => ({}))) as { products?: number; detail?: string };
    setNotice(response.ok ? `Синхронизировано товаров: ${result.products ?? 0}` : result.detail || "Синхронизация не удалась");
    if (response.ok) await loadData();
    setTimeout(() => setNotice(""), 3000);
  }

  if (authState !== "authenticated") {
    return <main className="admin-login"><section className="admin-login__card"><Link href="/" className="admin-login__brand">ПИЛОТ <small>кабинет продавца</small></Link>{authState === "checking" ? <p>Проверяем доступ…</p> : <><h1>Вход для продавца</h1><p>Заказы и остатки доступны только сотрудникам магазина.</p><form onSubmit={login}><label><span>Логин</span><input name="username" required autoComplete="username" /></label><label><span>Пароль</span><input name="password" type="password" required autoComplete="current-password" /></label>{loginError && <div className="login-error">{loginError}</div>}<button className="primary-button" disabled={loginLoading}>{loginLoading ? "Входим…" : "Войти"}</button></form><Link href="/">← Вернуться в магазин</Link></>}</section></main>;
  }

  return (
    <main className="admin-shell">
      <aside className="admin-nav">
        <Link href="/" className="admin-brand"><span>ПИЛОТ</span><small>управление магазином</small></Link>
        <nav aria-label="Разделы админки">
          <button className={tab === "orders" ? "is-active" : ""} onClick={() => setTab("orders")}><i>01</i>Заказы{newCount > 0 && <b>{newCount}</b>}</button>
          <button className={tab === "products" ? "is-active" : ""} onClick={() => setTab("products")}><i>02</i>Товары и категории</button>
          <button className={tab === "integration" ? "is-active" : ""} onClick={() => setTab("integration")}><i>03</i>Синхронизация</button>
        </nav>
        <div className="admin-nav__bottom"><span className="online-dot" /> Система работает<Link href="/">← Открыть сайт</Link></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><p>МАГАЗИН · СИБАЙ</p><h1>{tab === "orders" ? "Заказы" : tab === "products" ? "Товары и категории" : "Синхронизация"}</h1></div><div className="cashier"><span>Продавец</span><strong>{adminUser || "ПИЛОТ"}</strong><button onClick={logout}>Выйти</button></div></header>
        
        {loading ? <div className="admin-loading">Загружаем данные…</div> : tab === "orders" ? (
          <>
            <div className="admin-stats"><article><span>Новые заказы</span><strong>{newCount}</strong><small>Требуют звонка</small></article><article><span>Заказов сегодня</span><strong>{orders.length}</strong><small>Все статусы</small></article><article><span>Сумма заказов</span><strong>{money.format(revenue)} ₽</strong><small>Без отменённых</small></article><article><span>Мало на складе</span><strong>{lowStock}</strong><small>Остаток до 4 шт.</small></article></div>
            <div className="admin-panel"><div className="admin-panel__head"><div><h2>Последние заказы</h2><p>Нажмите на заказ, чтобы увидеть состав</p></div><button onClick={() => loadData()}>Обновить</button></div>
              {orders.length === 0 ? <div className="admin-empty"><h3>Новых заказов пока нет</h3><p>Оформите тестовый заказ на сайте — он появится здесь.</p><Link href="/">Перейти в каталог</Link></div> : <div className="order-table"><div className="table-row table-head"><span>Заказ</span><span>Покупатель</span><span>Состав</span><span>Сумма</span><span>Статус</span></div>{orders.map((order) => <button className="table-row" key={order.id} onClick={() => setSelectedOrder(order.id)}><span><strong>{order.publicCode}</strong><small>{time.format(new Date(order.createdAt))}</small></span><span><strong>{order.customerName}</strong><small>{order.phone}</small></span><span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} поз.</span><span><strong>{money.format(order.total)} ₽</strong></span><span><em className={`status status--${order.status}`}>{statusLabels[order.status]}</em></span></button>)}</div>}
            </div>
          </>
        ) : tab === "products" ? (
          <div className="admin-panel"><div className="admin-panel__head"><div><h2>Каталог</h2><p>{products.length} товаров · {categories.length} категорий</p></div><button onClick={() => loadData()}>Обновить</button></div><div className="product-admin-table"><div className="product-admin-row product-admin-head"><span>Товар</span><span>Категория</span><span>Цена</span><span>Остаток</span><span>Фото</span><span /></div>{products.map((product) => <div className="product-admin-row" key={product.id}><span><strong>{product.name}</strong><small>{product.brand} · {product.article}</small></span><span><input value={product.category} onChange={(event) => changeProduct(product.id, "category", event.target.value)} /></span><span><input type="number" value={product.price} onChange={(event) => changeProduct(product.id, "price", Number(event.target.value))} /> ₽</span><span><input type="number" value={product.stock} onChange={(event) => changeProduct(product.id, "stock", Number(event.target.value))} /> шт.</span><span><label className="upload-button">{product.imageKey ? "Заменить" : "Добавить"}<input type="file" accept="image/*" onChange={(event) => uploadImage(product, event)} /></label></span><span><button className="save-row" onClick={() => saveProduct(product)}>Сохранить</button></span></div>)}</div></div>
        ) : (
          <div className="integration-grid">
            <section className="admin-panel"><div className="admin-panel__head"><div><h2>Источник каталога</h2><p>Переключается без изменений на сайте</p></div></div><div className="provider-card is-active"><div><span className="provider-icon">M</span><div><strong>Тестовый каталог</strong><small>MockCatalogProvider</small></div></div><em>Подключён</em></div><div className="provider-card"><div><span className="provider-icon">ИП</span><div><strong>Инфо-Предприятие</strong><small>InfoEnterpriseProvider</small></div></div><em>Ожидает настройки</em></div>
              <label className="admin-field"><span>Режим каталога</span><select value={settings.provider} onChange={(event) => setSettings({ ...settings, provider: event.target.value })}><option value="mock">Тестовый каталог</option><option value="info-enterprise">Инфо-Предприятие</option></select></label><label className="admin-field"><span>Адрес локального модуля синхронизации</span><input value={settings.syncUrl} onChange={(event) => setSettings({ ...settings, syncUrl: event.target.value })} placeholder="https://bridge.example.ru" /></label><label className="admin-field"><span>Токен подключения</span><input value={settings.syncToken} onChange={(event) => setSettings({ ...settings, syncToken: event.target.value })} placeholder="Будет создан при установке модуля" type="password" /></label><label className="admin-field"><span>Проверять обновления каждые</span><select value={settings.syncInterval} onChange={(event) => setSettings({ ...settings, syncInterval: event.target.value })}><option value="5">5 минут</option><option value="15">15 минут</option><option value="30">30 минут</option></select></label><div className="integration-actions"><button className="admin-primary" onClick={saveSettings}>Сохранить</button><button className="admin-secondary" onClick={syncNow}>Синхронизировать сейчас</button></div>
            </section>
            <section className="admin-panel"><div className="admin-panel__head"><div><h2>Уведомления</h2><p>Куда отправлять новые заказы</p></div></div><label className="admin-field"><span>Email продавца</span><input type="email" value={settings.notificationEmail} onChange={(event) => setSettings({ ...settings, notificationEmail: event.target.value })} /></label><div className="sync-explainer"><b>Как будет работать подключение</b><ol><li>На компьютер магазина устанавливается небольшой модуль.</li><li>Он читает цены и остатки из «Инфо-Предприятия».</li><li>Каждые {settings.syncInterval} минут безопасно отправляет изменения на сайт.</li></ol></div><button className="admin-primary" onClick={saveSettings}>Сохранить настройки</button></section>
          </div>
        )}
      </section>

      {selected && <div className="admin-overlay" onMouseDown={() => setSelectedOrder(null)}><aside className="order-detail" onMouseDown={(event) => event.stopPropagation()}><button className="detail-close" onClick={() => setSelectedOrder(null)}>×</button><p>ЗАКАЗ НА САМОВЫВОЗ</p><h2>{selected.publicCode}</h2><div className="customer-box"><span>Покупатель</span><strong>{selected.customerName}</strong><a href={`tel:${selected.phone}`}>{selected.phone}</a>{selected.comment && <small>{selected.comment}</small>}</div><h3>Состав заказа</h3><div className="detail-items">{selected.items.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>Арт. {item.article} · {item.quantity} шт.</small></span><b>{money.format(item.price * item.quantity)} ₽</b></div>)}</div><div className="detail-total"><span>Итого</span><strong>{money.format(selected.total)} ₽</strong></div><label className="status-select"><span>Статус заказа</span><select value={selected.status} onChange={(event) => updateStatus(selected, event.target.value as OrderStatus)}>{allowedStatuses[selected.status].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>{selected.status === "new" && <p className="reserve-note">Остатки спишутся только после подтверждения заказа.</p>}{selected.history && selected.history.length > 0 && <div className="order-history"><h3>История</h3>{selected.history.map((event) => <div key={event.id}><i className={`status status--${event.toStatus}`}>{statusLabels[event.toStatus]}</i><span><strong>{event.actor}</strong><small>{time.format(new Date(event.createdAt))}{event.note ? ` · ${event.note}` : ""}</small></span></div>)}</div>}</aside></div>}
      {notice && <div className="admin-notice">{notice}</div>}
    </main>
  );
}
