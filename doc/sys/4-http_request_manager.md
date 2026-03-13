# Module 4 — 🌐 HTTP Request Manager

> **Core Principle:** No application code ever calls `fetch` directly. Every outbound request is constructed, validated, intercepted, and observed through this module. The network is a detail — the HTTP Client is the contract.

---

## Architecture Overview

```
Application Code
      │
      │  httpClient.get('/users/42')
      ▼
┌──────────────────────────────────────────────────┐
│                 Request Builder                   │
│   Fluent API → normalized RequestConfig object   │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│              Request Deduplicator                 │
│   Identical in-flight request? → return same     │
│   Promise instead of making a second call        │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│                 Cache Layer                       │
│   Cache hit? → return immediately, skip network  │
└─────────────────────┬────────────────────────────┘
                      │ cache miss
                      ▼
┌──────────────────────────────────────────────────┐
│              Rate Limiter                         │
│   Over limit? → enqueue in Request Queue         │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│           Interceptor Chain (Request)             │
│   Auth → Logging → Timeout → Custom...           │
└─────────────────────┬────────────────────────────┘
                      │ final Request object
                      ▼
              ┌───────────────┐
              │  Mock Adapter │ ← dev/test: intercepts here
              │  (if active)  │
              └───────┬───────┘
                      │ (passthrough in production)
                      ▼
              ┌───────────────┐
              │  fetch() API  │
              └───────┬───────┘
                      │
              ┌───────┴──────────────┐
              │                      │
           Success               Failure
              │                      │
              ▼                      ▼
     Interceptor Chain         Error Classifier
     (Response side)               │
              │               Retry Manager
              ▼                     │
    Response Normalizer        (retry loop)
              │
     Progress Tracker
     (streaming responses)
              │
              ▼
       Application Code
```

---

## 4.0 — Core Types & Interfaces

```js
/**
 * @typedef {Object} RequestConfig
 * The normalized, fully-resolved description of an HTTP request.
 * Built by RequestBuilder, consumed by every other component.
 *
 * @property {string}                    url          - Absolute URL (base + path resolved)
 * @property {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'HEAD'|'OPTIONS'} method
 * @property {Object.<string,string>}    headers      - Final merged headers
 * @property {*}                         [body]       - Pre-serialized body (string, FormData, Blob…)
 * @property {Object.<string,*>}         [params]     - URL query parameters (merged into url)
 * @property {number}                    [timeout]    - Per-request timeout in ms
 * @property {AbortSignal}               [signal]     - External abort signal
 * @property {RetryPolicy}               [retry]      - Per-request retry override
 * @property {CachePolicy}               [cache]      - Per-request cache override
 * @property {boolean}                   [deduplicate]- Enable deduplication (default: true for GET)
 * @property {boolean}                   [withCredentials] - Send cookies cross-origin
 * @property {'json'|'text'|'blob'|'arrayBuffer'|'formData'|'stream'} [responseType]
 * @property {function(ProgressEvent):void} [onUploadProgress]
 * @property {function(ProgressEvent):void} [onDownloadProgress]
 * @property {string}                    [requestId]  - UUID; auto-generated if omitted
 * @property {Object}                    [meta]       - Arbitrary caller metadata (not sent to server)
 */

/**
 * @typedef {Object} NormalizedResponse
 * The standard response shape returned to all callers regardless of API format.
 *
 * @property {number}                    status       - HTTP status code
 * @property {string}                    statusText
 * @property {boolean}                   ok           - true if status 200-299
 * @property {*}                         data         - Deserialized, normalized response body
 * @property {Object.<string,string>}    headers      - Response headers as plain object
 * @property {RequestConfig}             request      - The config that produced this response
 * @property {number}                    duration     - Round-trip ms
 * @property {string}                    [requestId]
 */

/**
 * @typedef {Object} HttpError
 * @property {string}              message
 * @property {DomainErrorType}     type        - Classified error type
 * @property {number}              [status]    - HTTP status if available
 * @property {NormalizedResponse}  [response]  - Full response if available
 * @property {RequestConfig}       request     - The config that failed
 * @property {boolean}             retryable   - Safe to retry?
 * @property {string}              requestId
 */

/**
 * @typedef {'network'|'timeout'|'abort'|'auth'|'forbidden'|
 *           'not_found'|'validation'|'rate_limit'|'server'|
 *           'unknown'} DomainErrorType
 */

/**
 * @typedef {Object} RetryPolicy
 * @property {number}   attempts       - Max retry attempts (default: 3)
 * @property {number}   baseDelay      - Initial backoff ms (default: 300)
 * @property {number}   maxDelay       - Cap on backoff ms (default: 30000)
 * @property {number}   factor         - Exponential multiplier (default: 2)
 * @property {number}   jitter         - 0–1 random jitter fraction (default: 0.2)
 * @property {string[]} retryOn        - HTTP status codes to retry (default: [429, 502, 503, 504])
 * @property {boolean}  retryOnNetwork - Retry on network failures (default: true)
 * @property {function(error: HttpError, attempt: number): boolean} [shouldRetry]
 *           Custom predicate — overrides retryOn if provided
 */

/**
 * @typedef {Object} CachePolicy
 * @property {boolean} enabled    - Enable caching for this request
 * @property {number}  [ttl]      - Cache TTL in ms
 * @property {string}  [key]      - Custom cache key (default: derived from url + params)
 */
```

---

## 4.1 — HTTP Client

### Responsibility
The central orchestrator. Owns the interceptor chain, wires all sub-components together, and exposes the public API that application code calls. Application code calls `httpClient.get()`, not `fetch()`.

```js
/**
 * @typedef {Object} HTTPClientOptions
 * @property {string}                  baseURL         - Prepended to all relative paths
 * @property {Object.<string,string>}  [defaultHeaders]- Merged into every request
 * @property {number}                  [timeout]       - Global default timeout ms (default: 30000)
 * @property {RetryPolicy}             [retry]         - Global default retry policy
 * @property {boolean}                 [deduplicate]   - Global deduplication toggle (default: true)
 * @property {'json'|'text'}           [responseType]  - Global default (default: 'json')
 * @property {function(url:string, params:Object): string} [paramsSerializer]
 */
```

