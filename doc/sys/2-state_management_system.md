# Module 2 — 🗂️ State Management System

> **Core Principle:** State is never mutated directly. Every state change is the result of a dispatchable, serializable action processed by a pure reducer. The store is the single source of truth — UI, storage, and network are all projections of it.

---

## Architecture Overview

```
                        ┌─────────────────────┐
                        │  State Hydration Mgr │  ← bootstraps on boot
                        └──────────┬──────────┘
                                   │ initial state
                                   ▼
                        ┌─────────────────────┐
          dispatch()───►│    Action Dispatcher │  ← validates + creates actions
                        └──────────┬──────────┘
                                   │ validated action
                                   ▼
                        ┌─────────────────────┐
                        │  Middleware Pipeline │  ← thunks, logging, analytics
                        └──────────┬──────────┘
                                   │ action reaches store
                                   ▼
                   ┌───────────────────────────────┐
                   │         Global Store           │
                   │  ┌─────────────────────────┐  │
                   │  │   Slice Manager          │  │
                   │  │  ┌────┐ ┌────┐ ┌──────┐ │  │
                   │  │  │auth│ │cart│ │orders│ │  │
                   │  │  └────┘ └────┘ └──────┘ │  │
                   │  └─────────────────────────┘  │
                   └──────────────┬────────────────┘
                                  │ new state
                   ┌──────────────┼────────────────┐
                   ▼              ▼                 ▼
           State Diff        Selector           Persistence
           Engine            Engine             Bridge
                   │              │                 │
                   ▼              ▼                 ▼
           Undo/Redo         Memoized          Storage
           Stack             Derived           Adapters
                             State
                                  │
                        Time-Travel Debugger
                        (dev only)
```

---

## 2.1 — Global Store

### Responsibility
The immutable, centralized state container. Owns the root state tree, dispatches actions through the middleware pipeline into slice reducers, and notifies subscribers of changes.

### Core Interfaces

```js
/**
 * @typedef {Object} StoreOptions
 * @property {Object}       [initialState]      - Seed state (usually from HydrationManager)
 * @property {Middleware[]}  [middleware]        - Ordered middleware array
 * @property {boolean}       [devTools]          - Enable time-travel debugger interface
 * @property {boolean}       [freeze]            - Deep-freeze state in development (default: true in dev)
 */

/**
 * @typedef {function(state: Object, action: Action): Object} Reducer
 * Pure function. Must never mutate state. Must return same reference if unchanged.
 */

/**
 * @typedef {Object} StoreSubscription
 * @property {string}   slicePath      - Dot-notation path being watched e.g. 'cart.items'
 * @property {function} handler        - Called with (newSlice, prevSlice)
 * @property {boolean}  [immediate]    - Call handler immediately with current value
 */
```

```js
class GlobalStore {
  /** @type {Object} - The immutable root state tree */
  #state = {};

  /** @type {Map<string, Reducer>} - slice key → reducer */
  #reducers = new Map();

  /** @type {Map<string, Set<function>>} - path → subscriber set */
  #subscribers = new Map();

  /** @type {DispatchFn} - composed dispatch (store + middleware chain) */
  #dispatch = null;

  /** @type {boolean} */
  #isDispatching = false;

  /**
   * Initialize the store. Called once at app boot.
   * @param {StoreOptions} options
   */
  init(options = {}) {}

  /**
   * Dispatch an action through the middleware pipeline.
   * Throws if called during reducer execution (prevents cascading dispatches).
   * Returns the action (or middleware-transformed value, e.g. a Promise for thunks).
   *
   * @param {Action|ThunkFn} action
   * @returns {any}
   */
  dispatch(action) {}

  /**
   * Read the entire current state tree.
   * Returns a frozen reference in development.
   * @returns {Object}
   */
  getState() {}

  /**
   * Read a slice of state by dot-notation path.
   * @param {string} path  - e.g. 'cart.items', 'auth.user.profile'
   * @returns {*}
   */
  get(path) {}

  /**
   * Subscribe to changes at a specific state path.
   * Handler is only called if the value at that path changed (by reference).
   *
   * @param {string}   path           - Dot-notation path
   * @param {function} handler        - (newValue, prevValue) => void
   * @param {boolean}  [immediate]    - Invoke handler immediately on subscribe
   * @returns {function} unsubscribe
   */
  subscribe(path, handler, immediate = false) {}

  /**
   * Subscribe to the entire state tree.
   * Use sparingly — prefer path-scoped subscriptions.
   * @param {function(newState: Object, prevState: Object): void} handler
   * @returns {function} unsubscribe
   */
  subscribeAll(handler) {}

  /**
   * Register a new reducer slice at runtime (called by SliceManager).
   * Merges the slice's initial state into the root state tree.
   * @param {string}  key
   * @param {Reducer} reducer
   * @param {Object}  [initialState]
   */
  registerReducer(key, reducer, initialState = {}) {}

  /**
   * Remove a reducer slice (for hot module replacement).
   * @param {string} key
   */
  unregisterReducer(key) {}

  /**
   * Replace the entire state tree (used by HydrationManager and time-travel).
   * Does NOT run through reducers or middleware.
   * @param {Object} newState
   */
  replaceState(newState) {}
}
```

