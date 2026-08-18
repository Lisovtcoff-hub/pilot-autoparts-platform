"use client";
/* eslint-disable @next/next/no-img-element */

import { FocusEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { statusLabels, type OrderStatus, type Product } from "../lib/catalog";
import { apiFetch, apiUrl } from "../lib/api";

type CartLine = Product & { quantity: number };
type PublicOrder = {
  publicCode: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  items: Array<{ name: string; quantity: number }>;
};

const categories = [
  ["Масла и жидкости", "oil"],
  ["Фильтры", "filter"],
  ["Тормозная система", "brakes"],
  ["Двигатель", "engine"],
  ["Подвеска", "bearing"],
  ["Электрика", "battery"],
];

const money = new Intl.NumberFormat("ru-RU");

const vehicles = [
  { value: "lada", label: "LADA / ВАЗ", models: ["Granta", "Kalina", "Vesta", "Niva", "2108–2115"] },
  { value: "renault", label: "Renault", models: ["Logan", "Sandero", "Duster", "Largus"] },
  { value: "hyundai", label: "Hyundai", models: ["Solaris", "Creta", "Elantra"] },
  { value: "toyota", label: "Toyota", models: ["Camry", "Corolla", "RAV4"] },
];

const translit: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function normalizeSearch(value: string) {
  return Array.from(value.toLowerCase())
    .map((letter) => translit[letter] ?? letter)
    .join("")
    .replace(/\b(vaz)\b/g, "lada")
    .replace(/\b(reno)\b/g, "renault")
    .replace(/\b(toiota)\b/g, "toyota")
    .replace(/\b(hendai|hundai)\b/g, "hyundai")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePhoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  else if (digits.startsWith("9")) digits = `7${digits}`;
  else if (!digits.startsWith("7") && digits.length === 10) digits = `7${digits}`;
  return digits.slice(0, 11);
}

function formatPhone(value: string) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  const local = digits.startsWith("7") ? digits.slice(1) : digits;
  let formatted = "+7";
  if (local.length) formatted += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) formatted += ")";
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
  return formatted;
}

