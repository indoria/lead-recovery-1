# Module 6 — 🔐 Authentication & Authorization System

> **Core Principle:** Authentication answers *who are you?* Authorization answers *what can you do?* These two concerns are strictly separated. Tokens never touch persistent storage. Every permission check is auditable. The system fails closed — deny by default.

---

## Architecture Overview

```
User Action (login / route change / UI render)
        │
        ▼
┌─────────────────────────────────────────────────────┐
│                   Auth Manager                       │
│   Orchestrates login, logout, session lifecycle      │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼─────────────────┐
          ▼            ▼                 ▼
   SSO Adapter    Token Store      Session Manager
   (OAuth2/OIDC)  (memory-only)    (idle/expiry)
          │            │
          │     Token Refresh
          │     Orchestrator
          │      (proactive)
          │
          ▼
┌─────────────────────────────────────────────────────┐
│              Permission Registry                     │
│   roles → permissions → capabilities                │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼──────────────────┐
          ▼            ▼                  ▼
  Authorization    RBAC / ABAC      Multi-Tenant
  Guard            Engine           Context
  (route/action/   (evaluation)     (org/workspace)
   UI)
          │
          ▼
┌─────────────────────────────────────────────────────┐
│   CSRF Token Manager  │  Auth Audit Logger           │
└─────────────────────────────────────────────────────┘
```

---

## 6.0 — Core Types & Interfaces

```js
/**
 * @typedef {Object} AuthUser
 * The normalized representation of the authenticated principal.
 * This is the shape ALL parts of the app work with — SSO adapter
 * transforms provider-specific claims into this before storing.
 *
 * @property {string}    id                - Unique user identifier
 * @property {string}    email
 * @property {string}    [name]
 * @property {string}    [avatarUrl]
 * @property {string[]}  roles             - e.g. ['admin', 'editor']
 * @property {Object}    [attributes]      - ABAC attributes: { department, clearanceLevel, ... }
 * @property {string}    [tenantId]        - Active tenant/org (multi-tenant)
 * @property {string[]}  [tenantIds]       - All tenants the user belongs to
 * @property {Object}    [claims]          - Raw provider claims (OIDC/SAML)
 * @property {number}    [loginAt]         - Unix ms of this session's login
 */

/**
 * @typedef {Object} TokenSet
 * @property {string}  accessToken
 * @property {string}  [refreshToken]
 * @property {number}  accessExpiresAt    - Unix ms
 * @property {number}  [refreshExpiresAt] - Unix ms
 * @property {string}  [tokenType]        - 'Bearer' (default)
 * @property {string}  [scope]
 * @property {string}  [idToken]          - OIDC id_token
 */

/**
 * @typedef {Object} AuthState
 * @property {'unauthenticated'|'authenticating'|'authenticated'|'refreshing'|'error'} status
 * @property {AuthUser|null}  user
 * @property {string|null}    error       - Error message if status === 'error'
 * @property {number|null}    lastActivity - Unix ms of last user interaction
 */

/**
 * @typedef {Object} Permission
 * @property {string}  action     - e.g. 'create', 'read', 'update', 'delete', 'manage'
 * @property {string}  resource   - e.g. 'orders', 'users'
 * @property {Object}  [conditions] - ABAC conditions: { ownOnly: true, tenantScoped: true }
 */

/**
 * @typedef {Object} AuthResult
 * @property {boolean}    success
 * @property {AuthUser}   [user]
 * @property {string}     [error]
 * @property {string}     [errorCode]   - Machine-readable: 'invalid_credentials', 'mfa_required', etc.
 * @property {boolean}    [mfaRequired]
 * @property {string}     [mfaChallengeId]
 */
```

---

## 6.1 — Auth Manager

### Responsibility
The single public API for all authentication operations. Orchestrates the full login/logout lifecycle, delegates to the appropriate SSO adapter or credential handler, persists session state, and emits auth events to the Event Bus.

```js
/**
 * @typedef {Object} AuthManagerOptions
 * @property {string}       [loginRoute]       - Route name to redirect to on auth failure (default: 'auth.login')
 * @property {string}       [postLoginRoute]   - Route name to redirect to after successful login
 * @property {string}       [postLogoutRoute]  - Route name after logout
 * @property {boolean}      [autoRefresh]      - Auto-start token refresh (default: true)
 * @property {boolean}      [persistSession]   - Restore session on page reload (default: true)
 * @property {SSOAdapter[]} [adapters]         - Registered SSO providers
 */
```

```js
class AuthManager {
  /** @type {AuthState} */
  #state = { status: 'unauthenticated', user: null, error: null, lastActivity: null };

  /** @type {TokenStore} */
  #tokenStore = null;

  /** @type {TokenRefreshOrchestrator} */
  #refreshOrchestrator = null;

  /** @type {SessionManager} */
  #sessionManager = null;

  /** @type {PermissionRegistry} */
  #permissionRegistry = null;

  /** @type {Map<string, SSOAdapter>} */
  #adapters = new Map();

  /** @type {AuthAuditLogger} */
  #auditLogger = null;

  /** @type {CSRFTokenManager} */
  #csrfManager = null;

  /** @type {AuthManagerOptions} */
  #options = {};

  /**
   * @param {AuthManagerOptions}     options
   * @param {TokenStore}             tokenStore
   * @param {TokenRefreshOrchestrator} refreshOrchestrator
   * @param {SessionManager}         sessionManager
   * @param {PermissionRegistry}     permissionRegistry
   * @param {AuthAuditLogger}        auditLogger
   * @param {CSRFTokenManager}       csrfManager
   */
  constructor(options, tokenStore, refreshOrchestrator,
              sessionManager, permissionRegistry, auditLogger, csrfManager) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Initialize the auth system at app boot.
   * Attempts to restore a previous session from memory/sessionStorage.
   * Starts refresh orchestrator and session monitor.
   *
   * @returns {Promise<AuthState>}
   */
  async init() {}

  /**
   * Authenticate with username/password credentials.
   * POSTs to the credential endpoint, stores returned tokens, loads user.
   *
   * @param {string}  email
   * @param {string}  password
   * @param {Object}  [options]
   * @param {boolean} [options.rememberMe]  - Extend refresh token lifetime
   * @returns {Promise<AuthResult>}
   */
  async loginWithCredentials(email, password, options = {}) {}

  /**
   * Authenticate via a named SSO provider.
   * Delegates to the registered SSOAdapter for that provider.
   *
   * @param {string}  providerId       - e.g. 'google', 'okta', 'azure-ad'
   * @param {Object}  [adapterOptions] - Provider-specific options
   * @returns {Promise<AuthResult>}
   */
  async loginWithSSO(providerId, adapterOptions = {}) {}

  /**
   * Complete MFA challenge after initial login.
   * @param {string} challengeId   - From AuthResult.mfaChallengeId
   * @param {string} code          - OTP code from authenticator / SMS
   * @returns {Promise<AuthResult>}
   */
  async completeMFA(challengeId, code) {}

  /**
   * Log out the current user.
   * Clears tokens, cancels refresh, notifies server, emits event.
   *
   * @param {Object}  [options]
   * @param {boolean} [options.everywhere]  - Revoke all sessions server-side
   * @param {string}  [options.reason]      - 'user-initiated'|'session-expired'|'forced'
   * @returns {Promise<void>}
   */
  async logout(options = {}) {}

  /**
   * Force logout the current user due to an external signal
   * (e.g. server returned 401 with X-Auth-Revoked header).
   * @param {string} reason
   */
  forceLogout(reason = 'forced') {}

  // ── State ──────────────────────────────────────────────────────────────

  /**
   * Returns the current auth state snapshot.
   * @returns {AuthState}
   */
  getState() { return { ...this.#state }; }

  /**
   * Returns the current authenticated user, or null.
   * @returns {AuthUser|null}
   */
  getUser() { return this.#state.user; }

  /**
   * @returns {boolean}
   */
  isAuthenticated() { return this.#state.status === 'authenticated'; }

  /**
   * Subscribe to auth state changes.
   * @param {function(AuthState): void} handler
   * @returns {function} unsubscribe
   */
  onChange(handler) {}

  // ── Token access ──────────────────────────────────────────────────────

  /**
   * Get the current access token for use in HTTP requests.
   * Triggers a refresh if the token is within the refresh buffer window.
   *
   * @returns {Promise<string|null>}
   */
  async getAccessToken() {}

  // ── Session control ────────────────────────────────────────────────────

  /**
   * Record user activity. Resets the idle timeout clock.
   * Should be called on user interactions (keypress, click, etc.)
   */
  recordActivity() {
    this.#state.lastActivity = Date.now();
    this.#sessionManager.resetIdleTimer();
  }

  // ── Adapter management ────────────────────────────────────────────────

  /**
   * Register an SSO adapter.
   * @param {string}     providerId
   * @param {SSOAdapter} adapter
   */
  registerAdapter(providerId, adapter) {
    this.#adapters.set(providerId, adapter);
  }

  // ── Internal ──────────────────────────────────────────────────────────

  /**
   * Called after any successful authentication to finalize session.
   * Stores tokens, loads user, registers permissions, starts refresh.
   *
   * @param {TokenSet}  tokenSet
   * @param {AuthUser}  user
   * @returns {Promise<void>}
   */
  async #finalizeLogin(tokenSet, user) {}

  /**
   * Transition auth state and notify subscribers + Event Bus.
   * @param {Partial<AuthState>} patch
   */
  #setState(patch) {}
}
```