### Internal Dispatch Loop

```
store.dispatch(action) called
        │
        ├── Guard: if #isDispatching → throw 'Reducers may not dispatch'
        ├── #isDispatching = true
        │
        ├── prevState = #state
        │
        ├── For each registered slice key:
        │       newSlice = reducer(#state[key], action)
        │       if newSlice !== #state[key]:
        │           #state = { ...#state, [key]: newSlice }   ← new root ref
        │
        ├── #isDispatching = false
        │
        ├── StateDiffEngine.compute(prevState, #state)        ← diffing
        ├── UndoRedoStack.record(action, prevState, #state)   ← if recordable
        │
        └── Notify subscribers whose watched path changed
                handler(newValue, prevValue)
```

---

## 2.2 — Action Dispatcher

### Responsibility
Constructs typed, validated actions. Enforces that all actions conform to a registered schema before they enter the store. Provides a fluent factory API so action creation is never ad-hoc string literals.

### Interfaces

```js
/**
 * @typedef {Object} Action
 * @property {string}  type      - Namespaced type string e.g. 'cart/addItem'
 * @property {*}       [payload] - The action's data
 * @property {Object}  [meta]    - Non-data metadata: timestamp, requestId, source
 * @property {boolean} [error]   - true if payload is an Error object
 */

/**
 * @typedef {Object} ActionSchema
 * @property {string}           type          - Matches Action.type
 * @property {function(*):bool} [validate]    - Returns true if payload is valid
 * @property {boolean}          [recordable]  - Include in undo/redo stack (default false)
 * @property {boolean}          [loggable]    - Include in audit log (default true)
 * @property {string}           [description] - Human-readable for devtools
 */

/**
 * @callback ActionCreator
 * @param {*} payload
 * @returns {Action}
 */
```

```js
class ActionDispatcher {
  /** @type {Map<string, ActionSchema>} */
  #registry = new Map();

  /** @type {GlobalStore} */
  #store = null;

  /**
   * @param {GlobalStore} store
   */
  constructor(store) {}

  /**
   * Register an action schema.
   * @param {ActionSchema} schema
   * @returns {ActionCreator} - Bound creator function
   */
  register(schema) {}

  /**
   * Register multiple schemas at once (typically called per slice).
   * @param {ActionSchema[]} schemas
   * @returns {Object.<string, ActionCreator>} - key: last segment of type
   */
  registerBatch(schemas) {}

  /**
   * Create and immediately dispatch an action.
   * Validates payload against schema before dispatching.
   * Throws ActionValidationError if validation fails.
   *
   * @param {string} type
   * @param {*}      [payload]
   * @param {Object} [meta]
   * @returns {any}  - Return value from store.dispatch
   */
  dispatch(type, payload, meta = {}) {}

  /**
   * Create an action object without dispatching it.
   * Useful for batching or passing to middleware manually.
   *
   * @param {string} type
   * @param {*}      [payload]
   * @param {Object} [meta]
   * @returns {Action}
   */
  create(type, payload, meta = {}) {}

  /**
   * Dispatch multiple actions in sequence within a single subscriber
   * notification cycle. Subscribers are only notified once after all
   * actions have been processed.
   *
   * @param {Action[]} actions
   */
  dispatchBatch(actions) {}

  /**
   * Check if a type is registered.
   * @param {string} type
   * @returns {boolean}
   */
  isRegistered(type) {}

  /**
   * Get the full schema registry (for devtools).
   * @returns {Map<string, ActionSchema>}
   */
  getRegistry() {}
}
```

### Action Creator Pattern

```js
// Define a slice's actions in one place
const cartActions = dispatcher.registerBatch([
  {
    type:        'cart/addItem',
    recordable:  true,
    description: 'Add a product to the cart',
    validate:    (payload) => payload?.productId && payload?.quantity > 0,
  },
  {
    type:        'cart/removeItem',
    recordable:  true,
    description: 'Remove an item from the cart',
    validate:    (payload) => typeof payload?.productId === 'string',
  },
  {
    type:        'cart/setQuantity',
    recordable:  true,
    validate:    (p) => p?.productId && Number.isInteger(p?.quantity) && p.quantity >= 0,
  },
  {
    type:        'cart/clear',
    recordable:  true,
    loggable:    true,
  },
]);

// Usage throughout the app:
cartActions.addItem({ productId: 'sku-42', quantity: 2 });
cartActions.removeItem({ productId: 'sku-42' });
dispatcher.dispatch('cart/clear');
```

---

## 2.3 — Middleware Pipeline

### Responsibility
A composable chain of functions that wraps `store.dispatch`. Each middleware can intercept, transform, delay, or cancel any action. The pipeline is assembled once at boot.

### Interface

