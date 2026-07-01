# URL Shortener

Minimal URL shortener service. Node.js 20 + Express + Redis + nanoid.

## Local dev (no Docker)

```bash
npm install
REDIS_HOST=localhost REDIS_PORT=6379 npm start
```

Requires a Redis instance running locally (`redis-server` or `docker run -p 6379:6379 redis:7.2-alpine`).

## Docker Compose

```bash
docker compose up --build
```

API will be available at http://localhost:3000, backed by a Redis container with a persistent named volume.

## Kubernetes

Manifests are in `k8s/`. Apply in this order:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/redis-service.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

Note: `deployment.yaml` references image `url-shortener-api:latest` — build and push this image to a registry your cluster can pull from (or load it into your local cluster, e.g. `kind load docker-image` / `minikube image load`) before applying.

## API

- `GET /` — minimal web UI for shortening links (served from `public/index.html`)
- `POST /shorten` — body `{ "url": "https://..." }` → `{ "shortUrl": "http://localhost:3000/<code>" }`
- `GET /:code` — 302 redirect to the original URL, or 404 if not found
- `GET /health` — `{ "status": "ok" }`, used for k8s readiness/liveness probes

## Environment variables

| Var | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the Express app listens on |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `BASE_URL` | `http://localhost:<PORT>` | Base URL used to build the `shortUrl` response |