### Auth Lifecycle State Machine

```
                    init()
                      │
           ┌──────────┴──────────┐
           │ stored session?     │ no stored session
           ▼ yes                 ▼
      [refreshing]         [unauthenticated]
           │                     │
    refresh succeeds?       loginWith*()
     yes │    │ no               │
         ▼    ▼            [authenticating]
  [authenticated] [unauthenticated]    │
         │              ┌──────────────┤
    recordActivity()    │ success      │ failure
         │              ▼             ▼
    idle timeout  [authenticated] [error] → [unauthenticated]
         │              │
    token near expiry   │
         ▼              │
  [refreshing]          │ repeat
         │              │
         ▼              │
  [authenticated] ──────┘
```

---

## 6.2 — Token Store

### Responsibility
The only place tokens live. Access tokens are held in memory (a plain JavaScript variable) — never in localStorage, never in a cookie accessible to JS. Refresh tokens may be stored in `HttpOnly` cookies set by the server, or in `sessionStorage` with appropriate caveats. The store is intentionally simple and deliberately restrictive.

```js
/**
 * Security model:
 *   - accessToken: in-memory JS variable ONLY. Wiped on page unload.
 *   - refreshToken: in-memory preferred. If persistence is needed,
 *     server must set an HttpOnly, Secure, SameSite=Strict cookie.
 *     This class does NOT write tokens to localStorage.
 *   - idToken: in-memory only.
 */
class TokenStore {
  /** @type {TokenSet|null} */
  #tokens = null;

  /** @type {boolean} */
  #sealed = false;

  /**
   * Store a token set in memory.
   * Seals the store against writes until unsealed.
   *
   * @param {TokenSet} tokenSet
   */
  store(tokenSet) {
    if (this.#sealed) throw new Error('TokenStore is sealed');
    this.#tokens = Object.freeze({ ...tokenSet });
  }

  /**
   * Retrieve the current access token.
   * Returns null if not set or already expired.
   * @returns {string|null}
   */
  getAccessToken() {
    if (!this.#tokens) return null;
    if (Date.now() >= this.#tokens.accessExpiresAt) return null;
    return this.#tokens.accessToken;
  }

  /**
   * Retrieve the refresh token.
   * Returns null if not set, expired, or server-managed (HttpOnly cookie).
   * @returns {string|null}
   */
  getRefreshToken() {
    if (!this.#tokens?.refreshToken) return null;
    if (this.#tokens.refreshExpiresAt && Date.now() >= this.#tokens.refreshExpiresAt) return null;
    return this.#tokens.refreshToken;
  }

  /**
   * Get the OIDC id_token if present.
   * @returns {string|null}
   */
  getIdToken() {
    return this.#tokens?.idToken ?? null;
  }

  /**
   * Check if the access token is expired or within a buffer window.
   * @param {number} [bufferMs]   - Consider expired this many ms early (default: 60000)
   * @returns {boolean}
   */
  isAccessTokenExpired(bufferMs = 60_000) {
    if (!this.#tokens) return true;
    return Date.now() >= (this.#tokens.accessExpiresAt - bufferMs);
  }

  /**
   * Check if a refresh token exists and is valid.
   * @returns {boolean}
   */
  hasValidRefreshToken() {
    return this.getRefreshToken() !== null;
  }

  /**
   * Return seconds until access token expires.
   * Returns 0 if expired or no token.
   * @returns {number}
   */
  accessTokenTTL() {
    if (!this.#tokens) return 0;
    return Math.max(0, Math.floor((this.#tokens.accessExpiresAt - Date.now()) / 1000));
  }

  /**
   * Wipe all tokens from memory. Called on logout.
   */
  clear() {
    this.#tokens = null;
    this.#sealed = false;
  }

  /**
   * Prevent any further writes (e.g. during a force-logout).
   */
  seal() { this.#sealed = true; }

  /** @returns {boolean} */
  hasTokens() { return this.#tokens !== null; }

  /**
   * Parse the access token's payload (JWT claims) WITHOUT verification.
   * Verification is the server's job; this is for reading claims only.
   *
   * @returns {Object|null}
   */
  parseAccessTokenClaims() {
    const token = this.#tokens?.accessToken;
    if (!token) return null;
    try {
      const [, payload] = token.split('.');
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      return null;
    }
  }
}
```

---

## 6.3 — Token Refresh Orchestrator

### Responsibility
Proactively refreshes the access token before it expires. Handles concurrent refresh requests by sharing a single in-flight Promise. Implements exponential backoff on refresh failures before declaring the session dead.