```js
/**
 * @typedef {Object} MiddlewareAPI
 * @property {function(): Object} getState   - Read current store state
 * @property {function(Action): any} dispatch - Dispatch further actions
 */

/**
 * @callback Middleware
 * @param {MiddlewareAPI} api
 * @returns {function(next: function): function(action: Action): any}
 *
 * Standard Redux-style signature:
 *   middleware = api => next => action => { ... return next(action) }
 */
```

```js
class MiddlewarePipeline {
  /** @type {Array<{ id: string, fn: Middleware, priority: number }>} */
  #middlewares = [];

  /** @type {function} - compiled dispatch chain */
  #chain = null;

  /**
   * Register a middleware. Lower priority runs first (outermost wrapper).
   * @param {string}     id
   * @param {Middleware} fn
   * @param {number}     [priority=100]
   */
  add(id, fn, priority = 100) {}

  /**
   * Remove a middleware by id. Recompiles the chain.
   * @param {string} id
   */
  remove(id) {}

  /**
   * Compose all registered middlewares into a single dispatch function.
   * Called internally after any add/remove, and once at boot.
   *
   * @param {function} baseDispatch - The store's raw dispatch (reducer loop)
   * @param {MiddlewareAPI} api
   * @returns {function} composedDispatch
   */
  compose(baseDispatch, api) {}
}
```

### Built-in Middleware Implementations

```js
/**
 * THUNK MIDDLEWARE (priority: 10)
 * Allows dispatching functions instead of plain action objects.
 * The function receives (dispatch, getState) and can be async.
 *
 * Usage:
 *   dispatcher.dispatch('app/loadUser', async (dispatch, getState) => {
 *     const user = await api.get('/user');
 *     dispatch({ type: 'auth/setUser', payload: user });
 *   });
 */
const thunkMiddleware = ({ dispatch, getState }) => next => action => {
  if (typeof action === 'function') {
    return action(dispatch, getState);
  }
  return next(action);
};

/**
 * LOGGER MIDDLEWARE (priority: 20)
 * Logs every action with prev/next state diff in development.
 * Groups console output for readability.
 */
const loggerMiddleware = ({ getState }) => next => action => {
  if (process.env.NODE_ENV === 'production') return next(action);
  const prevState = getState();
  console.group(`%c action: ${action.type}`, 'color: #9E9E9E');
  console.log('%c prev state', 'color: #9E9E9E', prevState);
  console.log('%c action    ', 'color: #03A9F4', action);
  const result = next(action);
  console.log('%c next state', 'color: #4CAF50', getState());
  console.groupEnd();
  return result;
};

/**
 * ERROR BOUNDARY MIDDLEWARE (priority: 5 — outermost)
 * Wraps every dispatch in try/catch.
 * On failure: emits 'store:dispatch:error' on Event Bus, does not rethrow.
 */
const errorMiddleware = ({ dispatch }) => next => action => {
  try {
    return next(action);
  } catch (err) {
    EventBus.emit('store:dispatch:error', { action, error: err });
    ErrorReporter.capture(err, { context: 'store.dispatch', action });
    return null;
  }
};

/**
 * ANALYTICS MIDDLEWARE (priority: 90)
 * Forwards actions marked loggable:true to the Analytics Tracker.
 */
const analyticsMiddleware = (analyticsTracker) =>
  ({ getState }) => next => action => {
    const result = next(action);
    const schema = ActionDispatcher.getRegistry().get(action.type);
    if (schema?.loggable !== false) {
      analyticsTracker.track(action.type, {
        payload: schema?.sensitive ? '[REDACTED]' : action.payload,
        meta: action.meta,
      });
    }
    return result;
  };

/**
 * PROMISE MIDDLEWARE (priority: 15)
 * If action.payload is a Promise, dispatches:
 *   {type}/pending  immediately
 *   {type}/fulfilled on resolve
 *   {type}/rejected  on reject
 */
const promiseMiddleware = ({ dispatch }) => next => action => {
  if (!(action.payload instanceof Promise)) return next(action);
  dispatch({ type: `${action.type}/pending`, meta: action.meta });
  return action.payload
    .then(value  => dispatch({ type: `${action.type}/fulfilled`, payload: value, meta: action.meta }))
    .catch(error => dispatch({ type: `${action.type}/rejected`,  payload: error, error: true, meta: action.meta }));
};
```

---

## 2.4 — Selector Engine

### Responsibility
Derives computed state from the store without redundant recalculation. Selectors are memoized — they only recompute when their input slices change. Prevents cascading re-renders caused by repeatedly deriving identical values.

### Interfaces

```js
/**
 * @typedef {function(state: Object, ...args): *} InputSelector
 * Reads raw values from state. Should be cheap, no computation.
 */

/**
 * @typedef {function(...inputResults, ...args): *} ResultFn
 * The computation. Only called when input values change.
 */

/**
 * @typedef {Object} SelectorOptions
 * @property {number}   [cacheSize=1]    - LRU cache slots (>1 for parametric selectors)
 * @property {function} [equalityFn]     - Custom equality check (default: strict ===)
 * @property {string}   [name]           - For devtools identification
 */
```

