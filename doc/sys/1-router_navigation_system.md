# Module 1 — 🧭 Router / Navigation System

> **Core Principle:** The URL is the single source of truth for application state. Every navigable state the user can reach must be expressible as a URL, and every URL must deterministically produce the same application state.

---

## Architecture Overview

```
window.location / window.history
            │
            ▼
    ┌───────────────────┐
    │   History Manager │  ← owns the browser History API
    └────────┬──────────┘
             │ fires navigation intent
             ▼
    ┌───────────────────┐
    │  Navigation Guard │  ← before/after hooks, can cancel
    └────────┬──────────┘
             │ approved
             ▼
    ┌───────────────────┐     ┌─────────────────────┐
    │    Path Router    │────►│ Route Transition Mgr │
    └────────┬──────────┘     └─────────────────────┘
             │ matched route
     ┌───────┼────────────┐
     ▼       ▼            ▼
  Query    Fragment    Scroll
  Param    Manager    Restoration
  Manager             Manager
     │
     ▼
  Deep Link Resolver
  Canonical URL Builder
```

---

## 1.1 — Path Router

### Responsibility
Maps URL pathnames to route definitions. Resolves dynamic segments, supports nested routes, and drives the root rendering decision.

### Route Definition Interface

```js
/**
 * @typedef {Object} RouteDefinition
 * @property {string}                     path        - Pattern string. Supports :param, *wildcard, (optional?)
 * @property {string}                     name        - Unique symbolic name e.g. 'user.profile'
 * @property {() => Promise<RouteHandler>} component  - Async factory; enables code-splitting
 * @property {RouteDefinition[]}          [children]  - Nested child routes
 * @property {Object}                     [meta]      - Arbitrary metadata: auth, title, flags
 * @property {string}                     [redirect]  - Redirect to named route or path string
 * @property {boolean}                    [exact]     - Default true; false allows prefix matching
 */

/**
 * @typedef {Object} RouteHandler
 * @property {function(RouteContext): void}  onEnter  - Called when route becomes active
 * @property {function(RouteContext): void}  onLeave  - Called when route is being left
 * @property {function(RouteContext): void}  render   - Renders the view into the outlet
 */

/**
 * @typedef {Object} RouteContext
 * @property {string}               path       - Matched path string
 * @property {Object.<string,string>} params   - Dynamic segments e.g. { id: '42' }
 * @property {QueryParams}          query      - Parsed query parameters (see 1.2)
 * @property {string}               fragment   - Hash fragment without '#'
 * @property {RouteDefinition}      route      - The matched route definition
 * @property {RouteDefinition|null} parent     - Parent route if nested
 * @property {any}                  state      - History state payload
 */
```

### PathRouter Class

```js
class PathRouter {
  /** @type {RouteDefinition[]} */
  #routes = [];

  /** @type {RouteContext|null} */
  #currentContext = null;

  /** @type {Map<string, RegExp>} */
  #compiledPatterns = new Map();

  /**
   * Register route definitions. Call once at boot.
   * @param {RouteDefinition[]} routes
   */
  register(routes) {}

  /**
   * Resolve a pathname to a matched route and extracted params.
   * Returns null if no route matched.
   * @param {string} pathname
   * @returns {{ route: RouteDefinition, params: Object } | null}
   */
  resolve(pathname) {}

  /**
   * Programmatically navigate to a named route.
   * Delegates to HistoryManager.push()
   * @param {string} name         - Route name
   * @param {Object} [params]     - Dynamic segment values
   * @param {Object} [query]      - Query parameters
   * @param {string} [fragment]   - Hash fragment
   */
  navigate(name, params = {}, query = {}, fragment = '') {}

  /**
   * Replace current history entry without adding a new one.
   * @param {string} name
   * @param {Object} [params]
   * @param {Object} [query]
   * @param {string} [fragment]
   */
  replace(name, params = {}, query = {}, fragment = '') {}

  /**
   * Returns the currently active RouteContext.
   * @returns {RouteContext|null}
   */
  getCurrentContext() {}

  /**
   * Subscribe to route change events.
   * @param {function(RouteContext): void} handler
   * @returns {function} unsubscribe
   */
  onChange(handler) {}
}
```

### Pattern Compilation Rules

