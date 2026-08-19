# PILOT Auto Parts Platform

[![CI](https://github.com/lisovcoff/pilot-autoparts-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/lisovcoff/pilot-autoparts-platform/actions/workflows/ci.yml)

Full-stack ordering platform for a local auto-parts store. Customers browse stock and place pickup orders, while store staff manage products, orders, and ERP synchronization from a protected dashboard.

## Highlights

- storefront and protected administration dashboard;
- idempotent order creation to prevent duplicate submissions;
- explicit transactional order-state transitions;
- inventory reservation and restore under database row locks;
- product image validation by size, MIME type, and file signature;
- SMTP notifications with Mailpit for local testing;
- mock catalog mode or external ERP bridge;
- CI validation for backend, frontend, and PostgreSQL migrations.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic
- **Database:** PostgreSQL; SQLite for tests
- **Frontend:** Next.js 16, React 19, TypeScript
- **Infrastructure:** Docker Compose, Mailpit, GitHub Actions
- **Testing:** Pytest, pytest-asyncio, Ruff, ESLint, Next.js production build

## Architecture

```text
Next.js storefront and admin UI
               |
               | same-origin /api proxy
               v
        FastAPI backend
      /       |       |       \
PostgreSQL   SMTP   ERP bridge  uploaded images
```

FastAPI is the source of truth for products, orders, authentication, inventory, and settings. Next.js provides the interface and proxies API requests to the backend.

Additional notes: [architecture](docs/architecture.md), [deployment](docs/deployment.md).

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

Services:

- storefront: `http://localhost:3000`
- admin dashboard: `http://localhost:3000/admin`
- OpenAPI: `http://localhost:8000/docs`
- Mailpit: `http://localhost:8025`

Change `ADMIN_PASSWORD` and `SESSION_SECRET` before sharing the environment.

## Development and tests

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
alembic upgrade head
ruff check app tests
pytest
uvicorn app.main:app --reload
```

Frontend:

```bash
npm ci
npm run lint
npm run build
npm run dev
```

## Repository layout

```text
backend/        FastAPI application, migrations, integrations, and tests
app/            Next.js storefront and administration routes
components/     shared React components
public/         static assets
docs/           architecture and deployment documentation
compose.yaml    local PostgreSQL, backend, frontend, and Mailpit stack
```

## Notes

- This public repository excludes production credentials, customer data, and operational ERP secrets.
- ERP tokens are stored as write-only secrets and are never returned to the browser.
- Production deployment requires HTTPS, secure cookies, strong secrets, and edge rate limiting.
