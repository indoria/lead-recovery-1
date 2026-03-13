# Module 5 — 📡 Event System / Event Bus

> **Core Principle:** No module calls another module's methods directly unless it is a declared dependency. Everything else communicates through events. The Event Bus is the spinal cord of the application — every state change, user action, and system notification flows through it.

---

## Architecture Overview

```
Emitter (any module)
        │
        │  EventBus.emit('cart:item:added', payload)
        ▼
┌────────────────────────────────────────────────────────┐
│               Event Transformer Pipeline               │
│   Enrich, redact, reshape payload before delivery      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Namespace Manager                      │
│   Validate naming convention, parse hierarchy          │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Event Registry                        │
│   Schema validation of payload, known event check      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                Event Priority Queue                     │
│   Order delivery for this event cycle                  │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
     Exact Subscribers  Wildcard       DOM Event
     (cart:item:added)  Subscribers    Bridge
                        (cart:*)
              │             │
              └──────┬──────┘
                     ▼
         ┌───────────────────────┐
         │  Subscriber Manager   │   ← cleanup on teardown
         └───────────┬───────────┘
                     │
         ┌───────────┼────────────────┐
         ▼           ▼                ▼
  Event Logger   Dead Letter      Replay Buffer
  (Audit Trail)  Queue            (late subscribers)
                     │
              Cross-Tab Sync
         (BroadcastChannel / SharedWorker)
```

---

## 5.0 — Core Types & Interfaces

```js
/**
 * @typedef {Object} EventEnvelope
 * The normalized container for every event flowing through the bus.
 *
 * @property {string}  id          - UUID; unique per emission
 * @property {string}  type        - Fully-qualified namespaced type e.g. 'cart:item:added'
 * @property {*}       payload     - The event data (may be transformed)
 * @property {*}       [originalPayload] - Pre-transform payload (set by transformer pipeline)
 * @property {Object}  meta        - System metadata (never transformed)
 * @property {number}  meta.timestamp    - Unix ms when emit() was called
 * @property {string}  meta.source       - Module/component that emitted e.g. 'CartService'
 * @property {string}  [meta.correlationId] - Links related events (e.g. request → response)
 * @property {string}  [meta.causationId]   - ID of the event that caused this one
 * @property {boolean} [meta.crossTab]      - True if event arrived from another tab
 * @property {boolean} [meta.replayed]      - True if event came from replay buffer
 * @property {number}  [meta.priority]      - Delivery priority (default: 5)
 * @property {boolean} [meta.broadcast]     - Whether to broadcast cross-tab
 */

/**
 * @callback EventHandler
 * @param {EventEnvelope} envelope
 * @returns {void | Promise<void>}
 */

/**
 * @typedef {Object} SubscriptionOptions
 * @property {number}   [priority]     - Handler priority within same event (lower = first, default: 100)
 * @property {boolean}  [once]         - Auto-unsubscribe after first delivery
 * @property {boolean}  [async]        - Run handler asynchronously (don't block other handlers)
 * @property {function(envelope: EventEnvelope): boolean} [filter]
 *           Predicate — only invoke handler if it returns true
 * @property {string}   [scope]        - Scope ID for bulk cleanup (e.g. component ID)
 * @property {AbortSignal} [signal]    - Unsubscribe when signal aborts
 * @property {number}   [timeout]      - Max ms for async handler before warning
 */

/**
 * @typedef {Object} Subscription
 * @property {string}          id        - UUID for this subscription
 * @property {string}          pattern   - The pattern subscribed to (exact or wildcard)
 * @property {EventHandler}    handler
 * @property {SubscriptionOptions} options
 * @property {function(): void} unsubscribe
 */

/**
 * @typedef {Object} EmitOptions
 * @property {string}  [source]          - Emitting module name (for audit trail)
 * @property {string}  [correlationId]   - Link to a related chain of events
 * @property {string}  [causationId]     - ID of the causing event
 * @property {number}  [priority]        - Override default delivery priority
 * @property {boolean} [broadcast]       - Sync to other browser tabs (default: per-event config)
 * @property {boolean} [sync]            - Force synchronous delivery (default: false)
 * @property {boolean} [skipTransform]   - Skip transformer pipeline for this emit
 * @property {boolean} [skipValidation]  - Skip registry validation (use carefully)
 */
```

---

## 5.1 — Event Bus

### Responsibility
The central broker. The only class most application code will ever interact with directly. Owns all other subsystems and exposes the unified public API. Every module receives a reference to this singleton at boot via the DI container.

