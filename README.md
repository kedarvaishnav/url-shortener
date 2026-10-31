# Linkform URL Shortener

Linkform creates short links with a React client, an Express API, MySQL storage, and Redis caching. A Redis-backed Bloom filter tracks aliases in MySQL and rejects definite misses before a SQL lookup.

## Architecture

```text
Browser
  ├── GET / ─────────────────────────► React client served by Express
  ├── POST /shorten ──► Bloom filter ─► MySQL INSERT (alias + destination)
  └── GET /:code ─────► Redis cache ──► redirect on cache hit
                          │ cache miss
                          ▼
                       Bloom filter ─► 404 on definite miss
                          │ possible match
                          ▼
                         MySQL ──────► cache result in Redis and redirect
```

MySQL is the permanent URL store. Redis holds temporary URL cache entries and the shared Bloom bitmap. The API imports existing `url:<code>` Redis mappings into MySQL once at startup, then removes each legacy key after it is copied successfully.

## Quick start

Copy `.env.example` to `.env`, replace the two local MySQL password placeholders, then start the containers:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Docker Compose runs MySQL, Redis, and the Node API. MySQL and Redis data use separate named volumes.

Stop the services:

```bash
docker compose down
```

Delete both database volumes as well:

```bash
docker compose down -v
```

## API

| Method and path | Behavior |
|---|---|
| `GET /` | Serves the React client. |
| `POST /shorten` | Accepts `{ "url": "https://example.com/..." }`; returns `{ "shortUrl": "http://localhost:3000/aB3xY9" }`. |
| `GET /:code` | Checks Redis cache, then the Bloom filter and MySQL; redirects with 302 or returns 404. |
| `GET /health` | Returns `{ "status": "ok" }`. |
| `GET /stats` | Returns Bloom filter sizing, MySQL URL count, and estimated false-positive rate. |

Example:

```bash
curl -X POST http://localhost:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/a/long/path"}'
```

## MySQL, Redis cache, and Bloom filter

`short_urls` in MySQL is the source of truth. Its case-sensitive alias primary key prevents duplicate short codes. Redis stores successful lookups under `cache:url:<code>` with a configurable TTL. A cache hit redirects without querying MySQL.

On a cache miss, the Bloom filter checks whether the alias may exist in MySQL. A definite miss returns 404 without a SQL lookup; a possible match queries MySQL, caches a found URL, and redirects. A Bloom positive is never treated as proof that the alias exists.

The filter is sized from `BLOOM_EXPECTED_ITEMS` and `BLOOM_FALSE_POSITIVE_RATE`. At startup, missing or incompatible filter metadata triggers a paged rebuild from MySQL aliases. Existing Redis-only `url:<code>` keys are imported before this rebuild.

## Benchmark

With the app running:

```bash
docker compose exec api npm run benchmark
```

The benchmark generates 10,000 unknown codes and reports MySQL lookups the filter predicts it avoided, along with HTTP request duration. It does not run a no-filter comparison.

## Tests

```bash
docker compose run --rm -e REDIS_DB=15 -e MYSQL_DATABASE=url_shortener_test api npm test
```

Tests use Redis DB 15 and the separate `url_shortener_test` MySQL database.

## Project structure

```text
url-shortener/
├── client/                       # React UI and Bloom stats panel
├── server/
│   ├── scripts/                  # Docker dev watcher and benchmark
│   ├── sql/                      # MySQL test database initialization
│   ├── src/
│   │   ├── mysql/                # Shared pool and URL repository
│   │   ├── redis/                # Redis client and cache keys
│   │   ├── routes/               # HTTP endpoints
│   │   ├── services/             # URL service, Bloom filter, legacy import
│   │   ├── app.js                # Express app and static client files
│   │   ├── config.js             # Environment validation
│   │   └── server.js             # Startup and service preparation
│   └── tests/                    # Node built-in test runner tests
├── Dockerfile
├── docker-compose.yml
└── docker-compose.override.yml
```