```js
class SelectorEngine {
  /**
   * Create a memoized selector from one or more input selectors and a result function.
   * API mirrors Reselect's createSelector.
   *
   * @param {InputSelector[]} inputSelectors
   * @param {ResultFn}        resultFn
   * @param {SelectorOptions} [options]
   * @returns {function(state: Object, ...args): *}
   *
   * @example
   * const selectCartTotal = SelectorEngine.create(
   *   [state => state.cart.items, state => state.products.byId],
   *   (items, productsById) =>
   *     items.reduce((sum, item) =>
   *       sum + (productsById[item.productId]?.price ?? 0) * item.quantity, 0)
   * );
   */
  static create(inputSelectors, resultFn, options = {}) {}

  /**
   * Create a parametric selector factory.
   * Each unique argument combination gets its own memoization slot.
   * cacheSize controls how many unique arg combinations are retained.
   *
   * @param {InputSelector[]} inputSelectors
   * @param {ResultFn}        resultFn
   * @param {SelectorOptions} [options]      - cacheSize recommended > 1
   * @returns {function(...args): function(state): *}
   *
   * @example
   * const selectOrderById = SelectorEngine.createParametric(
   *   [state => state.orders.byId],
   *   (ordersById, orderId) => ordersById[orderId],
   *   { cacheSize: 100, name: 'selectOrderById' }
   * );
   * // Usage: selectOrderById(orderId)(store.getState())
   */
  static createParametric(inputSelectors, resultFn, options = {}) {}

  /**
   * Compose existing selectors into a higher-order selector.
   * @param {function[]} selectors
   * @param {ResultFn}   resultFn
   * @returns {function(state): *}
   */
  static compose(selectors, resultFn) {}
}
```

### Memoization Internals

```
selector(state, ...args) called
        │
        ├── Run each inputSelector(state, ...args)
        │   → produces inputResults[]
        │
        ├── Compare inputResults[i] === lastInputResults[i]
        │   for all i
        │
        ├── ALL SAME → return cached lastResult         ← O(n inputs), no recompute
        │
        └── ANY CHANGED → resultFn(...inputResults, ...args)
                          → store as lastResult
                          → return new result
```

### Common Selector Patterns

```js
// ── Raw input selectors (no memoization needed, just reads) ──────────────

const selectCartItems       = state => state.cart.items;
const selectProductsById    = state => state.products.byId;
const selectCurrentUserId   = state => state.auth.user?.id;
const selectOrdersAll       = state => Object.values(state.orders.byId);

// ── Derived selectors ─────────────────────────────────────────────────────

const selectCartItemCount = SelectorEngine.create(
  [selectCartItems],
  items => items.reduce((n, i) => n + i.quantity, 0),
  { name: 'selectCartItemCount' }
);

const selectCartTotal = SelectorEngine.create(
  [selectCartItems, selectProductsById],
  (items, byId) =>
    items.reduce((sum, item) =>
      sum + (byId[item.productId]?.price ?? 0) * item.quantity, 0),
  { name: 'selectCartTotal' }
);

// ── Parametric selector (per-id lookups) ─────────────────────────────────

const selectOrderById = SelectorEngine.createParametric(
  [state => state.orders.byId],
  (byId, orderId) => byId[orderId] ?? null,
  { cacheSize: 100, name: 'selectOrderById' }
);

// Usage:
const order = selectOrderById('ord-123')(store.getState());
```

---

## 2.5 — Slice / Module Manager

### Responsibility
Enables the store to grow incrementally. Each feature module owns a self-contained slice: its own initial state, reducer, actions, and selectors. Slices are registered synchronously at boot or lazily when a code-split module loads.

### Interfaces

```js
/**
 * @typedef {Object} SliceDefinition
 * @property {string}              key            - Unique key in root state e.g. 'cart'
 * @property {Object}              initialState   - Default shape for this slice
 * @property {Reducer}             reducer        - Pure reducer function
 * @property {ActionSchema[]}      [actions]      - Action schemas to auto-register
 * @property {Object}              [selectors]    - Named selector functions
 * @property {PersistenceConfig}   [persist]      - Persistence bridge config (see 2.8)
 */
```

```js
class SliceManager {
  /** @type {Map<string, SliceDefinition>} */
  #slices = new Map();

  /** @type {GlobalStore} */
  #store = null;

  /** @type {ActionDispatcher} */
  #dispatcher = null;

  /**
   * @param {GlobalStore}     store
   * @param {ActionDispatcher} dispatcher
   */
  constructor(store, dispatcher) {}

  /**
   * Register a slice. Safe to call multiple times with the same key
   * (idempotent — will not re-register or reset state).
   * @param {SliceDefinition} definition
   * @returns {{ actions: Object, selectors: Object }}
   */
  register(definition) {}

  /**
   * Lazy-register a slice from a dynamic import.
   * Typically called inside a route's component() factory.
   *
   * @param {function(): Promise<{ default: SliceDefinition }>} factory
   * @returns {Promise<{ actions: Object, selectors: Object }>}
   */
  async registerLazy(factory) {}

  /**
   * Remove a slice (for hot module replacement).
   * State is preserved unless resetState: true.
   *
   * @param {string}  key
   * @param {boolean} [resetState=false]
   */
  unregister(key, resetState = false) {}

  /**
   * Returns true if a slice is registered.
   * @param {string} key
   * @returns {boolean}
   */
  isRegistered(key) {}

  /**
   * Get all registered slice keys.
   * @returns {string[]}
   */
  getKeys() {}
}
```