```js
class EventBus {
  /** @type {SubscriberManager} */
  #subscribers = null;

  /** @type {NamespaceManager} */
  #namespace = null;

  /** @type {EventRegistry} */
  #registry = null;

  /** @type {EventEmitter} */
  #emitter = null;

  /** @type {EventPriorityQueue} */
  #priorityQueue = null;

  /** @type {ReplayBuffer} */
  #replayBuffer = null;

  /** @type {CrossTabSync} */
  #crossTabSync = null;

  /** @type {EventLogger} */
  #logger = null;

  /** @type {DeadLetterQueue} */
  #dlq = null;

  /** @type {TransformerPipeline} */
  #transformer = null;

  /** @type {DOMEventBridge} */
  #domBridge = null;

  /** @type {boolean} */
  #isDispatching = false;

  /** @type {EventEnvelope[]} - events queued while a dispatch cycle is running */
  #pendingEmits = [];

  /**
   * @param {EventBusOptions} [options]
   */
  constructor(options = {}) {}

  // ── Core API ───────────────────────────────────────────────────────────

  /**
   * Emit an event. The primary way to communicate between modules.
   *
   * Flow: validate type → build envelope → transform → queue → deliver
   *
   * @param {string}     type       - Namespaced event type e.g. 'cart:item:added'
   * @param {*}          [payload]  - Event data
   * @param {EmitOptions} [options]
   * @returns {string} eventId  - UUID of the emitted envelope
   */
  emit(type, payload, options = {}) {}

  /**
   * Emit and wait for all async handlers to settle.
   * Use sparingly — prefer fire-and-forget emit() for loose coupling.
   *
   * @param {string}      type
   * @param {*}           [payload]
   * @param {EmitOptions} [options]
   * @returns {Promise<void>}
   */
  async emitAsync(type, payload, options = {}) {}

  /**
   * Subscribe to an exact event type or a wildcard pattern.
   *
   * @param {string}             pattern  - Exact type or wildcard e.g. 'cart:*', '*.error'
   * @param {EventHandler}       handler
   * @param {SubscriptionOptions} [options]
   * @returns {Subscription}
   */
  on(pattern, handler, options = {}) {}

  /**
   * Subscribe to the next emission of a type, then auto-unsubscribe.
   * Returns a Promise that resolves with the envelope.
   *
   * @param {string}  pattern
   * @param {SubscriptionOptions} [options]
   * @returns {Promise<EventEnvelope>}
   */
  once(pattern, options = {}) {}

  /**
   * Subscribe and receive the latest buffered event immediately
   * (if one exists in the replay buffer), then continue receiving new ones.
   * Useful for late-joining modules that need current state.
   *
   * @param {string}             pattern
   * @param {EventHandler}       handler
   * @param {SubscriptionOptions} [options]
   * @returns {Subscription}
   */
  onWithReplay(pattern, handler, options = {}) {}

  /**
   * Unsubscribe by subscription ID.
   * @param {string} subscriptionId
   */
  off(subscriptionId) {}

  /**
   * Unsubscribe all handlers registered under a scope ID.
   * Call this when a component/module unmounts.
   *
   * @param {string} scope  - e.g. component instance ID
   */
  offScope(scope) {}

  /**
   * Remove all subscribers for a given pattern.
   * @param {string} pattern
   */
  offAll(pattern) {}

  /**
   * Check if any subscribers exist for a pattern.
   * @param {string} pattern
   * @returns {boolean}
   */
  hasSubscribers(pattern) {}

  /**
   * Returns a count of active subscribers for a pattern (or total if omitted).
   * @param {string} [pattern]
   * @returns {number}
   */
  subscriberCount(pattern) {}

  // ── Accessors ──────────────────────────────────────────────────────────

  /** @returns {EventRegistry} */
  get registry()     { return this.#registry; }

  /** @returns {ReplayBuffer} */
  get replay()       { return this.#replayBuffer; }

  /** @returns {DeadLetterQueue} */
  get deadLetters()  { return this.#deadLetters; }

  /** @returns {EventLogger} */
  get auditLog()     { return this.#logger; }

  /** @returns {TransformerPipeline} */
  get transformers() { return this.#transformer; }

  /** @returns {DOMEventBridge} */
  get dom()          { return this.#domBridge; }
}

/**
 * @typedef {Object} EventBusOptions
 * @property {boolean} [strict]          - Throw on unregistered event types (default: false in dev, true in prod)
 * @property {boolean} [warnUnregistered]- Log warning on unregistered events (default: true)
 * @property {number}  [replayBufferSize]- Max events in replay buffer (default: 100)
 * @property {boolean} [crossTab]        - Enable cross-tab sync (default: false)
 * @property {string}  [channelName]     - BroadcastChannel name (default: 'app:events')
 * @property {boolean} [domBridge]       - Enable DOM event bridge (default: true)
 * @property {boolean} [auditAll]        - Log every event (default: false; audit configured per-event in registry)
 */
```

### Internal `emit()` Flow

```
EventBus.emit('cart:item:added', { productId: 'sku-42', quantity: 2 })
        │
        ├── 1. NamespaceManager.validate('cart:item:added')
        │         → throws if format is invalid
        │
        ├── 2. EventRegistry.check('cart:item:added', payload)
        │         → warn/throw if type unregistered (per strict mode)
        │         → validate payload schema; throw EventValidationError on failure
        │
        ├── 3. Build EventEnvelope {
        │         id: UUID(), type, payload,
        │         meta: { timestamp: Date.now(), source, priority, ... }
        │       }
        │
        ├── 4. TransformerPipeline.run(envelope)
        │         → returns (possibly mutated) envelope
        │
        ├── 5. EventLogger.record(envelope)          [if loggable]
        │
        ├── 6. ReplayBuffer.store(envelope)          [if buffered]
        │
        ├── 7. CrossTabSync.broadcast(envelope)      [if broadcast:true]
        │
        ├── 8. #isDispatching?
        │         → yes: push to #pendingEmits, return id   ← prevents re-entrant delivery
        │         → no:  continue
        │
        ├── 9. #isDispatching = true
        │
        ├── 10. PriorityQueue.build(envelope, matchedSubscriptions)
        │
        ├── 11. EventEmitter.deliver(queue)
        │         → for each handler:
        │               try { handler(envelope) }
        │               catch (err) { DeadLetterQueue.push(envelope, err) }
        │
        ├── 12. #isDispatching = false
        │
        ├── 13. Process #pendingEmits (drain queue)
        │
        └── 14. return envelope.id
```

---

## 5.2 — Namespace Manager

### Responsibility
Enforces that all event types follow a consistent hierarchical naming convention. Parses types into their segment tree. Provides utilities for prefix matching and hierarchy traversal used by wildcard subscriptions.

```js
/**
 * @typedef {Object} ParsedNamespace
 * @property {string[]} segments   - e.g. ['cart', 'item', 'added']
 * @property {string}   root       - First segment e.g. 'cart'
 * @property {string}   leaf       - Last segment e.g. 'added'
 * @property {string}   parent     - All but last segment e.g. 'cart:item'
 * @property {number}   depth      - Segment count
 */
```

```js
class NamespaceManager {
  /**
   * Naming rules enforced:
   *  - Segments are lowercase alphanumeric + hyphens only: [a-z0-9-]
   *  - Segments separated by ':'
   *  - Minimum 2 segments (e.g. 'module:action')
   *  - Maximum 5 segments
   *  - No leading/trailing colons
   *  - Special prefixes: '@@' reserved for system events e.g. '@@store:action'
   *
   * @type {RegExp}
   */
  static VALID_TYPE = /^(@@)?[a-z0-9-]+(?::[a-z0-9-]+){1,4}$/;

  /**
   * Validate an event type string.
   * @param {string}  type
   * @param {boolean} [throws]  - Throw InvalidNamespaceError instead of returning false
   * @returns {boolean}
   */
  static validate(type, throws = false) {}

  /**
   * Parse a type string into its constituent parts.
   * @param {string} type
   * @returns {ParsedNamespace}
   */
  static parse(type) {}

  /**
   * Determine if a type string matches a wildcard pattern.
   *
   * Pattern rules:
   *   'cart:*'      → matches any direct child: 'cart:item:added', 'cart:coupon:applied'
   *   '*.error'     → matches anything ending in ':error'
   *   'cart:**'     → matches cart and all descendants at any depth
   *   '*'           → matches everything (use with caution)
   *
   * @param {string} pattern   - May contain '*' or '**'
   * @param {string} type      - Concrete type to test
   * @returns {boolean}
   */
  static matches(pattern, type) {}

  /**
   * Return all ancestor type strings for a given type.
   * Used by wildcard matching to check parent patterns.
   *
   * e.g. 'cart:item:added' → ['cart', 'cart:item', 'cart:item:added']
   *
   * @param {string} type
   * @returns {string[]}
   */
  static ancestors(type) {}

  /**
   * Build a concrete type string from segments.
   * @param {...string} segments
   * @returns {string}
   */
  static build(...segments) {
    const type = segments.join(':');
    NamespaceManager.validate(type, true);
    return type;
  }
}
```