```js
class HTTPClient {
  /** @type {HTTPClientOptions} */
  #options = {};

  /** @type {InterceptorChain} */
  #interceptors = null;

  /** @type {RequestDeduplicator} */
  #deduplicator = null;

  /** @type {CacheLayer} */
  #cache = null;

  /** @type {RateLimiter} */
  #rateLimiter = null;

  /** @type {RequestQueue} */
  #queue = null;

  /** @type {RetryManager} */
  #retryManager = null;

  /** @type {TimeoutManager} */
  #timeoutManager = null;

  /** @type {ErrorClassifier} */
  #errorClassifier = null;

  /** @type {ResponseNormalizer} */
  #normalizer = null;

  /** @type {MockAdapter|null} */
  #mockAdapter = null;

  /**
   * @param {HTTPClientOptions} options
   */
  constructor(options = {}) {}

  // ── Convenience methods ────────────────────────────────────────────────

  /**
   * @param {string}        path
   * @param {RequestConfig} [config]
   * @returns {Promise<NormalizedResponse>}
   */
  get(path, config = {}) {
    return this.request({ ...config, method: 'GET', url: path });
  }

  /** @returns {Promise<NormalizedResponse>} */
  post(path, body, config = {}) {
    return this.request({ ...config, method: 'POST', url: path, body });
  }

  /** @returns {Promise<NormalizedResponse>} */
  put(path, body, config = {}) {
    return this.request({ ...config, method: 'PUT', url: path, body });
  }

  /** @returns {Promise<NormalizedResponse>} */
  patch(path, body, config = {}) {
    return this.request({ ...config, method: 'PATCH', url: path, body });
  }

  /** @returns {Promise<NormalizedResponse>} */
  delete(path, config = {}) {
    return this.request({ ...config, method: 'DELETE', url: path });
  }

  /** @returns {Promise<NormalizedResponse>} */
  head(path, config = {}) {
    return this.request({ ...config, method: 'HEAD', url: path });
  }

  /**
   * Core dispatch method. All convenience methods call this.
   * Runs the full pipeline: build → deduplicate → cache → rate-limit
   * → intercept → fetch → normalize → return.
   *
   * @param {Partial<RequestConfig>} config
   * @returns {Promise<NormalizedResponse>}
   * @throws {HttpError}
   */
  async request(config) {}

  /**
   * Returns a pre-configured RequestBuilder instance.
   * @returns {RequestBuilder}
   */
  build() {
    return new RequestBuilder(this);
  }

  /**
   * Returns the interceptor chain for external registration.
   * @returns {InterceptorChain}
   */
  get interceptors() {
    return this.#interceptors;
  }

  /**
   * Attach a mock adapter. All requests will be served from it.
   * Pass null to detach.
   * @param {MockAdapter|null} adapter
   */
  useMockAdapter(adapter) {
    this.#mockAdapter = adapter;
  }

  /**
   * Create a child client that inherits this client's config
   * but can override baseURL, headers, or interceptors independently.
   * Useful for multi-tenant or multi-API setups.
   *
   * @param {Partial<HTTPClientOptions>} overrides
   * @returns {HTTPClient}
   */
  fork(overrides = {}) {}

  /**
   * Cancel all in-flight requests (e.g. on user logout).
   */
  abortAll() {}
}
```

### Internal `request()` Pipeline

```
async request(config)
      │
      ├── 1. RequestBuilder.normalize(config, this.#options)
      │         → assigns requestId, merges defaults, resolves URL
      │
      ├── 2. RequestDeduplicator.check(config)
      │         → duplicate in-flight?  return existing Promise
      │
      ├── 3. CacheLayer.get(config)
      │         → cache hit?  return cached NormalizedResponse
      │
      ├── 4. RateLimiter.acquire(config)
      │         → over limit?  enqueue in RequestQueue, await slot
      │
      ├── 5. InterceptorChain.runRequest(config)
      │         → Auth, Logging, custom request interceptors
      │
      ├── 6. MockAdapter.match(config)?
      │         → yes: return mock response (skip fetch)
      │         → no:  continue
      │
      ├── 7. TimeoutManager.wrap(config)
      │         → attach AbortController with deadline
      │
      ├── 8. RetryManager.execute(config, fetchFn)
      │         └── loop:
      │               a. fetch(config.url, fetchOptions)
      │               b. success?  → break loop
      │               c. failure?  → ErrorClassifier.classify(error)
      │                             → shouldRetry?  wait + retry
      │                             → exhausted?    throw HttpError
      │
      ├── 9. ResponseNormalizer.normalize(rawResponse, config)
      │
      ├── 10. InterceptorChain.runResponse(normalizedResponse)
      │          → Logging, custom response interceptors
      │
      ├── 11. CacheLayer.set(config, response)  [if cacheable]
      │
      ├── 12. RequestDeduplicator.resolve(config, response)
      │
      └── 13. return NormalizedResponse
```

---

## 4.2 — Request Builder

### Responsibility
A fluent, chainable builder that constructs a `RequestConfig` object. Prevents ad-hoc config objects scattered across the codebase. The terminal method (`.send()`) dispatches through `HTTPClient.request()`.

