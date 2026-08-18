# Architecture

## Components

### Next.js frontend

The browser application contains the public catalog, shopping cart, order-status lookup and the employee dashboard. It does not contain a separate database or business API. Next.js rewrites same-origin `/api/*` requests to FastAPI.

### FastAPI backend

FastAPI owns the application rules:

- admin authentication and session cookies;
- product management and image uploads;
- idempotent order creation;
- status transition validation;
- inventory reservation and restoration;
- SMTP notifications;
- external catalog synchronization.

### PostgreSQL

PostgreSQL stores products, orders, order items, status history and application settings. Alembic is the only production schema-management mechanism.

## Consistency model

Product rows are locked when an order is confirmed or cancelled. This keeps concurrent inventory updates consistent. The external provider is called before the local transaction is committed; provider failures abort the status change.

Order creation accepts an `Idempotency-Key` header. Repeated submissions with the same key return the original order.

## Security boundaries

- Administrative routes require a signed HttpOnly session cookie.
- Production startup rejects placeholder passwords, short session secrets and insecure cookies.
- Upload paths are constrained to the configured upload directory.
- Images are validated by size, declared MIME type and decoded file format.
- ERP tokens are stored server-side and never returned by the settings API.