### Slice Definition Example

```js
// features/cart/cart.slice.js

/** @type {SliceDefinition} */
export default {
  key: 'cart',

  initialState: {
    items:     [],           // [{ productId, quantity }]
    coupon:    null,
    updatedAt: null,
  },

  reducer(state, action) {
    switch (action.type) {

      case 'cart/addItem': {
        const existing = state.items.find(i => i.productId === action.payload.productId);
        if (existing) {
          return {
            ...state,
            items: state.items.map(i =>
              i.productId === action.payload.productId
                ? { ...i, quantity: i.quantity + action.payload.quantity }
                : i
            ),
            updatedAt: Date.now(),
          };
        }
        return {
          ...state,
          items: [...state.items, action.payload],
          updatedAt: Date.now(),
        };
      }

      case 'cart/removeItem':
        return {
          ...state,
          items: state.items.filter(i => i.productId !== action.payload.productId),
          updatedAt: Date.now(),
        };

      case 'cart/clear':
        return { ...state, items: [], coupon: null, updatedAt: Date.now() };

      default:
        return state;
    }
  },

  actions: [
    { type: 'cart/addItem',    recordable: true, validate: p => p?.productId && p?.quantity > 0 },
    { type: 'cart/removeItem', recordable: true, validate: p => !!p?.productId },
    { type: 'cart/clear',      recordable: true },
  ],

  selectors: {
    items:     state => state.cart.items,
    itemCount: SelectorEngine.create(
                 [s => s.cart.items],
                 items => items.reduce((n, i) => n + i.quantity, 0)
               ),
  },

  persist: {
    key:      'cart',
    adapter:  'localStorage',
    pick:     ['items', 'coupon'],   // only persist these keys
    debounce: 500,
  },
};
```

---

## 2.6 — State Diff Engine

### Responsibility
Computes a minimal, human-readable diff between two state snapshots. Used by the Undo/Redo stack to know what changed, by the Persistence Bridge to know what to write, and by the Time-Travel Debugger to display state deltas.

### Interfaces

```js
/**
 * @typedef {Object} StateDiff
 * @property {Object[]} changes   - Array of change records
 * @property {boolean}  isEmpty   - True if no differences found
 */

/**
 * @typedef {Object} ChangeRecord
 * @property {'added'|'removed'|'updated'} type
 * @property {string} path        - Dot-notation path to changed value
 * @property {*}      [prev]      - Previous value (undefined for added)
 * @property {*}      [next]      - New value (undefined for removed)
 */
```

```js
class StateDiffEngine {
  /**
   * Compute a deep diff between two state objects.
   * Only traverses plain objects and arrays — does not diff class instances.
   * Arrays: diffs by index; for entity collections prefer normalized state.
   *
   * @param {Object}   prev
   * @param {Object}   next
   * @param {string[]} [ignorePaths]   - Dot-notation paths to skip (e.g. timestamps)
   * @returns {StateDiff}
   */
  static compute(prev, next, ignorePaths = []) {}

  /**
   * Compute a diff scoped to a single slice.
   * @param {Object} prevSlice
   * @param {Object} nextSlice
   * @param {string} sliceKey
   * @returns {StateDiff}
   */
  static computeSlice(prevSlice, nextSlice, sliceKey) {}

  /**
   * Given a diff, extract only the changed paths relevant to a list of
   * dot-notation watched paths.
   *
   * @param {StateDiff} diff
   * @param {string[]}  watchedPaths
   * @returns {ChangeRecord[]}
   */
  static filter(diff, watchedPaths) {}

  /**
   * Produce a summary string for logging / devtools.
   * e.g. "cart.items[2].quantity: 1 → 3, cart.updatedAt: updated"
   *
   * @param {StateDiff} diff
   * @returns {string}
   */
  static summarize(diff) {}
}
```

### Diff Algorithm

```
compute(prev, next)
        │
        ├── if prev === next  → return { isEmpty: true, changes: [] }
        │
        ├── if typeof differs → ChangeRecord{ type: 'updated', prev, next }
        │
        ├── if Array:
        │     diff by index, mark added/removed/updated elements
        │
        └── if Object:
              union of keys from prev and next
              for each key:
                ├── in prev but not next → { type: 'removed', path: 'parent.key' }
                ├── in next but not prev → { type: 'added',   path: 'parent.key' }
                └── in both             → recurse compute(prev[key], next[key], path+key)
```

---

## 2.7 — Undo / Redo Stack

### Responsibility
Maintains a navigable history of reversible state changes. Uses the Command Pattern — each entry stores the action taken and enough information to reverse it (either the previous state snapshot or an inverse action).

### Interfaces