```js
/**
 * @typedef {Object} RefreshOrchestratorOptions
 * @property {number}  [refreshBufferMs]   - Refresh this many ms before expiry (default: 60000)
 * @property {number}  [checkIntervalMs]   - How often to check if refresh is needed (default: 30000)
 * @property {number}  [maxRetries]        - Retry attempts on failure before logout (default: 3)
 * @property {number}  [retryBaseDelayMs]  - Initial retry backoff ms (default: 1000)
 * @property {function(): Promise<TokenSet>} refreshFn  - The actual refresh call (injected)
 */
```

```js
class TokenRefreshOrchestrator {
  /** @type {Promise<TokenSet>|null} - In-flight refresh; shared by all concurrent callers */
  #refreshPromise = null;

  /** @type {ReturnType<typeof setInterval>|null} */
  #timer = null;

  /** @type {TokenStore} */
  #tokenStore = null;

  /** @type {RefreshOrchestratorOptions} */
  #options = {};

  /** @type {number} */
  #failureCount = 0;

  /**
   * @param {TokenStore}                 tokenStore
   * @param {RefreshOrchestratorOptions} options
   */
  constructor(tokenStore, options) {}

  /**
   * Start the proactive refresh loop.
   * Called by AuthManager after a successful login.
   */
  start() {}

  /**
   * Stop the refresh loop.
   * Called on logout.
   */
  stop() {
    clearInterval(this.#timer);
    this.#timer = null;
    this.#refreshPromise = null;
    this.#failureCount = 0;
  }

  /**
   * Imperatively request a token refresh.
   * If a refresh is already in-flight, returns the same Promise.
   * This is the thundering-herd guard: 100 simultaneous 401s all
   * await this single Promise.
   *
   * @returns {Promise<TokenSet>}
   * @throws {RefreshFailedError} after maxRetries exhausted
   */
  async refresh() {
    if (this.#refreshPromise) return this.#refreshPromise;

    this.#refreshPromise = this.#performRefresh()
      .finally(() => { this.#refreshPromise = null; });

    return this.#refreshPromise;
  }

  /**
   * Returns true if a refresh is currently in progress.
   * @returns {boolean}
   */
  isRefreshing() { return this.#refreshPromise !== null; }

  /**
   * Internal proactive check — runs on each timer tick.
   * Only refreshes if the token is within the buffer window.
   */
  async #proactiveCheck() {}

  /**
   * Execute the actual refresh request with retry/backoff.
   * @returns {Promise<TokenSet>}
   */
  async #performRefresh() {}

  /**
   * Compute backoff delay for retry attempt n.
   * @param {number} attempt
   * @returns {number} ms
   */
  #backoff(attempt) {
    return Math.min(
      this.#options.retryBaseDelayMs * Math.pow(2, attempt),
      30_000
    );
  }
}
```

### Refresh Timing Diagram

```
Token issued at t=0, expires at t=3600s (1 hour)

  t=0        t=3540s        t=3600s
  │          │  (60s buffer) │
  │──────────┼───────────────│
             │
             proactive check fires here
             TokenStore.isAccessTokenExpired(bufferMs: 60000) === true
             │
             ▼
     #refreshPromise = performRefresh()

     Meanwhile: any interceptor calling refresh() gets
     the SAME #refreshPromise (not a second request)

             │
             ▼ success
     tokenStore.store(newTokenSet)
     #failureCount = 0
     emit 'auth:token:refreshed'

             │
             ▼ failure (3 retries exhausted)
     emit 'auth:token:refresh-failed'
     authManager.forceLogout('session-expired')
```

---

## 6.4 — Session Manager

### Responsibility
Tracks whether the current session is valid, enforces idle timeouts, and handles forced logout signals from the server (e.g. via WebSocket or BroadcastChannel). The session is the container that holds authentication — it can expire independently of the token.

```js
/**
 * @typedef {Object} SessionConfig
 * @property {number}   [idleTimeoutMs]       - Logout after inactivity (default: 30 min)
 * @property {number}   [absoluteTimeoutMs]   - Hard session limit regardless of activity (default: 8hr)
 * @property {number}   [warningBeforeMs]     - Warn user N ms before idle timeout (default: 2 min)
 * @property {boolean}  [extendOnActivity]    - Reset idle timer on user events (default: true)
 * @property {string[]} [activityEvents]      - DOM events that reset idle timer
 *                                              (default: ['click','keydown','mousemove','touchstart','scroll'])
 * @property {boolean}  [syncAcrossTabs]      - Share session state via BroadcastChannel (default: true)
 */

/**
 * @typedef {Object} SessionState
 * @property {boolean}  active
 * @property {number}   startedAt       - Unix ms
 * @property {number}   lastActivity    - Unix ms
 * @property {number}   idleTimeoutAt   - Unix ms of projected idle expiry
 * @property {number}   absoluteExpiry  - Unix ms of hard expiry
 * @property {string}   sessionId       - UUID
 */
```

```js
class SessionManager {
  /** @type {SessionState|null} */
  #session = null;

  /** @type {ReturnType<typeof setTimeout>|null} */
  #idleTimer = null;

  /** @type {ReturnType<typeof setTimeout>|null} */
  #warningTimer = null;

  /** @type {ReturnType<typeof setTimeout>|null} */
  #absoluteTimer = null;

  /** @type {SessionConfig} */
  #config = {};

  /** @type {Array<function(): void>} - DOM listener removers */
  #activityListeners = [];

  /**
   * @param {SessionConfig} config
   */
  constructor(config = {}) {}

  /**
   * Start a new session. Called by AuthManager after successful login.
   * @param {string} userId
   * @returns {SessionState}
   */
  start(userId) {}

  /**
   * End the current session. Called on logout.
   */
  end() {}

  /**
   * Reset the idle timer. Called by AuthManager.recordActivity().
   */
  resetIdleTimer() {}

  /**
   * Returns the current session state.
   * @returns {SessionState|null}
   */
  getSession() { return this.#session ? { ...this.#session } : null; }

  /**
   * Returns true if a session exists and has not expired.
   * @returns {boolean}
   */
  isActive() {
    if (!this.#session?.active) return false;
    return Date.now() < this.#session.absoluteExpiry;
  }

  /**
   * Returns ms until idle timeout fires (0 if already expired).
   * @returns {number}
   */
  idleTimeRemaining() {}

  /**
   * Subscribe to session events.
   * @param {'activity'|'warning'|'idle-expired'|'absolute-expired'|'ended'} event
   * @param {function(SessionState): void} handler
   * @returns {function} unsubscribe
   */
  on(event, handler) {}

  /**
   * Attach DOM activity listeners that call resetIdleTimer().
   */
  #attachActivityListeners() {}

  /**
   * Remove all DOM activity listeners.
   */
  #detachActivityListeners() {}

  /**
   * Schedule all timers (idle, warning, absolute).
   */
  #scheduleTimers() {}
}
```

### Idle Timeout Flow

