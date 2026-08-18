# Deployment

## Docker Compose

1. Copy `.env.example` to `.env`.
2. Set `APP_ENV=production`.
3. Generate a strong admin password and a random session secret.
4. Set `COOKIE_SECURE=true`.
5. Start the stack with `docker compose up -d --build`.

Use a reverse proxy with TLS in front of the frontend. Route all public traffic to the Next.js container; it proxies `/api/*` to FastAPI internally. The backend port is bound to localhost in the provided Compose file for diagnostics and OpenAPI access.

## Required production controls

- TLS and secure cookies
- Reverse-proxy rate limits for `/api/auth/login` and `/api/orders/status`
- Database backups
- Persistent storage for `/data/uploads`
- SMTP credentials from a secret store
- Restricted network access to the ERP bridge

No server IP addresses, credentials or client-specific deployment values are stored in this repository.