### Naming Convention Examples

```
VALID:
  auth:login                   → simple 2-segment
  auth:user:login              → 3-segment with subject
  cart:item:added              → standard form
  http:request:error           → error event
  store:action:dispatched      → store events
  @@internal:bus:ready         → system events (@@-prefixed)

INVALID:
  Login                        → not namespaced
  auth_login                   → underscore not allowed
  AUTH:LOGIN                   → uppercase not allowed
  a                            → single segment
  auth:user:profile:settings:update:clicked  → too deep (>5)
  :auth:login                  → leading colon

WILDCARD PATTERNS:
  cart:*          → 'cart:cleared', 'cart:item:added' ✓
  cart:**         → 'cart:item:added', 'cart:coupon:applied:code' ✓
  *.error         → 'http:error', 'auth:error', 'store:dispatch:error' ✓
  *               → everything ✓  (use with great care)
```

---

## 5.3 — Event Registry

### Responsibility
A compile-time and runtime catalog of all known event types. Serves as the single authoritative source of what events exist, what their payloads look like, and how they should be treated (audited, buffered, broadcast across tabs, etc.).

```js
/**
 * @typedef {Object} EventDefinition
 * @property {string}   type               - Fully-qualified type e.g. 'cart:item:added'
 * @property {string}   [description]      - Human-readable purpose
 * @property {function(payload: *): ValidationResult} [validate]
 *           Payload validator. Return { valid, errors }.
 * @property {boolean}  [buffered]         - Store in ReplayBuffer (default: false)
 * @property {number}   [bufferSize]       - Per-event buffer size override
 * @property {boolean}  [audited]          - Include in audit log (default: true)
 * @property {boolean}  [broadcast]        - Sync cross-tab by default (default: false)
 * @property {boolean}  [sensitive]        - Redact payload in logs (default: false)
 * @property {number}   [defaultPriority]  - Default delivery priority 1–10 (default: 5)
 * @property {string}   [module]           - Owning module name for documentation
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  valid
 * @property {string[]} [errors]
 */
```

```js
class EventRegistry {
  /** @type {Map<string, EventDefinition>} */
  #definitions = new Map();

  /**
   * Register a single event definition.
   * @param {EventDefinition} definition
   */
  register(definition) {}

  /**
   * Register multiple definitions. Called per-module at boot or lazy load.
   * @param {EventDefinition[]} definitions
   */
  registerBatch(definitions) {}

  /**
   * Look up a definition by type.
   * Returns null if not found (not an error unless strict mode).
   *
   * @param {string} type
   * @returns {EventDefinition|null}
   */
  get(type) {}

  /**
   * Check if a type is registered.
   * @param {string} type
   * @returns {boolean}
   */
  has(type) {}

  /**
   * Validate an event payload against its registered schema.
   * Returns { valid: true } if no validator is registered.
   *
   * @param {string} type
   * @param {*}      payload
   * @returns {ValidationResult}
   */
  validate(type, payload) {}

  /**
   * Return all definitions for a given module namespace prefix.
   * @param {string} modulePrefix  - e.g. 'cart' returns all 'cart:*' definitions
   * @returns {EventDefinition[]}
   */
  getByModule(modulePrefix) {}

  /**
   * Return all registered type strings.
   * @returns {string[]}
   */
  getAllTypes() {}
}
```

### Registry Definition Example

```js
// events/cart.events.js
export const cartEventDefinitions = [
  {
    type:        'cart:item:added',
    description: 'A product was added to the shopping cart',
    module:      'cart',
    buffered:    true,
    audited:     true,
    validate(payload) {
      const errors = [];
      if (!payload?.productId)            errors.push('productId required');
      if (typeof payload?.quantity !== 'number') errors.push('quantity must be a number');
      if (payload?.quantity <= 0)         errors.push('quantity must be > 0');
      return { valid: errors.length === 0, errors };
    },
  },
  {
    type:        'cart:item:removed',
    description: 'A product was removed from the cart',
    module:      'cart',
    buffered:    true,
    audited:     true,
    validate: (p) => ({ valid: !!p?.productId, errors: p?.productId ? [] : ['productId required'] }),
  },
  {
    type:            'cart:checkout:completed',
    description:     'Checkout completed successfully',
    module:          'cart',
    buffered:        true,
    audited:         true,
    broadcast:       true,   // sync to other tabs (e.g. header cart badge)
    defaultPriority: 1,      // deliver first
    validate(payload) {
      const errors = [];
      if (!payload?.orderId) errors.push('orderId required');
      if (!payload?.total)   errors.push('total required');
      return { valid: errors.length === 0, errors };
    },
  },
  {
    type:      'cart:coupon:applied',
    module:    'cart',
    audited:   true,
  },
];
```

---

## 5.4 — Event Emitter

### Responsibility
The delivery engine. Takes a built priority queue of `(handler, envelope)` pairs and executes them. Handles synchronous and asynchronous handlers, catches errors, and routes failures to the Dead Letter Queue.

```js
class EventEmitter {
  /** @type {DeadLetterQueue} */
  #dlq = null;

  /**
   * @param {DeadLetterQueue} dlq
   */
  constructor(dlq) {
    this.#dlq = dlq;
  }

  /**
   * Deliver an envelope to an ordered list of subscriptions.
   * Synchronous by default: blocks until all sync handlers complete.
   * Async handlers are fired and their Promises collected but not awaited
   * unless emitAsync() was used.
   *
   * @param {EventEnvelope}  envelope
   * @param {DeliveryEntry[]} deliveries    - Priority-ordered list
   * @returns {Promise<DeliveryResult>}
   */
  async deliver(envelope, deliveries) {}

  /**
   * Deliver to a single handler safely.
   * Catches all errors and routes them to DLQ.
   *
   * @param {EventEnvelope} envelope
   * @param {Subscription}  subscription
   * @returns {Promise<SingleDeliveryResult>}
   */
  async deliverOne(envelope, subscription) {}
}

/**
 * @typedef {Object} DeliveryEntry
 * @property {Subscription}  subscription
 * @property {number}        priority
 */

/**
 * @typedef {Object} DeliveryResult
 * @property {number}  delivered     - Successfully handled count
 * @property {number}  failed        - Handler threw count
 * @property {number}  filtered      - Skipped by subscription filter
 * @property {number}  durationMs    - Total delivery time
 */

/**
 * @typedef {Object} SingleDeliveryResult
 * @property {'delivered'|'failed'|'filtered'|'timeout'} status
 * @property {number}  durationMs
 * @property {Error}   [error]
 */
```

