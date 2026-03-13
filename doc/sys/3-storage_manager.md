# Module 3 — 💾 Storage Manager

> **Core Principle:** All persistence is accessed through a single, unified API. The caller never knows or cares whether data lives in IndexedDB, localStorage, a remote server, or memory. Adapters are interchangeable. The router decides where things go.

---

## Architecture Overview

```
Application Code
      │
      │  StorageManager.get('users:123')
      ▼
┌─────────────────────────────────────────────┐
│              Storage Router                  │
│   matches key namespace → selects adapter   │
└──────────────────┬──────────────────────────┘
                   │
       ┌───────────┼────────────┬──────────────┐
       ▼           ▼            ▼              ▼
  IndexedDB   LocalStorage  SessionStorage  Remote API
  Adapter     Adapter       Adapter         Adapter
       ▲           ▲            ▲              ▲
       └───────────┴────────────┴──────────────┘
                   │
         (every adapter passes through)
                   │
       ┌───────────┼────────────┐
       ▼           ▼            ▼
  Schema        TTL/Expiry   Encryption
  Validator     Manager      Layer
                   │
       ┌───────────┼────────────┐
       ▼           ▼            ▼
  Quota         Migration    In-Memory
  Monitor       Engine       Adapter
```

---

## 3.0 — Storage Adapter Interface

### Responsibility
The base contract that every adapter must implement. No application code ever calls an adapter directly — it always goes through the Storage Router. This contract is the only thing the router depends on.

```js
/**
 * @typedef {Object} StorageEntry
 * @property {string}  key           - The storage key
 * @property {*}       value         - The stored value (already deserialized)
 * @property {number}  [createdAt]   - Unix ms timestamp of first write
 * @property {number}  [updatedAt]   - Unix ms timestamp of last write
 * @property {number}  [expiresAt]   - Unix ms timestamp of TTL expiry (null = never)
 * @property {number}  [version]     - Schema version at write time
 * @property {Object}  [meta]        - Arbitrary adapter-specific metadata
 */

/**
 * @typedef {Object} QueryOptions
 * @property {string}   [prefix]       - Key prefix filter e.g. 'users:'
 * @property {number}   [limit]        - Max results to return
 * @property {number}   [offset]       - Pagination offset
 * @property {string}   [orderBy]      - Field to sort by
 * @property {string}   [order]        - Sort direction ('asc' or 'desc')
 * @property {Object}   [where]        - Field equality filter { status: 'active' }
 * @property {boolean}  [includeExpired] - Default false; skip TTL-expired entries
 */

/**
 * @typedef {Object} SetOptions
 * @property {number}  [ttl]          - Time-to-live in milliseconds
 * @property {number}  [version]      - Schema version to tag the entry with
 * @property {boolean} [encrypt]      - Override adapter-level encryption setting
 * @property {Object}  [meta]         - Extra metadata stored alongside entry
 */

/**
 * @typedef {Object} StorageAdapterCapabilities
 * @property {boolean} queryable       - Supports query() with where/orderBy
 * @property {boolean} transactional   - Supports atomic transactions
 * @property {boolean} streaming       - Supports streaming large results
 * @property {boolean} persistent      - Survives browser restarts
 * @property {boolean} crossTab        - Shared across browser tabs
 * @property {number}  [quotaBytes]    - Known storage quota (-1 = unknown)
 */
```

```js
/**
 * @abstract
 * Base class all adapters must extend.
 * Provides default no-op implementations for optional methods.
 */
class StorageAdapter {
  /** @type {string} - Unique adapter identifier */
  name = 'base';

  /** @type {StorageAdapterCapabilities} */
  capabilities = {};

  /**
   * Initialize the adapter. Called once at boot.
   * Use for opening DB connections, checking permissions, etc.
   * @returns {Promise<void>}
   */
  async init() {}

  /**
   * Retrieve an entry by exact key.
   * Returns null if not found or if entry is expired.
   *
   * @param {string} key
   * @returns {Promise<StorageEntry|null>}
   */
  async get(key) { throw new Error('Not implemented'); }

  /**
   * Write a value under a key.
   * Creates or fully replaces the entry.
   *
   * @param {string}     key
   * @param {*}          value
   * @param {SetOptions} [options]
   * @returns {Promise<StorageEntry>} - The written entry
   */
  async set(key, value, options = {}) { throw new Error('Not implemented'); }

  /**
   * Delete an entry by key.
   * Resolves silently if key does not exist.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {}

  /**
   * Check existence of a key without reading the full value.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    const entry = await this.get(key);
    return entry !== null;
  }

  /**
   * Query multiple entries. Required if capabilities.queryable === true.
   *
   * @param {QueryOptions} options
   * @returns {Promise<StorageEntry[]>}
   */
  async query(options = {}) { return []; }

  /**
   * Return all keys matching an optional prefix.
   * @param {string} [prefix]
   * @returns {Promise<string[]>}
   */
  async keys(prefix = '') { return []; }

  /**
   * Return the count of stored entries.
   * @param {string} [prefix]
   * @returns {Promise<number>}
   */
  async count(prefix = '') { return 0; }

  /**
   * Remove all entries (optionally scoped to a prefix).
   * @param {string} [prefix]
   * @returns {Promise<void>}
   */
  async clear(prefix = '') { throw new Error('Not implemented'); }

  /**
   * Return estimated storage usage in bytes.
   * Returns -1 if unavailable.
   * @returns {Promise<number>}
   */
  async getUsageBytes() { return -1; }

  /**
   * Execute multiple operations atomically.
   * Supported only if capabilities.transactional === true.
   *
   * @param {function(tx: TransactionContext): Promise<void>} fn
   * @returns {Promise<void>}
   */
  async transaction(fn) { throw new Error('Transactions not supported by this adapter'); }

  /**
   * Gracefully close the adapter (e.g. close DB connection).
   * @returns {Promise<void>}
   */
  async close() {}
}

/**
 * @typedef {Object} TransactionContext
 * @property {function(key: string): Promise<StorageEntry|null>} get
 * @property {function(key: string, value: *, options?: SetOptions): Promise<void>} set
 * @property {function(key: string): Promise<void>} delete
 */
```

---

## 3.1 — IndexedDB Adapter

### Responsibility
Structured, schema-versioned, queryable offline storage. The highest-capability local adapter — supports large data volumes, complex queries, and atomic transactions. The preferred adapter for entity collections.