```
Session started at t=0
Activity events attached (click, keydown, etc.)

t=28min: last user interaction
         resetIdleTimer() → idleTimeoutAt = now + 30min = t=58min
         warningTimer → fires at t=56min

t=56min: 'warning' event → show countdown dialog
         "Your session will expire in 2 minutes"

t=58min: idleTimer fires
         → emit 'auth:session:idle-expired'
         → authManager.logout({ reason: 'session-expired' })

If user clicks OK in dialog at t=57min:
         resetIdleTimer() → reschedule timers
         dismiss warning dialog
```

---

## 6.5 — Permission Registry

### Responsibility
The authoritative source of what the current user is allowed to do. Loads role-to-permission mappings at login. Exposes a query API that the Authorization Guard and RBAC/ABAC engine use. Never hardcodes permissions — all rules are data-driven.

```js
/**
 * @typedef {Object} RoleDefinition
 * @property {string}      name              - e.g. 'admin', 'editor', 'viewer'
 * @property {string}      [inherits]        - Parent role to inherit permissions from
 * @property {Permission[]} permissions      - Explicit permissions granted
 * @property {Permission[]} [denies]         - Explicit permission denials (override inherits)
 * @property {string}      [description]
 */

/**
 * @typedef {Object} PermissionQuery
 * @property {string}  action       - e.g. 'create', 'read', 'update', 'delete', 'manage'
 * @property {string}  resource     - e.g. 'orders', 'users'
 * @property {Object}  [context]    - Runtime context for ABAC conditions
 */
```

```js
class PermissionRegistry {
  /** @type {Map<string, RoleDefinition>} */
  #roles = new Map();

  /** @type {Map<string, Permission[]>} - Flattened permission cache per role (with inheritance) */
  #resolvedCache = new Map();

  /** @type {AuthUser|null} */
  #currentUser = null;

  /**
   * Register role definitions.
   * Called once at boot from a static config or dynamically from the server.
   *
   * @param {RoleDefinition[]} roles
   */
  registerRoles(roles) {}

  /**
   * Load the permission set for a specific user.
   * Called by AuthManager after login.
   * Resolves role inheritance, flattens permissions, caches result.
   *
   * @param {AuthUser} user
   */
  loadForUser(user) {}

  /**
   * Check if the current user has a specific permission.
   * Returns false if no user is loaded.
   *
   * @param {PermissionQuery} query
   * @returns {boolean}
   */
  can(query) {}

  /**
   * Check if the current user has ALL of the given permissions.
   * @param {PermissionQuery[]} queries
   * @returns {boolean}
   */
  canAll(queries) {
    return queries.every(q => this.can(q));
  }

  /**
   * Check if the current user has ANY of the given permissions.
   * @param {PermissionQuery[]} queries
   * @returns {boolean}
   */
  canAny(queries) {
    return queries.some(q => this.can(q));
  }

  /**
   * Return all permissions the current user has for a resource.
   * @param {string} resource
   * @returns {Permission[]}
   */
  getPermissionsForResource(resource) {}

  /**
   * Return all roles the current user holds.
   * @returns {string[]}
   */
  getUserRoles() {
    return this.#currentUser?.roles ?? [];
  }

  /**
   * Returns true if the current user has the specified role.
   * @param {string} role
   * @returns {boolean}
   */
  hasRole(role) {
    return this.#currentUser?.roles?.includes(role) ?? false;
  }

  /**
   * Clear the current user's permissions (called on logout).
   */
  clear() {
    this.#currentUser = null;
    this.#resolvedCache.clear();
  }

  /**
   * Resolve inherited permissions for a role recursively.
   * Memoized per role name.
   *
   * @param {string}  roleName
   * @param {Set<string>} [visited]   - Cycle detection
   * @returns {Permission[]}
   */
  #resolveRole(roleName, visited = new Set()) {}
}
```

### Permission Registry Example

```js
registry.registerRoles([
  {
    name:        'viewer',
    description: 'Read-only access',
    permissions: [
      { action: 'read',   resource: 'orders'   },
      { action: 'read',   resource: 'products' },
      { action: 'read',   resource: 'reports'  },
    ],
  },
  {
    name:        'editor',
    inherits:    'viewer',     // gets all viewer permissions + these
    permissions: [
      { action: 'create', resource: 'orders'   },
      { action: 'update', resource: 'orders',  conditions: { ownOnly: true } },
      { action: 'create', resource: 'products' },
      { action: 'update', resource: 'products' },
    ],
  },
  {
    name:        'admin',
    inherits:    'editor',
    permissions: [
      { action: 'manage', resource: '*' },   // wildcard resource
    ],
    denies: [],
  },
  {
    name:        'billing-manager',
    inherits:    'viewer',
    permissions: [
      { action: 'manage', resource: 'billing'  },
      { action: 'read',   resource: 'invoices' },
    ],
  },
]);

// User has roles: ['editor', 'billing-manager']
registry.loadForUser(user);

registry.can({ action: 'create', resource: 'orders'  }); // true (editor)
registry.can({ action: 'delete', resource: 'orders'  }); // false
registry.can({ action: 'manage', resource: 'billing' }); // true (billing-manager)
registry.can({ action: 'manage', resource: 'users'   }); // false
```

---

## 6.6 — Authorization Guard

### Responsibility
The enforcement point. Called before route transitions, action dispatches, and conditional UI rendering. Provides a clean, declarative API for checking permissions without spreading permission logic across the codebase.

```js
/**
 * @typedef {Object} GuardConfig
 * @property {PermissionQuery | PermissionQuery[]} [permission]
 *           Single permission or array (ALL must pass for AND, use canAny for OR).
 * @property {string | string[]}  [roles]       - Required roles (ANY match = pass)
 * @property {function(AuthUser): boolean} [custom]
 *           Custom check function. Receives current user. Return true to allow.
 * @property {string}  [redirectTo]             - Route name on denial (default: 'errors.forbidden')
 * @property {string}  [unauthenticatedRedirect] - Route name if not logged in (default: 'auth.login')
 * @property {boolean} [silent]                 - Don't redirect; just return false (for UI guards)
 */

/**
 * @typedef {Object} GuardResult
 * @property {boolean}      allowed
 * @property {string|null}  redirectTo   - null if silent: true
 * @property {string}       reason       - 'unauthenticated'|'forbidden'|'missing-role'|'custom'
 */
```