### Delivery Rules

```
deliver(envelope, deliveries)
        │
        For each DeliveryEntry (in priority order):
        │
        ├── subscription.options.filter?.(envelope) === false?
        │       → status: 'filtered', skip
        │
        ├── subscription.options.async === true?
        │       → fire Promise, don't await (non-blocking)
        │
        ├── subscription.options.timeout set?
        │       → race handler vs timeout Promise
        │       → timeout wins → log warning, status: 'timeout'
        │
        ├── try { await handler(envelope) }
        │       → success: status 'delivered'
        │       → catch:   DeadLetterQueue.push(envelope, err, subscription)
        │                  status 'failed'
        │
        └── subscription.options.once?
                → subscription.unsubscribe()
```

---

## 5.5 — Event Subscriber Manager

### Responsibility
Owns the subscription registry. Matches incoming events to subscriptions (exact + wildcard). Provides scope-based bulk cleanup so modules never leak listeners when they unmount.

```js
class SubscriberManager {
  /** @type {Map<string, Set<Subscription>>} - exact type → subscriptions */
  #exactIndex = new Map();

  /** @type {Array<{ pattern: string, subscription: Subscription }>} - wildcard subscriptions */
  #wildcardIndex = [];

  /** @type {Map<string, Set<string>>} - scope → Set<subscriptionId> */
  #scopeIndex = new Map();

  /**
   * Register a new subscription.
   * @param {string}             pattern
   * @param {EventHandler}       handler
   * @param {SubscriptionOptions} [options]
   * @returns {Subscription}
   */
  subscribe(pattern, handler, options = {}) {}

  /**
   * Remove a subscription by ID.
   * @param {string} subscriptionId
   * @returns {boolean} - true if found and removed
   */
  unsubscribe(subscriptionId) {}

  /**
   * Remove all subscriptions for a scope.
   * Call when a component or module tears down.
   * @param {string} scope
   */
  unsubscribeScope(scope) {}

  /**
   * Remove all subscriptions matching a pattern.
   * @param {string} pattern
   */
  unsubscribeAll(pattern) {}

  /**
   * Find all subscriptions that should receive an event.
   * Checks exact matches first, then wildcard patterns.
   *
   * @param {string} type   - Concrete event type e.g. 'cart:item:added'
   * @returns {Subscription[]}
   */
  resolve(type) {}

  /**
   * Returns the total number of active subscriptions.
   * @returns {number}
   */
  count() {}

  /**
   * Returns all subscriptions for devtools / diagnostics.
   * @returns {Subscription[]}
   */
  getAll() {}
}
```

### Usage With Scope-Based Cleanup

```js
// In a component or module:
class CartWidget {
  #scope = `CartWidget:${UUID.v4()}`;
  #unsubscribers = [];

  mount() {
    // All subscriptions tagged with this scope
    eventBus.on('cart:item:added',   this.#onItemAdded,   { scope: this.#scope });
    eventBus.on('cart:item:removed', this.#onItemRemoved, { scope: this.#scope });
    eventBus.on('cart:cleared',      this.#onCleared,     { scope: this.#scope });
  }

  unmount() {
    // Single call removes ALL subscriptions for this component
    eventBus.offScope(this.#scope);
  }
}

// Alternatively with AbortSignal (Web-standard pattern):
const controller = new AbortController();

eventBus.on('cart:item:added', handler, { signal: controller.signal });
eventBus.on('cart:cleared',    handler, { signal: controller.signal });

// On teardown:
controller.abort();   // automatically unsubscribes all
```

---

## 5.6 — Wildcard Subscriber

### Responsibility
Extends the `SubscriberManager`'s resolve logic with pattern-matching semantics. Compiled patterns are cached as `RegExp` objects for fast matching. Supports `*` (single segment wildcard) and `**` (multi-segment wildcard).

```js
class WildcardMatcher {
  /** @type {Map<string, RegExp>} - pattern → compiled RegExp cache */
  static #cache = new Map();

  /**
   * Compile a wildcard pattern to a RegExp. Results are cached.
   *
   * Compilation rules:
   *   ':'   → escaped as literal ':'
   *   '**'  → matches one or more segments: [a-z0-9-]+(:[a-z0-9-]+)*
   *   '*'   → matches exactly one segment: [a-z0-9-]+
   *   Other chars → escaped literally
   *
   * @param {string} pattern
   * @returns {RegExp}
   */
  static compile(pattern) {}

  /**
   * Test a concrete type against a pattern.
   * @param {string} pattern
   * @param {string} type
   * @returns {boolean}
   */
  static matches(pattern, type) {
    if (pattern === type) return true;    // fast path: exact match
    if (!pattern.includes('*')) return false;
    const re = WildcardMatcher.compile(pattern);
    return re.test(type);
  }

  /**
   * Score specificity of a pattern for priority ordering.
   * More specific patterns should be reported first.
   * Exact > long prefix > short prefix > wildcard.
   *
   * @param {string} pattern
   * @param {string} type
   * @returns {number} - lower = more specific
   */
  static specificity(pattern, type) {}
}
```

### Pattern Match Table

| Pattern | Matches | Does Not Match |
|---|---|---|
| `cart:item:added` | `cart:item:added` only | `cart:item:removed` |
| `cart:*` | `cart:cleared`, `cart:item:added` | `auth:login` |
| `cart:**` | `cart:item:added`, `cart:coupon:applied:code` | `auth:login` |
| `*.error` | `http:error`, `auth:error` | `http:request:error` |
| `**:error` | `http:error`, `http:request:error` | `cart:item:added` |
| `*` | everything | — |

---

## 5.7 — Event Priority Queue

### Responsibility
Orders the delivery of subscriptions for a single event emission. Higher-priority handlers (lower number) run first. Ensures critical handlers (e.g. security audit) always run before side-effect handlers (e.g. analytics).

```js
/**
 * @typedef {Object} QueueEntry
 * @property {Subscription}  subscription
 * @property {number}        effectivePriority  - min(event.defaultPriority, subscription.priority)
 */
```

```js
class EventPriorityQueue {
  /**
   * Build a delivery queue for an envelope from a list of matching subscriptions.
   * Sorts by effectivePriority ascending (lower number = higher priority = runs first).
   * Within same priority, preserves registration order (FIFO).
   *
   * @param {EventEnvelope}   envelope
   * @param {Subscription[]}  subscriptions
   * @returns {QueueEntry[]}
   */
  build(envelope, subscriptions) {}

  /**
   * Insert a single entry into an existing queue at the correct position.
   * Used when a handler emits a new event mid-delivery (re-entrant case).
   *
   * @param {QueueEntry[]} queue
   * @param {QueueEntry}   entry
   * @returns {QueueEntry[]}
   */
  insert(queue, entry) {}
}
```