| Pattern token | Meaning | Example | Matches |
|---|---|---|---|
| `:param` | Required named segment | `/users/:id` | `/users/42` → `{ id: '42' }` |
| `:param?` | Optional named segment | `/users/:id?` | `/users` or `/users/42` |
| `*` | Wildcard (rest of path) | `/files/*` | `/files/a/b/c` |
| `(regex)` | Inline regex constraint | `/items/:id(\\d+)` | Only numeric ids |

Pattern compilation produces a `RegExp` with named capture groups. Compiled patterns are cached in `#compiledPatterns` keyed by pattern string.

### Route Matching Algorithm

```
1. Flatten all registered routes into a depth-first ordered list
   (children are inserted after their parent)
2. For each candidate route (in order):
   a. Compile pattern → RegExp (or retrieve from cache)
   b. Test pathname against RegExp
   c. On match: extract named captures as params{}
   d. If route has a redirect: resolve redirect target and restart
   e. Return { route, params }
3. If no match: return null → render 404 outlet
```

---

## 1.2 — Query Parameter Manager

### Responsibility
Treats the query string as a typed, structured filter/options object. The raw string is never manipulated directly by application code.

### Interfaces

```js
/**
 * @typedef {Object} QueryParamSchema
 * @property {'string'|'number'|'boolean'|'array'|'json'} type
 * @property {*}       [default]     - Value used when param is absent
 * @property {boolean} [persist]     - Write to URL on set (default true)
 * @property {number}  [min]         - For numeric types
 * @property {number}  [max]         - For numeric types
 * @property {Array}   [enum]        - Allowlist of values
 */

/**
 * @typedef {Object.<string, QueryParamSchema>} QuerySchemaMap
 * Map of param name → schema. Registered per route or globally.
 */
```

```js
class QueryParamManager {
  /** @type {QuerySchemaMap} */
  #schema = {};

  /**
   * Register schema for current route's query params.
   * Called by PathRouter when a new route is matched.
   * @param {QuerySchemaMap} schema
   */
  registerSchema(schema) {}

  /**
   * Parse a raw query string into a typed object.
   * Applies defaults, coerces types, strips unknown params (if strict).
   * @param {string} queryString  - e.g. '?page=2&active=true&tags=a,b'
   * @param {boolean} [strict]    - Drop params not in schema (default false)
   * @returns {Object}
   */
  parse(queryString, strict = false) {}

  /**
   * Serialize a params object back to a query string.
   * Omits params matching their default value (keeps URLs clean).
   * Sorts keys for canonical output.
   * @param {Object} params
   * @returns {string}  - e.g. 'page=2&tags=a%2Cb'
   */
  serialize(params) {}

  /**
   * Return the current parsed query params.
   * @returns {Object}
   */
  getAll() {}

  /**
   * Read a single typed param by key.
   * @param {string} key
   * @returns {*}
   */
  get(key) {}

  /**
   * Set one or more params and push/replace URL.
   * Merges with current params; does not clobber unrelated keys.
   * @param {Object} updates
   * @param {'push'|'replace'} [mode='replace']
   */
  set(updates, mode = 'replace') {}

  /**
   * Remove one or more params from URL.
   * @param {string|string[]} keys
   */
  remove(keys) {}

  /**
   * Compute a diff between two param objects.
   * Returns { added, removed, changed } key sets.
   * Used by NavigationGuards to detect filter changes.
   * @param {Object} prev
   * @param {Object} next
   * @returns {{ added: string[], removed: string[], changed: string[] }}
   */
  diff(prev, next) {}

  /**
   * Subscribe to query param changes.
   * @param {function(current: Object, diff: Object): void} handler
   * @returns {function} unsubscribe
   */
  onChange(handler) {}
}
```

### Type Coercion Rules

```
Raw string     Schema type     Coerced value
─────────────────────────────────────────────
'true'         boolean         true
'false'        boolean         false
'42'           number          42
'3.14'         number          3.14
'a,b,c'        array           ['a', 'b', 'c']
'%5B1%2C2%5D'  json            [1, 2]    (URL-decoded then JSON.parsed)
'hello'        string          'hello'
(absent)       any             schema.default
```

---

## 1.3 — Fragment Manager

### Responsibility
Treats the URL `#fragment` as a first-class UI state carrier. Fragments are **namespaced** so multiple independent UI states can coexist in one fragment string without collisions.