```js
class RequestBuilder {
  /** @type {Partial<RequestConfig>} */
  #config = {
    method:  'GET',
    headers: {},
    params:  {},
    meta:    {},
  };

  /** @type {HTTPClient} */
  #client = null;

  /** @param {HTTPClient} client */
  constructor(client) {
    this.#client = client;
  }

  // ── URL & Method ─────────────────────────────────────────────────────

  /** @returns {this} */
  url(path)             { this.#config.url    = path;    return this; }
  /** @returns {this} */
  get(path)             { return this.url(path).method('GET'); }
  /** @returns {this} */
  post(path)            { return this.url(path).method('POST'); }
  /** @returns {this} */
  put(path)             { return this.url(path).method('PUT'); }
  /** @returns {this} */
  patch(path)           { return this.url(path).method('PATCH'); }
  /** @returns {this} */
  delete(path)          { return this.url(path).method('DELETE'); }
  /** @returns {this} */
  method(verb)          { this.#config.method = verb.toUpperCase(); return this; }

  // ── Headers ───────────────────────────────────────────────────────────

  /**
   * Set one or more headers. Merges with existing.
   * @param {string|Object} keyOrMap
   * @param {string}        [value]
   * @returns {this}
   */
  header(keyOrMap, value) {
    if (typeof keyOrMap === 'object') {
      Object.assign(this.#config.headers, keyOrMap);
    } else {
      this.#config.headers[keyOrMap] = value;
    }
    return this;
  }

  /** @returns {this} */
  contentType(type) { return this.header('Content-Type', type); }
  /** @returns {this} */
  accept(type)      { return this.header('Accept', type); }
  /** @returns {this} */
  bearerToken(token){ return this.header('Authorization', `Bearer ${token}`); }

  // ── Query Parameters ─────────────────────────────────────────────────

  /**
   * Merge query parameters. Handles arrays as repeated params.
   * @param {string|Object} keyOrMap
   * @param {*}             [value]
   * @returns {this}
   */
  param(keyOrMap, value) {
    if (typeof keyOrMap === 'object') {
      Object.assign(this.#config.params, keyOrMap);
    } else {
      this.#config.params[keyOrMap] = value;
    }
    return this;
  }

  // ── Body ─────────────────────────────────────────────────────────────

  /**
   * Set the request body. Automatically sets Content-Type.
   * - Object → JSON serialized, Content-Type: application/json
   * - FormData → multipart/form-data (browser sets boundary)
   * - string  → text/plain
   * - Blob/ArrayBuffer → application/octet-stream
   *
   * @param {*} data
   * @returns {this}
   */
  body(data) {}

  /**
   * Shorthand: JSON body.
   * @param {Object} data
   * @returns {this}
   */
  json(data) {
    this.#config.body = JSON.stringify(data);
    return this.contentType('application/json');
  }

  /**
   * Shorthand: FormData body.
   * @param {Object|FormData} data
   * @returns {this}
   */
  form(data) {}

  // ── Behavior ─────────────────────────────────────────────────────────

  /** @returns {this} */
  timeout(ms)               { this.#config.timeout     = ms;   return this; }
  /** @returns {this} */
  retry(policy)             { this.#config.retry        = policy; return this; }
  /** @returns {this} */
  noRetry()                 { this.#config.retry        = { attempts: 0 }; return this; }
  /** @returns {this} */
  cache(policy)             { this.#config.cache        = policy; return this; }
  /** @returns {this} */
  noCache()                 { this.#config.cache        = { enabled: false }; return this; }
  /** @returns {this} */
  deduplicate(on = true)    { this.#config.deduplicate  = on;   return this; }
  /** @returns {this} */
  withCredentials(on = true){ this.#config.withCredentials = on; return this; }
  /** @returns {this} */
  responseType(type)        { this.#config.responseType = type; return this; }
  /** @returns {this} */
  signal(abortSignal)       { this.#config.signal       = abortSignal; return this; }

  // ── Progress ─────────────────────────────────────────────────────────

  /** @param {function(ProgressEvent):void} fn @returns {this} */
  onUploadProgress(fn)   { this.#config.onUploadProgress   = fn; return this; }
  /** @param {function(ProgressEvent):void} fn @returns {this} */
  onDownloadProgress(fn) { this.#config.onDownloadProgress = fn; return this; }

  // ── Metadata ─────────────────────────────────────────────────────────

  /** @returns {this} */
  meta(keyOrMap, value) {}

  // ── Terminal ─────────────────────────────────────────────────────────

  /**
   * Build the final RequestConfig without dispatching.
   * @returns {RequestConfig}
   */
  build() {
    return { ...this.#config };
  }

  /**
   * Dispatch the request through the HTTP client.
   * @returns {Promise<NormalizedResponse>}
   */
  send() {
    return this.#client.request(this.build());
  }
}
```

### Builder Usage Examples

```js
// Simple GET
const resp = await httpClient
  .build()
  .get('/users')
  .param({ page: 2, status: 'active' })
  .timeout(5000)
  .send();

// Authenticated POST with retry override
const resp = await httpClient
  .build()
  .post('/orders')
  .json({ productId: 'sku-42', quantity: 3 })
  .bearerToken(authService.getToken())
  .retry({ attempts: 1 })
  .meta({ context: 'checkout' })
  .send();

// File upload with progress
const resp = await httpClient
  .build()
  .post('/uploads')
  .form(formData)
  .onUploadProgress(e => progressBar.update(e.loaded / e.total))
  .timeout(120_000)
  .noRetry()
  .send();
```

---

## 4.3 — Response Normalizer

### Responsibility
Transforms every raw `fetch` Response into a consistent `NormalizedResponse` shape. APIs vary wildly — some wrap data in `{ data: ... }`, some in `{ result: ... }`, some return errors in 200 responses. This component irons all of that out before any application code sees it.

```js
/**
 * @typedef {Object} NormalizerRule
 * @property {string|RegExp}  pattern      - URL pattern to match
 * @property {function(body: *, response: Response, config: RequestConfig): *} transform
 *           Return the normalized data value.
 */
```

```js
class ResponseNormalizer {
  /** @type {NormalizerRule[]} */
  #rules = [];

  /**
   * Register a URL-specific transform.
   * Applied after the global default unwrapping.
   * @param {NormalizerRule} rule
   */
  addRule(rule) {}

  /**
   * Normalize a raw fetch Response into NormalizedResponse.
   *
   * Steps:
   *  1. Parse body according to Content-Type (json / text / blob / etc)
   *  2. Apply global unwrapper (extracts data from common envelope shapes)
   *  3. Apply any matching URL-specific transform rules
   *  4. Build and return NormalizedResponse
   *
   * @param {Response}      raw      - Raw fetch Response object
   * @param {RequestConfig} config   - Config that produced this response
   * @param {number}        duration - Round-trip ms
   * @returns {Promise<NormalizedResponse>}
   */
  async normalize(raw, config, duration) {}

  /**
   * Configure the global envelope unwrapper.
   * Tells the normalizer where the actual data lives in a response body.
   *
   * @param {Object} options
   * @param {string} [options.dataKey]      - e.g. 'data', 'result', 'payload'
   * @param {string} [options.errorKey]     - e.g. 'error', 'message', 'errors'
   * @param {string} [options.metaKey]      - e.g. 'meta', 'pagination'
   * @param {function(body:*): boolean} [options.isErrorBody]
   *   Called on 2xx responses to detect application-level errors in body
   */
  configureEnvelope(options) {}

  /**
   * Parse a Response body to a JS value according to Content-Type.
   * @param {Response}     raw
   * @param {RequestConfig} config
   * @returns {Promise<*>}
   */
  async #parseBody(raw, config) {}

  /**
   * Apply envelope unwrapping rules to extract the application data.
   * @param {*}      body
   * @param {number} status
   * @returns {{ data: *, meta: * }}
   */
  #unwrapEnvelope(body, status) {}
}
```

### Envelope Unwrapping Examples

```js
normalizer.configureEnvelope({
  dataKey:  'data',
  errorKey: 'error',
  metaKey:  'meta',
  isErrorBody: (body) => body?.success === false,
});

// API returns: { "data": { "id": 1 }, "meta": { "total": 100 } }
// Normalizer extracts: response.data = { id: 1 }

// API returns: { "result": [...] }
// Add a rule for this endpoint:
normalizer.addRule({
  pattern:   '/legacy/products*',
  transform: (body) => body.result,
});

// API returns success:false in a 200:
// { "success": false, "error": "Item not found" }
// isErrorBody detects this → converted to HttpError before reaching caller
```

---