### Priority Levels — Convention

```
Priority 1   - Security / Auth handlers
Priority 2   - State management (store updates)
Priority 5   - Default (business logic)
Priority 7   - UI / rendering updates
Priority 9   - Analytics / telemetry
Priority 10  - Logging / debugging
```

```js
// Example: auth:logout must flush store before UI reacts
eventBus.on('auth:logout', store.clearUserData,    { priority: 2 });
eventBus.on('auth:logout', ui.showLoginScreen,     { priority: 7 });
eventBus.on('auth:logout', analytics.trackLogout,  { priority: 9 });
```

---

## 5.8 — Event Replay Buffer

### Responsibility
Stores the N most recent emissions of each `buffered: true` event type. When a subscriber calls `onWithReplay()`, or when a module lazy-loads after the event was already emitted, it immediately receives the last buffered state without waiting for the next emission.

```js
/**
 * @typedef {Object} ReplayBufferOptions
 * @property {number} [globalMaxSize]     - Total envelopes kept across all types (default: 500)
 * @property {number} [perTypeMaxSize]    - Max envelopes per type (default: 10)
 * @property {number} [ttl]              - Evict buffered events older than this ms (default: 5 min)
 */
```

```js
class ReplayBuffer {
  /** @type {Map<string, EventEnvelope[]>} - type → ring buffer */
  #buffers = new Map();

  /** @type {ReplayBufferOptions} */
  #options = {};

  /**
   * @param {ReplayBufferOptions} [options]
   */
  constructor(options = {}) {}

  /**
   * Store an envelope in the replay buffer.
   * Only called for events where registry.buffered === true.
   * Enforces per-type and global size limits (evicts oldest).
   *
   * @param {EventEnvelope} envelope
   */
  store(envelope) {}

  /**
   * Retrieve the most recent N envelopes for a type.
   * Filters out expired envelopes before returning.
   *
   * @param {string}  type
   * @param {number}  [count]  - Number to return (default: 1)
   * @returns {EventEnvelope[]}  - Newest first
   */
  get(type, count = 1) {}

  /**
   * Retrieve and replay buffered events to a newly registered handler.
   * Marks replayed envelopes with meta.replayed = true.
   *
   * @param {string}       pattern   - Exact type or wildcard pattern
   * @param {EventHandler} handler
   */
  replayTo(pattern, handler) {}

  /**
   * Clear buffer for a specific type, or all if omitted.
   * @param {string} [type]
   */
  clear(type) {}

  /**
   * Evict envelopes older than TTL across all buffers.
   * Called periodically by the TTL sweep.
   * @returns {number} evicted count
   */
  evictExpired() {}

  /**
   * Returns total envelopes currently buffered.
   * @returns {number}
   */
  size() {}
}
```

### Replay Usage Pattern

```js
// Module A emits at t=0
eventBus.emit('auth:user:loaded', { id: 42, name: 'Alice' });

// --- 2 seconds pass ---

// Module B lazy-loads at t=2000
// Using onWithReplay() it immediately gets the buffered event
// AND subscribes for future ones
eventBus.onWithReplay('auth:user:loaded', (envelope) => {
  // Called IMMEDIATELY with the buffered envelope (meta.replayed === true)
  // AND again on every future emission
  profileWidget.setUser(envelope.payload);
});
```

---

## 5.9 — Cross-Tab Event Sync

### Responsibility
Broadcasts designated events to all other browser tabs/windows sharing the same origin using `BroadcastChannel`. Prevents redundant state (e.g. a user logs out in one tab but other tabs remain authenticated).

```js
/**
 * @typedef {Object} CrossTabSyncOptions
 * @property {string}   channelName         - BroadcastChannel name (default: 'app:events')
 * @property {string[]} [allowedTypes]      - Whitelist. If set, only these types are broadcast.
 *                                            Takes precedence over registry broadcast:true.
 * @property {string[]} [blockedTypes]      - Blacklist. Never broadcast these.
 * @property {boolean}  [echoOwn]          - Deliver cross-tab events back to emitting tab (default: false)
 * @property {boolean}  [useSharedWorker]  - Use SharedWorker instead of BroadcastChannel (default: false)
 */
```

```js
class CrossTabSync {
  /** @type {BroadcastChannel|null} */
  #channel = null;

  /** @type {string} - Unique ID for this tab instance */
  #tabId = UUID.v4();

  /** @type {CrossTabSyncOptions} */
  #options = {};

  /** @type {function(EventEnvelope): void} - Callback to re-emit received events */
  #onReceive = null;

  /**
   * @param {CrossTabSyncOptions} options
   * @param {function(EventEnvelope): void} onReceive
   *        Called when an event arrives from another tab.
   *        Implementation: eventBus.emit() with meta.crossTab = true
   */
  constructor(options, onReceive) {}

  /**
   * Open the BroadcastChannel and begin listening.
   * @returns {void}
   */
  init() {}

  /**
   * Broadcast an envelope to other tabs.
   * Attaches tabId so receiving tabs can filter out their own broadcasts.
   *
   * @param {EventEnvelope} envelope
   */
  broadcast(envelope) {}

  /**
   * Returns whether an event type should be broadcast.
   * Checks allowedTypes whitelist, blockedTypes blacklist, and registry.broadcast flag.
   *
   * @param {EventEnvelope} envelope
   * @returns {boolean}
   */
  shouldBroadcast(envelope) {}

  /**
   * Close the channel. Call on app teardown.
   */
  close() { this.#channel?.close(); }
}
```

### Cross-Tab Flow

```
Tab A: eventBus.emit('auth:logout', {})
        │
        ├── registry: { broadcast: true }
        │
        ├── CrossTabSync.broadcast(envelope)
        │     → BroadcastChannel.postMessage({
        │           ...envelope,
        │           _sourceTabId: 'tab-a-uuid'
        │       })
        │
        └── Delivers to Tab A's own subscribers normally

Tab B: BroadcastChannel 'message' event fires
        │
        ├── message._sourceTabId !== this.#tabId  → not our own echo
        │
        ├── envelope.meta.crossTab = true          ← marked as cross-tab
        │
        └── onReceive(envelope)
              → eventBus.emit() with skipTransform: true, skipValidation: true
              → delivered to Tab B's subscribers normally
```

---

## 5.10 — Event Logger / Audit Trail