### Fragment Format

```
#ns1:value1|ns2:value2|ns3:value3

Examples:
  #modal:new-user          → modal 'new-user' is open
  #modal:new-user|tab:settings   → modal open AND settings tab active
  #section:billing         → billing section is focused/scrolled to
```

### Interface

```js
/**
 * @typedef {Object} FragmentEntry
 * @property {string} namespace
 * @property {string} value
 */
```

```js
class FragmentManager {
  /**
   * Parse the raw fragment string into a namespace map.
   * @param {string} [raw]  - Defaults to window.location.hash
   * @returns {Object.<string, string>}  - e.g. { modal: 'new-user', tab: 'settings' }
   */
  parse(raw) {}

  /**
   * Get the value for a specific namespace.
   * @param {string} namespace
   * @returns {string|null}
   */
  get(namespace) {}

  /**
   * Set a namespaced fragment value.
   * Merges with existing namespaces; replaces history entry by default.
   * @param {string} namespace
   * @param {string} value
   * @param {'push'|'replace'} [mode='replace']
   */
  set(namespace, value, mode = 'replace') {}

  /**
   * Remove a namespace from the fragment.
   * @param {string} namespace
   */
  remove(namespace) {}

  /**
   * Clear all fragment namespaces.
   */
  clear() {}

  /**
   * Serialize a namespace map back to a fragment string.
   * @param {Object.<string, string>} map
   * @returns {string}  - e.g. 'modal:new-user|tab:settings'
   */
  serialize(map) {}

  /**
   * Subscribe to changes for a specific namespace (or all if omitted).
   * @param {string|null} namespace
   * @param {function(value: string|null): void} handler
   * @returns {function} unsubscribe
   */
  onChange(namespace, handler) {}

  /**
   * Returns true if a namespace currently has any value set.
   * @param {string} namespace
   * @returns {boolean}
   */
  isActive(namespace) {}
}
```

### Common Namespace Conventions

| Namespace | Purpose | Example |
|---|---|---|
| `modal` | Open modal by ID | `#modal:confirm-delete` |
| `tab` | Active tab key | `#tab:payments` |
| `panel` | Expanded side panel | `#panel:filters` |
| `section` | Scroll-to anchor | `#section:billing` |
| `focus` | Focused field/item | `#focus:email-input` |
| `drawer` | Drawer open state | `#drawer:notifications` |

---

## 1.4 — Navigation Guard System

### Responsibility
An ordered middleware pipeline that runs before and after every route transition. Any guard can **cancel**, **redirect**, or **pause** (async) a navigation.

### Interfaces

```js
/**
 * @typedef {Object} NavigationContext
 * @property {RouteContext}  from        - Currently active route context (null on first load)
 * @property {RouteContext}  to          - Incoming route context
 * @property {'push'|'replace'|'pop'} trigger - What caused the navigation
 */

/**
 * @typedef {Object} GuardResult
 * @property {boolean}        proceed    - false cancels navigation
 * @property {string}         [redirect] - Named route or path to redirect to instead
 * @property {string}         [reason]   - Human-readable reason (for logging)
 */

/**
 * @callback GuardFn
 * @param {NavigationContext} context
 * @returns {GuardResult | Promise<GuardResult>}
 */
```

```js
class NavigationGuardSystem {
  /** @type {Array<{ id: string, phase: 'before'|'after', fn: GuardFn, priority: number }>} */
  #guards = [];

  /**
   * Register a guard to run before navigation is committed.
   * Lower priority number runs first.
   * @param {string}   id
   * @param {GuardFn}  fn
   * @param {number}   [priority=100]
   * @returns {function} unregister
   */
  addBeforeGuard(id, fn, priority = 100) {}

  /**
   * Register a guard to run after navigation is committed.
   * After-guards cannot cancel navigation; they are for side-effects.
   * @param {string}   id
   * @param {GuardFn}  fn
   * @param {number}   [priority=100]
   * @returns {function} unregister
   */
  addAfterGuard(id, fn, priority = 100) {}

  /**
   * Run all before-guards in priority order.
   * Stops pipeline on first non-proceed result.
   * @param {NavigationContext} context
   * @returns {Promise<GuardResult>}
   */
  async runBeforeGuards(context) {}

  /**
   * Run all after-guards. Errors are caught and logged; never thrown.
   * @param {NavigationContext} context
   * @returns {Promise<void>}
   */
  async runAfterGuards(context) {}

  /**
   * Remove a registered guard by id.
   * @param {string} id
   */
  remove(id) {}
}
```