```js
class AuthorizationGuard {
  /** @type {PermissionRegistry} */
  #registry = null;

  /** @type {AuthManager} */
  #authManager = null;

  /** @type {AuthAuditLogger} */
  #auditLogger = null;

  /**
   * @param {PermissionRegistry} registry
   * @param {AuthManager}        authManager
   * @param {AuthAuditLogger}    auditLogger
   */
  constructor(registry, authManager, auditLogger) {}

  /**
   * Evaluate a guard config and return a result.
   * This is the core check — all other methods call this.
   *
   * @param {GuardConfig}  config
   * @param {Object}       [context]   - Runtime ABAC context (e.g. { resourceOwnerId: '42' })
   * @returns {GuardResult}
   */
  evaluate(config, context = {}) {}

  /**
   * Check if the current user can perform an action on a resource.
   * Shorthand for evaluate() with a permission query.
   *
   * @param {string}  action
   * @param {string}  resource
   * @param {Object}  [context]
   * @returns {boolean}
   */
  can(action, resource, context = {}) {
    return this.evaluate({
      permission: { action, resource, conditions: context },
      silent: true,
    }).allowed;
  }

  /**
   * Check if the current user has a role.
   * @param {string|string[]} roles   - ANY match = allowed
   * @returns {boolean}
   */
  hasRole(roles) {
    const roleList = Array.isArray(roles) ? roles : [roles];
    return roleList.some(r => this.#registry.hasRole(r));
  }

  /**
   * Route navigation guard factory.
   * Returns a NavigationGuardFn (Module 1 interface) that enforces auth.
   *
   * @param {GuardConfig} config
   * @returns {GuardFn}
   */
  toRouteGuard(config) {
    return async ({ to }) => {
      const result = this.evaluate({
        ...config,
        redirectTo: config.redirectTo ?? 'errors.forbidden',
      });
      if (result.allowed) return { proceed: true };
      return {
        proceed:  false,
        redirect: result.redirectTo,
        reason:   result.reason,
      };
    };
  }

  /**
   * React-style conditional render helper.
   * Returns true if the user is allowed, false otherwise.
   * Never throws. Logs denial to audit trail.
   *
   * @param {GuardConfig} config
   * @returns {boolean}
   */
  renderIf(config) {
    return this.evaluate({ ...config, silent: true }).allowed;
  }
}
```

### Authorization Guard Usage

```js
// ── Route guard (Module 1 integration) ───────────────────────────────
router.register([
  {
    path:  '/admin/users',
    name:  'admin.users',
    meta: {
      guard: authGuard.toRouteGuard({
        roles:      ['admin'],
        redirectTo: 'errors.forbidden',
      }),
    },
  },
  {
    path:  '/orders/:id',
    name:  'orders.detail',
    meta: {
      guard: authGuard.toRouteGuard({
        permission: { action: 'read', resource: 'orders' },
      }),
    },
  },
]);

// ── Action guard (before store dispatch) ─────────────────────────────
if (!authGuard.can('delete', 'orders')) {
  throw new ForbiddenError('Cannot delete orders');
}
store.dispatch('orders/delete', { orderId });

// ── Conditional UI rendering ──────────────────────────────────────────
// In template / render function:
if (authGuard.renderIf({ permission: { action: 'create', resource: 'users' } })) {
  renderCreateUserButton();
}

// ── Complex guard ─────────────────────────────────────────────────────
const result = authGuard.evaluate({
  permission: [
    { action: 'read',   resource: 'reports' },
    { action: 'export', resource: 'reports' },
  ],
  custom: (user) => user.attributes?.department === 'finance',
  silent: false,
  redirectTo: 'errors.forbidden',
});
```

---

## 6.7 — RBAC / ABAC Engine

### Responsibility
Evaluates permission queries against the current user's roles (RBAC) and attributes (ABAC). Handles wildcard resources, conditional permissions, and hierarchical role resolution. This is the algorithmic core — the Authorization Guard calls it, but it has no knowledge of routing or UI.

```js
/**
 * @typedef {Object} EvaluationContext
 * @property {AuthUser}    user
 * @property {Permission[]} resolvedPermissions   - Flattened from all roles
 * @property {Object}       [runtime]             - Runtime data: { resourceOwnerId, tenantId }
 */

/**
 * @typedef {Object} EvaluationResult
 * @property {boolean}     allowed
 * @property {string}      reason       - Why allowed or denied (for audit)
 * @property {Permission}  [matchedBy]  - Which permission rule granted access
 */
```

```js
class RBACEngine {
  /**
   * Evaluate a single permission query against a resolved permission set.
   *
   * @param {PermissionQuery}   query
   * @param {EvaluationContext} context
   * @returns {EvaluationResult}
   */
  evaluate(query, context) {}

  /**
   * Check a wildcard resource match.
   * 'manage' on '*' grants everything.
   * 'read' on 'orders' matches 'read:orders' and 'manage:orders' and 'manage:*'.
   *
   * @param {Permission}      rule
   * @param {PermissionQuery} query
   * @returns {boolean}
   */
  #matchesResource(rule, query) {}

  /**
   * Check if the action matches.
   * 'manage' is a super-action that implies all other actions.
   *
   * @param {string} ruleAction    - e.g. 'manage', 'read'
   * @param {string} queryAction   - e.g. 'delete'
   * @returns {boolean}
   */
  #matchesAction(ruleAction, queryAction) {
    if (ruleAction === 'manage') return true;
    return ruleAction === queryAction;
  }

  /**
   * Evaluate ABAC conditions on a matching permission.
   * Returns false if any condition fails.
   *
   * @param {Object}            conditions  - Permission.conditions
   * @param {EvaluationContext} context
   * @returns {boolean}
   */
  #evaluateConditions(conditions, context) {}
}

class ABACEngine {
  /** @type {Map<string, ABACConditionEvaluator>} */
  #evaluators = new Map();

  /**
   * Register a condition evaluator.
   * @param {string}                   conditionKey
   * @param {ABACConditionEvaluator}   evaluator
   */
  registerCondition(conditionKey, evaluator) {}

  /**
   * Evaluate all conditions on a permission rule.
   * @param {Object}            conditions
   * @param {EvaluationContext} context
   * @returns {boolean}
   */
  evaluate(conditions, context) {}
}

/**
 * @callback ABACConditionEvaluator
 * @param {*}                 conditionValue  - From Permission.conditions
 * @param {EvaluationContext} context
 * @returns {boolean}
 */
```

### Built-in ABAC Conditions

```js
abacEngine.registerCondition('ownOnly', (value, { user, runtime }) => {
  // value = true: user can only act on resources they own
  if (!value) return true;
  return runtime?.resourceOwnerId === user.id;
});

abacEngine.registerCondition('tenantScoped', (value, { user, runtime }) => {
  // value = true: resource must belong to user's active tenant
  if (!value) return true;
  return runtime?.tenantId === user.tenantId;
});

abacEngine.registerCondition('departmentMatch', (value, { user }) => {
  // value = 'finance': user's department attribute must match
  return user.attributes?.department === value;
});

abacEngine.registerCondition('clearanceLevel', (requiredLevel, { user }) => {
  // value = 3: user must have clearanceLevel >= 3
  return (user.attributes?.clearanceLevel ?? 0) >= requiredLevel;
});

// Usage — permission with ABAC condition:
{
  action:     'update',
  resource:   'orders',
  conditions: {
    ownOnly:      true,      // only own orders
    tenantScoped: true,      // only within their org
  }
}
```

---

## 6.8 — Multi-Tenant Context

### Responsibility
Manages the active tenant/organization context for users who belong to multiple tenants. Ensures API requests are scoped to the active tenant, permissions are filtered by tenant, and switching tenants is clean and auditable.