### Responsibility
Maintains an immutable, append-only, chronological log of all auditable events. In production this log is shipped to a remote logging service. Locally it provides a queryable in-memory trail for debugging and compliance.

```js
/**
 * @typedef {Object} AuditEntry
 * @property {string}        id          - Matches EventEnvelope.id
 * @property {string}        type
 * @property {*}             payload     - Sensitive fields replaced with '[REDACTED]'
 * @property {Object}        meta        - Full envelope meta
 * @property {number}        timestamp
 * @property {DeliveryResult} [delivery] - Handler delivery stats
 * @property {string}        [error]     - If event caused a DLQ entry
 */

/**
 * @typedef {Object} AuditQueryOptions
 * @property {string|RegExp}  [type]         - Filter by type
 * @property {number}         [fromTimestamp]
 * @property {number}         [toTimestamp]
 * @property {string}         [source]       - Filter by meta.source
 * @property {string}         [correlationId]
 * @property {number}         [limit]        - Max results (default: 100)
 * @property {'asc'|'desc'}   [order]        - Default 'desc' (newest first)
 */
```

```js
class EventLogger {
  /** @type {AuditEntry[]} - ring buffer; oldest entries evicted at maxSize */
  #log = [];

  /** @type {number} */
  #maxSize = 1_000;

  /** @type {function(AuditEntry): void | null} - remote transport */
  #transport = null;

  /**
   * @param {Object} [options]
   * @param {number}   [options.maxSize]      - In-memory log size (default: 1000)
   * @param {function(AuditEntry): void} [options.transport] - Ship to remote
   * @param {boolean}  [options.auditAll]     - Log all events (default: false; respects registry.audited)
   */
  constructor(options = {}) {}

  /**
   * Record an event envelope in the audit log.
   * Skips if registry.audited === false for this type.
   * Redacts sensitive payloads before storage.
   *
   * @param {EventEnvelope}  envelope
   * @param {DeliveryResult} [delivery]
   */
  record(envelope, delivery) {}

  /**
   * Query the in-memory audit log.
   * @param {AuditQueryOptions} [options]
   * @returns {AuditEntry[]}
   */
  query(options = {}) {}

  /**
   * Get a single audit entry by event ID.
   * @param {string} eventId
   * @returns {AuditEntry|null}
   */
  getById(eventId) {}

  /**
   * Get the complete event chain for a correlationId.
   * Returns all events sharing the same correlation, ordered by timestamp.
   *
   * @param {string} correlationId
   * @returns {AuditEntry[]}
   */
  getCorrelatedChain(correlationId) {}

  /**
   * Clear the in-memory log.
   * Does not affect remote transport.
   */
  clear() {}

  /**
   * Export the log as a JSON string (for download / bug report).
   * @returns {string}
   */
  export() {}

  /**
   * Attach a remote transport (e.g. send to logging API).
   * @param {function(AuditEntry): void} fn
   */
  setTransport(fn) { this.#transport = fn; }
}
```

---

## 5.11 — Dead Letter Queue

### Responsibility
Captures any event that either had no subscribers or caused a handler to throw an unhandled error. Acts as a safety net — events are never silently lost. Provides retry and inspection APIs.

```js
/**
 * @typedef {Object} DeadLetter
 * @property {string}         id            - UUID
 * @property {EventEnvelope}  envelope      - The event that failed
 * @property {'unhandled'|'handler-error'|'validation-failed'|'timeout'} reason
 * @property {Error}          [error]       - The thrown error (for handler-error)
 * @property {Subscription}   [subscription]- Which subscription threw
 * @property {number}         timestamp
 * @property {number}         retryCount    - How many times retried
 * @property {boolean}        resolved      - Manually marked as resolved
 */
```

```js
class DeadLetterQueue {
  /** @type {DeadLetter[]} */
  #letters = [];

  /** @type {number} */
  #maxSize = 200;

  /** @type {Map<string, function(DeadLetter): void>} - reason → handler */
  #handlers = new Map();

  /**
   * Push a failed event to the DLQ.
   * Triggers any registered DLQ handlers for this reason.
   *
   * @param {EventEnvelope}  envelope
   * @param {'unhandled'|'handler-error'|'validation-failed'|'timeout'} reason
   * @param {Error}          [error]
   * @param {Subscription}   [subscription]
   */
  push(envelope, reason, error, subscription) {}

  /**
   * Retry a dead letter — re-emits the envelope through the event bus.
   * Increments retryCount on the DLQ entry.
   *
   * @param {string} deadLetterId
   * @returns {boolean} - true if found and retried
   */
  retry(deadLetterId) {}

  /**
   * Retry all unresolved dead letters matching an optional type filter.
   * @param {string} [typeFilter]   - Only retry this event type
   * @returns {number} retried count
   */
  retryAll(typeFilter) {}

  /**
   * Mark a dead letter as resolved (acknowledged, won't re-surface).
   * @param {string} deadLetterId
   */
  resolve(deadLetterId) {}

  /**
   * Register a handler for a specific failure reason.
   * Called automatically by the EventBus on every DLQ push.
   *
   * @param {'unhandled'|'handler-error'|'*'} reason
   * @param {function(DeadLetter): void}       handler
   * @returns {function} unregister
   */
  onDead(reason, handler) {}

  /**
   * Query dead letters.
   * @param {Object} [filter]
   * @param {string} [filter.reason]
   * @param {string} [filter.type]        - Event type
   * @param {boolean} [filter.resolved]   - Include/exclude resolved (default: false = only unresolved)
   * @returns {DeadLetter[]}
   */
  query(filter = {}) {}

  /**
   * Total count of unresolved dead letters.
   * @returns {number}
   */
  size() {}

  /**
   * Clear all dead letters.
   */
  clear() {}
}
```

---

## 5.12 — Event Transformer Pipeline

### Responsibility
A composable pipeline of transform functions that runs on every envelope before it is delivered to subscribers. Used to enrich payloads (add timestamps, user context), redact sensitive fields, or reshape data for compatibility.

```js
/**
 * @callback TransformerFn
 * @param {EventEnvelope}    envelope   - Current envelope (treat as immutable; return new one)
 * @param {EventDefinition}  definition - Registry definition for this event type
 * @returns {EventEnvelope | Promise<EventEnvelope>}
 * Return the (possibly modified) envelope. Return null to suppress the event entirely.
 */

/**
 * @typedef {Object} TransformerRegistration
 * @property {string}        id
 * @property {string|RegExp} [pattern]    - Only apply to matching types. Default: apply to all.
 * @property {number}        [priority]   - Execution order (lower = first, default: 100)
 * @property {TransformerFn} fn
 */
```