### Built-in Guard Factories

```js
// Auth guard — redirect to login if user is not authenticated
NavigationGuardSystem.guards.auth = (authService, loginRoute = 'auth.login') =>
  async ({ to }) => {
    if (!to.route.meta?.requiresAuth) return { proceed: true };
    const isAuthenticated = await authService.isAuthenticated();
    return isAuthenticated
      ? { proceed: true }
      : { proceed: false, redirect: loginRoute, reason: 'unauthenticated' };
  };

// Permission guard — check RBAC before entering route
NavigationGuardSystem.guards.permission = (permissionService) =>
  async ({ to }) => {
    const required = to.route.meta?.permission;
    if (!required) return { proceed: true };
    const allowed = await permissionService.can(required);
    return allowed
      ? { proceed: true }
      : { proceed: false, redirect: 'errors.forbidden', reason: `missing permission: ${required}` };
  };

// Unsaved changes guard — prompt user before leaving dirty forms
NavigationGuardSystem.guards.unsavedChanges = (formRegistry) =>
  async ({ from }) => {
    if (!from) return { proceed: true };
    const dirty = formRegistry.hasDirtyForms();
    if (!dirty) return { proceed: true };
    const confirmed = await Dialog.confirm('You have unsaved changes. Leave anyway?');
    return { proceed: confirmed, reason: confirmed ? 'user-confirmed' : 'user-cancelled' };
  };

// Feature flag guard — block route if flag is off
NavigationGuardSystem.guards.featureFlag = (flagService) =>
  ({ to }) => {
    const flag = to.route.meta?.featureFlag;
    if (!flag) return { proceed: true };
    return flagService.isEnabled(flag)
      ? { proceed: true }
      : { proceed: false, redirect: 'errors.not-found', reason: `flag disabled: ${flag}` };
  };
```

### Guard Execution Flow

```
Navigation Intent
      │
      ▼
[Before Guard 1 (priority 10)] → { proceed: false } ──► CANCEL / REDIRECT
      │ proceed: true
      ▼
[Before Guard 2 (priority 50)] → { proceed: false } ──► CANCEL / REDIRECT
      │ proceed: true
      ▼
[Before Guard N (priority 100)]
      │ all proceed: true
      ▼
History committed + View rendered
      │
      ▼
[After Guard 1] → side effects only (analytics, scroll, title update)
[After Guard 2]
[After Guard N]
```

---

## 1.5 — Route Transition Manager

### Responsibility
Orchestrates the async lifecycle of a route change — teardown of the outgoing view, loading of the incoming route's component, loading state display, and transition animations.

### Interfaces

```js
/**
 * @typedef {'idle'|'loading'|'transitioning'|'error'} TransitionState
 */

/**
 * @typedef {Object} TransitionHooks
 * @property {function(): void}          [onStart]     - Fired when transition begins
 * @property {function(number): void}    [onProgress]  - Fired with 0–100 progress value
 * @property {function(): void}          [onComplete]  - Fired when new view is mounted
 * @property {function(Error): void}     [onError]     - Fired if component load fails
 */
```

```js
class RouteTransitionManager {
  /** @type {TransitionState} */
  #state = 'idle';

  /** @type {AbortController|null} */
  #activeAbort = null;

  /**
   * Execute a route transition from `from` context to `to` context.
   * Handles: abort of previous in-flight transition, component lazy load,
   * loading state, animation, and error boundary.
   *
   * @param {RouteContext}    from
   * @param {RouteContext}    to
   * @param {TransitionHooks} [hooks]
   * @returns {Promise<void>}
   */
  async transition(from, to, hooks = {}) {}

  /**
   * Abort any in-progress transition (e.g. user navigated away mid-load).
   */
  abort() {}

  /**
   * Returns current transition state.
   * @returns {TransitionState}
   */
  getState() {}

  /**
   * Register a named animation to play between specific route pairs.
   * @param {string}   fromPattern  - Route name glob e.g. 'list.*'
   * @param {string}   toPattern
   * @param {function(outEl: Element, inEl: Element): Promise<void>} animFn
   */
  registerAnimation(fromPattern, toPattern, animFn) {}
}
```