```js
/**
 * @typedef {Object} IDBAdapterOptions
 * @property {string}   dbName         - IndexedDB database name
 * @property {number}   version        - DB schema version (integer, increment on schema change)
 * @property {IDBStoreSchema[]} stores - Object store definitions
 * @property {function(db: IDBDatabase, oldVersion: number, newVersion: number): void} onUpgrade
 *           Called during version upgrade. Define stores and indexes here.
 */

/**
 * @typedef {Object} IDBStoreSchema
 * @property {string}   name           - Object store name
 * @property {string}   [keyPath]      - In-line key e.g. 'id' (null = out-of-line keys)
 * @property {boolean}  [autoIncrement]
 * @property {IDBIndexSchema[]} [indexes]
 */

/**
 * @typedef {Object} IDBIndexSchema
 * @property {string}  name
 * @property {string}  keyPath
 * @property {boolean} [unique]
 * @property {boolean} [multiEntry]   - True for array key paths
 */
```

```js
class IndexedDBAdapter extends StorageAdapter {
  name = 'indexeddb';

  capabilities = {
    queryable:     true,
    transactional: true,
    streaming:     false,
    persistent:    true,
    crossTab:      true,
  };

  /** @type {IDBDatabase|null} */
  #db = null;

  /** @type {IDBAdapterOptions} */
  #options = null;

  /** @type {string} - Default object store name for key-value usage */
  #defaultStore = '_kv';

  /**
   * @param {IDBAdapterOptions} options
   */
  constructor(options) {
    super();
    this.#options = options;
  }

  /**
   * Open the database. Handles version upgrades via onUpgrade callback.
   * @returns {Promise<void>}
   */
  async init() {}

  /** @returns {Promise<StorageEntry|null>} */
  async get(key) {}

  /** @returns {Promise<StorageEntry>} */
  async set(key, value, options = {}) {}

  /** @returns {Promise<void>} */
  async delete(key) {}

  /**
   * Query entries from a named object store using an index.
   * Falls back to full scan if no matching index exists.
   *
   * @param {QueryOptions & { store?: string, index?: string, range?: IDBKeyRange }} options
   * @returns {Promise<StorageEntry[]>}
   */
  async query(options = {}) {}

  /** @returns {Promise<string[]>} */
  async keys(prefix = '') {}

  /** @returns {Promise<number>} */
  async count(prefix = '') {}

  /** @returns {Promise<void>} */
  async clear(prefix = '') {}

  /**
   * @param {function(tx: IDBTransaction): Promise<void>} fn
   * @param {string[]} storeNames - Object stores to include in transaction
   * @param {'readonly'|'readwrite'} [mode]
   * @returns {Promise<void>}
   */
  async transaction(fn, storeNames = [this.#defaultStore], mode = 'readwrite') {}

  /** @returns {Promise<number>} */
  async getUsageBytes() {}

  /**
   * Upgrade object stores and indexes. Called internally during version bump.
   * @param {IDBDatabase}  db
   * @param {number}       oldVersion
   * @param {number}       newVersion
   */
  #handleUpgrade(db, oldVersion, newVersion) {}

  /** @returns {Promise<void>} */
  async close() {
    this.#db?.close();
    this.#db = null;
  }
}
```

### Usage Example

```js
const idbAdapter = new IndexedDBAdapter({
  dbName:  'myapp',
  version: 3,
  stores: [
    {
      name:    'users',
      keyPath: 'id',
      indexes: [
        { name: 'by_email',  keyPath: 'email', unique: true },
        { name: 'by_status', keyPath: 'status' },
      ],
    },
    {
      name:    '_kv',       // fallback key-value store
      keyPath: 'key',
    },
  ],
  onUpgrade(db, oldVersion, newVersion) {
    if (oldVersion < 2) {
      db.createObjectStore('orders', { keyPath: 'id' });
    }
    if (oldVersion < 3) {
      db.transaction.objectStore('orders')
        .createIndex('by_status', 'status');
    }
  },
});

// Querying with index
const activeUsers = await idbAdapter.query({
  store:   'users',
  index:   'by_status',
  where:   { status: 'active' },
  orderBy: 'email',
  limit:   50,
});
```

---

## 3.2 — LocalStorage Adapter

### Responsibility
Simple synchronous key-value storage. Ideal for small, frequently-read values like user preferences, feature flag overrides, and app settings. Enforces size awareness to prevent quota errors.

```js
/**
 * @typedef {Object} LocalStorageAdapterOptions
 * @property {string}  [prefix]           - Key prefix to namespace all entries e.g. 'myapp:'
 * @property {number}  [maxSizeBytes]     - Soft size limit before warnings (default: 4MB)
 * @property {boolean} [compress]         - LZ-string compress values before write (default: false)
 * @property {boolean} [fallbackToMemory] - If localStorage unavailable, fall back silently
 */
```