```js
class TransformerPipeline {
  /** @type {TransformerRegistration[]} */
  #transformers = [];

  /**
   * Register a transformer.
   * @param {TransformerRegistration} registration
   * @returns {function} unregister
   */
  add(registration) {}

  /**
   * Remove a transformer by id.
   * @param {string} id
   */
  remove(id) {}

  /**
   * Run the pipeline for an envelope.
   * Returns null if any transformer returns null (event suppressed).
   *
   * @param {EventEnvelope}   envelope
   * @param {EventDefinition} definition
   * @returns {Promise<EventEnvelope|null>}
   */
  run(envelope, definition) {}
}
```

### Built-in Transformer Examples

```js
// ── Enrich: add userId from auth state ────────────────────────────────
pipeline.add({
  id:       'enrich-user-context',
  priority: 10,
  fn: (envelope) => ({
    ...envelope,
    meta: {
      ...envelope.meta,
      userId: authStore.getCurrentUserId(),
    },
  }),
});

// ── Redact: strip sensitive fields from logged events ─────────────────
pipeline.add({
  id:       'redact-sensitive',
  priority: 20,
  fn: (envelope, definition) => {
    if (!definition?.sensitive) return envelope;
    return {
      ...envelope,
      payload:         '[REDACTED]',
      originalPayload: envelope.payload,   // kept for delivery, not for logging
    };
  },
});

// ── Suppress: block events during maintenance mode ────────────────────
pipeline.add({
  id:       'maintenance-suppressor',
  priority: 1,
  fn: (envelope) => {
    if (featureFlags.isEnabled('maintenance-mode')) {
      Logger.warn(`Event suppressed during maintenance: ${envelope.type}`);
      return null;   // null = suppress
    }
    return envelope;
  },
});

// ── Schema version: tag envelope with app version ─────────────────────
pipeline.add({
  id:       'version-tag',
  priority: 50,
  fn: (envelope) => ({
    ...envelope,
    meta: { ...envelope.meta, appVersion: APP_VERSION },
  }),
});
```

---

## 5.13 — Custom DOM Event Bridge

### Responsibility
Bidirectional bridge between the browser's native DOM event system and the internal Event Bus. Allows legacy DOM code, Web Components, and third-party libraries to participate in the event-driven architecture without directly importing the Event Bus.

```js
/**
 * @typedef {Object} DOMInboundRule
 * Captures a native DOM event and forwards it to the Event Bus.
 *
 * @property {string}         domEvent        - Native event name e.g. 'click', 'submit'
 * @property {string|Element|Window} [target] - CSS selector, Element, or Window (default: document)
 * @property {string}         busType         - Event Bus type to emit e.g. 'ui:button:clicked'
 * @property {function(Event): *} [transform] - Extract payload from DOM Event
 * @property {boolean}        [capture]       - Use capture phase (default: false)
 * @property {boolean}        [passive]       - Passive listener (default: false)
 * @property {boolean}        [once]          - Only capture once
 */

/**
 * @typedef {Object} DOMOutboundRule
 * Listens to the Event Bus and dispatches a native CustomEvent to the DOM.
 *
 * @property {string}         busPattern      - Event Bus pattern to subscribe to
 * @property {string}         domEvent        - CustomEvent name to dispatch
 * @property {string|Element|Window} [target] - Where to dispatch (default: document)
 * @property {function(EventEnvelope): *} [detail] - Build CustomEvent.detail from envelope
 * @property {boolean}        [bubbles]       - Default: true
 * @property {boolean}        [composed]      - Cross shadow DOM (default: true)
 */
```

```js
class DOMEventBridge {
  /** @type {DOMInboundRule[]} */
  #inbound = [];

  /** @type {DOMOutboundRule[]} */
  #outbound = [];

  /** @type {Array<{ target: EventTarget, type: string, fn: function, options: * }>} */
  #listeners = [];

  /** @type {EventBus} */
  #bus = null;

  /** @param {EventBus} bus */
  constructor(bus) { this.#bus = bus; }

  /**
   * Register an inbound rule (DOM → Bus).
   * Attaches a DOM event listener immediately.
   *
   * @param {DOMInboundRule} rule
   * @returns {function} unregister — removes the DOM listener
   */
  inbound(rule) {}

  /**
   * Register an outbound rule (Bus → DOM).
   * Subscribes to Event Bus immediately.
   *
   * @param {DOMOutboundRule} rule
   * @returns {function} unregister
   */
  outbound(rule) {}

  /**
   * Remove all registered inbound and outbound rules.
   */
  clear() {}

  /**
   * Resolve a target descriptor to an actual EventTarget.
   * @param {string|Element|Window} target
   * @returns {EventTarget}
   */
  #resolveTarget(target) {
    if (!target || target === 'document') return document;
    if (target === 'window') return window;
    if (typeof target === 'string') return document.querySelector(target);
    return target;
  }
}
```

### DOM Bridge Usage Examples

```js
const bridge = eventBus.dom;

// ── Inbound: capture form submit → emit to bus ─────────────────────────
bridge.inbound({
  domEvent:  'submit',
  target:    '#checkout-form',
  busType:   'checkout:form:submitted',
  capture:   false,
  transform: (e) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.target));
  },
});

// ── Inbound: capture all button clicks in a region ────────────────────
bridge.inbound({
  domEvent:  'click',
  target:    '#main-nav',
  busType:   'ui:nav:clicked',
  transform: (e) => ({
    label:   e.target.dataset.navLabel,
    href:    e.target.href,
  }),
});

// ── Outbound: dispatch CustomEvent when cart updates ──────────────────
bridge.outbound({
  busPattern: 'cart:item:added',
  domEvent:   'cart-updated',
  target:     document,
  bubbles:    true,
  composed:   true,
  detail:     (envelope) => ({ itemCount: envelope.payload.quantity }),
});

// ── Outbound: Web Component receives bus events via DOM ───────────────
bridge.outbound({
  busPattern: 'auth:user:loaded',
  domEvent:   'user-loaded',
  target:     document.querySelector('user-profile-component'),
  detail:     (envelope) => envelope.payload,
});
```

---

## Wiring: Full Bootstrap Sequence