```js
/**
 * @typedef {'snapshot'|'inverse'} UndoStrategy
 *
 * snapshot: store full prev state slice. Simple, uses more memory.
 * inverse:  store an inverse action to dispatch. Efficient, requires action design.
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string}        id           - UUID
 * @property {Action}        action       - The action that was dispatched
 * @property {Object}        prevState    - State snapshot before action (strategy: snapshot)
 * @property {Action|null}   inverseAction- Action to reverse (strategy: inverse)
 * @property {StateDiff}     diff         - What changed
 * @property {number}        timestamp
 * @property {string}        [label]      - Human-readable e.g. 'Added item to cart'
 */
```

```js
class UndoRedoStack {
  /** @type {HistoryEntry[]} */
  #past = [];

  /** @type {HistoryEntry[]} */
  #future = [];

  /** @type {number} */
  #maxSize = 50;

  /** @type {GlobalStore} */
  #store = null;

  /** @type {UndoStrategy} */
  #strategy = 'snapshot';

  /**
   * @param {GlobalStore} store
   * @param {Object} [options]
   * @param {number}        [options.maxSize=50]
   * @param {UndoStrategy}  [options.strategy='snapshot']
   */
  constructor(store, options = {}) {}

  /**
   * Record a state transition.
   * Only called for actions where schema.recordable === true.
   * Called automatically by the store's dispatch loop.
   *
   * @param {Action}    action
   * @param {Object}    prevState
   * @param {Object}    nextState
   * @param {StateDiff} diff
   */
  record(action, prevState, nextState, diff) {}

  /**
   * Undo the last recordable action.
   * Restores previous state and moves entry to future stack.
   * Dispatches a synthetic '@@undo' action for middleware/logging.
   *
   * @returns {HistoryEntry|null} - The undone entry, or null if nothing to undo
   */
  undo() {}

  /**
   * Redo the last undone action.
   * Re-dispatches original action and moves entry back to past stack.
   *
   * @returns {HistoryEntry|null}
   */
  redo() {}

  /**
   * Jump directly to a specific entry in history (time-travel).
   * @param {string} entryId
   */
  jumpTo(entryId) {}

  /**
   * Clear all history (e.g. on user logout).
   */
  clear() {}

  /** @returns {boolean} */
  canUndo() {}

  /** @returns {boolean} */
  canRedo() {}

  /**
   * Returns a copy of the past stack (newest first).
   * @returns {HistoryEntry[]}
   */
  getPast() {}

  /**
   * Returns a copy of the future stack.
   * @returns {HistoryEntry[]}
   */
  getFuture() {}

  /**
   * Subscribe to undo/redo stack changes.
   * @param {function({ canUndo: boolean, canRedo: boolean, past: [], future: [] }): void} handler
   * @returns {function} unsubscribe
   */
  onChange(handler) {}
}
```

### Undo / Redo Mechanics

```
UNDO called
    │
    ├── pop last entry from #past → entry
    ├── push entry onto #future
    │
    ├── strategy === 'snapshot':
    │       store.replaceState(entry.prevState)
    │
    └── strategy === 'inverse':
            store.dispatch(entry.inverseAction)   ← NOT recorded again
            (dispatch with meta.isUndo: true to suppress re-recording)

REDO called
    │
    ├── pop last entry from #future → entry
    ├── push entry onto #past
    └── store.dispatch(entry.action)              ← re-dispatch original
        (with meta.isRedo: true)
```

---

## 2.8 — State Persistence Bridge

### Responsibility
Watches specific state slices and writes them to a configured storage adapter when they change. On app boot, rehydrates those slices from storage back into the store. Decouples persistence concerns from business logic — no slice reducer ever touches storage directly.

### Interfaces

```js
/**
 * @typedef {Object} PersistenceConfig
 * @property {string}   key          - Storage key
 * @property {string}   adapter      - 'localStorage' | 'sessionStorage' | 'indexedDB' | 'remote'
 * @property {string[]} [pick]       - Only persist these keys within the slice
 * @property {string[]} [omit]       - Exclude these keys from persistence
 * @property {number}   [debounce]   - Write debounce ms (default: 300)
 * @property {number}   [version]    - Schema version. Mismatch triggers migration.
 * @property {function(stored: Object): Object} [migrate]  - Transform old shape to new
 * @property {function(state: Object): Object}  [serialize]   - Custom serializer
 * @property {function(stored: Object): Object} [deserialize] - Custom deserializer
 */
```