```js
class LocalStorageAdapter extends StorageAdapter {
  name = 'localstorage';

  capabilities = {
    queryable:     false,
    transactional: false,
    streaming:     false,
    persistent:    true,
    crossTab:      true,     // via StorageEvent
    quotaBytes:    5_242_880, // 5MB typical limit
  };

  /** @type {LocalStorageAdapterOptions} */
  #options = {};

  /** @type {Storage} - window.localStorage or in-memory fallback */
  #storage = null;

  /**
   * @param {LocalStorageAdapterOptions} [options]
   */
  constructor(options = {}) {
    super();
    this.#options = {
      prefix:          'app:',
      maxSizeBytes:    4_194_304,
      compress:        false,
      fallbackToMemory: true,
      ...options,
    };
  }

  /**
   * Detect localStorage availability (private browsing may block it).
   * Falls back to in-memory Map if unavailable and fallbackToMemory is true.
   * @returns {Promise<void>}
   */
  async init() {}

  /** @returns {Promise<StorageEntry|null>} */
  async get(key) {}

  /** @returns {Promise<StorageEntry>} */
  async set(key, value, options = {}) {}

  /** @returns {Promise<void>} */
  async delete(key) {}

  /** @returns {Promise<string[]>} */
  async keys(prefix = '') {}

  /** @returns {Promise<number>} */
  async count(prefix = '') {}

  /** @returns {Promise<void>} */
  async clear(prefix = '') {}

  /**
   * Compute the total bytes used by all entries under this adapter's prefix.
   * Uses Blob for accurate UTF-16 byte counting.
   * @returns {Promise<number>}
   */
  async getUsageBytes() {}

  /**
   * Subscribe to changes from other browser tabs via StorageEvent.
   * @param {function(key: string, newValue: *, oldValue: *): void} handler
   * @returns {function} unsubscribe
   */
  onExternalChange(handler) {}

  /**
   * Build the full storage key including prefix.
   * @param {string} key
   * @returns {string}
   */
  #buildKey(key) {
    return `${this.#options.prefix}${key}`;
  }

  /**
   * Wrap a value in the StorageEntry envelope and serialize it.
   * @param {*}          value
   * @param {SetOptions} options
   * @returns {string}
   */
  #serialize(value, options) {}

  /**
   * Deserialize a raw storage string into a StorageEntry.
   * Returns null if JSON is malformed.
   * @param {string} raw
   * @returns {StorageEntry|null}
   */
  #deserialize(raw) {}
}
```

### Stored Envelope Format

```js
// Every value written to localStorage is wrapped in this envelope.
// The envelope is what gets JSON.stringified.
{
  v:  1,                     // envelope schema version (for future format changes)
  d:  <the actual value>,    // 'd' for data (shorter key = less storage)
  ca: 1710234000000,         // createdAt
  ua: 1710234000000,         // updatedAt
  ex: 1710234300000,         // expiresAt (null if no TTL)
  sv: 2,                     // slice schema version (from SetOptions.version)
  m:  {}                     // meta
}
```

---

## 3.3 — SessionStorage Adapter

### Responsibility
Tab-scoped ephemeral storage. Data does not survive tab close. Identical API to LocalStorageAdapter — shares the same implementation with `window.sessionStorage` swapped in.

```js
class SessionStorageAdapter extends LocalStorageAdapter {
  name = 'sessionstorage';

  capabilities = {
    queryable:     false,
    transactional: false,
    streaming:     false,
    persistent:    false,  // does NOT survive tab close
    crossTab:      false,  // tab-scoped only
    quotaBytes:    5_242_880,
  };

  constructor(options = {}) {
    super({
      prefix: 'sess:',
      ...options,
    });
    // Override the storage backend to sessionStorage
    this._storageBackend = window.sessionStorage;
  }
}
```

### When to Use SessionStorage

| Use case | Adapter |
|---|---|
| User preferences | localStorage |
| Auth token (short-lived) | sessionStorage / memory |
| Multi-step form draft | sessionStorage |
| Entity collections | indexedDB |
| Sensitive PII | memory (+ encryption if disk needed) |
| Shared across tabs | localStorage / indexedDB |

---

## 3.4 — In-Memory Adapter

### Responsibility
A fully volatile, zero-persistence adapter backed by a `Map`. The fastest possible read/write. Used for sensitive data that must never reach disk, for unit testing (no environment setup required), and as a fallback when all other adapters are unavailable.

```js
/**
 * @typedef {Object} MemoryAdapterOptions
 * @property {number}  [maxEntries]    - Evict LRU entries when exceeded (default: Infinity)
 * @property {boolean} [cloneOnRead]   - Deep-clone values on get to prevent external mutation
 * @property {boolean} [cloneOnWrite]  - Deep-clone values on set (default: true)
 */
```

```js
class InMemoryAdapter extends StorageAdapter {
  name = 'memory';

  capabilities = {
    queryable:     true,
    transactional: true,
    streaming:     false,
    persistent:    false,
    crossTab:      false,
  };

  /** @type {Map<string, StorageEntry>} */
  #store = new Map();

  /** @type {string[]} - LRU eviction order (oldest first) */
  #lruQueue = [];

  /** @type {MemoryAdapterOptions} */
  #options = {};

  /**
   * @param {MemoryAdapterOptions} [options]
   */
  constructor(options = {}) {
    super();
    this.#options = {
      maxEntries:  Infinity,
      cloneOnRead:  true,
      cloneOnWrite: true,
      ...options,
    };
  }

  /** @returns {Promise<StorageEntry|null>} */
  async get(key) {}

  /** @returns {Promise<StorageEntry>} */
  async set(key, value, options = {}) {}

  /** @returns {Promise<void>} */
  async delete(key) {}

  /**
   * Query by prefix and/or where clause.
   * Performs a full in-memory scan (acceptable given small data sets).
   * @returns {Promise<StorageEntry[]>}
   */
  async query(options = {}) {}

  /** @returns {Promise<string[]>} */
  async keys(prefix = '') {}

  /** @returns {Promise<void>} */
  async clear(prefix = '') {}

  /**
   * Approximate byte count by serializing all entries to JSON.
   * @returns {Promise<number>}
   */
  async getUsageBytes() {}

  /**
   * Synchronous snapshot — useful for testing assertions.
   * @returns {Object.<string, *>}
   */
  snapshot() {
    return Object.fromEntries(
      [...this.#store.entries()].map(([k, e]) => [k, e.value])
    );
  }

  /**
   * Restore from a snapshot (testing / hydration).
   * @param {Object.<string, *>} snap
   */
  restore(snap) {}

  /** Evict oldest entry when maxEntries exceeded. */
  #evictLRU() {}
}
```

---

## 3.5 — Remote API Adapter

### Responsibility
Wraps remote HTTP endpoints behind the same `StorageAdapter` interface. CRUD operations are mapped to REST verbs. The application code treats a remote resource identically to a local one — the adapter handles the HTTP mechanics.

```js
/**
 * @typedef {Object} RemoteAdapterEndpoints
 * @property {string|function(key: string): string} get     - GET endpoint
 * @property {string|function(key: string): string} set     - POST/PUT endpoint
 * @property {string|function(key: string): string} delete  - DELETE endpoint
 * @property {string|function(options: QueryOptions): string} query - GET list endpoint
 */

/**
 * @typedef {Object} RemoteAdapterOptions
 * @property {RemoteAdapterEndpoints} endpoints
 * @property {'rest'|'graphql'}       [protocol]      - Default: 'rest'
 * @property {function(raw: *): StorageEntry} [deserialize]  - Transform API response
 * @property {function(entry: *): *}  [serialize]     - Transform value before send
 * @property {string}                 [idField]        - Field name for key (default: 'id')
 * @property {Object}                 [defaultHeaders] - Merged into every request
 * @property {number}                 [timeout]        - Request timeout ms (default: 10000)
 */