```js
// events/index.js — assembled at boot by DI Container

import EventBus             from './EventBus.js';
import NamespaceManager     from './NamespaceManager.js';
import EventRegistry        from './EventRegistry.js';
import EventEmitter         from './EventEmitter.js';
import SubscriberManager    from './SubscriberManager.js';
import EventPriorityQueue   from './EventPriorityQueue.js';
import ReplayBuffer         from './ReplayBuffer.js';
import CrossTabSync         from './CrossTabSync.js';
import EventLogger          from './EventLogger.js';
import DeadLetterQueue      from './DeadLetterQueue.js';
import TransformerPipeline  from './TransformerPipeline.js';
import DOMEventBridge       from './DOMEventBridge.js';

// ── 1. Build DLQ first (others depend on it) ───────────────────────────
const dlq = new DeadLetterQueue();

// Log DLQ entries to console in development
if (process.env.NODE_ENV !== 'production') {
  dlq.onDead('*', (letter) => {
    console.warn(`[DLQ] ${letter.reason} — ${letter.envelope.type}`, letter);
  });
}

// ── 2. Build subsystems ────────────────────────────────────────────────
const registry   = new EventRegistry();
const subscribers= new SubscriberManager();
const emitter    = new EventEmitter(dlq);
const priorityQ  = new EventPriorityQueue();
const replay     = new ReplayBuffer({ perTypeMaxSize: 5, ttl: 5 * 60_000 });
const logger     = new EventLogger({
  maxSize:   2_000,
  auditAll:  false,
  transport: process.env.NODE_ENV === 'production'
    ? (entry) => remoteLogger.ship(entry)
    : null,
});
const transformer = new TransformerPipeline();
const crossTab    = new CrossTabSync(
  { channelName: 'app:events', echoOwn: false },
  (envelope) => eventBus.emit(envelope.type, envelope.payload, {
    skipTransform: true,
    skipValidation: true,
    source: `crossTab:${envelope.meta.source}`,
  })
);

// ── 3. Register all event definitions ──────────────────────────────────
registry.registerBatch([
  ...cartEventDefinitions,
  ...authEventDefinitions,
  ...httpEventDefinitions,
  ...storeEventDefinitions,
  ...routerEventDefinitions,
  ...storageEventDefinitions,
]);

// ── 4. Register built-in transformers ──────────────────────────────────
transformer.add({ id: 'enrich-user',   priority: 10, fn: enrichUserTransformer });
transformer.add({ id: 'redact-sensitive', priority: 20, fn: redactTransformer });
transformer.add({ id: 'version-tag',   priority: 50, fn: versionTagTransformer });

// ── 5. Assemble the bus ────────────────────────────────────────────────
const eventBus = new EventBus({
  strict:          process.env.NODE_ENV === 'production',
  warnUnregistered: true,
  crossTab:        true,
  domBridge:       true,
  replayBufferSize: 500,
});

// ── 6. Wire up DOM bridge ──────────────────────────────────────────────
eventBus.dom.inbound({
  domEvent: 'visibilitychange',
  target:   'document',
  busType:  'app:visibility:changed',
  transform: () => ({ hidden: document.hidden }),
});

// ── 7. DLQ → alert monitoring in production ────────────────────────────
if (process.env.NODE_ENV === 'production') {
  dlq.onDead('handler-error', (letter) => {
    ErrorReporter.capture(letter.error, {
      context: 'event-bus',
      event:   letter.envelope.type,
    });
  });
}

// ── 8. Sweep replay buffer periodically ────────────────────────────────
setInterval(() => replay.evictExpired(), 60_000);

export { eventBus };
```

---

## Event Catalogue: System Events

All system events use the `@@` prefix and are emitted by the bus itself.

```js
registry.registerBatch([
  { type: '@@bus:ready',                  audited: false },
  { type: '@@bus:subscriber:added',       audited: false },
  { type: '@@bus:subscriber:removed',     audited: false },
  { type: '@@bus:event:unhandled',        audited: true  },
  { type: '@@bus:event:suppressed',       audited: true  },
  { type: '@@bus:dlq:push',              audited: true  },
  { type: '@@bus:dlq:retry',             audited: true  },
  { type: '@@bus:crosstab:received',      audited: false },
  { type: '@@bus:crosstab:broadcast',     audited: false },
]);
```

---

## Complete Public API Cheat Sheet

```js
// ── Emitting ──────────────────────────────────────────────────────────
eventBus.emit('cart:item:added', { productId: 'sku-1', quantity: 2 });
eventBus.emit('cart:item:added', payload, { source: 'CartService', broadcast: true });
await eventBus.emitAsync('checkout:form:submitted', formData);

// ── Subscribing ───────────────────────────────────────────────────────
const sub = eventBus.on('cart:item:added', handler);
const sub = eventBus.on('cart:*', handler, { priority: 2, scope: 'MyWidget' });
const sub = eventBus.on('cart:**', handler, { filter: e => e.payload.quantity > 1 });
const sub = eventBus.on('*.error', handler, { async: true, timeout: 3000 });
sub.unsubscribe();

// ── One-shot ──────────────────────────────────────────────────────────
const envelope = await eventBus.once('auth:user:loaded');
eventBus.on('cart:cleared', handler, { once: true });

// ── With replay ───────────────────────────────────────────────────────
eventBus.onWithReplay('auth:user:loaded', handler);

// ── Scope cleanup ─────────────────────────────────────────────────────
eventBus.on('cart:item:added', handler, { scope: 'my-component' });
eventBus.offScope('my-component');

// ── AbortSignal ───────────────────────────────────────────────────────
const ctrl = new AbortController();
eventBus.on('cart:item:added', handler, { signal: ctrl.signal });
ctrl.abort();   // auto-unsubscribes

// ── Registry ──────────────────────────────────────────────────────────
eventBus.registry.register({ type: 'my:event', validate: (p) => ({ valid: !!p.id }) });
eventBus.registry.has('cart:item:added');     // true
eventBus.registry.validate('cart:item:added', payload);

// ── Replay buffer ─────────────────────────────────────────────────────
eventBus.replay.get('auth:user:loaded');      // last emission
eventBus.replay.clear('cart:item:added');

// ── Dead letter queue ─────────────────────────────────────────────────
eventBus.deadLetters.query({ reason: 'handler-error' });
eventBus.deadLetters.retry('dead-letter-id');
eventBus.deadLetters.retryAll('cart:item:added');
eventBus.deadLetters.onDead('unhandled', handler);

// ── Audit log ─────────────────────────────────────────────────────────
eventBus.auditLog.query({ type: 'cart:*', limit: 50 });
eventBus.auditLog.getCorrelatedChain('correlation-uuid');
eventBus.auditLog.export();

// ── DOM bridge ───────────────────────────────────────────────────────
eventBus.dom.inbound({ domEvent: 'click', target: '#btn', busType: 'ui:btn:clicked' });
eventBus.dom.outbound({ busPattern: 'cart:**', domEvent: 'cart-changed', target: document });

// ── Transformers ──────────────────────────────────────────────────────
eventBus.transformers.add({ id: 'my-transform', fn: (env) => env });
eventBus.transformers.remove('my-transform');
```

---