```js
/**
 * @typedef {Object} Tenant
 * @property {string}   id
 * @property {string}   name
 * @property {string}   [slug]
 * @property {string}   [logoUrl]
 * @property {Object}   [settings]      - Tenant-specific feature flags / config
 * @property {string[]} [userRoles]     - This user's roles within this tenant
 */

/**
 * @typedef {Object} TenantContext
 * @property {Tenant}   activeTenant
 * @property {Tenant[]} availableTenants
 * @property {boolean}  isSwitching
 */
```

```js
class MultiTenantContext {
  /** @type {TenantContext|null} */
  #context = null;

  /** @type {AuthManager} */
  #authManager = null;

  /** @type {PermissionRegistry} */
  #permissionRegistry = null;

  /**
   * @param {AuthManager}        authManager
   * @param {PermissionRegistry} permissionRegistry
   */
  constructor(authManager, permissionRegistry) {}

  /**
   * Initialize tenant context after login.
   * Loads available tenants, sets active tenant from user's last session
   * (or from URL slug, or defaults to first).
   *
   * @param {AuthUser}  user
   * @param {Tenant[]}  tenants
   * @returns {Promise<TenantContext>}
   */
  async init(user, tenants) {}

  /**
   * Switch the active tenant.
   * Re-fetches the user's roles for the new tenant.
   * Re-loads permissions into PermissionRegistry.
   * Emits 'auth:tenant:switched' event.
   * Optionally triggers a token refresh (some providers scope tokens to tenant).
   *
   * @param {string} tenantId
   * @returns {Promise<TenantContext>}
   */
  async switchTo(tenantId) {}

  /**
   * Get the active tenant.
   * @returns {Tenant|null}
   */
  getActiveTenant() { return this.#context?.activeTenant ?? null; }

  /**
   * Get the active tenant ID.
   * Shorthand for injection into API requests and storage keys.
   * @returns {string|null}
   */
  getActiveTenantId() { return this.#context?.activeTenant?.id ?? null; }

  /**
   * Get all tenants available to the current user.
   * @returns {Tenant[]}
   */
  getAvailableTenants() { return this.#context?.availableTenants ?? []; }

  /**
   * Returns true if the user belongs to more than one tenant.
   * @returns {boolean}
   */
  isMultiTenant() { return (this.#context?.availableTenants.length ?? 0) > 1; }

  /**
   * Subscribe to tenant context changes.
   * @param {function(TenantContext): void} handler
   * @returns {function} unsubscribe
   */
  onChange(handler) {}

  /**
   * Clear tenant context on logout.
   */
  clear() { this.#context = null; }
}
```

---

## 6.9 — SSO Adapter

### Responsibility
Abstracts provider-specific OAuth2/OIDC/SAML flows behind a common interface. Each provider (Google, Okta, Azure AD, etc.) has its own adapter implementation. The Auth Manager only knows the `SSOAdapter` interface.

```js
/**
 * @interface SSOAdapter
 * Every SSO provider implements this interface.
 */
class SSOAdapter {
  /** @type {string} - Provider identifier e.g. 'google', 'okta' */
  providerId = '';

  /**
   * Initiate the SSO flow.
   * - For redirect flow: navigates away; returns never.
   * - For popup flow: opens popup; returns when user completes auth.
   * - For silent flow: attempts iframe/cookie-based; throws if no session.
   *
   * @param {'redirect'|'popup'|'silent'} mode
   * @param {Object} [options]
   * @returns {Promise<SSOResult>}
   */
  async login(mode, options = {}) { throw new Error('Not implemented'); }

  /**
   * Handle the callback after redirect.
   * Called when the app loads at the redirect_uri.
   * Extracts code/token from URL, exchanges for token set.
   *
   * @param {string} callbackUrl   - Current window.location.href
   * @returns {Promise<SSOResult>}
   */
  async handleCallback(callbackUrl) { throw new Error('Not implemented'); }

  /**
   * Silently refresh the session using an existing SSO session.
   * Typically via a hidden iframe or cookies.
   *
   * @returns {Promise<TokenSet>}
   */
  async silentRefresh() { throw new Error('Not implemented'); }

  /**
   * Log out from the SSO provider (RP-initiated logout).
   * @param {Object} [options]
   * @returns {Promise<void>}
   */
  async logout(options = {}) { throw new Error('Not implemented'); }

  /**
   * Normalize provider-specific user claims to the internal AuthUser shape.
   * @param {Object} claims    - Raw OIDC claims or SAML attributes
   * @returns {AuthUser}
   */
  normalizeUser(claims) { throw new Error('Not implemented'); }
}

/**
 * @typedef {Object} SSOResult
 * @property {TokenSet}  tokenSet
 * @property {AuthUser}  user
 * @property {string}    [state]    - CSRF state parameter verified
 */
```

### OAuth2/OIDC Adapter Implementation

```js
class OIDCAdapter extends SSOAdapter {
  /** @type {string} */
  providerId = 'oidc';

  /** @type {OIDCConfig} */
  #config = null;

  /** @type {Map<string, string>} - state → codeVerifier (PKCE) */
  #pendingStates = new Map();

  /**
   * @typedef {Object} OIDCConfig
   * @property {string}   clientId
   * @property {string}   issuer            - e.g. 'https://accounts.google.com'
   * @property {string}   redirectUri
   * @property {string[]} scope             - ['openid','profile','email']
   * @property {string}   [responseType]    - 'code' (default, PKCE)
   * @property {string}   [tokenEndpoint]   - Override if not discoverable
   * @property {string}   [userinfoEndpoint]
   * @property {boolean}  [usePKCE]         - Default: true
   */

  /** @param {OIDCConfig} config */
  constructor(config) {
    super();
    this.#config = config;
  }

  async login(mode = 'redirect', options = {}) {
    const state        = this.#generateState();
    const codeVerifier = this.#config.usePKCE !== false
      ? this.#generateCodeVerifier()
      : null;
    const codeChallenge = codeVerifier
      ? await this.#generateCodeChallenge(codeVerifier)
      : null;

    // Store state + verifier in sessionStorage for callback
    sessionStorage.setItem(`oidc:${state}`, JSON.stringify({ codeVerifier }));

    const url = this.#buildAuthorizationUrl({ state, codeChallenge, ...options });

    if (mode === 'redirect') {
      window.location.href = url;
      return new Promise(() => {});    // never resolves; page navigates away
    }
    if (mode === 'popup') {
      return this.#loginWithPopup(url, state);
    }
    if (mode === 'silent') {
      return this.#loginSilently(url, state);
    }
  }

  async handleCallback(callbackUrl) {}
  async silentRefresh() {}
  async logout(options = {}) {}

  normalizeUser(claims) {
    return {
      id:        claims.sub,
      email:     claims.email,
      name:      claims.name,
      avatarUrl: claims.picture,
      roles:     claims['roles'] ?? claims['https://myapp.com/roles'] ?? [],
      claims,
    };
  }

  /** Generate cryptographically random state parameter */
  #generateState() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, '');
  }

  /** PKCE code verifier */
  #generateCodeVerifier() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /** PKCE S256 code challenge */
  async #generateCodeChallenge(verifier) {
    const bytes = new TextEncoder().encode(verifier);
    const hash  = await crypto.subtle.digest('SHA-256', bytes);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  #buildAuthorizationUrl(params) {}
  async #loginWithPopup(url, state) {}
  async #loginSilently(url, state) {}
}
```