```

```js
class RemoteAPIAdapter extends StorageAdapter {
  name = 'remote';

  capabilities = {
    queryable:     true,
    transactional: false,
    streaming:     false,
    persistent:    true,
    crossTab:      true,
  };

  /** @type {RemoteAdapterOptions} */
  #options = null;

  /** @type {HTTPClient} - Injected from Module 4 */
  #http = null;

  /**
   * @param {RemoteAdapterOptions} options
   * @param {HTTPClient}           httpClient  - Injected HTTP Request Manager (Module 4)
   */
  constructor(options, httpClient) {
    super();
    this.#options = options;
    this.#http    = httpClient;
  }

  /**
   * Maps to: GET /endpoint/:key
   * @returns {Promise<StorageEntry|null>}
   */
  async get(key) {}

  /**
   * Maps to: POST /endpoint (create) or PUT /endpoint/:key (update)
   * Detects create vs update via prior has() check or meta flag.
   * @returns {Promise<StorageEntry>}
   */
  async set(key, value, options = {}) {}

  /**
   * Maps to: DELETE /endpoint/:key
   * @returns {Promise<void>}
   */
  async delete(key) {}

  /**
   * Maps to: GET /endpoint?param=value&...
   * Translates QueryOptions to URL query parameters.
   * @returns {Promise<StorageEntry[]>}
   */
  async query(options = {}) {}

  /**
   * Translate a QueryOptions object to URL query string params.
   * @param {QueryOptions} options
   * @returns {string}  e.g. '?status=active&_limit=50&_offset=0'
   */
  #buildQueryString(options) {}

  /**
   * Resolve an endpoint pattern (string or function) to a URL.
   * @param {'get'|'set'|'delete'|'query'} operation
   * @param {string} [key]
   * @returns {string}
   */
  #resolveEndpoint(operation, key) {}

  /**
   * Wrap an API response body into a StorageEntry.
   * @param {*}      raw
   * @param {string} key
   * @returns {StorageEntry}
   */
  #toEntry(raw, key) {}
}
```

### REST Verb Mapping

| Operation | HTTP method | URL pattern | Body |
|---|---|---|---|
| `get(key)` | `GET` | `/resource/:key` | — |
| `set(key, value)` ← new | `POST` | `/resource` | value |
| `set(key, value)` ← existing | `PUT` | `/resource/:key` | value |
| `delete(key)` | `DELETE` | `/resource/:key` | — |
| `query({ where })` | `GET` | `/resource?field=val` | — |
| `clear()` | `DELETE` | `/resource` | — |

---

## 3.6 — Cache API Adapter

### Responsibility
Wraps the browser's Service Worker `Cache API` for offline-first storage of responses, assets, and pre-fetched data. Unlike other adapters, the Cache API stores `Request`/`Response` pairs natively — this adapter normalizes those into `StorageEntry` objects.

```js
/**
 * @typedef {Object} CacheAdapterOptions
 * @property {string}   cacheName        - Name of the Cache API bucket e.g. 'myapp-v1'
 * @property {boolean}  [cloneResponse]  - Clone responses before caching (default: true)
 * @property {function(url: string): boolean} [shouldCache] - Filter which URLs to store
 */
```

```js
class CacheAPIAdapter extends StorageAdapter {
  name = 'cacheapi';

  capabilities = {
    queryable:     false,
    transactional: false,
    streaming:     true,
    persistent:    true,
    crossTab:      true,
  };

  /** @type {CacheAdapterOptions} */
  #options = null;

  /** @type {Cache|null} */
  #cache = null;

  /**
   * @param {CacheAdapterOptions} options
   */
  constructor(options) {
    super();
    this.#options = options;
  }

  /**
   * Open the named cache bucket.
   * Throws if Cache API is unavailable (non-HTTPS, no service worker).
   * @returns {Promise<void>}
   */
  async init() {
    if (!('caches' in globalThis)) throw new Error('Cache API not available');
    this.#cache = await caches.open(this.#options.cacheName);
  }

  /**
   * The key is treated as a URL string.
   * @param {string} key  - URL or URL-like key
   * @returns {Promise<StorageEntry|null>}
   */
  async get(key) {}

  /**
   * Store a Response or plain value under a URL key.
   * Plain values are serialized to a synthetic Response.
   *
   * @param {string}          key
   * @param {Response|*}      value
   * @param {SetOptions}      [options]
   * @returns {Promise<StorageEntry>}
   */
  async set(key, value, options = {}) {}

  /** @returns {Promise<void>} */
  async delete(key) {}

  /** @returns {Promise<string[]>} */
  async keys(prefix = '') {}

  /**
   * Delete all entries in this cache bucket, or a named bucket.
   * @param {string} [cacheName]  - If provided, deletes entire bucket
   * @returns {Promise<void>}
   */
  async clear(prefix = '') {}

  /**
   * Get estimated usage from StorageManager.estimate().
   * @returns {Promise<number>}
   */
  async getUsageBytes() {}
}
```

---

## 3.7 — Storage Router

### Responsibility
The single entry point for all storage operations. Routes each operation to the correct adapter based on the key's namespace prefix. Applies the middleware stack (encryption, TTL, schema validation) transparently around every operation.

```js
/**
 * @typedef {Object} RouteRule
 * @property {string|RegExp}  pattern      - Key pattern to match e.g. 'users:*' or /^cache:/
 * @property {string}         adapter      - Adapter name to route to
 * @property {boolean}        [encrypt]    - Force encryption on this namespace (default: false)
 * @property {number}         [ttl]        - Default TTL in ms for this namespace
 * @property {string}         [schema]     - Schema ID to validate against before writes
 * @property {number}         [priority]   - Match priority (lower = checked first, default: 100)
 */

/**
 * @typedef {Object} StorageManagerOptions
 * @property {RouteRule[]}    routes            - Ordered routing rules
 * @property {string}         [defaultAdapter]  - Fallback adapter if no rule matches
 * @property {boolean}        [validateOnRead]  - Re-validate on reads (default: false)
 * @property {boolean}        [logOperations]   - Log all ops to Logger (default: false in prod)
 */
```

```js
class StorageRouter {
  /** @type {Map<string, StorageAdapter>} */
  #adapters = new Map();

  /** @type {RouteRule[]} */
  #rules = [];

  /** @type {string} */
  #defaultAdapter = 'memory';