```js
class StatePersistenceBridge {
  /** @type {Map<string, PersistenceConfig>} */
  #configs = new Map();

  /** @type {Map<string, function>} */
  #debouncedWriters = new Map();

  /**
   * Register a slice for persistence.
   * @param {string}           sliceKey  - Matches the store's root key
   * @param {PersistenceConfig} config
   */
  register(sliceKey, config) {}

  /**
   * Load persisted values for all registered slices and merge them
   * into the store's initial state. Called once at boot before first render.
   *
   * @returns {Promise<Object>} - Partial initial state from storage
   */
  async rehydrate() {}

  /**
   * Attach store subscriber for each registered slice.
   * Writes to storage on change (debounced).
   * Call after store.init() and rehydrate().
   *
   * @param {GlobalStore} store
   */
  attach(store) {}

  /**
   * Force an immediate write for a specific slice (bypasses debounce).
   * Useful before page unload.
   * @param {string} sliceKey
   * @returns {Promise<void>}
   */
  async flush(sliceKey) {}

  /**
   * Flush all slices immediately.
   * @returns {Promise<void>}
   */
  async flushAll() {}

  /**
   * Clear persisted data for a slice (e.g. on logout).
   * @param {string} sliceKey
   */
  async clear(sliceKey) {}

  /**
   * Clear all persisted data.
   */
  async clearAll() {}
}
```

### Persistence Write Flow

```
store.subscribe('cart', handler) fires
        │
        ├── Retrieve PersistenceConfig for 'cart'
        │
        ├── Extract slice state
        │     ├── if config.pick  → only include those keys
        │     └── if config.omit  → exclude those keys
        │
        ├── Wrap in envelope:
        │     {
        │       __version: config.version,
        │       __savedAt: Date.now(),
        │       data: <extracted state>
        │     }
        │
        ├── config.serialize?.(envelope) ?? JSON.stringify(envelope)
        │
        └── StorageAdapter[config.adapter].set(config.key, serialized)
            (debounced by config.debounce ms)
```

### Rehydration Flow

```
StatePersistenceBridge.rehydrate() called at boot
        │
        ├── For each registered sliceKey → config:
        │       raw = StorageAdapter.get(config.key)
        │       if null → skip (use initialState from slice)
        │
        │       envelope = config.deserialize?.(raw) ?? JSON.parse(raw)
        │
        │       if envelope.__version !== config.version:
        │           data = config.migrate?.(envelope.data) ?? {}
        │       else:
        │           data = envelope.data
        │
        └── Return merged object { [sliceKey]: data, ... }
                → passed to GlobalStore.init({ initialState: merged })
```

---

## 2.9 — State Hydration Manager

### Responsibility
Assembles the complete initial state from all available sources before the store is initialized. Sources have a defined priority order — later sources win over earlier ones for the same key.

### Priority Order (lowest → highest)

```
1. Slice default initialState    (defined in SliceDefinition)
2. Persisted storage             (from PersistenceBridge.rehydrate())
3. Server-Side Render payload    (window.__SSR_STATE__)
4. URL-encoded state             (query param ?_state=<base64>)
5. Boot-time overrides           (passed explicitly at app.init())
```

```js
class StateHydrationManager {
  /**
   * Collect and merge initial state from all sources.
   * @param {Object} [options]
   * @param {Object}  [options.ssrPayload]     - Parsed SSR state (overrides storage)
   * @param {Object}  [options.overrides]      - Explicit boot overrides (highest priority)
   * @param {boolean} [options.fromURL]        - Decode and include URL-embedded state
   * @param {boolean} [options.fromStorage]    - Include persisted state (default: true)
   * @returns {Promise<Object>} - Merged initial state ready for store.init()
   */
  async collect(options = {}) {}

  /**
   * Extract server-side render state from the DOM.
   * Looks for window.__SSR_STATE__ or <script id="ssr-state" type="application/json">.
   * @returns {Object|null}
   */
  extractSSRState() {}

  /**
   * Decode state embedded in URL query param (for shareable UI states).
   * @param {string} [paramName='_state']
   * @returns {Object|null}
   */
  decodeURLState(paramName = '_state') {}

  /**
   * Encode a partial state object into a URL-safe base64 string.
   * Used by CanonicalURLBuilder for shareable states.
   * @param {Object} state
   * @returns {string}
   */
  encodeURLState(state) {}

  /**
   * Validate hydrated state against registered slice schemas.
   * Logs warnings for unrecognized keys or type mismatches.
   * Never throws — bad hydration data is silently dropped.
   * @param {Object} hydratedState
   * @returns {Object} - Sanitized state
   */
  validate(hydratedState) {}
}
```

---

## 2.10 — Time-Travel Debugger Interface

### Responsibility
Development-only interface that exposes the full action history, state snapshots, and replay controls to a browser devtools panel or an in-app debug overlay. **Never loaded in production.**

```js
/**
 * @typedef {Object} DebugSnapshot
 * @property {number}    index        - Position in timeline
 * @property {Action}    action       - Action that produced this state
 * @property {Object}    state        - Full state after action
 * @property {StateDiff} diff         - What changed vs previous snapshot
 * @property {number}    timestamp
 * @property {number}    [duration]   - Reducer execution time in ms
 */
```