## 4.4 — Interceptor Chain

### Responsibility
An ordered pipeline of request and response interceptors. Each interceptor can read, modify, or reject the request/response passing through it. The architecture mirrors Axios interceptors but with explicit priorities and IDs for manageability.

```js
/**
 * @callback RequestInterceptorFn
 * @param {RequestConfig} config
 * @returns {RequestConfig | Promise<RequestConfig>}
 * Modify and return the config, or throw to cancel the request.
 */

/**
 * @callback ResponseInterceptorFn
 * @param {NormalizedResponse} response
 * @returns {NormalizedResponse | Promise<NormalizedResponse>}
 * Modify and return the response, or throw to convert to error.
 */

/**
 * @callback ErrorInterceptorFn
 * @param {HttpError} error
 * @returns {NormalizedResponse | Promise<NormalizedResponse> | never}
 * Return a response to recover, or re-throw to propagate.
 */

/**
 * @typedef {Object} InterceptorRegistration
 * @property {string}                  id
 * @property {number}                  priority       - Lower runs first on request, last on response
 * @property {RequestInterceptorFn}    [onRequest]
 * @property {ResponseInterceptorFn}   [onResponse]
 * @property {ErrorInterceptorFn}      [onError]
 */
```

```js
class InterceptorChain {
  /** @type {InterceptorRegistration[]} */
  #interceptors = [];

  /**
   * Register an interceptor.
   * @param {InterceptorRegistration} registration
   * @returns {function} unregister
   */
  add(registration) {}

  /**
   * Run all request interceptors in priority order (ascending).
   * @param {RequestConfig} config
   * @returns {Promise<RequestConfig>}
   */
  async runRequest(config) {}

  /**
   * Run all response interceptors in reverse priority order (descending).
   * This mirrors the onion model — last request interceptor = first response interceptor.
   * @param {NormalizedResponse} response
   * @returns {Promise<NormalizedResponse>}
   */
  async runResponse(response) {}

  /**
   * Run error interceptors. First one that returns (doesn't throw) wins.
   * @param {HttpError} error
   * @returns {Promise<NormalizedResponse>} - recovered response
   * @throws {HttpError} - if no interceptor recovers
   */
  async runError(error) {}
}
```

---

## 4.5 — Authentication Interceptor

### Responsibility
Injects auth tokens into outgoing requests and handles transparent token refresh when a `401` response is received. Prevents thundering-herd: if multiple requests get a 401 simultaneously, only one token refresh is performed; others wait for it to complete.

```js
/**
 * @typedef {Object} AuthInterceptorOptions
 * @property {function(): Promise<string|null>}  getAccessToken   - Returns current access token
 * @property {function(): Promise<string>}       refreshToken     - Performs refresh, returns new token
 * @property {function(error: HttpError): boolean} [isAuthError]  - Detect 401/403 (default: status === 401)
 * @property {string}  [headerName]      - Header to inject token into (default: 'Authorization')
 * @property {string}  [scheme]          - Token scheme (default: 'Bearer')
 * @property {string[]} [excludePaths]   - URL paths that skip token injection e.g. ['/auth/login']
 */
```

```js
class AuthInterceptor {
  /** @type {AuthInterceptorOptions} */
  #options = null;

  /** @type {Promise<string>|null} - In-flight refresh promise (shared by all waiters) */
  #refreshPromise = null;

  /**
   * @param {AuthInterceptorOptions} options
   */
  constructor(options) {
    this.#options = options;
  }

  /**
   * Returns an InterceptorRegistration ready for InterceptorChain.add().
   * @returns {InterceptorRegistration}
   */
  toRegistration() {
    return {
      id:       'auth',
      priority: 10,

      onRequest: async (config) => {
        if (this.#isExcluded(config.url)) return config;
        const token = await this.#options.getAccessToken();
        if (!token) return config;
        return {
          ...config,
          headers: {
            ...config.headers,
            [this.#options.headerName ?? 'Authorization']:
              `${this.#options.scheme ?? 'Bearer'} ${token}`,
          },
        };
      },

      onError: async (error) => {
        const isAuth = this.#options.isAuthError?.(error)
          ?? error.status === 401;

        if (!isAuth || error.request.meta?._retried) throw error;

        // Deduplicate concurrent refreshes
        if (!this.#refreshPromise) {
          this.#refreshPromise = this.#options.refreshToken()
            .finally(() => { this.#refreshPromise = null; });
        }

        const newToken = await this.#refreshPromise;

        // Retry original request with new token
        const retryConfig = {
          ...error.request,
          headers: {
            ...error.request.headers,
            Authorization: `Bearer ${newToken}`,
          },
          meta: { ...error.request.meta, _retried: true },
        };

        return httpClient.request(retryConfig);   // injected reference
      },
    };
  }

  /** @param {string} url @returns {boolean} */
  #isExcluded(url) {
    return (this.#options.excludePaths ?? []).some(p => url.includes(p));
  }
}
```

---

## 4.6 — Retry Manager

### Responsibility
Wraps the `fetch` call in a retry loop with exponential backoff and jitter. Respects `Retry-After` response headers. Handles both network failures and HTTP error status codes.

```js
class RetryManager {
  /** @type {RetryPolicy} */
  #defaultPolicy = {
    attempts:      3,
    baseDelay:     300,
    maxDelay:      30_000,
    factor:        2,
    jitter:        0.2,
    retryOn:       [429, 502, 503, 504],
    retryOnNetwork: true,
  };

  /**
   * @param {Partial<RetryPolicy>} [defaultPolicy]
   */
  constructor(defaultPolicy = {}) {
    this.#defaultPolicy = { ...this.#defaultPolicy, ...defaultPolicy };
  }

  /**
   * Execute a fetch function with retries.
   *
   * @param {RequestConfig}          config
   * @param {function(): Promise<Response>} fetchFn
   * @param {ErrorClassifier}        classifier
   * @returns {Promise<Response>}
   * @throws {HttpError} after all attempts exhausted
   */
  async execute(config, fetchFn, classifier) {}

  /**
   * Compute the delay for a given attempt number.
   * delay = min(baseDelay * factor^attempt, maxDelay) * (1 ± jitter)
   *
   * @param {RetryPolicy} policy
   * @param {number}      attempt   - 0-indexed
   * @param {Response}    [response] - Check Retry-After header if present
   * @returns {number} delay in ms
   */
  computeDelay(policy, attempt, response = null) {}

  /**
   * Determine if an error is retryable given the policy.
   * @param {HttpError}   error
   * @param {RetryPolicy} policy
   * @param {number}      attempt
   * @returns {boolean}
   */
  shouldRetry(error, policy, attempt) {}
}
```

### Retry Backoff Formula

```
attempt 0 (first retry):
  delay = min(300ms × 2^0, 30000) × (1 + random(-0.2, +0.2))
        = 300ms × ~(0.8–1.2) = ~240ms–360ms