### Transition Lifecycle

```
transition(from, to) called
        │
        ├─ abort() any previous in-flight transition
        ├─ state = 'loading'
        ├─ hooks.onStart()
        ├─ emit 'router:transition:start' on Event Bus
        │
        ├─ call from.route.handler.onLeave(from)   [outgoing teardown]
        │
        ├─ await to.route.component()              [dynamic import]
        │       │ loading indicator shown if > 200ms
        │       │ hooks.onProgress(n) as modules load
        │       ├─ SUCCESS → state = 'transitioning'
        │       └─ FAILURE → state = 'error', hooks.onError(err), render error outlet
        │
        ├─ run registered animation(from, to)      [CSS / WAAPI]
        │
        ├─ call to.route.handler.render(to)        [mount new view]
        ├─ call to.route.handler.onEnter(to)
        │
        ├─ state = 'idle'
        ├─ hooks.onComplete()
        └─ emit 'router:transition:complete' on Event Bus
```

---

## 1.6 — History Manager

### Responsibility
Single owner of the browser History API. All code that wants to manipulate the URL goes through this class — never calls `history.pushState` directly.

```js
/**
 * @typedef {Object} HistoryEntry
 * @property {string}  path       - Full path + query + fragment
 * @property {any}     state      - Arbitrary serializable state payload
 * @property {string}  key        - Unique entry key (UUID)
 * @property {number}  timestamp  - When entry was created
 */
```

```js
class HistoryManager {
  /** @type {HistoryEntry[]} */
  #stack = [];

  /** @type {number} */
  #cursor = -1;

  /**
   * Initialize. Binds to window.popstate.
   * Reconstructs in-memory stack from sessionStorage if available.
   */
  init() {}

  /**
   * Push a new entry. Deduplicates: if new path === current path, does nothing.
   * @param {string} path   - Full URL path with query and fragment
   * @param {any}    [state]
   */
  push(path, state = null) {}

  /**
   * Replace current entry without adding to stack.
   * @param {string} path
   * @param {any}    [state]
   */
  replace(path, state = null) {}

  /**
   * Navigate back. No-ops if at start of stack.
   */
  back() {}

  /**
   * Navigate forward. No-ops if at end of stack.
   */
  forward() {}

  /**
   * Navigate by delta (positive = forward, negative = back).
   * @param {number} delta
   */
  go(delta) {}

  /**
   * Returns the current HistoryEntry.
   * @returns {HistoryEntry|null}
   */
  getCurrent() {}

  /**
   * Returns true if there is a previous entry to go back to.
   * @returns {boolean}
   */
  canGoBack() {}

  /**
   * Returns true if there is a forward entry.
   * @returns {boolean}
   */
  canGoForward() {}

  /**
   * Returns a copy of the full navigation stack.
   * @returns {HistoryEntry[]}
   */
  getStack() {}

  /**
   * Subscribe to navigation events (push, replace, pop).
   * @param {function(HistoryEntry, 'push'|'replace'|'pop'): void} handler
   * @returns {function} unsubscribe
   */
  onChange(handler) {}
}
```

### Duplicate Prevention Logic

```
push('/users?page=2') called
    │
    ├── normalize new path (sort query keys, lowercase scheme)
    ├── normalize current path
    │
    ├── if normalized(new) === normalized(current):
    │       do nothing, return                        ← DEDUPLICATED
    │
    └── else:
            history.pushState(state, '', path)
            append to #stack, advance #cursor
            notify subscribers
```

---

## 1.7 — Scroll Restoration Manager

### Responsibility
Saves the scroll position of the page and any registered nested scroll containers when leaving a route, and restores them when returning to it (back/forward navigation). On fresh navigation, scrolls to the top (or to a `#section` fragment target).