  /** @type {SchemaValidator} */
  #validator = null;

  /** @type {EncryptionLayer} */
  #encryption = null;

  /** @type {TTLManager} */
  #ttlManager = null;

  /**
   * Register an adapter by name.
   * @param {string}         name
   * @param {StorageAdapter} adapter
   */
  registerAdapter(name, adapter) {}

  /**
   * Define routing rules. Rules are evaluated in priority order.
   * @param {RouteRule[]} rules
   */
  registerRoutes(rules) {}

  /**
   * Resolve which adapter handles a given key.
   * Returns the default adapter if no rule matches.
   * @param {string} key
   * @returns {{ adapter: StorageAdapter, rule: RouteRule|null }}
   */
  resolve(key) {}

  /**
   * Unified get — routes to correct adapter, checks TTL, decrypts.
   * @param {string} key
   * @returns {Promise<StorageEntry|null>}
   */
  async get(key) {}

  /**
   * Unified set — validates schema, encrypts, writes TTL envelope, routes.
   * @param {string}     key
   * @param {*}          value
   * @param {SetOptions} [options]
   * @returns {Promise<StorageEntry>}
   */
  async set(key, value, options = {}) {}

  /**
   * Unified delete.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {}

  /**
   * Unified query — routes to adapter, filters expired entries.
   * @param {QueryOptions & { adapter?: string }} options
   * @returns {Promise<StorageEntry[]>}
   */
  async query(options = {}) {}

  /**
   * Unified keys.
   * @param {string} [prefix]
   * @param {string} [adapterName]  - Scope to one adapter (default: all)
   * @returns {Promise<string[]>}
   */
  async keys(prefix = '', adapterName = null) {}

  /**
   * Clear all data in all adapters (or scoped to prefix).
   * @param {string} [prefix]
   * @returns {Promise<void>}
   */
  async clear(prefix = '') {}

  /**
   * Initialize all registered adapters concurrently.
   * @returns {Promise<void>}
   */
  async initAll() {}

  /**
   * Close all adapters gracefully.
   * @returns {Promise<void>}
   */
  async closeAll() {}
}
```

### Routing Configuration Example

```js
const storageRouter = new StorageRouter();

// Register adapters
storageRouter.registerAdapter('indexeddb',    idbAdapter);
storageRouter.registerAdapter('localstorage', localStorageAdapter);
storageRouter.registerAdapter('session',      sessionStorageAdapter);
storageRouter.registerAdapter('memory',       memoryAdapter);
storageRouter.registerAdapter('remote',       remoteAdapter);
storageRouter.registerAdapter('cache',        cacheAdapter);

// Declare routing rules (lower priority = checked first)
storageRouter.registerRoutes([
  { pattern: 'auth:token',    adapter: 'memory',       priority: 1  },  // never touch disk
  { pattern: 'auth:*',        adapter: 'session',      priority: 5  },  // session-scoped
  { pattern: 'cache:*',       adapter: 'cache',        priority: 10 },  // SW cache
  { pattern: 'users:*',       adapter: 'indexeddb',    encrypt: false, schema: 'User',     priority: 20 },
  { pattern: 'orders:*',      adapter: 'indexeddb',    schema: 'Order',    priority: 20 },
  { pattern: 'prefs:*',       adapter: 'localstorage', ttl: 30 * 24 * 60 * 60 * 1000,     priority: 30 },
  { pattern: 'secure:*',      adapter: 'localstorage', encrypt: true,      priority: 30 },
  { pattern: 'remote:*',      adapter: 'remote',       priority: 50 },
  { pattern: /.*/,            adapter: 'localstorage', priority: 999 },  // catch-all
]);
```

### Request Flow Through the Router

```
storageRouter.set('users:42', userObject)
        │
        ├── resolve('users:42')
        │     → rule: { adapter: 'indexeddb', schema: 'User' }
        │
        ├── SchemaValidator.validate('User', userObject)
        │     → throws StorageValidationError on failure
        │
        ├── TTLManager.applyTTL(userObject, rule.ttl ?? options.ttl)
        │     → wraps in TTL envelope if TTL set
        │
        ├── rule.encrypt?
        │     → EncryptionLayer.encrypt(userObject)
        │
        └── indexeddbAdapter.set('users:42', processed, options)
                → StorageEntry written


storageRouter.get('users:42')
        │
        ├── resolve('users:42') → indexeddbAdapter
        ├── indexeddbAdapter.get('users:42') → raw StorageEntry
        │
        ├── TTLManager.isExpired(entry)?
        │     → Yes: delete('users:42'), return null
        │     → No:  continue
        │
        ├── entry.encrypted?
        │     → EncryptionLayer.decrypt(entry.value)
        │
        └── return StorageEntry
```

---

## 3.8 — Schema Validator

### Responsibility
Validates values before writes using registered schemas. Prevents structurally invalid data from ever reaching storage. Schemas are registered by name and referenced in routing rules or set options.

```js
/**
 * @typedef {Object} SchemaDefinition
 * @property {string}   id               - Unique schema name e.g. 'User'
 * @property {number}   [version]        - Schema version for migration tracking
 * @property {function(value: *): ValidationResult} validate - Validation function
 * @property {Object}   [jsonSchema]     - Optional JSON Schema object for auto-validation
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  valid
 * @property {string[]} [errors]   - Human-readable error messages
 */
```

```js
class SchemaValidator {
  /** @type {Map<string, SchemaDefinition>} */
  #schemas = new Map();

  /**
   * Register a schema.
   * @param {SchemaDefinition} definition
   */
  register(definition) {}

  /**
   * Register multiple schemas.
   * @param {SchemaDefinition[]} definitions
   */
  registerBatch(definitions) {}

  /**
   * Validate a value against a named schema.
   * Throws StorageValidationError if invalid.
   *
   * @param {string} schemaId
   * @param {*}      value
   * @returns {ValidationResult}
   * @throws {StorageValidationError}
   */
  validate(schemaId, value) {}

  /**
   * Validate without throwing.
   * @param {string} schemaId
   * @param {*}      value
   * @returns {ValidationResult}
   */
  check(schemaId, value) {}

