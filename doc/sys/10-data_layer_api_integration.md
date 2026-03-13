## 10. 📊 Data Layer / API Integration

- **Repository Pattern Layer** — domain-specific data access objects (UserRepository, OrderRepository) abstracting raw HTTP calls
- **Query Manager** — manages data-fetching lifecycles (loading, success, error, stale, refetch) — similar to React Query
- **Optimistic Update Manager** — applies UI changes immediately; rolls back on failure
- **Data Normalizer** — normalizes nested API responses into flat, ID-indexed collections (like Normalizr)
- **Pagination Manager** — handles offset, cursor, and page-based pagination; manages page cache
- **Infinite Scroll Manager** — intersection-observer-based load-more triggering
- **WebSocket Manager** — connection lifecycle, heartbeat/ping, reconnect with backoff, message framing
- **Server-Sent Events (SSE) Manager** — manages SSE connections for server-push streams
- **GraphQL Client** — query/mutation/subscription execution, fragment management, normalized cache

---