function handlePhoneBlur(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.value = formatPhone(event.currentTarget.value);
  const valid = !event.currentTarget.value || normalizePhoneDigits(event.currentTarget.value).length === 11;
  event.currentTarget.setCustomValidity(valid ? "" : "Введите номер полностью: 10 цифр после +7");
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function PartIcon({ type }: { type: string }) {
  return (
    <span className={`part-icon part-icon--${type}`} aria-hidden="true">
      <span />
    </span>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Все товары");
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusCode, setStatusCode] = useState("");
  const [statusPhoneLast4, setStatusPhoneLast4] = useState("");
  const [statusResult, setStatusResult] = useState<PublicOrder | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [orderAttemptKey, setOrderAttemptKey] = useState("");

  useEffect(() => {
    apiFetch("/api/products")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("catalog request failed")))
      .then((data: { products?: Product[] }) => setProducts(data.products ?? []))
      .catch(() => setCatalogError("Не удалось загрузить каталог. Обновите страницу."))
      .finally(() => setCatalogLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const tokens = normalizeSearch(query).split(" ").filter(Boolean);
    const selectedModelKey = normalizeSearch(selectedModel);
    const allModelKeys = vehicles.flatMap((make) => make.models.map(normalizeSearch));
    return products.filter((product) => {
      const matchesCategory = category === "Все товары" || product.category === category;
      const haystack = normalizeSearch(`${product.name} ${product.brand} ${product.article} ${product.vehicle}`);
      const vehicle = normalizeSearch(product.vehicle);
      const universal = vehicle.includes("universal");
      const matchesQuery = tokens.every((token) => haystack.includes(token));
      const matchesMake = !selectedMake || universal || vehicle.includes(selectedMake);
      const hasSpecificModel = allModelKeys.some((model) => vehicle.includes(model));
      const matchesModel = !selectedModelKey || universal || vehicle.includes(selectedModelKey) || (vehicle.includes(selectedMake) && !hasSpecificModel);
      return matchesCategory && matchesQuery && matchesMake && matchesModel;
    });
  }, [query, category, products, selectedMake, selectedModel]);

  const totalCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);

  function addToCart(product: Product) {
    if (product.stock <= 0) return;
    const currentQuantity = cart.find((line) => line.id === product.id)?.quantity ?? 0;
    if (currentQuantity >= product.stock) setCartNotice(`Больше добавить нельзя: в наличии ${product.stock} шт.`);
    else setCartNotice("");
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) return current.map((line) => line.id === product.id ? { ...line, quantity: Math.min(line.quantity + 1, line.stock) } : line);
      return [...current, { ...product, quantity: 1 }];
    });
    setCartOpen(true);
  }

  function updateQuantity(id: number, quantity: number) {
    setCartNotice("");
    setCart((current) => current
      .map((line) => line.id === id ? { ...line, quantity: Math.min(quantity, line.stock) } : line)
      .filter((line) => line.quantity > 0));
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phoneInput = event.currentTarget.elements.namedItem("phone") as HTMLInputElement;
    phoneInput.value = formatPhone(phoneInput.value);
    if (normalizePhoneDigits(phoneInput.value).length !== 11) {
      phoneInput.setCustomValidity("Введите номер полностью: 10 цифр после +7");
      phoneInput.reportValidity();
      return;
    }
    phoneInput.setCustomValidity("");
    setCheckoutError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": orderAttemptKey || createRequestKey() },
        body: JSON.stringify({
          customerName: String(form.get("customerName") ?? ""),
          phone: String(form.get("phone") ?? ""),
          comment: String(form.get("comment") ?? ""),
          items: cart.map((line) => ({ productId: line.id, quantity: line.quantity })),
        }),
      });
      const data = (await response.json()) as { order?: { publicCode: string }; error?: string; detail?: string };
      if (!response.ok || !data.order) throw new Error(data.error || data.detail || "Не удалось отправить заказ");
      setOrderNumber(data.order.publicCode);
      const phoneLast4 = normalizePhoneDigits(phoneInput.value).slice(-4);
      setStatusCode(data.order.publicCode);
      setStatusPhoneLast4(phoneLast4);
      localStorage.setItem("pilot:last-order", JSON.stringify({ code: data.order.publicCode, phoneLast4 }));
      setCheckoutOpen(false);
      setCartOpen(false);
      setCart([]);
      setOrderAttemptKey("");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Не удалось отправить заказ. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function checkOrderStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const codeDigits = statusCode.replace(/\D/g, "").slice(-4);
    const phoneDigits = statusPhoneLast4.replace(/\D/g, "").slice(-4);
    setStatusResult(null);
    if (codeDigits.length !== 4 || phoneDigits.length !== 4) {
      setStatusError("Введите 4 цифры номера заказа и последние 4 цифры телефона.");
      return;
    }
    setStatusError("");
    setStatusLoading(true);
    try {
      const response = await apiFetch(`/api/orders/status?code=${encodeURIComponent(codeDigits)}&phoneLast4=${encodeURIComponent(phoneDigits)}`);
      const data = (await response.json()) as { order?: PublicOrder; error?: string; detail?: string };
      if (!response.ok || !data.order) throw new Error(data.error || data.detail || "Заказ не найден");
      setStatusResult(data.order);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Не удалось проверить статус.");
    } finally {
      setStatusLoading(false);
    }
  }

  function openStatusLookup() {
    try {
      const saved = JSON.parse(localStorage.getItem("pilot:last-order") ?? "null") as { code?: string; phoneLast4?: string } | null;
      if (!statusCode && saved?.code) setStatusCode(saved.code);
      if (!statusPhoneLast4 && saved?.phoneLast4) setStatusPhoneLast4(saved.phoneLast4);
    } catch {
      localStorage.removeItem("pilot:last-order");
    }
    setOrderNumber(null);
    setStatusError("");
    setStatusResult(null);
    setStatusOpen(true);
  }

  return (
    <main>
      <div className="service-bar">
        <div className="container service-bar__inner">
          <span>г. Сибай, проспект Горняков, 37</span>
          <span className="service-bar__right">
            <strong>Самовывоз из магазина</strong>
            <a href="tel:+79603904555">+7 (960) 390-45-55</a>
          </span>
        </div>
      </div>

      <header className="site-header">
        <div className="container site-header__inner">
          <a href="#top" className="logo" aria-label="ПИЛОТ — на главную">
            <strong>ПИЛ<span>О</span>Т</strong>
            <small>Автозапчасти</small>
          </a>
          <nav aria-label="Основная навигация">
            <a href="#catalog">Каталог</a>
            <a href="#about">О магазине</a>
            <a href="#contacts">Контакты</a>
            <button className="nav-button" onClick={openStatusLookup}>Статус заказа</button>
            <a href="/admin">Для продавца</a>
          </nav>
          <button className="mobile-status-button" onClick={openStatusLookup}>Статус заказа</button>
          <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={`Корзина, товаров: ${totalCount}`}>
            <span className="cart-glyph" aria-hidden="true" />
            <span>Корзина</span>
            {totalCount > 0 && <b>{totalCount}</b>}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="container hero__grid">
          <div>
            <p className="eyebrow">МАГАЗИН АВТОЗАПЧАСТЕЙ В СИБАЕ</p>
            <h1>Нужная деталь —<br />без долгих поисков</h1>
            <p className="hero__lead">Подберём запчасти для иномарок и ВАЗ. Закажите на сайте — проверим наличие, позвоним и отложим к вашему приезду.</p>
            <div className="hero__benefits">
              <span><i>✓</i> Проверяем совместимость</span>
              <span><i>✓</i> Резерв после звонка</span>
              <span><i>✓</i> Самовывоз сегодня</span>
            </div>
          </div>
          <div className="search-panel" aria-label="Поиск запчастей">
            <div className="search-panel__title">Найдите запчасть</div>
            <label className="search-field">
              <span className="search-glyph" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, артикул или бренд" />
            </label>
            <div className="vehicle-row">
              <label><span>Марка автомобиля</span><select value={selectedMake} onChange={(event) => { setSelectedMake(event.target.value); setSelectedModel(""); }}><option value="">Любая марка</option>{vehicles.map((make) => <option key={make.value} value={make.value}>{make.label}</option>)}</select></label>
              <label><span>Модель</span><select value={selectedModel} disabled={!selectedMake} onChange={(event) => setSelectedModel(event.target.value)}><option value="">{selectedMake ? "Любая модель" : "Сначала выберите марку"}</option>{vehicles.find((make) => make.value === selectedMake)?.models.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
            </div>
            <button className="primary-button" onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}>Показать запчасти</button>
            <p>Не знаете артикул? <a href="#request">Оставьте запрос по автомобилю</a></p>
          </div>
        </div>
      </section>

      <section className="category-section">
        <div className="container">
          <div className="section-heading section-heading--compact">
            <div><p className="eyebrow">БЫСТРЫЙ ПЕРЕХОД</p><h2>Популярные категории</h2></div>
          </div>
          <div className="category-grid">
            {categories.map(([name, icon]) => (
              <button key={name} className={category === name ? "category-card is-active" : "category-card"} onClick={() => { setCategory(name); document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }); }}>
                <PartIcon type={icon} /><span>{name}</span><b>→</b>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="container">
          <div className="section-heading">
            <div><p className="eyebrow">КАТАЛОГ</p><h2>{category}</h2></div>
            <div className="catalog-tools">
              {category !== "Все товары" && <button className="text-button" onClick={() => setCategory("Все товары")}>Сбросить категорию</button>}
              {(selectedMake || selectedModel) && <button className="vehicle-filter" onClick={() => { setSelectedMake(""); setSelectedModel(""); }}>Автомобиль: {vehicles.find((make) => make.value === selectedMake)?.label}{selectedModel ? ` ${selectedModel}` : ""} ×</button>}
              <span>{filtered.length} товаров</span>
            </div>
          </div>
          {catalogLoading ? (
            <div className="empty-search"><h3>Загружаем каталог…</h3></div>
          ) : catalogError ? (
            <div className="empty-search"><h3>Каталог временно недоступен</h3><p>{catalogError}</p></div>
          ) : filtered.length > 0 ? (
            <div className="product-grid">
              {filtered.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-card__visual">{product.imageKey ? <img src={apiUrl(`/api/product-image?key=${encodeURIComponent(product.imageKey)}`)} alt="" /> : <PartIcon type={product.icon} />}<span>{product.category}</span></div>
                  <div className="product-card__body">
                    <div className="product-card__meta"><strong>{product.brand}</strong><span>Арт. {product.article}</span></div>
                    <h3>{product.name}</h3>
                    <p className="fits">Подходит: {product.vehicle}</p>
                    <div className={product.stock > 0 ? "availability" : "availability availability--out"}><i /> {product.stock > 0 ? `В наличии: ${product.stock} шт.` : "Нет в наличии"}</div>
                    <div className="product-card__footer">
                      <div><strong>{money.format(product.price)} ₽</strong><span>за шт.</span></div>
                      <button disabled={product.stock <= 0} onClick={() => addToCart(product)} aria-label={`Добавить ${product.name} в корзину`}>{product.stock > 0 ? "В корзину" : "Нет в наличии"}</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-search"><h3>Ничего не нашли</h3><p>Попробуйте изменить запрос или оставьте заявку на подбор детали.</p><button className="primary-button" onClick={() => { setQuery(""); setCategory("Все товары"); setSelectedMake(""); setSelectedModel(""); }}>Сбросить фильтры</button></div>
          )}
        </div>
      </section>

      <section className="request-section" id="request">
        <div className="container request-section__inner">
          <div><p className="eyebrow eyebrow--light">ПОМОЖЕМ С ПОДБОРОМ</p><h2>Не нашли нужную запчасть?</h2><p>Позвоните продавцу и назовите автомобиль, VIN или артикул. Мы проверим наличие и подберём замену.</p></div>
          <div className="request-form">
            <a className="light-button" href="tel:+79603904555">+7 (960) 390-45-55</a>
            <a className="light-button" href="tel:+73477554800">(34775) 5-48-00</a>
          </div>
        </div>
      </section>

      <section className="about-section" id="about">
        <div className="container about-grid">
          <div className="store-photo-wrap">
            <div className="store-visual" aria-label="Магазин ПИЛОТ в Сибае"><strong>ПИЛОТ</strong><span>Автозапчасти · Сибай</span></div>
          </div>
          <div><p className="eyebrow">О МАГАЗИНЕ</p><h2>Запчасти рядом.<br />Совет — по делу.</h2><p>«ПИЛОТ» — магазин автозапчастей на проспекте Горняков. Здесь можно подобрать расходники и детали для отечественных автомобилей и иномарок, уточнить наличие и зарезервировать заказ до приезда.</p><p>Мы делаем ставку на понятный подбор, честную информацию о наличии и быстрый самовывоз без лишнего ожидания.</p><ul className="about-list"><li><b>01</b><span><strong>Проверяем наличие</strong>Перед подтверждением заказа</span></li><li><b>02</b><span><strong>Помогаем с подбором</strong>По автомобилю и артикулу</span></li><li><b>03</b><span><strong>Откладываем детали</strong>После звонка продавца</span></li></ul></div>
        </div>
      </section>

      <section className="contacts-section" id="contacts">
        <div className="container contacts-grid">
          <div><p className="eyebrow">КОНТАКТЫ</p><h2>Заезжайте в «ПИЛОТ»</h2><p className="contacts-lead">Перед поездкой можно позвонить — проверим наличие нужной детали.</p></div>
          <div className="contact-card"><span>Адрес</span><strong>г. Сибай,<br />проспект Горняков, 37</strong><a href="https://yandex.ru/maps/?text=Сибай%2C%20проспект%20Горняков%2C%2037" target="_blank" rel="noreferrer">Построить маршрут →</a></div>
          <div className="contact-card"><span>Телефоны</span><strong><a href="tel:+79603904555">+7 (960) 390-45-55</a><br /><a href="tel:+73477554800">(34775) 5-48-00</a></strong><small>Позвоните, чтобы уточнить наличие</small></div>
        </div>
      </section>

      <footer><div className="container footer-inner"><div className="footer-logo">ПИЛ<span>О</span>Т <small>автозапчасти</small></div><p>© 2026 «ПИЛОТ». Информация на сайте не является публичной офертой.</p><a href="#top">Наверх ↑</a></div></footer>

      {cartOpen && (
        <div className="overlay" onMouseDown={() => setCartOpen(false)}>
          <aside className="cart-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Корзина">
            <div className="drawer-head"><div><span>Ваш заказ</span><h2>Корзина</h2></div><button onClick={() => setCartOpen(false)} aria-label="Закрыть">×</button></div>
            {cartNotice && <div className="cart-notice" role="status">{cartNotice}</div>}
            {cart.length === 0 ? (
              <div className="cart-empty"><span className="cart-glyph cart-glyph--large" /><h3>Корзина пока пуста</h3><p>Добавьте нужные запчасти из каталога.</p><button className="primary-button" onClick={() => setCartOpen(false)}>Вернуться в каталог</button></div>
            ) : (
              <>
                <div className="cart-lines">{cart.map((line) => <div className="cart-line" key={line.id}><PartIcon type={line.icon} /><div className="cart-line__body"><strong>{line.name}</strong><span>{line.brand} · {line.article}</span><div className="quantity"><button onClick={() => updateQuantity(line.id, line.quantity - 1)} aria-label="Уменьшить количество">−</button><b>{line.quantity}</b><button disabled={line.quantity >= line.stock} onClick={() => updateQuantity(line.id, line.quantity + 1)} aria-label="Увеличить количество">+</button><small>из {line.stock}</small></div></div><b>{money.format(line.price * line.quantity)} ₽</b></div>)}</div>
                <div className="cart-summary"><p><span>Товаров</span><b>{totalCount}</b></p><p className="cart-total"><span>Итого</span><b>{money.format(total)} ₽</b></p><small>Оплата при получении в магазине</small><button className="primary-button" onClick={() => { setCheckoutError(""); setOrderAttemptKey(createRequestKey()); setCheckoutOpen(true); setCartOpen(false); }}>Оформить самовывоз</button></div>
              </>
            )}
          </aside>
        </div>
      )}

      {checkoutOpen && (
        <div className="overlay overlay--center" onMouseDown={() => setCheckoutOpen(false)}>
          <div className="checkout-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setCheckoutOpen(false)} aria-label="Закрыть">×</button>
            <p className="eyebrow">САМОВЫВОЗ ИЗ МАГАЗИНА</p><h2>Оформление заказа</h2><p>Продавец проверит наличие, позвонит вам и отложит товары.</p>
            <form onSubmit={submitOrder}>
              <label><span>Ваше имя</span><input name="customerName" required placeholder="Например, Алексей" /></label>
              <label><span>Номер телефона</span><input name="phone" required type="tel" inputMode="tel" onBlur={handlePhoneBlur} placeholder="+7 (___) ___-__-__" /></label>
              <label><span>Комментарий <small>необязательно</small></span><textarea name="comment" placeholder="Например, марка и год автомобиля" /></label>
              {checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}
              <div className="checkout-total"><span>К оплате в магазине</span><strong>{money.format(total)} ₽</strong></div>
              <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Отправляем…" : "Заказать"}</button>
              <small className="agreement">Нажимая кнопку, вы соглашаетесь на обработку данных для оформления заказа.</small>
            </form>
          </div>
        </div>
      )}

      {orderNumber && (
        <div className="overlay overlay--center">
          <div className="success-modal">
            <div className="success-check">✓</div><p className="eyebrow">ЗАКАЗ ПРИНЯТ</p><h2>{orderNumber}</h2>
            <p>Сохраните номер. Продавец проверит наличие и позвонит для подтверждения.</p>
            <div><span>Выдача:</span><strong>проспект Горняков, 37</strong></div>
            <div className="success-actions"><button className="primary-button" onClick={openStatusLookup}>Проверить статус</button><button className="secondary-button" onClick={() => setOrderNumber(null)}>Закрыть</button></div>
          </div>
        </div>
      )}

      {statusOpen && (
        <div className="overlay overlay--center" onMouseDown={() => setStatusOpen(false)}>
          <div className="status-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setStatusOpen(false)} aria-label="Закрыть">×</button>
            <p className="eyebrow">САМОПРОВЕРКА ЗАКАЗА</p><h2>Статус заказа</h2>
            <p>Введите номер заказа и последние 4 цифры телефона, указанного при оформлении.</p>
            <form onSubmit={checkOrderStatus} className="status-form">
              <label><span>Номер заказа</span><input value={statusCode} onChange={(event) => setStatusCode(event.target.value.toUpperCase())} placeholder="ПЛТ-1234" /></label>
              <label><span>Последние 4 цифры телефона</span><input value={statusPhoneLast4} onChange={(event) => setStatusPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="4555" /></label>
              <button className="primary-button" disabled={statusLoading}>{statusLoading ? "Проверяем…" : "Проверить"}</button>
            </form>
            {statusError && <p className="form-error" role="alert">{statusError}</p>}
            {statusResult && (
              <div className="status-result">
                <div className="status-result__head"><div><span>Заказ</span><strong>{statusResult.publicCode}</strong></div><em className={`status status--${statusResult.status}`}>{statusLabels[statusResult.status]}</em></div>
                <div className="status-progress" aria-label={`Статус: ${statusLabels[statusResult.status]}`}>
                  {(["new", "confirmed", "ready", "completed"] as OrderStatus[]).map((status, index) => {
                    const currentIndex = ["new", "confirmed", "ready", "completed"].indexOf(statusResult.status);
                    const reached = statusResult.status !== "cancelled" && index <= currentIndex;
                    return <div key={status} className={reached ? "is-reached" : ""}><i>{reached ? "✓" : index + 1}</i><span>{statusLabels[status]}</span></div>;
                  })}
                </div>
                {statusResult.status === "cancelled" && <p className="cancelled-note">Заказ отменён. Если это ошибка, позвоните в магазин.</p>}
                <div className="status-order-summary"><span>{statusResult.items.reduce((sum, item) => sum + item.quantity, 0)} шт. в заказе</span><strong>{money.format(statusResult.total)} ₽</strong></div>
                <p className="status-hint">{statusResult.status === "new" ? "Продавец ещё проверяет наличие. После подтверждения статус обновится здесь." : statusResult.status === "confirmed" ? "Заказ подтверждён и зарезервирован. Дождитесь статуса «Готов к выдаче»." : statusResult.status === "ready" ? "Заказ собран — можно забирать в магазине на проспекте Горняков, 37." : statusResult.status === "completed" ? "Заказ уже выдан. Спасибо за покупку!" : "Свяжитесь с магазином для уточнения."}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
