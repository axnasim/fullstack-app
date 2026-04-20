# 🚀 Fullstack App

A production-ready fullstack application with:

| Layer      | Technology                  |
|------------|-----------------------------|
| Frontend   | Static HTML + Nginx         |
| Backend    | Node.js + Express           |
| Database   | PostgreSQL                  |
| Cache      | Redis                       |
| Container  | Docker (multi-stage builds) |
| Orchestration | Kubernetes via Helm      |

## Architecture

```
Browser → Nginx (frontend) → /api/* → Express (backend)
                                           │
                                    ┌──────┴──────┐
                                 PostgreSQL      Redis
```

## Quick Start (local, no Docker)

```bash
# 1. Start dependencies
docker run -d --name pg    -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
docker run -d --name redis -p 6379:6379 redis:7-alpine

# 2. Backend
cd backend
npm install
PG_PASSWORD=postgres node server.js

# 3. Frontend — open in browser
open frontend/index.html
```

## Docker Compose (recommended for local dev)

See `DEPLOYMENT_GUIDE.md` for the full docker-compose snippet.

## Kubernetes / Helm

```bash
helm upgrade --install fullstack ./helm-chart \
  --namespace fullstack --create-namespace \
  --set backend.image.repository=<YOUR_REGISTRY>/fullstack-backend \
  --set frontend.image.repository=<YOUR_REGISTRY>/fullstack-frontend
```

See `DEPLOYMENT_GUIDE.md` for detailed steps.

## API Reference

| Method | Path         | Description                     |
|--------|--------------|---------------------------------|
| GET    | /health      | Service health check            |
| POST   | /api/visit   | Record a page visit             |
| GET    | /api/stats   | Aggregated stats                |
| GET    | /api/visits  | Paginated visit log             |