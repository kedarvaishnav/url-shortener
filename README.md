# Linkform URL Shortener

Linkform is a Docker-only URL shortener built with React, Express, and Redis. It stores short-code mappings in Redis and uses a Redis-backed Bloom filter to reject codes that definitely do not exist without a URL lookup.

## Architecture

```text
Browser
  │
  ├── GET /                 ──► React app served by Express
  ├── POST /shorten         ──► URL service ──► Redis: SET url:<code>
  ├── GET /<code>           ──► Bloom filter ──► Redis: GET url:<code> (possible match)
  ├── GET /stats            ──► Bloom filter statistics
  └── GET /health           ──► health response
                                   │
                                   └── definite filter miss ──► 404, no URL GET
```

New codes enter the Bloom filter before their URLs are saved. This ordering avoids a saved URL being absent from the filter after a crash. The filter is shared by API containers through Redis.

## Quick start

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Compose builds the React client into the API image and starts the API with Redis. Redis AOF and a named volume preserve links and filter data across container restarts.

Compose defaults work without a `.env` file. Copy `.env.example` to `.env` if you want to change ports or Bloom filter sizing.

Stop the services:

```bash
docker compose down
```

Remove the Redis volume as well:

```bash
docker compose down -v
```

## API

| Method and path | Behavior |
|---|---|
| `GET /` | Serves the React client. |
| `POST /shorten` | Accepts `{ "url": "https://example.com/..." }`; returns `{ "shortUrl": "http://localhost:3000/aB3xY9" }`. |
| `GET /:code` | Redirects with `302`; returns `404` for unknown codes. |
| `GET /health` | Returns `{ "status": "ok" }`. |
| `GET /stats` | Returns Bloom filter sizing, item, and false-positive statistics. |

Example:

```bash
curl -X POST http://localhost:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/a/long/path"}'
```

## How the Bloom filter works

The filter is a Redis bitmap sized for 1,000,000 links at a 1% target false-positive rate: 9,585,059 bits and 7 hash positions per code.

- A negative result means the code is definitely absent, so the API returns `404` without `GET url:<code>`.
- A positive result may be a false positive, so the API checks Redis before deciding whether to redirect.
- On startup, the API rebuilds missing or outdated filter metadata from `url:*` keys using `SCAN`.

Run the benchmark while Compose is up:

```bash
docker compose exec api npm run benchmark
```

The benchmark sends 10,000 random unknown-code requests and reports URL GETs avoided. In one run against an empty Redis database, it completed all requests in 2.83 seconds and avoided 10,000 of 10,000 URL GETs. The result depends on the stored data and false-positive rate.

## Tests

```bash
docker compose run --rm -e REDIS_DB=15 api npm test
```

Tests use Redis database 15 so they do not clear the normal database.

## Project structure

```text
url-shortener/
├── client/                       # React UI and Bloom stats panel
├── server/
│   ├── scripts/                  # Docker dev watcher and benchmark
│   ├── src/
│   │   ├── routes/               # HTTP endpoints
│   │   ├── services/             # URL service and Bloom filter
│   │   ├── redis/                # Shared Redis client and keys
│   │   ├── app.js                # Express app and static client files
│   │   ├── config.js             # Environment validation
│   │   └── server.js             # Startup and filter preparation
│   └── tests/                    # Node built-in test runner tests
├── Dockerfile
├── docker-compose.yml
├── docker-compose.override.yml
└── docs/
```
