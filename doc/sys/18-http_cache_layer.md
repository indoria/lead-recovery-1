## 18. 🗃️ HTTP Cache Layer

A transparent, request-level caching layer that sits between the HTTP Request Manager and the network, intercepting outgoing requests and serving responses from LocalStorage when valid cached data exists.

---

### Core Design Principles
- **Transparent interception** — the rest of the app makes HTTP calls normally; caching is invisible
- **Path-based configuration** — cache rules are defined per URL pattern, not per call site
- **Cache-first or network-first** — configurable strategy per endpoint
- **Stale-While-Revalidate support** — serve stale data immediately, refresh in background
- **Opt-in by default** — caching must be explicitly configured for a path; nothing is cached silently

---

### Components

**Cache Interceptor**
Hooks into the HTTP Client's interceptor chain (Module 4). Runs before every outgoing request. Checks if the request path matches any configured cache rule. If matched and a valid cache entry exists, short-circuits the network call entirely and returns the cached response. If the entry is stale but `staleWhileRevalidate` is enabled, returns stale data immediately and dispatches a background refresh.

**Cache Configuration Registry**
A declarative map of URL patterns to cache policies. Each entry specifies:
- `pattern` — string, glob, or RegExp matching the request path (e.g., `/api/products*`)
- `methods` — which HTTP methods are cacheable (almost always `GET` only)
- `ttl` — time-to-live in milliseconds before the entry is considered stale
- `strategy` — `cache-first`, `network-first`, or `stale-while-revalidate`
- `vary` — list of query params that form part of the cache key (e.g., `['page', 'filter']`)
- `tags` — logical group labels used for bulk invalidation (e.g., `'products'`, `'user-profile'`)
- `enabled` — boolean or function `(request) => boolean` for conditional caching

```js
CacheRegistry.register([
  {
    pattern: '/api/products*',
    methods: ['GET'],
    ttl: 5 * 60 * 1000,           // 5 minutes
    strategy: 'stale-while-revalidate',
    vary: ['category', 'page'],
    tags: ['products'],
    enabled: true
  },
  {
    pattern: '/api/user/profile',
    methods: ['GET'],
    ttl: 10 * 60 * 1000,          // 10 minutes
    strategy: 'cache-first',
    tags: ['user'],
    enabled: (req) => req.headers['x-no-cache'] !== 'true'
  }
]);
```

**Cache Key Builder**
Constructs a deterministic, collision-safe string key for each request. The key is derived from: the normalized URL path, the sorted and filtered query parameters (only those listed in `vary`), and optionally a tenant or user-scope prefix (for multi-user environments on shared storage). Keys are hashed to keep LocalStorage key lengths manageable and to avoid special character issues.

```
cache::v1::user_123::/api/products::category=shoes&page=2
  → SHA-256 → "cache::a3f9c2..."
```

**Cache Store (LocalStorage Adapter)**
Wraps the LocalStorage adapter from Module 3 with cache-specific read/write semantics. Each stored entry is a serialized envelope:

```js
{
  key: "cache::a3f9c2...",
  url: "/api/products?category=shoes&page=2",
  response: { status: 200, headers: {}, body: { ... } },
  cachedAt: 1710234000000,
  expiresAt: 1710234300000,
  etag: '"abc123"',
  lastModified: "Thu, 12 Mar 2026 10:00:00 GMT",
  tags: ['products'],
  version: 1
}
```

**Cache Validator**
Determines the validity state of a cached entry at read time:
- `FRESH` — within TTL, serve immediately with no network call
- `STALE` — past TTL but entry exists; behaviour depends on configured strategy
- `MISS` — no entry found; always go to network
- `EXPIRED` — entry found but forcibly invalidated; treat as MISS

Also handles HTTP conditional request headers: if an entry carries an `ETag` or `Last-Modified`, the validator injects `If-None-Match` / `If-Modified-Since` headers on the revalidation request and processes `304 Not Modified` responses by refreshing the TTL without re-writing the body.

**Cache Strategy Executor**
Executes the fetch logic for each strategy:

- **`cache-first`** — return cache if FRESH or STALE; only hit network on MISS or EXPIRED. Best for rarely-changing reference data.
- **`network-first`** — always attempt network; fall back to cache on network failure. Best for data that must be current but needs offline resilience.
- **`stale-while-revalidate`** — return STALE entry immediately for zero perceived latency, then fire a background network request and silently update the cache. Emits a `cache:revalidated` event on the Event Bus when fresh data arrives so the UI can decide whether to re-render.

**Cache Invalidation Manager**
Provides fine-grained invalidation APIs called by the application after mutations:

```js
// Invalidate a single exact entry
CacheInvalidator.invalidateKey('/api/products?category=shoes&page=2');

// Invalidate all entries matching a tag
CacheInvalidator.invalidateByTag('products');

// Invalidate all entries matching a pattern
CacheInvalidator.invalidateByPattern('/api/products*');

// Full cache wipe
CacheInvalidator.flush();
```

The HTTP Client's response interceptor automatically calls invalidation after successful `POST`, `PUT`, `PATCH`, and `DELETE` responses based on a configurable `invalidatesTag` mapping declared alongside the cache config. This keeps cache coherence without manual invalidation at every call site.

**Cache Quota Guard**
LocalStorage has a hard browser limit (~5MB). The guard monitors total cache storage usage after every write. If usage exceeds a configurable high-water mark (e.g., 80% of allocated budget), it evicts the least-recently-used entries until usage drops below a low-water mark. Emits a `cache:quota-warning` event when approaching limits.

**Cache Metrics Collector**
Tracks hit/miss/stale/revalidation counters per URL pattern. Integrates with Module 14 (Observability) — exposes metrics to the Performance Monitor and Logger so engineers can tune TTLs and identify over- or under-caching in production.

**Cache Bypass Mechanism**
Provides explicit escape hatches:
- Per-request opt-out via a request option flag `{ cache: false }` or a custom header `X-No-Cache: true`
- Global bypass toggle via Feature Flag Manager (Module 14) — useful to disable caching in a production incident without a deployment
- User-initiated cache clear (e.g., "refresh" button triggers `CacheInvalidator.flush()`)

**Cache Version Manager**
Stores a global cache schema version in LocalStorage. On application boot, compares the stored version against the current app version. If they differ (e.g., after a deployment that changed API response shapes), the entire cache is flushed before any requests are made — preventing the app from serving structurally stale or incompatible data.

---

### Data Flow Diagram

```
HTTP Client (Module 4)
        │
        ▼
  Cache Interceptor  ──── Cache Config Registry
        │                   (pattern match)
        │
   ┌────┴──────────┐
   │               │
  HIT             MISS
   │               │
Cache Validator   Network Request
   │               │
 FRESH  STALE     Response
   │      │    Interceptor
   │      │        │
   │   Strategy    ├── Write to Cache Store
   │   Executor    │       │
   │      │        │   Cache Key Builder
   │  ┌───┴──┐     │   Cache Quota Guard
   │  │      │     │
Return  Return  Return
Cached  Stale + (fresh)
       Background
       Revalidate
           │
     cache:revalidated
       (Event Bus)
```

---

---