---

## 6.10 — CSRF Token Manager

### Responsibility
Manages CSRF tokens for all mutating HTTP requests. Fetches a CSRF token from the server on boot, injects it into request headers automatically via the HTTP interceptor chain (Module 4), and rotates it after use or on a schedule.

```js
/**
 * @typedef {Object} CSRFOptions
 * @property {string}  [headerName]      - Header to inject token into (default: 'X-CSRF-Token')
 * @property {string}  [cookieName]      - Read from cookie instead of fetching (default: 'csrf-token')
 * @property {string}  [endpoint]        - Endpoint to fetch token from (default: '/api/csrf-token')
 * @property {string[]} [protectedMethods] - Methods that require CSRF (default: ['POST','PUT','PATCH','DELETE'])
 * @property {boolean} [rotateOnUse]     - Request new token after each use (default: false)
 * @property {number}  [tokenTTLMs]     - Token lifetime before proactive refresh (default: 30min)
 */
```

```js
class CSRFTokenManager {
  /** @type {string|null} - Current CSRF token (memory only) */
  #token = null;

  /** @type {number|null} - Unix ms when token was fetched */
  #fetchedAt = null;

  /** @type {Promise<string>|null} - In-flight fetch (deduplication) */
  #fetchPromise = null;

  /** @type {CSRFOptions} */
  #options = {};

  /** @param {CSRFOptions} [options] */
  constructor(options = {}) {
    this.#options = {
      headerName:        'X-CSRF-Token',
      cookieName:        'csrf-token',
      endpoint:          '/api/csrf-token',
      protectedMethods:  ['POST', 'PUT', 'PATCH', 'DELETE'],
      rotateOnUse:       false,
      tokenTTLMs:        30 * 60_000,
      ...options,
    };
  }

  /**
   * Initialize: attempt to read token from cookie (double-submit pattern)
   * or fetch from server endpoint.
   * @returns {Promise<void>}
   */
  async init() {}

  /**
   * Get the current valid CSRF token.
   * Refreshes automatically if expired.
   * @returns {Promise<string>}
   */
  async getToken() {}

  /**
   * Explicitly rotate the token (fetch a new one from server).
   * @returns {Promise<string>}
   */
  async rotate() {}

  /**
   * Returns an InterceptorRegistration (Module 4 interface) that
   * automatically injects the CSRF header into protected requests.
   *
   * @returns {InterceptorRegistration}
   */
  toInterceptor() {
    return {
      id:       'csrf',
      priority: 15,
      onRequest: async (config) => {
        const method = config.method.toUpperCase();
        if (!this.#options.protectedMethods.includes(method)) return config;

        const token = await this.getToken();
        return {
          ...config,
          headers: {
            ...config.headers,
            [this.#options.headerName]: token,
          },
        };
      },
    };
  }

  /**
   * Read CSRF token from cookie (double-submit cookie pattern).
   * @returns {string|null}
   */
  #readFromCookie() {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${this.#options.cookieName}=([^;]+)`)
    );
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Returns true if the current token is stale and needs rotation.
   * @returns {boolean}
   */
  #isStale() {
    if (!this.#token || !this.#fetchedAt) return true;
    return Date.now() - this.#fetchedAt > this.#options.tokenTTLMs;
  }
}
```

---

## 6.11 — Auth Audit Logger

### Responsibility
Records all security-relevant authentication and authorization events in an immutable, append-only log. Distinct from the Event Bus audit trail (Module 5) — this log is compliance-focused, includes denial reasons, and is always shipped to a remote store.

```js
/**
 * @typedef {Object} AuthAuditEvent
 * @property {string}  id            - UUID
 * @property {number}  timestamp
 * @property {AuthAuditEventType}  type
 * @property {string}  [userId]
 * @property {string}  [tenantId]
 * @property {string}  [sessionId]
 * @property {string}  [ipAddress]   - From request context if available
 * @property {string}  [userAgent]
 * @property {Object}  [details]     - Event-specific fields
 * @property {'success'|'failure'}  outcome
 */

/**
 * @typedef {'login'|'logout'|'login-failed'|'mfa-challenge'|'mfa-success'|'mfa-failed'
 *          |'token-refreshed'|'token-refresh-failed'|'session-expired'|'session-idle'
 *          |'permission-denied'|'role-changed'|'tenant-switched'|'force-logout'
 *          |'password-reset'|'account-locked'} AuthAuditEventType
 */
```

```js
class AuthAuditLogger {
  /** @type {AuthAuditEvent[]} - Local ring buffer */
  #log = [];

  /** @type {number} */
  #maxLocalSize = 500;

  /** @type {function(AuthAuditEvent[]): Promise<void>|null} */
  #remoteTransport = null;

  /** @type {AuthAuditEvent[]} - Buffer for batched remote shipping */
  #shipBuffer = [];

  /** @type {ReturnType<typeof setInterval>|null} */
  #shipTimer = null;

  /**
   * @param {Object} [options]
   * @param {function(AuthAuditEvent[]): Promise<void>} [options.transport]
   * @param {number}  [options.shipIntervalMs]   - Batch ship interval (default: 5000)
   * @param {number}  [options.maxLocalSize]
   */
  constructor(options = {}) {}

  /**
   * Record an auth audit event.
   * Adds to local ring buffer and ship buffer.
   *
   * @param {AuthAuditEventType}  type
   * @param {'success'|'failure'} outcome
   * @param {Object}              [details]
   */
  record(type, outcome, details = {}) {}

  // ── Convenience methods ───────────────────────────────────────────────

  /** @param {string} userId @param {string} [method] */
  loginSuccess(userId, method)         { this.record('login',             'success', { userId, method }); }
  /** @param {string} email @param {string} reason */
  loginFailed(email, reason)           { this.record('login-failed',      'failure', { email, reason }); }
  /** @param {string} userId @param {string} reason */
  logout(userId, reason)               { this.record('logout',            'success', { userId, reason }); }
  /** @param {string} userId */
  tokenRefreshed(userId)               { this.record('token-refreshed',   'success', { userId }); }
  /** @param {string} userId @param {string} reason */
  tokenRefreshFailed(userId, reason)   { this.record('token-refresh-failed','failure',{ userId, reason }); }
  /** @param {string} userId @param {string} reason */
  sessionExpired(userId, reason)       { this.record('session-expired',   'failure', { userId, reason }); }
  /**
   * @param {string} userId
   * @param {PermissionQuery} query
   * @param {string} reason
   */
  permissionDenied(userId, query, reason) {
    this.record('permission-denied', 'failure', { userId, ...query, reason });
  }
  /** @param {string} userId @param {string} from @param {string} to */
  tenantSwitched(userId, from, to)     { this.record('tenant-switched',   'success', { userId, from, to }); }