  /**
   * Returns true if a schema is registered.
   * @param {string} schemaId
   * @returns {boolean}
   */
  has(schemaId) {}
}
```

### Schema Definition Examples

```js
validator.registerBatch([
  {
    id:      'User',
    version: 2,
    validate(value) {
      const errors = [];
      if (typeof value?.id     !== 'string') errors.push('id must be a string');
      if (typeof value?.email  !== 'string') errors.push('email must be a string');
      if (!value?.email?.includes('@'))      errors.push('email must be valid');
      if (typeof value?.name   !== 'string') errors.push('name must be a string');
      return { valid: errors.length === 0, errors };
    },
  },
  {
    id:      'Order',
    version: 1,
    validate(value) {
      const errors = [];
      if (!value?.id)                    errors.push('id required');
      if (!Array.isArray(value?.items))  errors.push('items must be array');
      if (typeof value?.total !== 'number') errors.push('total must be number');
      return { valid: errors.length === 0, errors };
    },
  },
]);
```

---

## 3.9 — Encryption Layer

### Responsibility
Transparently encrypts values before writes and decrypts after reads using AES-GCM via the browser's native `SubtleCrypto` API. Keys are derived from a master secret using PBKDF2. Sensitive data never reaches any storage adapter in plaintext.

```js
/**
 * @typedef {Object} EncryptionOptions
 * @property {string}  algorithm     - 'AES-GCM' (only supported value currently)
 * @property {number}  keyLength     - 128 or 256 bits (default: 256)
 * @property {number}  iterations    - PBKDF2 iterations (default: 100000)
 * @property {string}  [saltKey]     - Key under which the salt is stored in sessionStorage
 */

/**
 * @typedef {Object} EncryptedEnvelope
 * @property {true}   encrypted
 * @property {string} ciphertext    - Base64-encoded encrypted payload
 * @property {string} iv            - Base64-encoded initialization vector
 * @property {string} salt          - Base64-encoded PBKDF2 salt
 * @property {string} algorithm     - 'AES-GCM'
 * @property {number} keyLength
 */
```

```js
class EncryptionLayer {
  /** @type {CryptoKey|null} */
  #key = null;

  /** @type {EncryptionOptions} */
  #options = {};