attempt 1:
  delay = min(300ms × 2^1, 30000) × jitter = ~480ms–720ms

attempt 2:
  delay = min(300ms × 2^2, 30000) × jitter = ~960ms–1440ms

Retry-After header overrides computed delay:
  if response.headers['Retry-After'] exists → parse and use that value
```

---

## 4.7 — Timeout Manager

### Responsibility
Enforces per-request and global timeouts using `AbortController`. Provides a clean error when a request exceeds its time budget, distinguishing timeout from user-initiated abort.

```js
class TimeoutManager {
  /** @type {number} - Global default timeout ms */
  #defaultTimeout = 30_000;

  /** @type {Map<string, AbortController>} - requestId → controller */
  #controllers = new Map();

  /**
   * @param {number} [defaultTimeout]
   */
  constructor(defaultTimeout = 30_000) {
    this.#defaultTimeout = defaultTimeout;
  }

  /**
   * Create an AbortController for a request and schedule its timeout.
   * If config already has a signal, creates a composite signal that
   * aborts on either the timeout OR the external signal.
   *
   * @param {RequestConfig} config
   * @returns {{ signal: AbortSignal, cancel: function, requestId: string }}
   */
  wrap(config) {}

  /**
   * Cancel a specific request's timeout (called on success or retry).
   * @param {string} requestId
   */
  cancel(requestId) {}

  /**
   * Cancel all managed timeouts (e.g. on app teardown).
   */
  cancelAll() {}

  /**
   * Create a composite AbortSignal that fires when any of the input signals fire.
   * Polyfills AbortSignal.any() for older browsers.
   *
   * @param {AbortSignal[]} signals
   * @returns {AbortSignal}
   */
  static any(signals) {}
}
```

---

## 4.8 — Request Deduplicator

### Responsibility
Identifies in-flight requests that are identical (same method + URL + params + body hash) and returns the same `Promise` to all callers instead of making multiple network calls. Particularly valuable when multiple components mount simultaneously and all request the same data.

```js
class RequestDeduplicator {
  /** @type {Map<string, Promise<NormalizedResponse>>} */
  #inflight = new Map();

  /**
   * Check if an identical request is already in-flight.
   * If so, returns the existing Promise.
   * If not, returns null (caller should proceed and register).
   *
   * @param {RequestConfig} config
   * @returns {Promise<NormalizedResponse>|null}
   */
  check(config) {}

  /**
   * Register a new in-flight request Promise.
   * @param {RequestConfig}              config
   * @param {Promise<NormalizedResponse>} promise
   */
  register(config, promise) {}

  /**
   * Remove a request from the in-flight map.
   * Called when the request settles (success or failure).
   * @param {string} requestId
   */
  resolve(config) {}

  /**
   * Compute a deduplication key for a request.
   * Key = method + normalized URL + sorted params + body hash.
   * Two requests with the same key are considered identical.
   *
   * @param {RequestConfig} config
   * @returns {string}
   */
  buildKey(config) {}

  /**
   * Disable deduplication for specific paths (e.g. POST to analytics).
   * @param {string|RegExp} pattern
   */
  exclude(pattern) {}

  /**
   * Returns the count of currently in-flight unique requests.
   * @returns {number}
   */
  size() {
    return this.#inflight.size;
  }
}
```

---

## 4.9 — Request Queue

### Responsibility
Buffers requests when the app is offline or when the rate limiter signals capacity is exhausted. Processes the queue in FIFO order when connectivity or capacity is restored.

```js
/**
 * @typedef {'fifo'|'lifo'|'priority'} QueueStrategy
 */

/**
 * @typedef {Object} QueuedRequest
 * @property {string}           id
 * @property {RequestConfig}    config
 * @property {number}           priority    - Higher = processed first (for priority strategy)
 * @property {number}           queuedAt
 * @property {number}           [expiresAt] - Drop if not processed by this time
 * @property {function(NormalizedResponse): void} resolve
 * @property {function(HttpError): void}          reject
 */
```

```js
class RequestQueue {
  /** @type {QueuedRequest[]} */
  #queue = [];

  /** @type {boolean} */
  #paused = false;

  /** @type {QueueStrategy} */
  #strategy = 'fifo';

  /** @type {number} */
  #maxSize = 100;

  /** @type {number} */
  #concurrency = 1;

  /** @type {number} */
  #processing = 0;

  /**
   * @param {Object} [options]
   * @param {QueueStrategy} [options.strategy]
   * @param {number}        [options.maxSize]
   * @param {number}        [options.concurrency]
   */
  constructor(options = {}) {}

  /**
   * Add a request to the queue.
   * Returns a Promise that resolves when the request is eventually processed.
   * Throws QueueFullError if maxSize is reached.
   *
   * @param {RequestConfig} config
   * @param {number}        [priority]
   * @param {number}        [ttl]       - Max ms to wait before expiry
   * @returns {Promise<NormalizedResponse>}
   */
  enqueue(config, priority = 0, ttl = null) {}