```js
class TimeTravelDebugger {
  /** @type {DebugSnapshot[]} */
  #timeline = [];

  /** @type {number} - Current position in timeline (-1 = live) */
  #cursor = -1;

  /** @type {boolean} */
  #isPaused = false;

  /**
   * Initialize. Hooks into store's dispatch loop.
   * Only callable in development.
   * @param {GlobalStore} store
   */
  init(store) {
    if (process.env.NODE_ENV === 'production') return;
  }

  /**
   * Record a snapshot (called after every dispatch).
   * @param {Action}    action
   * @param {Object}    state
   * @param {StateDiff} diff
   * @param {number}    duration
   */
  record(action, state, diff, duration) {}

  /**
   * Jump to a specific snapshot index.
   * Replaces store state without dispatching.
   * @param {number} index
   */
  jumpTo(index) {}

  /**
   * Step one action forward in the timeline.
   */
  stepForward() {}

  /**
   * Step one action back in the timeline.
   */
  stepBack() {}

  /**
   * Replay the entire timeline from scratch at a given speed.
   * @param {number} [speed=1]  - 1 = real-time, 2 = 2× faster, 0.5 = slower
   */
  replay(speed = 1) {}

  /**
   * Pause live dispatching (store still receives actions but UI stays at cursor).
   */
  pause() {}

  /**
   * Resume live mode (jump to latest snapshot).
   */
  resume() {}

  /**
   * Export the full timeline as a JSON blob.
   * Can be imported and replayed in another session.
   * @returns {string}
   */
  export() {}

  /**
   * Import a previously exported timeline and replay it.
   * @param {string} json
   */
  import(json) {}

  /**
   * Return the full timeline for devtools rendering.
   * @returns {DebugSnapshot[]}
   */
  getTimeline() {}

  /**
   * Filter the timeline by action type substring.
   * @param {string} query
   * @returns {DebugSnapshot[]}
   */
  search(query) {}
}
```

---

## Wiring: Full Bootstrap Sequence

```js
// store/index.js — assembled at boot by the DI Container

import GlobalStore           from './GlobalStore.js';
import ActionDispatcher      from './ActionDispatcher.js';
import MiddlewarePipeline    from './MiddlewarePipeline.js';
import SliceManager          from './SliceManager.js';
import StateDiffEngine       from './StateDiffEngine.js';
import UndoRedoStack         from './UndoRedoStack.js';
import StatePersistenceBridge from './StatePersistenceBridge.js';
import StateHydrationManager from './StateHydrationManager.js';
import TimeTravelDebugger    from './TimeTravelDebugger.js';

// ── 1. Collect initial state from all sources ───────────────────────────
const hydrationManager = new StateHydrationManager();
const hydratedState    = await hydrationManager.collect({
  fromStorage: true,
  fromURL:     true,
});

// ── 2. Build the store ──────────────────────────────────────────────────
const store      = new GlobalStore();
const dispatcher = new ActionDispatcher(store);
const pipeline   = new MiddlewarePipeline();

pipeline.add('error',     errorMiddleware,                     5);
pipeline.add('thunk',     thunkMiddleware,                    10);
pipeline.add('promise',   promiseMiddleware,                  15);
pipeline.add('logger',    loggerMiddleware,                   20);
pipeline.add('analytics', analyticsMiddleware(analytics),    90);

store.init({
  initialState: hydratedState,
  middleware:   pipeline.compose(store._rawDispatch, { getState: store.getState, dispatch: store.dispatch }),
  devTools:     process.env.NODE_ENV !== 'production',
});

// ── 3. Register core slices ─────────────────────────────────────────────
const sliceManager = new SliceManager(store, dispatcher);

const { actions: authActions }    = sliceManager.register(authSlice);
const { actions: cartActions }    = sliceManager.register(cartSlice);
const { actions: uiActions }      = sliceManager.register(uiSlice);

// ── 4. Attach undo/redo ─────────────────────────────────────────────────
const undoRedo = new UndoRedoStack(store, { maxSize: 100, strategy: 'snapshot' });

// ── 5. Attach persistence bridge ────────────────────────────────────────
const persistence = new StatePersistenceBridge();
persistence.attach(store);

// ── 6. Attach time-travel debugger (dev only) ───────────────────────────
if (process.env.NODE_ENV !== 'production') {
  const debugger_ = new TimeTravelDebugger();
  debugger_.init(store);
}

// ── 7. Flush persistence before page unload ─────────────────────────────
window.addEventListener('beforeunload', () => persistence.flushAll());

export { store, dispatcher, sliceManager, undoRedo, persistence, hydrationManager };
```

---

## Event Bus Emissions (Module 5 integration)

| Event name | Payload | When |
|---|---|---|
| `store:action:dispatched` | `{ action, duration }` | After every successful dispatch |
| `store:action:rejected` | `{ action, reason }` | Schema validation failed |
| `store:dispatch:error` | `{ action, error }` | Reducer or middleware threw |
| `store:slice:registered` | `{ key }` | New slice registered at runtime |
| `store:slice:unregistered` | `{ key }` | Slice removed |
| `store:undo` | `{ entry, canUndo, canRedo }` | Undo executed |
| `store:redo` | `{ entry, canUndo, canRedo }` | Redo executed |
| `store:rehydrated` | `{ sources, slices }` | Hydration complete at boot |
| `store:persisted` | `{ sliceKey, adapter }` | Slice written to storage |
| `store:state:replaced` | `{ source }` | replaceState called (time-travel / hydration) |

---