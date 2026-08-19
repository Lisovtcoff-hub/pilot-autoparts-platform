# PILOT Auto Parts Platform

[![CI](https://github.com/lisovcoff/pilot-autoparts-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/lisovcoff/pilot-autoparts-platform/actions/workflows/ci.yml)

A full-stack ordering platform for a local auto-parts store. Customers can browse stock, place pickup orders, and track their status. Store employees use a protected dashboard to manage products, process orders, and synchronize inventory with an external ERP bridge.

> This public repository is a portfolio-safe source version. Production credentials, customer data, and operational ERP secrets are not included.

## What the project does

- provides a storefront and protected administration dashboard;
- creates orders idempotently to prevent duplicate submissions;
- enforces explicit transactional order-state transitions;
- reserves and restores inventory under database row locks;
- validates uploaded product images by size, MIME type, and file signature;
- sends email notifications through SMTP with Mailpit for local testing;
- supports mock catalog data or an external ERP bridge;
- stores ERP tokens as write-only secrets;
- validates backend, frontend, and PostgreSQL migrations in CI.

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

See [docs/architecture.md](docs/architecture.md).

## Technology stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic
- **Database:** PostgreSQL; SQLite for tests
- **Frontend:** Next.js 16, React 19, TypeScript
- **Infrastructure:** Docker Compose, Mailpit, GitHub Actions
- **Testing:** Pytest, pytest-asyncio, Ruff, ESLint, Next.js production build

## Quick start

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

## Project structure

```text
backend/        FastAPI application, migrations, integrations, and tests
app/            Next.js storefront and administration routes
components/     shared React components
public/         static assets
docs/           architecture and deployment documentation
compose.yaml    local PostgreSQL, backend, frontend, and Mailpit stack
```

## Security and operational notes

- Administrator sessions use HttpOnly cookies and production credential validation.
- The backend refuses to start in production with placeholder credentials.
- Image uploads are validated before storage.
- ERP tokens are never returned to the browser.
- Production deployment requires HTTPS, secure cookies, strong secrets, and edge rate limiting.
- The ERP bridge must be deployed close to and authorized by the store's accounting system.

See [docs/deployment.md](docs/deployment.md) for additional details.

## Project status

The repository demonstrates the complete ordering workflow, including inventory reservation, cancellation recovery, administration, notifications, and an explicit ERP integration boundary.

## Author

Sergey Inozemtsev — Python backend developer

GitHub: https://github.com/lisovcoff