  /**
   * Query the local audit log.
   * @param {Object} [filter]
   * @param {AuthAuditEventType} [filter.type]
   * @param {string}  [filter.userId]
   * @param {number}  [filter.fromTimestamp]
   * @param {number}  [filter.toTimestamp]
   * @param {number}  [filter.limit]
   * @returns {AuthAuditEvent[]}
   */
  query(filter = {}) {}

  /**
   * Force-flush the ship buffer to remote transport immediately.
   * Called on logout / beforeunload.
   * @returns {Promise<void>}
   */
  async flush() {}

  /**
   * Set the remote transport function.
   * @param {function(AuthAuditEvent[]): Promise<void>} fn
   */
  setTransport(fn) {
    this.#remoteTransport = fn;
    this.#startShipTimer();
  }

  #startShipTimer() {}
  #stopShipTimer() {}
  async #ship() {}
}
```

---

## Wiring: Full Bootstrap Sequence

```js
// auth/index.js — assembled at boot by the DI Container

import AuthManager               from './AuthManager.js';
import TokenStore                from './TokenStore.js';
import TokenRefreshOrchestrator  from './TokenRefreshOrchestrator.js';
import SessionManager            from './SessionManager.js';
import PermissionRegistry        from './PermissionRegistry.js';
import AuthorizationGuard        from './AuthorizationGuard.js';
import RBACEngine                from './RBACEngine.js';
import ABACEngine                from './ABACEngine.js';
import MultiTenantContext        from './MultiTenantContext.js';
import OIDCAdapter               from './adapters/OIDCAdapter.js';
import CSRFTokenManager          from './CSRFTokenManager.js';
import AuthAuditLogger           from './AuthAuditLogger.js';

// ── 1. Build leaf dependencies first ───────────────────────────────────
const auditLogger  = new AuthAuditLogger({
  transport:     (events) => httpClient.post('/api/audit', events),
  shipIntervalMs: 5_000,
});

const tokenStore = new TokenStore();

const csrfManager = new CSRFTokenManager({
  headerName:  'X-CSRF-Token',
  endpoint:    '/api/csrf-token',
  tokenTTLMs:  30 * 60_000,
});

// ── 2. Session manager ─────────────────────────────────────────────────
const sessionManager = new SessionManager({
  idleTimeoutMs:     30 * 60_000,   // 30 min
  absoluteTimeoutMs:  8 * 3600_000, // 8 hr
  warningBeforeMs:    2 * 60_000,   // warn 2 min early
  activityEvents:    ['click', 'keydown', 'mousemove', 'touchstart'],
  syncAcrossTabs:    true,
});

sessionManager.on('warning', () => {
  eventBus.emit('auth:session:warning', { secondsLeft: 120 });
});
sessionManager.on('idle-expired', () => {
  authManager.logout({ reason: 'session-expired' });
});

// ── 3. Token refresh orchestrator ──────────────────────────────────────
const refreshOrchestrator = new TokenRefreshOrchestrator(tokenStore, {
  refreshBufferMs:  60_000,
  checkIntervalMs:  30_000,
  maxRetries:       3,
  refreshFn: () => httpClient.post('/api/auth/refresh', null, {
    meta: { _isRefresh: true },   // skip auth interceptor
  }).then(r => r.data),
});

// ── 4. Permission system ────────────────────────────────────────────────
const abacEngine        = new ABACEngine();
const rbacEngine        = new RBACEngine(abacEngine);
const permissionRegistry = new PermissionRegistry(rbacEngine);

// Register built-in ABAC conditions
abacEngine.registerCondition('ownOnly',       ownOnlyCondition);
abacEngine.registerCondition('tenantScoped',  tenantScopedCondition);

// Load role definitions (could also come from server at login)
permissionRegistry.registerRoles(appRoleDefinitions);

// ── 5. Multi-tenant context ────────────────────────────────────────────
const tenantContext = new MultiTenantContext(null, permissionRegistry);

// ── 6. Auth manager (top-level orchestrator) ───────────────────────────
const authManager = new AuthManager(
  {
    loginRoute:      'auth.login',
    postLoginRoute:  'dashboard',
    postLogoutRoute: 'auth.login',
  },
  tokenStore,
  refreshOrchestrator,
  sessionManager,
  permissionRegistry,
  auditLogger,
  csrfManager,
);

// ── 7. Register SSO adapters ────────────────────────────────────────────
authManager.registerAdapter('google', new OIDCAdapter({
  clientId:    GOOGLE_CLIENT_ID,
  issuer:      'https://accounts.google.com',
  redirectUri: `${window.location.origin}/auth/callback`,
  scope:       ['openid', 'profile', 'email'],
}));

authManager.registerAdapter('okta', new OIDCAdapter({
  clientId:    OKTA_CLIENT_ID,
  issuer:      `https://${OKTA_DOMAIN}/oauth2/default`,
  redirectUri: `${window.location.origin}/auth/callback`,
  scope:       ['openid', 'profile', 'email', 'roles'],
}));

// ── 8. Authorization guard ──────────────────────────────────────────────
const authGuard = new AuthorizationGuard(permissionRegistry, authManager, auditLogger);

// ── 9. Inject CSRF into HTTP client ────────────────────────────────────
httpClient.interceptors.add(csrfManager.toInterceptor());

// ── 10. Wire activity tracking ─────────────────────────────────────────
eventBus.on('ui:*', () => authManager.recordActivity(), { priority: 10 });

// ── 11. Bootstrap ──────────────────────────────────────────────────────
await csrfManager.init();
const initialState = await authManager.init();

// ── 12. Flush audit log on exit ─────────────────────────────────────────
window.addEventListener('beforeunload', () => auditLogger.flush());

export { authManager, authGuard, permissionRegistry, tenantContext, tokenStore, csrfManager };
```

---

## Event Bus Emissions (Module 5 integration)

| Event name | Payload | When |
|---|---|---|
| `auth:login:started` | `{ method }` | Login attempt begins |
| `auth:login:success` | `{ user, method }` | Login completed |
| `auth:login:failed` | `{ reason, errorCode }` | Login rejected |
| `auth:logout` | `{ userId, reason }` | Logout completed |
| `auth:token:refreshed` | `{ userId }` | Token refresh succeeded |
| `auth:token:refresh-failed` | `{ userId, attempt }` | Token refresh failed |
| `auth:session:warning` | `{ secondsLeft }` | Idle timeout approaching |
| `auth:session:idle-expired` | `{ userId }` | Idle timeout fired |
| `auth:session:absolute-expired` | `{ userId }` | Hard session limit reached |
| `auth:permission:denied` | `{ userId, action, resource, reason }` | Authorization check failed |
| `auth:tenant:switched` | `{ userId, from, to }` | Active tenant changed |
| `auth:user:loaded` | `{ user }` | User profile available (buffered) |
| `auth:mfa:required` | `{ challengeId }` | MFA step needed |
| `auth:force-logout` | `{ reason }` | External forced logout |

---