  /**
   * @param {EncryptionOptions} [options]
   */
  constructor(options = {}) {
    this.#options = {
      algorithm:  'AES-GCM',
      keyLength:  256,
      iterations: 100_000,
      saltKey:    'enc:salt',
      ...options,
    };
  }

  /**
   * Derive or import the CryptoKey from a master secret.
   * The secret is typically the user's session token or a server-provided key.
   * Never stored — lives only in memory.
   *
   * @param {string} masterSecret
   * @returns {Promise<void>}
   */
  async init(masterSecret) {}

  /**
   * Encrypt a value. Serializes to JSON first, then encrypts bytes.
   * Returns an EncryptedEnvelope — a plain object safe to pass to any adapter.
   *
   * @param {*} value
   * @returns {Promise<EncryptedEnvelope>}
   */
  async encrypt(value) {}

  /**
   * Decrypt an EncryptedEnvelope back to the original value.
   * Returns null if decryption fails (wrong key, corrupted data).
   *
   * @param {EncryptedEnvelope} envelope
   * @returns {Promise<*|null>}
   */
  async decrypt(envelope) {}

  /**
   * Returns true if the given object looks like an EncryptedEnvelope.
   * Used by Storage Router to decide if decryption is needed on read.
   * @param {*} value
   * @returns {boolean}
   */
  isEncrypted(value) {
    return value !== null
      && typeof value === 'object'
      && value.encrypted === true
      && typeof value.ciphertext === 'string';
  }

  /**
   * Rotate the encryption key.
   * Re-encrypts all entries in targeted namespaces with the new key.
   *
   * @param {string}   newMasterSecret
   * @param {string[]} keyPrefixes     - Which namespaces to re-encrypt
   * @returns {Promise<{ rotated: number, failed: number }>}
   */
  async rotateKey(newMasterSecret, keyPrefixes) {}

  /**
   * Derive a CryptoKey from a password + salt using PBKDF2.
   * @param {string}     password
   * @param {Uint8Array} salt
   * @returns {Promise<CryptoKey>}
   */
  async #deriveKey(password, salt) {}
}
```

### Encryption Flow

```
EncryptionLayer.encrypt(value)
        │
        ├── JSON.stringify(value) → plaintext string
        ├── TextEncoder → Uint8Array bytes
        ├── crypto.getRandomValues(12 bytes) → IV
        │
        ├── crypto.subtle.encrypt({
        │     name: 'AES-GCM',
        │     iv:   iv
        │   }, #key, bytes)
        │   → ciphertext ArrayBuffer
        │
        └── return {
              encrypted:  true,
              ciphertext: btoa(ciphertext),
              iv:         btoa(iv),
              algorithm:  'AES-GCM',
              keyLength:  256
            }
```

---

## 3.10 — TTL / Expiry Manager

### Responsibility
Attaches time-based expiry metadata to stored entries. Performs lazy eviction on read (expired entries are deleted when first accessed). Optionally runs proactive background sweeps.

```js
/**
 * @typedef {Object} TTLEnvelope
 * @property {*}      data         - The actual stored value
 * @property {number} expiresAt    - Unix ms timestamp (null = never)
 * @property {number} createdAt
 * @property {number} updatedAt
 */
```

```js
class TTLManager {
  /** @type {Map<string, ReturnType<typeof setInterval>>} */
  #sweepIntervals = new Map();

  /**
   * Wrap a value in a TTL envelope.
   * @param {*}      value
   * @param {number} [ttl]   - Milliseconds. If omitted, expiresAt is null.
   * @returns {TTLEnvelope}
   */
  wrap(value, ttl) {}

  /**
   * Unwrap a TTL envelope.
   * Returns null if expired. Returns the raw value if no envelope found
   * (backwards compat with un-wrapped data).
   *
   * @param {TTLEnvelope|*} envelope
   * @returns {* | null}
   */
  unwrap(envelope) {}

  /**
   * Test if a TTL envelope is expired.
   * @param {TTLEnvelope} envelope
   * @returns {boolean}
   */
  isExpired(envelope) {
    if (!envelope?.expiresAt) return false;
    return Date.now() > envelope.expiresAt;
  }

  /**
   * Return remaining TTL in ms. Returns Infinity if no expiry. Returns 0 if expired.
   * @param {number} envelope
   * @returns {number}
   */
  remainingTTL(envelope) {}

  /**
   * Start a background sweep that deletes expired entries for a
   * given adapter and key prefix.
   *
   * @param {string}         sweepId       - Unique identifier for this sweep job
   * @param {StorageAdapter} adapter
   * @param {string}         [prefix]
   * @param {number}         [intervalMs]  - How often to sweep (default: 60000)
   * @returns {function} stop - Call to cancel the sweep
   */
  startSweep(sweepId, adapter, prefix = '', intervalMs = 60_000) {}

  /**
   * Stop a named sweep.
   * @param {string} sweepId
   */
  stopSweep(sweepId) {}

  /**
   * Manually run one sweep pass against an adapter.
   * @param {StorageAdapter} adapter
   * @param {string}         [prefix]
   * @returns {Promise<{ scanned: number, evicted: number }>}
   */
  async sweep(adapter, prefix = '') {}
}
```

---

## 3.11 — Storage Quota Monitor

### Responsibility
Tracks per-adapter storage usage, warns before quota limits are hit, and evicts Least Recently Used entries to free space. Prevents `QuotaExceededError` crashes.

```js
/**
 * @typedef {Object} QuotaConfig
 * @property {number}  warnThreshold   - 0–1 fraction of quota at which to warn (default: 0.8)
 * @property {number}  evictThreshold  - 0–1 fraction at which to start eviction (default: 0.9)
 * @property {string}  [evictPrefix]   - Only evict keys matching this prefix
 * @property {number}  [evictTarget]   - 0–1 fraction to evict down to (default: 0.7)
 */
```

```js
class StorageQuotaMonitor {
  /** @type {Map<string, QuotaConfig>} */
  #configs = new Map();

  /** @type {Map<string, number[]>} - adapterName → LRU access timestamps per key */
  #lruTracker = new Map();

  /**
   * Configure quota monitoring for a named adapter.
   * @param {string}      adapterName
   * @param {QuotaConfig} config
   */
  configure(adapterName, config) {}

  /**
   * Check usage for a named adapter and take action if needed.
   * Called automatically after every write by the Storage Router.
   *
   * @param {string}         adapterName
   * @param {StorageAdapter} adapter
   * @returns {Promise<QuotaReport>}
   */
  async check(adapterName, adapter) {}

  /**
   * Record a key access for LRU tracking.
   * @param {string} adapterName
   * @param {string} key
   */
  recordAccess(adapterName, key) {}

  /**
   * Evict the N least recently used entries from an adapter.
   * @param {string}         adapterName
   * @param {StorageAdapter} adapter
   * @param {number}         targetBytes  - Bytes to free
   * @returns {Promise<{ evicted: number, freedBytes: number }>}
   */
  async evictLRU(adapterName, adapter, targetBytes) {}

  /**
   * Get a usage snapshot for all monitored adapters.
   * @returns {Promise<Object.<string, QuotaReport>>}
   */
  async getReport() {}
}

/**
 * @typedef {Object} QuotaReport
 * @property {number}  usedBytes
 * @property {number}  quotaBytes
 * @property {number}  usedFraction    - 0–1
 * @property {'ok'|'warn'|'critical'} status
 * @property {number}  evictedCount    - Entries evicted in last check
 */
```

---

## 3.12 — Migration Engine

### Responsibility
Runs versioned, ordered migration scripts when the schema version stored in an adapter does not match the current application version. Ensures data written by an old version of the app is transformed into the shape the current version expects — before any application code reads it.

```js
/**
 * @typedef {Object} Migration
 * @property {number}   version       - Target schema version this migration produces
 * @property {string}   [description] - Human-readable e.g. 'Add user.role field'
 * @property {string[]} [adapters]    - Which adapters to run against (default: all)
 * @property {string}   [prefix]      - Key prefix to scope migration to e.g. 'users:'
 * @property {function(entry: StorageEntry, adapter: StorageAdapter): Promise<StorageEntry|null>} up
 *           Transform an entry to the new version.
 *           Return null to delete the entry.
 * @property {function(entry: StorageEntry, adapter: StorageAdapter): Promise<StorageEntry|null>} [down]
 *           Reverse the migration. Optional — for rollback support.
 */

/**
 * @typedef {Object} MigrationManifest
 * @property {string}      adapterName
 * @property {number}      currentVersion   - Version stored in adapter metadata
 * @property {number}      targetVersion    - Application's expected version
 * @property {Migration[]} pending          - Migrations yet to run
 */
```

```js
class MigrationEngine {
  /** @type {Migration[]} */
  #migrations = [];

  /** @type {string} - Key used to store schema version in each adapter */
  #versionKey = '__schema_version__';

  /**
   * Register a migration.
   * Migrations are sorted by version number automatically.
   * @param {Migration} migration
   */
  register(migration) {}

  /**
   * Register multiple migrations.
   * @param {Migration[]} migrations
   */
  registerBatch(migrations) {}

  /**
   * Check if any migrations are needed for a given adapter.
   * @param {StorageAdapter} adapter
   * @param {string}         adapterName
   * @param {number}         targetVersion
   * @returns {Promise<MigrationManifest>}
   */
  async getManifest(adapter, adapterName, targetVersion) {}

  /**
   * Run all pending migrations for an adapter.
   * Runs inside a transaction if the adapter supports it.
   * Writes new schema version to adapter metadata on success.
   * Rolls back and throws on failure.
   *
   * @param {StorageAdapter} adapter
   * @param {string}         adapterName
   * @param {number}         targetVersion
   * @returns {Promise<MigrationResult>}
   */
  async migrate(adapter, adapterName, targetVersion) {}

  /**
   * Roll back to a target version by running .down() migrations in reverse.
   * @param {StorageAdapter} adapter
   * @param {string}         adapterName
   * @param {number}         targetVersion
   * @returns {Promise<MigrationResult>}
   */
  async rollback(adapter, adapterName, targetVersion) {}

  /**
   * Read the current schema version stored in an adapter.
   * Returns 0 if never migrated.
   * @param {StorageAdapter} adapter
   * @returns {Promise<number>}
   */
  async getStoredVersion(adapter) {}

  /**
   * Manually set the schema version (e.g. after manual data repair).
   * @param {StorageAdapter} adapter
   * @param {number}         version
   * @returns {Promise<void>}
   */
  async setStoredVersion(adapter, version) {}
}

/**
 * @typedef {Object} MigrationResult
 * @property {boolean}  success
 * @property {number}   fromVersion
 * @property {number}   toVersion
 * @property {number}   entriesMigrated
 * @property {number}   entriesDeleted
 * @property {number}   durationMs
 * @property {Error[]}  [errors]
 */
```

### Migration Registration Example

```js
migrationEngine.registerBatch([
  {
    version:     1,
    description: 'Initial schema — no-op',
    up:          async (entry) => entry,
  },
  {
    version:     2,
    description: 'Rename user.fullName to user.name',
    prefix:      'users:',
    adapters:    ['indexeddb'],
    async up(entry) {
      if (entry.value.fullName !== undefined) {
        return {
          ...entry,
          value: {
            ...entry.value,
            name:     entry.value.fullName,
            fullName: undefined,
          },
        };
      }
      return entry;
    },
    async down(entry) {
      if (entry.value.name !== undefined) {
        return {
          ...entry,
          value: {
            ...entry.value,
            fullName: entry.value.name,
            name:     undefined,
          },
        };
      }
      return entry;
    },
  },
  {
    version:     3,
    description: 'Delete all cached product entries (shape changed)',
    prefix:      'products:',
    async up() {
      return null;   // returning null deletes the entry
    },
  },
]);
```

---

## Wiring: Full Bootstrap Sequence

```js
// storage/index.js — assembled at boot by the DI Container

import StorageRouter         from './StorageRouter.js';
import IndexedDBAdapter      from './adapters/IndexedDBAdapter.js';
import LocalStorageAdapter   from './adapters/LocalStorageAdapter.js';
import SessionStorageAdapter from './adapters/SessionStorageAdapter.js';
import InMemoryAdapter       from './adapters/InMemoryAdapter.js';
import RemoteAPIAdapter      from './adapters/RemoteAPIAdapter.js';
import CacheAPIAdapter       from './adapters/CacheAPIAdapter.js';
import SchemaValidator       from './SchemaValidator.js';
import EncryptionLayer       from './EncryptionLayer.js';
import TTLManager            from './TTLManager.js';
import StorageQuotaMonitor   from './StorageQuotaMonitor.js';
import MigrationEngine       from './MigrationEngine.js';

const APP_SCHEMA_VERSION = 3;

// ── 1. Instantiate adapters ─────────────────────────────────────────────
const idbAdapter      = new IndexedDBAdapter({ dbName: 'myapp', version: APP_SCHEMA_VERSION, stores: [...] });
const lsAdapter       = new LocalStorageAdapter({ prefix: 'app:' });
const ssAdapter       = new SessionStorageAdapter({ prefix: 'sess:' });
const memAdapter      = new InMemoryAdapter({ maxEntries: 500 });
const remoteAdapter   = new RemoteAPIAdapter({ endpoints: { ... } }, httpClient);
const cacheAdapter    = new CacheAPIAdapter({ cacheName: 'myapp-v1' });

// ── 2. Initialize all adapters ──────────────────────────────────────────
await Promise.all([
  idbAdapter.init(), lsAdapter.init(), ssAdapter.init(),
  memAdapter.init(), remoteAdapter.init(), cacheAdapter.init(),
]);

// ── 3. Run migrations ───────────────────────────────────────────────────
const migrationEngine = new MigrationEngine();
migrationEngine.registerBatch(appMigrations);

await migrationEngine.migrate(idbAdapter, 'indexeddb', APP_SCHEMA_VERSION);
await migrationEngine.migrate(lsAdapter,  'localstorage', APP_SCHEMA_VERSION);

// ── 4. Init encryption with user's session secret ──────────────────────
const encryption = new EncryptionLayer({ keyLength: 256, iterations: 100_000 });
await encryption.init(authService.getSessionSecret());

// ── 5. Register schemas ──────────────────────────────────────────────────
const validator = new SchemaValidator();
validator.registerBatch(appSchemas);

// ── 6. Build router ──────────────────────────────────────────────────────
const ttlManager     = new TTLManager();
const quotaMonitor   = new StorageQuotaMonitor();
const storageRouter  = new StorageRouter({ validator, encryption, ttlManager, quotaMonitor });

storageRouter.registerAdapter('indexeddb',    idbAdapter);
storageRouter.registerAdapter('localstorage', lsAdapter);
storageRouter.registerAdapter('session',      ssAdapter);
storageRouter.registerAdapter('memory',       memAdapter);
storageRouter.registerAdapter('remote',       remoteAdapter);
storageRouter.registerAdapter('cache',        cacheAdapter);
storageRouter.registerRoutes(appStorageRoutes);

// ── 7. Configure quota monitoring ───────────────────────────────────────
quotaMonitor.configure('localstorage', { warnThreshold: 0.75, evictThreshold: 0.90 });
quotaMonitor.configure('indexeddb',    { warnThreshold: 0.80, evictThreshold: 0.95 });

// ── 8. Start TTL sweeps ──────────────────────────────────────────────────
ttlManager.startSweep('ls-sweep',  lsAdapter,  '',        60_000);
ttlManager.startSweep('idb-sweep', idbAdapter, '',       120_000);

// ── 9. Flush on unload ───────────────────────────────────────────────────
window.addEventListener('beforeunload', () => storageRouter.closeAll());

export { storageRouter, validator, encryption, ttlManager, quotaMonitor, migrationEngine };
```

---

## Event Bus Emissions (Module 5 integration)

| Event name | Payload | When |
|---|---|---|
| `storage:set` | `{ key, adapter, bytes }` | Value written |
| `storage:get:miss` | `{ key, adapter }` | Key not found |
| `storage:get:expired` | `{ key, adapter }` | TTL-expired entry evicted on read |
| `storage:delete` | `{ key, adapter }` | Entry deleted |
| `storage:clear` | `{ prefix, adapter }` | Namespace cleared |
| `storage:quota:warn` | `{ adapter, usedFraction }` | Usage crossed warn threshold |
| `storage:quota:evict` | `{ adapter, evicted, freedBytes }` | LRU eviction ran |
| `storage:validation:failed` | `{ key, schemaId, errors }` | Schema validation rejected write |
| `storage:migration:start` | `{ adapter, from, to }` | Migration sequence begins |
| `storage:migration:complete` | `{ adapter, result }` | Migration succeeded |
| `storage:migration:failed` | `{ adapter, error }` | Migration threw |
| `storage:encryption:error` | `{ key, operation }` | Encrypt/decrypt failed |

---