```js
class ScrollRestorationManager {
  /** @type {Map<string, ScrollSnapshot>} */
  #snapshots = new Map();

  /** @type {Set<string>} */
  #containers = new Set();

  /**
   * Initialize. Must be called once at boot.
   * Sets history.scrollRestoration = 'manual' to take over from browser.
   */
  init() {}

  /**
   * Register a CSS selector for a nested scroll container
   * that should have its position saved/restored alongside the page.
   * @param {string} selector  - e.g. '.data-table', '#sidebar'
   */
  registerContainer(selector) {}

  /**
   * Save scroll positions for the current route key.
   * Called by NavigationGuard (before phase) on every navigation.
   * @param {string} routeKey  - Unique key from HistoryEntry.key
   */
  save(routeKey) {}

  /**
   * Restore scroll positions for a route key.
   * Called by RouteTransitionManager (after view mounts).
   * @param {string}      routeKey
   * @param {RouteContext} context   - Used to detect #section fragments
   */
  restore(routeKey, context) {}

  /**
   * Scroll to a fragment target element smoothly.
   * Falls back gracefully if element is not found.
   * @param {string} fragment  - Element ID or [data-section] value
   */
  scrollToFragment(fragment) {}

  /**
   * Clear saved snapshot for a given key (e.g. after route is destroyed).
   * @param {string} routeKey
   */
  clear(routeKey) {}
}

/**
 * @typedef {Object} ScrollSnapshot
 * @property {number}                        pageX
 * @property {number}                        pageY
 * @property {Object.<string, {x,y}>}        containers  - selector → {x, y}
 * @property {number}                        savedAt
 */
```

### Restore Decision Table

| Navigation trigger | Has snapshot | Has `#section` fragment | Action |
|---|---|---|---|
| `back` / `forward` | ✅ Yes | — | Restore saved `{x, y}` |
| `back` / `forward` | ❌ No | — | Scroll to top |
| `push` / `replace` | — | ✅ Yes | `scrollToFragment()` |
| `push` / `replace` | — | ❌ No | Scroll to top |

---

## 1.8 — Deep Link Resolver

### Responsibility
Handles externally shared or bookmarked URLs that may be stale, partially valid, or require prerequisite data to load (e.g. `/orders/999` but the user is not logged in, or the order belongs to a different account).

```js
/**
 * @typedef {Object} DeepLinkResolution
 * @property {'resolved'|'redirected'|'failed'} status
 * @property {RouteContext|null}                 context   - Final resolved context
 * @property {string|null}                       redirectTo
 * @property {string|null}                       reason
 */
```

```js
class DeepLinkResolver {
  /**
   * Register a validator for a named route.
   * The validator receives the matched RouteContext and returns whether
   * the link is valid for the current user/session, and optionally a redirect.
   *
   * @param {string}   routeName
   * @param {function(RouteContext): Promise<DeepLinkResolution>} validator
   */
  registerValidator(routeName, validator) {}

  /**
   * Resolve a full URL string into a final navigable RouteContext.
   * Called once on initial page load before first render.
   *
   * @param {string} url  - e.g. 'https://app.example.com/orders/999?tab=items'
   * @returns {Promise<DeepLinkResolution>}
   */
  async resolve(url) {}
}
```

### Resolution Flow

```
App boot → DeepLinkResolver.resolve(window.location.href)
        │
        ├── PathRouter.resolve(pathname)
        │       ├── No match  →  { status: 'failed', redirectTo: 'errors.not-found' }
        │       └── Matched   →  RouteContext
        │
        ├── Run registered validator for matched route name
        │       ├── { status: 'resolved' }   → proceed to render
        │       ├── { status: 'redirected' } → HistoryManager.replace(redirectTo)
        │       └── { status: 'failed' }     → render error outlet
        │
        └── Hand off resolved RouteContext to PathRouter for first render
```

---

## 1.9 — Canonical URL Builder

### Responsibility
Constructs a fully normalized, deterministic URL string from a set of route parameters. Used for sharing, bookmarking, `<link rel="canonical">`, and server-side rendering hydration.

```js
class CanonicalURLBuilder {
  /**
   * Build a full absolute URL for a named route.
   *
   * @param {string}  name              - Route name e.g. 'user.orders'
   * @param {Object}  [params]          - Dynamic path segments
   * @param {Object}  [query]           - Query parameters (will omit defaults)
   * @param {string}  [fragment]        - Fragment without '#'
   * @param {string}  [base]            - Override base URL (default: window.location.origin)
   * @returns {string}                  - e.g. 'https://app.example.com/users/42/orders?status=open'
   */
  build(name, params = {}, query = {}, fragment = '', base) {}

  /**
   * Build only the relative path portion (no origin).
   * @param {string}  name
   * @param {Object}  [params]
   * @param {Object}  [query]
   * @param {string}  [fragment]
   * @returns {string}  - e.g. '/users/42/orders?status=open'
   */
  buildPath(name, params = {}, query = {}, fragment = '') {}

  /**
   * Update the document's <link rel="canonical"> tag.
   * Call on every route change.
   * @param {string} url
   */
  setCanonicalTag(url) {}

  /**
   * Update document.title from route meta or a provided string.
   * Supports template strings e.g. 'Order #{id} — MyApp'
   * @param {RouteContext} context
   * @param {string}       [appName]   - Appended to title e.g. '— MyApp'
   */
  updateDocumentTitle(context, appName = '') {}
}
```