  /**
   * Pause the queue (stop processing new requests).
   * In-flight requests continue.
   */
  pause() { this.#paused = true; }

  /**
   * Resume processing.
   */
  resume() {
    this.#paused = false;
    this.#flush();
  }

  /**
   * Process pending requests up to concurrency limit.
   */
  #flush() {}

  /**
   * Drop all pending requests with a cancellation error.
   * @param {string} [reason]
   */
  clear(reason = 'Queue cleared') {}

  /**
   * Current queue depth.
   * @returns {number}
   */
  size() { return this.#queue.length; }

  /**
   * Subscribe to queue state changes.
   * @param {function({ size: number, paused: boolean, processing: number }): void} handler
   * @returns {function} unsubscribe
   */
  onChange(handler) {}
}
```

---

## 4.10 — Rate Limiter

### Responsibility
Enforces client-side rate limits per API endpoint using a token-bucket algorithm. Prevents the app from hammering APIs and triggering server-side 429 responses. Respects `Retry-After` headers from 429 responses.

```js
/**
 * @typedef {Object} RateLimitRule
 * @property {string|RegExp}  pattern      - URL pattern this rule applies to
 * @property {number}         requests     - Max requests allowed in the window
 * @property {number}         windowMs     - Window size in ms (e.g. 60000 for 1 req/min)
 * @property {'token-bucket'|'sliding-window'|'fixed-window'} [algorithm]
 * @property {boolean}        [queue]      - Queue excess requests (default: true)
 *                                           false = reject with RateLimitError
 */
```

```js
class RateLimiter {
  /** @type {Map<string, TokenBucket>} */
  #buckets = new Map();

  /** @type {RateLimitRule[]} */
  #rules = [];

  /**
   * Register a rate limit rule.
   * @param {RateLimitRule} rule
   */
  addRule(rule) {}

  /**
   * Request permission to send a request.
   * Blocks (returns a Promise) until a token is available.
   * Returns immediately if the request matches no rule.
   *
   * @param {RequestConfig} config
   * @returns {Promise<void>}
   */
  async acquire(config) {}

  /**
   * Signal that a 429 was received for a URL.
   * Reads Retry-After header and pauses the relevant bucket until then.
   *
   * @param {RequestConfig} config
   * @param {Response}      response
   */
  onRateLimited(config, response) {}

  /**
   * Get current status of a bucket.
   * @param {string} pattern
   * @returns {{ tokens: number, capacity: number, nextRefill: number }}
   */
  getStatus(pattern) {}
}

// ── Token Bucket (internal) ───────────────────────────────────────────────
class TokenBucket {
  #capacity    = 0;
  #tokens      = 0;
  #refillRate  = 0;   // tokens per ms
  #lastRefill  = 0;

  constructor(capacity, windowMs) {
    this.#capacity   = capacity;
    this.#tokens     = capacity;
    this.#refillRate = capacity / windowMs;
    this.#lastRefill = Date.now();
  }

  /** @returns {boolean} */
  consume() {
    this.#refill();
    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }

  /** @returns {number} ms until next token available */
  nextAvailableMs() {
    this.#refill();
    if (this.#tokens >= 1) return 0;
    return Math.ceil((1 - this.#tokens) / this.#refillRate);
  }

  #refill() {
    const now    = Date.now();
    const delta  = now - this.#lastRefill;
    this.#tokens = Math.min(this.#capacity, this.#tokens + delta * this.#refillRate);
    this.#lastRefill = now;
  }
}
```

---

## 4.11 — Cache Layer

### Responsibility
Short-lived, in-memory response cache scoped to the HTTP client. Distinct from Module 18 (HTTP Cache Layer with LocalStorage) — this layer is process-lifetime only, lives in RAM, and is for extremely hot request paths where even a 5-second cache eliminates duplicate calls in a single page view.

```js
/**
 * @typedef {Object} CacheEntry
 * @property {NormalizedResponse} response
 * @property {number}             expiresAt
 * @property {string}             key
 * @property {number}             hits
 */
```

```js
class HTTPCacheLayer {
  /** @type {Map<string, CacheEntry>} */
  #store = new Map();

  /** @type {Map<string, number>} - Default TTLs per URL pattern */
  #patternTTLs = new Map();

  /** @type {number} */
  #maxEntries = 500;

  /**
   * Configure TTLs per URL pattern.
   * @param {string|RegExp} pattern
   * @param {number}        ttl      - ms
   */
  setPatternTTL(pattern, ttl) {}

  /**
   * Check cache for a request. Returns null on miss or expiry.
   * @param {RequestConfig} config
   * @returns {NormalizedResponse|null}
   */
  get(config) {}

  /**
   * Store a response. Only caches GET requests (or as configured).
   * @param {RequestConfig}    config
   * @param {NormalizedResponse} response
   */
  set(config, response) {}

  /**
   * Invalidate cache entries matching a URL pattern.
   * @param {string|RegExp} pattern
   */
  invalidate(pattern) {}

  /**
   * Clear the entire cache.
   */
  clear() {}

  /**
   * Build a cache key from a request config.
   * @param {RequestConfig} config
   * @returns {string}
   */
  buildKey(config) {}

  /**
   * Return cache statistics.
   * @returns {{ size: number, hits: number, misses: number, hitRate: number }}
   */
  stats() {}
}
```

---

## 4.12 — Batch Request Manager

### Responsibility
Collects multiple individual requests made within a short time window and combines them into a single HTTP call to a batch endpoint. Transparently splits the batch response back out to individual callers.

```js
/**
 * @typedef {Object} BatchConfig
 * @property {string}  endpoint          - URL of the batch endpoint e.g. '/api/batch'
 * @property {string}  [method]          - HTTP method for batch call (default: 'POST')
 * @property {number}  [windowMs]        - Collection window ms (default: 10)
 * @property {number}  [maxSize]         - Max requests per batch (default: 20)
 * @property {string|RegExp} [matchPattern]  - Only batch requests matching this URL pattern
 * @property {function(configs: RequestConfig[]): *}       buildBody      - Serialize batch body
 * @property {function(batchResponse: *, configs: RequestConfig[]): NormalizedResponse[]} parseResponse
 *           Split a batch response back into per-request responses in the same order.
 */
```

```js
class BatchRequestManager {
  /** @type {BatchConfig[]} */
  #configs = [];

  /** @type {Map<string, { pending: Array, timer: number }>} */
  #windows = new Map();

  /**
   * Register a batch configuration for a URL pattern.
   * @param {BatchConfig} config
   */
  register(config) {}

  /**
   * Intercept a request. If it matches a batch rule, buffer it and
   * return a Promise that resolves when the batch completes.
   * Returns null if no batch rule matches (caller should send normally).
   *
   * @param {RequestConfig} config
   * @returns {Promise<NormalizedResponse>|null}
   */
  intercept(config) {}

  /**
   * Flush a specific batch window immediately (bypass the timer).
   * @param {string} endpointKey
   */
  flush(endpointKey) {}

  /**
   * Fire a collected batch of requests.
   * @param {string}          endpointKey
   * @param {BatchConfig}     batchConfig
   * @param {Array}           pending
   */
  async #executeBatch(endpointKey, batchConfig, pending) {}
}
```

### Batch Request Flow

```
httpClient.get('/users/1') ─┐
httpClient.get('/users/2') ─┤  within 10ms window
httpClient.get('/users/3') ─┘
        │
        ▼
BatchRequestManager.intercept() collects all three
        │
        ▼ (after 10ms)
POST /api/batch
Body: { requests: [
  { method: 'GET', path: '/users/1' },
  { method: 'GET', path: '/users/2' },
  { method: 'GET', path: '/users/3' },
]}
        │
        ▼
Response: { responses: [
  { status: 200, body: { id: 1, name: 'Alice' } },
  { status: 200, body: { id: 2, name: 'Bob' } },
  { status: 404, body: null },
]}
        │
        ▼
parseResponse splits → resolves each caller's Promise individually
```

---

## 4.13 — Progress Tracker

### Responsibility
Provides upload and download progress events for requests involving large payloads. Since the `fetch` API does not natively expose upload progress, this component uses `XMLHttpRequest` as a fallback for uploads while using `ReadableStream` for download progress.

```js
/**
 * @typedef {Object} ProgressEvent
 * @property {number}   loaded        - Bytes transferred so far
 * @property {number}   total         - Total bytes (0 if unknown)
 * @property {number}   percent       - 0–100 (0 if total unknown)
 * @property {boolean}  lengthKnown   - Whether total is available
 * @property {number}   bytesPerSecond- Current transfer rate
 * @property {number}   [eta]         - Estimated seconds remaining
 */
```

```js
class ProgressTracker {
  /**
   * Execute a request with progress tracking.
   * Automatically chooses fetch (download) or XHR (upload) path.
   *
   * @param {RequestConfig} config
   * @returns {Promise<Response>}
   */
  async execute(config) {}

  /**
   * Track download progress on a fetch Response via ReadableStream.
   * Calls config.onDownloadProgress as chunks arrive.
   *
   * @param {Response}      response
   * @param {RequestConfig} config
   * @returns {Promise<Response>}  - New Response with fully-buffered body
   */
  async trackDownload(response, config) {}

  /**
   * Execute an upload via XMLHttpRequest to get upload progress events.
   * Falls back to this when config.onUploadProgress is set.
   *
   * @param {RequestConfig} config
   * @returns {Promise<Response>} - Normalized as a fetch Response
   */
  async executeWithXHR(config) {}

  /**
   * Compute bytes-per-second from a series of timed chunk sizes.
   * @param {Array<{ bytes: number, time: number }>} samples
   * @returns {number}
   */
  #computeRate(samples) {}
}
```

---

## 4.14 — Error Classifier

### Responsibility
Takes any error — `fetch` network error, `AbortError`, `HTTP 4xx/5xx`, or application-level error body — and converts it into a typed `HttpError` with a `DomainErrorType`. Downstream code switches on `error.type` rather than inspecting raw status codes.

```js
class ErrorClassifier {
  /**
   * @typedef {Object} ClassificationRule
   * @property {function(error: *, response?: Response): boolean} matches
   * @property {DomainErrorType} type
   * @property {boolean}         retryable
   * @property {function(error: *, response?: Response): string} [message]
   */

  /** @type {ClassificationRule[]} */
  #rules = [];

  /**
   * Classify an error into an HttpError.
   *
   * @param {Error|Response|*} raw
   * @param {RequestConfig}    config
   * @param {Response}         [response]  - The raw Response if available
   * @returns {HttpError}
   */
  classify(raw, config, response = null) {}

  /**
   * Register a custom classification rule.
   * Custom rules are checked before built-in ones.
   * @param {ClassificationRule} rule
   */
  addRule(rule) {}
}
```

### Built-in Classification Rules

```js
const BUILT_IN_RULES = [
  // Network failure (no response at all)
  {
    matches: (e) => e instanceof TypeError && e.message.includes('fetch'),
    type:      'network',
    retryable: true,
    message:   () => 'Network request failed — no connection',
  },
  // Timeout / user abort
  {
    matches: (e) => e?.name === 'AbortError',
    type:      (e, _, config) => config?.meta?._timedOut ? 'timeout' : 'abort',
    retryable: false,
    message:   (e, _, config) => config?.meta?._timedOut
      ? `Request timed out after ${config.timeout}ms`
      : 'Request was aborted',
  },
  // 401 Unauthorized
  { matches: (_, r) => r?.status === 401, type: 'auth',        retryable: false },
  // 403 Forbidden
  { matches: (_, r) => r?.status === 403, type: 'forbidden',   retryable: false },
  // 404 Not Found
  { matches: (_, r) => r?.status === 404, type: 'not_found',   retryable: false },
  // 422 / 400 Validation
  { matches: (_, r) => [400, 422].includes(r?.status), type: 'validation', retryable: false },
  // 429 Rate Limited
  { matches: (_, r) => r?.status === 429, type: 'rate_limit',  retryable: true  },
  // 5xx Server Error
  { matches: (_, r) => r?.status >= 500,  type: 'server',      retryable: true  },
  // Fallback
  { matches: () => true,                  type: 'unknown',      retryable: false },
];
```

---

## 4.15 — Mock Adapter

### Responsibility
Intercepts requests in development and test environments and returns predefined fixture responses. Zero network calls. Supports delays, error simulation, and dynamic response factories.

```js
/**
 * @typedef {Object} MockDefinition
 * @property {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'|string} method
 * @property {string|RegExp} url
 * @property {number}        [status]      - HTTP status code (default: 200)
 * @property {*}             [body]        - Response body
 * @property {Object}        [headers]     - Response headers
 * @property {number}        [delay]       - Artificial latency ms (default: 0)
 * @property {number}        [times]       - Only match this many times (-1 = infinite, default: -1)
 * @property {function(config: RequestConfig): { status: number, body: * } | null} [handler]
 *           Dynamic response factory. Return null to fall through to next mock.
 * @property {boolean}       [passthrough] - Forward to real network if true
 */
```

```js
class MockAdapter {
  /** @type {Array<MockDefinition & { hitCount: number }>} */
  #mocks = [];

  /** @type {NormalizedResponse[]} */
  #log = [];

  /** @type {boolean} */
  #passthroughUnmatched = false;

  /**
   * @param {Object} [options]
   * @param {boolean} [options.passthroughUnmatched] - Forward unmatched to real network
   */
  constructor(options = {}) {}

  /**
   * Register a mock definition.
   * @param {MockDefinition} definition
   * @returns {this} for chaining
   */
  on(definition) {}

  /**
   * Shorthand helpers.
   * @returns {this}
   */
  onGet(url, body, options = {}) {
    return this.on({ method: 'GET', url, body, ...options });
  }
  onPost(url, body, options = {}) {
    return this.on({ method: 'POST', url, body, ...options });
  }
  onPut(url, body, options = {})  {
    return this.on({ method: 'PUT', url, body, ...options });
  }
  onDelete(url, options = {}) {
    return this.on({ method: 'DELETE', url, status: 204, ...options });
  }

  /**
   * Try to match a request to a registered mock.
   * Returns a NormalizedResponse if matched, null if not.
   *
   * @param {RequestConfig} config
   * @returns {Promise<NormalizedResponse|null>}
   */
  match(config) {}

  /**
   * Clear all registered mocks.
   * @returns {this}
   */
  reset() {}

  /**
   * Get a log of all intercepted requests and their matched mock.
   * @returns {Array<{ config: RequestConfig, response: NormalizedResponse }>}
   */
  getLog() {}

  /**
   * Assert a request was made (for unit testing).
   * Throws AssertionError if not found.
   *
   * @param {'GET'|string} method
   * @param {string|RegExp} url
   */
  assertCalled(method, url) {}

  /**
   * Assert a request was NOT made.
   * @param {'GET'|string} method
   * @param {string|RegExp} url
   */
  assertNotCalled(method, url) {}
}
```

### Mock Adapter Usage

```js
const mock = new MockAdapter({ passthroughUnmatched: false });

// Static fixture
mock.onGet('/api/users', [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]);

// Dynamic handler
mock.on({
  method: 'GET',
  url:    /\/api\/users\/(\d+)/,
  delay:  100,
  handler(config) {
    const id = config.url.match(/(\d+)/)[1];
    return id === '99'
      ? { status: 404, body: { error: 'Not found' } }
      : { status: 200, body: { id: +id, name: `User ${id}` } };
  },
});

// Simulate network failure
mock.on({
  method:  'POST',
  url:     '/api/orders',
  handler: () => { throw new TypeError('Failed to fetch'); },
});

// Only match 3 times, then pass through
mock.onGet('/api/config', { featureFlag: true }, { times: 3, passthrough: true });

httpClient.useMockAdapter(mock);
```

---

## Wiring: Full Bootstrap Sequence

```js
// http/index.js — assembled at boot by the DI Container

import HTTPClient            from './HTTPClient.js';
import RequestBuilder        from './RequestBuilder.js';
import ResponseNormalizer    from './ResponseNormalizer.js';
import InterceptorChain      from './InterceptorChain.js';
import AuthInterceptor       from './interceptors/AuthInterceptor.js';
import RetryManager          from './RetryManager.js';
import TimeoutManager        from './TimeoutManager.js';
import RequestDeduplicator   from './RequestDeduplicator.js';
import RequestQueue          from './RequestQueue.js';
import RateLimiter           from './RateLimiter.js';
import HTTPCacheLayer        from './HTTPCacheLayer.js';
import BatchRequestManager   from './BatchRequestManager.js';
import ProgressTracker       from './ProgressTracker.js';
import ErrorClassifier       from './ErrorClassifier.js';
import MockAdapter           from './MockAdapter.js';

// ── 1. Instantiate sub-components ──────────────────────────────────────
const classifier   = new ErrorClassifier();
const normalizer   = new ResponseNormalizer();
const interceptors = new InterceptorChain();
const retry        = new RetryManager({ attempts: 3, baseDelay: 300 });
const timeout      = new TimeoutManager(30_000);
const dedup        = new RequestDeduplicator();
const queue        = new RequestQueue({ strategy: 'fifo', concurrency: 4 });
const rateLimiter  = new RateLimiter();
const cache        = new HTTPCacheLayer();
const batcher      = new BatchRequestManager();
const progress     = new ProgressTracker();

// ── 2. Configure normalizer ─────────────────────────────────────────────
normalizer.configureEnvelope({ dataKey: 'data', errorKey: 'error', metaKey: 'meta' });

// ── 3. Register interceptors ────────────────────────────────────────────
interceptors.add(new AuthInterceptor({
  getAccessToken: () => tokenStore.getAccessToken(),
  refreshToken:   () => authService.refresh(),
  excludePaths:   ['/auth/login', '/auth/refresh'],
}).toRegistration());

interceptors.add({
  id:       'logger',
  priority: 50,
  onRequest:  (config)   => { Logger.debug(`→ ${config.method} ${config.url}`); return config; },
  onResponse: (response) => { Logger.debug(`← ${response.status} ${response.request.url} (${response.duration}ms)`); return response; },
  onError:    (error)    => { Logger.error(`✕ ${error.type}: ${error.message}`); throw error; },
});

// ── 4. Configure rate limits ────────────────────────────────────────────
rateLimiter.addRule({ pattern: '/api/*',        requests: 60,  windowMs: 60_000 });
rateLimiter.addRule({ pattern: '/api/search*',  requests: 10,  windowMs: 10_000 });

// ── 5. Configure caching ────────────────────────────────────────────────
cache.setPatternTTL('/api/config',   5 * 60_000);
cache.setPatternTTL('/api/products', 60_000);

// ── 6. Configure batch ──────────────────────────────────────────────────
batcher.register({
  endpoint:      '/api/batch',
  windowMs:      15,
  maxSize:       25,
  matchPattern:  /\/api\/users\/\d+$/,
  buildBody:     (configs) => ({ requests: configs.map(c => ({ method: c.method, path: new URL(c.url).pathname })) }),
  parseResponse: (resp, configs) => resp.responses.map((r, i) => ({
    status: r.status, data: r.body, ok: r.status < 400, request: configs[i], headers: {}, duration: 0,
  })),
});

// ── 7. Build the client ─────────────────────────────────────────────────
const httpClient = new HTTPClient({
  baseURL:        'https://api.myapp.com',
  defaultHeaders: { 'X-App-Version': APP_VERSION, 'Accept': 'application/json' },
  timeout:        30_000,
  deduplicate:    true,
  responseType:   'json',
});

// ── 8. Attach mock adapter in dev/test ──────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  const mock = new MockAdapter();
  // register fixtures...
  httpClient.useMockAdapter(mock);
}

// ── 9. Handle offline/online for queue ─────────────────────────────────
window.addEventListener('offline', () => queue.pause());
window.addEventListener('online',  () => queue.resume());

export { httpClient };
```

---

## Event Bus Emissions (Module 5 integration)

| Event name | Payload | When |
|---|---|---|
| `http:request:start` | `{ config }` | Request enters pipeline |
| `http:request:success` | `{ response }` | Response received and normalized |
| `http:request:error` | `{ error }` | Request failed after all retries |
| `http:request:aborted` | `{ requestId, reason }` | Request was aborted |
| `http:retry:attempt` | `{ config, attempt, delay }` | Retry is about to fire |
| `http:retry:exhausted` | `{ config, attempts, error }` | All retries consumed |
| `http:cache:hit` | `{ config, key }` | Served from in-memory cache |
| `http:cache:miss` | `{ config, key }` | Cache miss, going to network |
| `http:deduplicated` | `{ config, key }` | Joined existing in-flight request |
| `http:rate-limited` | `{ config, retryAfterMs }` | Request held by rate limiter |
| `http:batch:dispatched` | `{ count, endpoint }` | Batch request fired |
| `http:queue:enqueued` | `{ size }` | Request added to offline queue |
| `http:queue:flushed` | `{ processed }` | Queue processed after reconnect |
| `http:auth:refreshed` | `{ requestId }` | Token refreshed transparently |
| `http:auth:failed` | `{ requestId }` | Token refresh failed |

---