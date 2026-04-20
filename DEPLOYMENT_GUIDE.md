# Deployment Guide

## Prerequisites

- Docker & Docker Compose
- kubectl + a running cluster (minikube, kind, EKS, GKE, AKS…)
- Helm 3
- A container registry (Docker Hub, ECR, GCR, etc.)

---

## 1 — Run Locally with Docker Compose

Create `docker-compose.yml` in the project root:

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5

  backend:
    build: ./backend
    environment:
      PG_HOST: postgres
      PG_DB: appdb
      PG_USER: postgres
      PG_PASSWORD: postgres
      REDIS_URL: redis://redis:6379
    ports:
      - "3000:3000"
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }

  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    depends_on:
      - backend

volumes:
  pg_data:
```

Then run:

```bash
docker compose up --build
# Open http://localhost:8080
```

---

## 2 — Build & Push Docker Images

```bash
REGISTRY=your-registry   # e.g. docker.io/youruser or 123456789.dkr.ecr.us-east-1.amazonaws.com

# Backend
docker build -t $REGISTRY/fullstack-backend:latest ./backend
docker push $REGISTRY/fullstack-backend:latest

# Frontend
docker build -t $REGISTRY/fullstack-frontend:latest ./frontend
docker push $REGISTRY/fullstack-frontend:latest
```

---

## 3 — Create Kubernetes Namespace & Secret

```bash
kubectl create namespace fullstack

# Backend needs the PG password as a Secret
kubectl create secret generic backend-secret \
  --namespace fullstack \
  --from-literal=pg-password=YOUR_STRONG_PASSWORD
```

---

## 4 — Install PostgreSQL & Redis (via Helm)

```bash
# PostgreSQL
helm repo add bitnami https://charts.bitnami.com/bitnami
helm upgrade --install postgresql bitnami/postgresql \
  --namespace fullstack \
  --set auth.postgresPassword=YOUR_STRONG_PASSWORD \
  --set auth.database=appdb

# Redis
helm upgrade --install redis bitnami/redis \
  --namespace fullstack \
  --set auth.enabled=false
```

---

## 5 — Deploy the App with Helm

```bash
helm upgrade --install fullstack ./helm-chart \
  --namespace fullstack \
  --set backend.image.repository=$REGISTRY/fullstack-backend \
  --set backend.image.tag=latest \
  --set frontend.image.repository=$REGISTRY/fullstack-frontend \
  --set frontend.image.tag=latest
```

Verify:

```bash
kubectl get pods -n fullstack
kubectl get svc  -n fullstack
```

---

## 6 — Access the App

```bash
# If service type is LoadBalancer:
kubectl get svc frontend-service -n fullstack
# Use the EXTERNAL-IP

# If using minikube:
minikube service frontend-service -n fullstack

# Port-forward for quick testing:
kubectl port-forward svc/frontend-service 8080:80 -n fullstack
# Open http://localhost:8080
```

---

## 7 — Upgrade & Rollback

```bash
# Upgrade (e.g. new image tag)
helm upgrade fullstack ./helm-chart --namespace fullstack \
  --set backend.image.tag=v1.1.0

# Rollback to previous release
helm rollback fullstack 1 --namespace fullstack
```

---

## 8 — Teardown

```bash
helm uninstall fullstack     --namespace fullstack
helm uninstall postgresql    --namespace fullstack
helm uninstall redis         --namespace fullstack
kubectl delete namespace fullstack
```

---

## Environment Variables Reference (Backend)

| Variable      | Default          | Description                    |
|---------------|------------------|--------------------------------|
| PORT          | 3000             | Express listen port            |
| PG_HOST       | localhost        | PostgreSQL hostname            |
| PG_PORT       | 5432             | PostgreSQL port                |
| PG_DB         | appdb            | Database name                  |
| PG_USER       | postgres         | Database user                  |
| PG_PASSWORD   | —                | Database password (use Secret) |
| REDIS_URL     | redis://localhost:6379 | Redis connection URL    |
| CORS_ORIGIN   | *                | Allowed CORS origin            |