---

## Wiring: Full Bootstrap Sequence

```js
// router/index.js — assembled at boot by the DI Container

const historyManager     = new HistoryManager();
const queryParamManager  = new QueryParamManager();
const fragmentManager    = new FragmentManager();
const guardSystem        = new NavigationGuardSystem();
const transitionManager  = new RouteTransitionManager();
const scrollManager      = new ScrollRestorationManager();
const deepLinkResolver   = new DeepLinkResolver();
const canonicalBuilder   = new CanonicalURLBuilder();
const pathRouter         = new PathRouter();

// 1. Register routes
pathRouter.register(appRoutes);

// 2. Register built-in guards (priority order matters)
guardSystem.addBeforeGuard('auth',           guards.auth(authService),           10);
guardSystem.addBeforeGuard('feature-flag',   guards.featureFlag(flagService),    20);
guardSystem.addBeforeGuard('permission',     guards.permission(permService),     30);
guardSystem.addBeforeGuard('unsaved-changes',guards.unsavedChanges(formReg),    100);
guardSystem.addAfterGuard ('analytics',      guards.analytics(analyticsService), 10);
guardSystem.addAfterGuard ('canonical',      ({ to }) =>                         20
  canonicalBuilder.updateDocumentTitle(to, 'MyApp'));

// 3. Init history (binds popstate)
historyManager.init();
scrollManager.init();   // sets scrollRestoration = 'manual'

// 4. On every history change → run full pipeline
historyManager.onChange(async (entry, trigger) => {
  const { pathname, search, hash } = new URL(entry.path, location.origin);

  const matched = pathRouter.resolve(pathname);
  if (!matched) { /* render 404 */ return; }

  const to = {
    path: pathname,
    params: matched.params,
    query: queryParamManager.parse(search),
    fragment: fragmentManager.parse(hash),
    route: matched.route,
    state: entry.state,
  };
  const from = pathRouter.getCurrentContext();

  // Save scroll before guards (guard may cancel)
  if (from) scrollManager.save(historyManager.getCurrent().key);

  const guardResult = await guardSystem.runBeforeGuards({ from, to, trigger });

  if (!guardResult.proceed) {
    if (guardResult.redirect) historyManager.replace(guardResult.redirect);
    return;
  }

  await transitionManager.transition(from, to);

  scrollManager.restore(entry.key, to);
  queryParamManager.registerSchema(to.route.meta?.querySchema ?? {});
  canonicalBuilder.setCanonicalTag(canonicalBuilder.build(to.route.name, to.params, to.query));

  await guardSystem.runAfterGuards({ from, to, trigger });
});

// 5. Resolve initial deep link on first load
const resolution = await deepLinkResolver.resolve(window.location.href);
if (resolution.status === 'redirected') {
  historyManager.replace(resolution.redirectTo);
} else {
  historyManager.push(window.location.pathname + window.location.search + window.location.hash);
}
```

---

## Event Bus Emissions (Module 5 integration)

| Event name | Payload | When |
|---|---|---|
| `router:navigation:start` | `{ from, to, trigger }` | Before guards run |
| `router:navigation:cancelled` | `{ from, to, reason }` | Guard returned `proceed: false` |
| `router:navigation:redirected` | `{ from, to, redirectTo }` | Guard issued redirect |
| `router:transition:start` | `{ from, to }` | Component loading begins |
| `router:transition:complete` | `{ context }` | New view fully mounted |
| `router:transition:error` | `{ error, context }` | Component load failed |
| `router:query:changed` | `{ prev, next, diff }` | Query params mutated |
| `router:fragment:changed` | `{ namespace, value }` | Fragment namespace changed |

---