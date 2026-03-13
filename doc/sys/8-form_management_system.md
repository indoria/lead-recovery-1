# Module 8 — 📋 Form Management System

> **Core Principle:** Forms are state machines. Every field, every validation rule, every submission attempt is a predictable state transition. No form logic lives in components — it lives here, tested independently, reusable across the entire application.

---

## Architecture Overview

```
User Interaction (keypress, blur, submit)
        │
        ▼
┌────────────────────────────────────────────────────────┐
│                   Form Controller                       │
│   Owns: values, errors, touched, dirty, status         │
└──────────────┬─────────────────────────────────────────┘
               │
    ┌──────────┼───────────────────────┐
    ▼          ▼                       ▼
Field Mask  Validation Engine      Form Diff Engine
Manager    (sync + async)          (initial vs current)
    │          │                       │
    │    Validation Schema         "unsaved changes"
    │    Registry                  warning
    │
    ▼
Form Serializer / Deserializer
    │
    ├──── API Payload (submit)
    └──── Storage (auto-save)
               │
               ▼
        Auto-Save Manager
        (debounced, draft recovery)

Multi-Step Form Orchestrator
    ├── Step Registry
    ├── Validation Gates
    └── Step Navigation

File Upload Manager
    ├── Chunked Upload
    ├── Progress Tracker
    ├── Retry Logic
    └── Drag-and-Drop Zone
```

---

## 8.0 — Core Types & Interfaces

```js
/**
 * @typedef {Object} FieldState
 * The complete state of a single form field.
 *
 * @property {*}        value         - Current field value
 * @property {*}        initialValue  - Value at form initialization
 * @property {boolean}  touched       - True after the field has been blurred
 * @property {boolean}  dirty         - True if value !== initialValue
 * @property {boolean}  valid         - True if no validation errors
 * @property {boolean}  validating    - True during async validation
 * @property {string[]} errors        - Current validation error messages
 * @property {string[]} warnings      - Non-blocking validation messages
 * @property {boolean}  disabled
 * @property {boolean}  required
 * @property {Object}   [meta]        - Arbitrary field metadata
 */

/**
 * @typedef {Object} FormState
 * The complete state of an entire form.
 *
 * @property {Object.<string, FieldState>} fields  - keyed by field name
 * @property {Object.<string, *>}          values  - flat map of name → value
 * @property {Object.<string, string[]>}   errors  - flat map of name → errors[]
 * @property {boolean}  valid          - All fields valid AND no form-level errors
 * @property {boolean}  invalid        - Inverse of valid
 * @property {boolean}  dirty          - Any field is dirty
 * @property {boolean}  pristine       - No fields are dirty
 * @property {boolean}  touched        - Any field has been touched
 * @property {boolean}  untouched      - No fields touched yet
 * @property {boolean}  submitting     - Form is in submission flight
 * @property {boolean}  submitted      - Form has been submitted at least once
 * @property {boolean}  submitFailed   - Last submission resulted in an error
 * @property {string[]} formErrors     - Form-level (cross-field) errors
 * @property {number}   submitCount    - Total submission attempts
 */

/**
 * @typedef {Object} FormConfig
 * @property {Object}    initialValues           - Field name → initial value map
 * @property {ValidationSchema} [validationSchema]
 * @property {function(values: Object): Promise<void>|void} [onSubmit]
 * @property {function(values: Object, errors: Object): void} [onSubmitFail]
 * @property {boolean}   [validateOnChange]   - Validate field on every keystroke (default: false)
 * @property {boolean}   [validateOnBlur]     - Validate field on blur (default: true)
 * @property {boolean}   [validateOnMount]    - Validate all fields on init (default: false)
 * @property {boolean}   [reValidateOnChange] - Re-validate touched fields on change (default: true)
 * @property {AutoSaveConfig} [autoSave]      - Enable auto-save for this form
 * @property {string}    [formId]             - Stable ID for storage/draft recovery
 */

/**
 * @typedef {'idle'|'validating'|'submitting'|'success'|'error'} FormStatus
 */
```

---

## 8.1 — Form Controller

### Responsibility
The central state machine for a single form instance. Owns all field state, drives validation, handles submission, and notifies subscribers of changes. Every form in the application is a `FormController` instance.

```js
class FormController {
  /** @type {FormState} */
  #state = null;

  /** @type {FormConfig} */
  #config = null;

  /** @type {ValidationEngine} */
  #validator = null;

  /** @type {FormDiffEngine} */
  #diffEngine = null;

  /** @type {AutoSaveManager|null} */
  #autoSave = null;

  /** @type {Map<string, Set<function>>} - field name → change listeners */
  #fieldSubscribers = new Map();

  /** @type {Set<function>} - form-level state change listeners */
  #formSubscribers = new Set();

  /** @type {Map<string, FieldMask>} - field name → mask */
  #masks = new Map();

  /** @type {AbortController|null} - cancels in-flight async validation */
  #validationAbort = null;

  /**
   * @param {FormConfig}        config
   * @param {ValidationEngine}  validator
   * @param {FormDiffEngine}    diffEngine
   * @param {AutoSaveManager}   [autoSave]
   */
  constructor(config, validator, diffEngine, autoSave = null) {}

  // ── Initialization ──────────────────────────────────────────────────────

  /**
   * Initialize the form. Builds initial FieldState for every key
   * in config.initialValues. Loads any persisted draft if autoSave is configured.
   * @returns {Promise<void>}
   */
  async init() {}

  /**
   * Reset the form to its initial values.
   * Clears all touched/dirty/error state.
   * @param {Object} [newInitialValues]  - Override initial values on reset
   */
  reset(newInitialValues = null) {}

  // ── Field interactions ──────────────────────────────────────────────────

  /**
   * Set a field's value. The primary write operation.
   * Triggers: dirty check, conditional validation, auto-save debounce.
   *
   * @param {string} name
   * @param {*}      value
   */
  setValue(name, value) {}

  /**
   * Set multiple field values at once (batch update).
   * Triggers a single re-validation pass and one subscriber notification.
   * @param {Object} values  - { fieldName: value, ... }
   */
  setValues(values) {}

  /**
   * Mark a field as touched (called on blur).
   * Triggers validation if validateOnBlur is true.
   * @param {string} name
   */
  setTouched(name) {}

  /**
   * Manually set a field's error (e.g. from server validation response).
   * @param {string}   name
   * @param {string[]} errors
   */
  setFieldErrors(name, errors) {}

  /**
   * Set form-level errors (cross-field or server errors).
   * @param {string[]} errors
   */
  setFormErrors(errors) {}

  /**
   * Clear all errors (or just a specific field's errors).
   * @param {string} [fieldName]
   */
  clearErrors(fieldName = null) {}

  /**
   * Enable or disable a field.
   * @param {string}  name
   * @param {boolean} disabled
   */
  setDisabled(name, disabled) {}

  // ── Validation ──────────────────────────────────────────────────────────

  /**
   * Validate a single field immediately.
   * @param {string} name
   * @returns {Promise<string[]>} errors
   */
  async validateField(name) {}

  /**
   * Validate all fields.
   * @returns {Promise<boolean>} true if form is valid
   */
  async validateAll() {}

  // ── Submission ──────────────────────────────────────────────────────────

  /**
   * Handle form submission.
   * Flow: validate all → serialize → call config.onSubmit → handle result.
   *
   * @param {Event} [event]  - Native submit event; calls preventDefault() if provided
   * @returns {Promise<void>}
   */
  async submit(event = null) {}

  // ── State access ────────────────────────────────────────────────────────

  /**
   * Get current form state snapshot.
   * @returns {FormState}
   */
  getState() {}

  /**
   * Get a specific field's state.
   * @param {string} name
   * @returns {FieldState|null}
   */
  getField(name) {}

  /**
   * Get the current value of a field.
   * @param {string} name
   * @returns {*}
   */
  getValue(name) {}

  /**
   * Get all current values as a flat object.
   * @returns {Object}
   */
  getValues() {}

  /**
   * Returns true if the form has any unsaved changes.
   * Delegates to FormDiffEngine.
   * @returns {boolean}
   */
  isDirty() {}

  /**
   * Register a mask for a field.
   * @param {string}    fieldName
   * @param {FieldMask} mask
   */
  registerMask(fieldName, mask) {}

  // ── Subscriptions ───────────────────────────────────────────────────────

  /**
   * Subscribe to all form state changes.
   * @param {function(FormState): void} handler
   * @returns {function} unsubscribe
   */
  subscribe(handler) {}

  /**
   * Subscribe to a specific field's state changes only.
   * Avoids re-renders of components that only care about one field.
   *
   * @param {string}                    fieldName
   * @param {function(FieldState): void} handler
   * @returns {function} unsubscribe
   */
  subscribeField(fieldName, handler) {}

  /**
   * Tear down: cancel validation, flush auto-save, remove all subscribers.
   */
  destroy() {}

  // ── Internal ───────────────────────────────────────────────────────────

  /**
   * Derive top-level FormState booleans from individual FieldStates.
   * Called after any mutation.
   */
  #deriveFormState() {}

  /**
   * Notify subscribers. Only notifies field subscribers if that
   * field actually changed (by value reference).
   * @param {string[]} [changedFields]
   */
  #notify(changedFields = []) {}

  /**
   * Apply a mask to a value and return the masked string.
   * @param {string} fieldName
   * @param {*}      rawValue
   * @returns {*}
   */
  #applyMask(fieldName, rawValue) {}
}
```

### Form State Machine

```
                  init()
                    │
                    ▼
               ┌─────────┐
               │  idle   │◄──────────────────────┐
               └────┬────┘                       │
                    │ setValue / setTouched       │ reset()
                    ▼                             │
             ┌────────────┐                      │
             │  editing   │──── submit() ────────┤
             └─────┬──────┘                      │
                   │                             │
            validate all                        │
                   │                             │
        ┌──────────┴──────────┐                 │
        │ invalid             │ valid            │
        ▼                     ▼                  │
   ┌─────────┐        ┌─────────────┐            │
   │ invalid │        │ submitting  │            │
   └─────────┘        └──────┬──────┘            │
   (submitFailed)            │                   │
                    ┌────────┴────────┐          │
                 error             success        │
                    │                 │           │
                    ▼                 ▼           │
              ┌─────────┐      ┌─────────┐       │
              │  error  │      │ success │───────┘
              └─────────┘      └─────────┘
```

---

## 8.2 — Validation Engine

### Responsibility
Runs per-field and cross-field validation rules. Supports synchronous rules (fast, inline) and asynchronous rules (API checks like "is email taken?"). Composes multiple rules per field. Cross-field rules receive the full values object.

```js
/**
 * @typedef {Object} ValidationRule
 * @property {string}   name         - Rule identifier e.g. 'required', 'minLength'
 * @property {function(value: *, values: Object, context: ValidationContext): string | null | Promise<string|null>} validate
 *           Return an error message string on failure, null on success.
 * @property {boolean}  [async]      - Hint that this rule is async (for ordering optimization)
 * @property {number}   [debounce]   - Debounce ms for async rules (default: 300)
 */

/**
 * @typedef {Object} ValidationContext
 * @property {string}  fieldName
 * @property {Object}  allValues      - Full form values
 * @property {Object}  [meta]         - Extra context (e.g. tenantId for uniqueness checks)
 * @property {AbortSignal} signal     - Abort signal for async rules
 */

/**
 * @typedef {Object} FieldValidationResult
 * @property {string}   fieldName
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {boolean}  valid
 */

/**
 * @typedef {Object} FormValidationResult
 * @property {boolean}  valid
 * @property {Object.<string, string[]>} errors   - fieldName → errors[]
 * @property {string[]} formErrors                - Cross-field errors
 */
```

```js
class ValidationEngine {
  /** @type {ValidationSchemaRegistry} */
  #registry = null;

  /**
   * @param {ValidationSchemaRegistry} registry
   */
  constructor(registry) {}

  /**
   * Validate a single field value against a set of rules.
   * Runs sync rules first (fast fail), then async rules in parallel.
   * Aborts in-flight async rules if called again before they settle.
   *
   * @param {string}           fieldName
   * @param {*}                value
   * @param {ValidationRule[]} rules
   * @param {Object}           allValues   - Full form values for cross-field access
   * @param {Object}           [meta]
   * @param {AbortSignal}      [signal]
   * @returns {Promise<FieldValidationResult>}
   */
  async validateField(fieldName, value, rules, allValues, meta = {}, signal = null) {}

  /**
   * Validate the entire form at once.
   * Runs all field validations in parallel, then cross-field rules.
   *
   * @param {Object}           values       - Full form values
   * @param {ValidationSchema} schema       - Compiled schema from registry
   * @param {Object}           [meta]
   * @param {AbortSignal}      [signal]
   * @returns {Promise<FormValidationResult>}
   */
  async validateForm(values, schema, meta = {}, signal = null) {}

  /**
   * Run cross-field (form-level) validation rules.
   * These receive the full values object and return form-level error strings.
   *
   * @param {Object}           values
   * @param {CrossFieldRule[]} rules
   * @param {AbortSignal}      [signal]
   * @returns {Promise<string[]>}   form-level errors
   */
  async validateCrossField(values, rules, signal = null) {}
}

/**
 * @typedef {Object} CrossFieldRule
 * @property {string} name
 * @property {function(values: Object): string | null | Promise<string|null>} validate
 */
```

### Validation Execution Flow

```
validateField('email', 'bad@', rules, allValues)
        │
        ├── Separate rules into sync[] and async[]
        │
        ├── Run sync rules in order (FAST FAIL on first error):
        │     required('bad@')   → null (passes)
        │     email('bad@')      → 'Must be a valid email' ← STOP
        │
        │   If sync rules pass:
        │
        └── Run async rules in parallel (after debounce):
              emailTaken('user@example.com')  → null (passes)
              domainAllowed('user@corp.com')  → null (passes)

              → { fieldName: 'email', errors: [], valid: true }
```

---

## 8.3 — Validation Schema Registry

### Responsibility
A catalog of named, reusable validation rules and composed schemas. Rules are defined once and referenced by name everywhere. Prevents duplication across forms.

```js
/**
 * @typedef {Object} ValidationSchema
 * Fields map to arrays of ValidationRule OR named rule references.
 *
 * @property {Object.<string, (ValidationRule | string)[]>} fields
 *           Field name → array of rules or rule names from registry
 * @property {CrossFieldRule[]} [crossField]
 *           Form-level rules that receive all values
 */
```

```js
class ValidationSchemaRegistry {
  /** @type {Map<string, ValidationRule>} */
  #rules = new Map();

  /** @type {Map<string, ValidationSchema>} */
  #schemas = new Map();

  /**
   * Register a reusable named rule.
   * @param {string}         name
   * @param {ValidationRule} rule
   */
  registerRule(name, rule) {}

  /**
   * Register a factory that creates a rule with parameters.
   * @param {string}   name
   * @param {function(...args): ValidationRule} factory
   *
   * @example
   * registry.registerRuleFactory('minLength', (min) => ({
   *   name: `minLength(${min})`,
   *   validate: (v) => v?.length >= min ? null : `Minimum ${min} characters`,
   * }));
   * // Usage in schema: 'minLength(8)'
   */
  registerRuleFactory(name, factory) {}

  /**
   * Register a named schema (reusable form structure).
   * @param {string}           name
   * @param {ValidationSchema} schema
   */
  registerSchema(name, schema) {}

  /**
   * Get a registered rule by name. Handles parameterized rules.
   * e.g. 'minLength(8)' → calls minLength factory with arg 8
   *
   * @param {string} nameOrCall   - e.g. 'required', 'minLength(8)', 'matches(/^[A-Z]/)'
   * @returns {ValidationRule}
   */
  getRule(nameOrCall) {}

  /**
   * Get a registered schema.
   * @param {string} name
   * @returns {ValidationSchema}
   */
  getSchema(name) {}

  /**
   * Compile a schema — resolves all string rule references to
   * actual ValidationRule objects. Returns a fully-resolved schema.
   *
   * @param {ValidationSchema | string} schemaOrName
   * @returns {ResolvedSchema}
   */
  compile(schemaOrName) {}
}

/**
 * @typedef {Object} ResolvedSchema
 * @property {Object.<string, ValidationRule[]>} fields
 * @property {CrossFieldRule[]} crossField
 */
```

### Built-in Rules Catalogue

```js
const registry = new ValidationSchemaRegistry();

// ── Primitives ─────────────────────────────────────────────────────────

registry.registerRule('required', {
  name:     'required',
  validate: (v) => (v !== null && v !== undefined && v !== '') ? null : 'This field is required',
});

registry.registerRule('email', {
  name:     'email',
  validate: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    ? null : 'Must be a valid email address',
});

registry.registerRule('url', {
  name:     'url',
  validate: (v) => {
    if (!v) return null;
    try { new URL(v); return null; }
    catch { return 'Must be a valid URL'; }
  },
});

// ── Factories ──────────────────────────────────────────────────────────

registry.registerRuleFactory('minLength', (min) => ({
  name:     `minLength(${min})`,
  validate: (v) => (!v || v.length >= min) ? null : `Must be at least ${min} characters`,
}));

registry.registerRuleFactory('maxLength', (max) => ({
  name:     `maxLength(${max})`,
  validate: (v) => (!v || v.length <= max) ? null : `Must be at most ${max} characters`,
}));

registry.registerRuleFactory('min', (n) => ({
  name:     `min(${n})`,
  validate: (v) => (v === '' || v === null || Number(v) >= n) ? null : `Must be at least ${n}`,
}));

registry.registerRuleFactory('max', (n) => ({
  name:     `max(${n})`,
  validate: (v) => (v === '' || v === null || Number(v) <= n) ? null : `Must be at most ${n}`,
}));

registry.registerRuleFactory('matches', (pattern, message) => ({
  name:     'matches',
  validate: (v) => (!v || pattern.test(v)) ? null : (message ?? 'Invalid format'),
}));

registry.registerRuleFactory('oneOf', (...allowed) => ({
  name:     'oneOf',
  validate: (v) => allowed.includes(v) ? null : `Must be one of: ${allowed.join(', ')}`,
}));

// ── Composed schemas ───────────────────────────────────────────────────

registry.registerSchema('passwordStrong', {
  fields: {
    password: [
      'required',
      'minLength(8)',
      { name: 'uppercase',  validate: (v) => /[A-Z]/.test(v) ? null : 'Must contain uppercase letter' },
      { name: 'lowercase',  validate: (v) => /[a-z]/.test(v) ? null : 'Must contain lowercase letter' },
      { name: 'number',     validate: (v) => /\d/.test(v)     ? null : 'Must contain a number'        },
      { name: 'special',    validate: (v) => /[^A-Za-z0-9]/.test(v) ? null : 'Must contain special character' },
    ],
  },
});

registry.registerSchema('addressUS', {
  fields: {
    street:  ['required'],
    city:    ['required'],
    state:   ['required', 'minLength(2)', 'maxLength(2)'],
    zip:     ['required', 'matches(/^\\d{5}(-\\d{4})?$/, "Invalid ZIP code")'],
    country: ['required'],
  },
});

// ── Async rules ────────────────────────────────────────────────────────

registry.registerRule('emailUnique', {
  name:    'emailUnique',
  async:   true,
  debounce: 500,
  validate: async (v, _, { signal }) => {
    if (!v) return null;
    const res = await httpClient.get('/api/users/check-email', {
      params: { email: v }, signal,
    });
    return res.data.available ? null : 'This email is already registered';
  },
});

// ── Cross-field rules ──────────────────────────────────────────────────

registry.registerSchema('passwordConfirm', {
  fields: {
    password:        ['required', 'minLength(8)'],
    confirmPassword: ['required'],
  },
  crossField: [
    {
      name: 'passwordsMatch',
      validate: ({ password, confirmPassword }) =>
        password === confirmPassword ? null : 'Passwords do not match',
    },
  ],
});
```

---

## 8.4 — Field Mask Manager

### Responsibility
Applies input masks to raw values as the user types. Masks format the displayed string while preserving the clean underlying value separately. Supports static masks (phone numbers, dates), dynamic masks (credit cards that change format by card type), and custom masks.

```js
/**
 * @typedef {Object} MaskResult
 * @property {string}  masked       - The display string (e.g. '(555) 123-4567')
 * @property {string}  raw          - The clean value (e.g. '5551234567')
 * @property {number}  cursorPos    - Correct cursor position after masking
 */

/**
 * @interface FieldMask
 * All masks implement this interface.
 */
class FieldMask {
  /**
   * Apply the mask to a raw input value.
   * @param {string}  value       - Current input value (may be partially masked already)
   * @param {number}  [cursorPos] - Current cursor position
   * @returns {MaskResult}
   */
  apply(value, cursorPos) { throw new Error('Not implemented'); }

  /**
   * Strip mask characters and return the clean underlying value.
   * @param {string} maskedValue
   * @returns {string}
   */
  strip(maskedValue) { throw new Error('Not implemented'); }

  /**
   * Validate that a value (raw or masked) conforms to the mask's
   * expected length/format. Used for completeness checking.
   * @param {string} value
   * @returns {boolean}
   */
  isComplete(value) { return true; }
}
```

### Built-in Mask Implementations

```js
/**
 * Pattern-based mask using '#' (digit), 'A' (letter), '*' (alphanumeric), 'X' (any).
 * Static literal characters are preserved as-is.
 *
 * @example new PatternMask('(###) ###-####') → US phone
 * @example new PatternMask('##/##/####')     → date MM/DD/YYYY
 * @example new PatternMask('AAA-###')        → plate format
 */
class PatternMask extends FieldMask {
  /** @type {string} */
  #pattern = '';

  /** @type {RegExp[]} - Compiled per-char validators */
  #charValidators = [];

  /** @param {string} pattern */
  constructor(pattern) {
    super();
    this.#pattern  = pattern;
    this.#charValidators = [...pattern].map(char => ({
      '#': /\d/,
      'A': /[a-zA-Z]/,
      '*': /[a-zA-Z0-9]/,
      'X': /./,
    }[char] ?? null));  // null = literal character
  }

  /** @returns {MaskResult} */
  apply(value, cursorPos = value.length) {}

  /** @returns {string} */
  strip(maskedValue) {
    return [...maskedValue]
      .filter((ch, i) => this.#charValidators[i] !== null)
      .join('');
  }

  /** @returns {boolean} */
  isComplete(value) {
    const stripped = this.strip(value);
    const required = this.#charValidators.filter(v => v !== null).length;
    return stripped.length === required;
  }
}

/**
 * Credit card mask. Detects card network from prefix and applies
 * appropriate grouping (Amex: 4-6-5, others: 4-4-4-4).
 */
class CreditCardMask extends FieldMask {
  /** @type {'visa'|'mastercard'|'amex'|'discover'|'unknown'} */
  #detectedNetwork = 'unknown';

  apply(value, cursorPos = value.length) {}
  strip(maskedValue)  { return maskedValue.replace(/\s/g, ''); }
  isComplete(value)   { return this.strip(value).length >= 15; }

  /** @returns {string} */
  get detectedNetwork() { return this.#detectedNetwork; }
}

/**
 * Currency mask. Formats as localized currency as user types.
 * @example new CurrencyMask({ locale: 'en-US', currency: 'USD' })
 */
class CurrencyMask extends FieldMask {
  /** @type {{ locale: string, currency: string, allowNegative: boolean }} */
  #options = {};

  constructor(options = {}) {
    super();
    this.#options = { locale: 'en-US', currency: 'USD', allowNegative: false, ...options };
  }

  apply(value, cursorPos = value.length) {}

  strip(maskedValue) {
    return maskedValue.replace(/[^0-9.-]/g, '');
  }
}

/**
 * Date mask with locale-aware separator and order.
 * @example new DateMask({ format: 'MM/DD/YYYY' })
 */
class DateMask extends FieldMask {
  #format = 'MM/DD/YYYY';

  constructor(options = {}) {
    super();
    this.#format = options.format ?? 'MM/DD/YYYY';
  }

  apply(value, cursorPos = value.length) {}
  strip(maskedValue) { return maskedValue.replace(/\D/g, ''); }
  isComplete(value)  { return this.strip(value).length === 8; }
}

/**
 * Numeric mask. Restricts input to numbers with optional decimal places.
 */
class NumericMask extends FieldMask {
  #options = { decimals: 0, min: null, max: null };

  constructor(options = {}) {
    super();
    this.#options = { ...this.#options, ...options };
  }

  apply(value) {}
  strip(maskedValue) { return maskedValue.replace(/[^0-9.]/g, ''); }
}
```

### Field Mask Manager

```js
class FieldMaskManager {
  /** @type {Map<string, FieldMask>} */
  #namedMasks = new Map();

  /**
   * Register a named mask for use by string reference.
   * @param {string}    name
   * @param {FieldMask} mask
   */
  register(name, mask) {
    this.#namedMasks.set(name, mask);
  }

  /**
   * Get a registered mask by name.
   * @param {string} name
   * @returns {FieldMask}
   */
  get(name) {}

  /**
   * Apply a mask to an input event.
   * Handles cursor position preservation.
   *
   * @param {InputEvent|string} eventOrValue
   * @param {FieldMask}         mask
   * @returns {MaskResult}
   */
  applyToEvent(eventOrValue, mask) {}

  /**
   * Install a mask on a DOM input element.
   * Attaches input event listener, maintains cursor position.
   * Returns a cleanup function.
   *
   * @param {HTMLInputElement} input
   * @param {FieldMask}        mask
   * @param {function(raw: string): void} onChange  - Called with stripped value
   * @returns {function} cleanup
   */
  install(input, mask, onChange) {}
}
```

---

## 8.5 — Form Serializer / Deserializer

### Responsibility
Converts between the form's internal flat value map and the shape expected by the API (which may be nested, renamed, or typed differently). Decouples form field names from API payload keys.

```js
/**
 * @typedef {Object} SerializerConfig
 * @property {Object.<string, FieldMapping>} fields   - fieldName → mapping
 * @property {function(values: Object): Object} [transform]
 *           Optional global transform applied after field mappings.
 *           Use for adding computed fields, removing nulls, etc.
 * @property {function(apiData: Object): Object} [reverseTransform]
 *           Applied before field mappings on deserialization.
 * @property {boolean} [omitEmpty]     - Remove null/undefined/'' fields (default: false)
 * @property {boolean} [omitUnchanged] - Only include dirty fields (default: false)
 */

/**
 * @typedef {Object} FieldMapping
 * @property {string}   [key]            - API key name (default: same as field name)
 * @property {string}   [path]           - Dot-notation nested path e.g. 'address.city'
 * @property {function(v: *): *} [serialize]    - Transform value for API
 * @property {function(v: *): *} [deserialize]  - Transform API value to form value
 * @property {boolean}  [omit]           - Never include this field in API payload
 * @property {*}        [defaultValue]   - Used during deserialization if field is absent
 */
```

```js
class FormSerializer {
  /** @type {SerializerConfig} */
  #config = null;

  /** @param {SerializerConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /**
   * Convert form values to an API payload object.
   *
   * @param {Object}  values       - Form's current values
   * @param {Object}  [context]    - Extra data available to transform functions
   * @param {Object}  [initialValues]  - Required if omitUnchanged: true
   * @returns {Object}
   */
  serialize(values, context = {}, initialValues = null) {}

  /**
   * Convert an API response object into form field values.
   * Handles nested paths, renames, and type transformations.
   *
   * @param {Object} apiData
   * @param {Object} [context]
   * @returns {Object}   - Flat field-name → value map
   */
  deserialize(apiData, context = {}) {}

  /**
   * Set a value at a dot-notation path in an object.
   * Creates intermediate objects as needed.
   * @param {Object} obj
   * @param {string} path    - e.g. 'address.shipping.city'
   * @param {*}      value
   * @returns {Object}  - New object (immutable)
   */
  static setPath(obj, path, value) {}

  /**
   * Get a value from a dot-notation path.
   * @param {Object} obj
   * @param {string} path
   * @returns {*}
   */
  static getPath(obj, path) {}
}
```

### Serializer Configuration Example

```js
const userProfileSerializer = new FormSerializer({
  omitEmpty: true,
  fields: {
    // Simple rename
    firstName:    { key: 'first_name' },
    lastName:     { key: 'last_name'  },

    // Nested path
    streetAddress: { path: 'address.street' },
    city:          { path: 'address.city'   },
    zipCode:       { path: 'address.postal_code' },

    // Type transformation
    birthDate: {
      key:         'birth_date',
      serialize:   (v) => v ? new Date(v).toISOString().split('T')[0] : null,
      deserialize: (v) => v ? v.substring(0, 10) : '',
    },

    // Computed (serialize only)
    fullName: {
      omit: true,   // Don't send to API; computed on server
    },

    // Boolean ↔ string
    receiveEmails: {
      key:         'email_opt_in',
      serialize:   (v) => v ? '1' : '0',
      deserialize: (v) => v === '1' || v === true,
    },
  },

  // Post-processing: add audit field
  transform: (payload) => ({
    ...payload,
    updated_at: new Date().toISOString(),
  }),
});

// Serialize: form → API
const apiPayload = userProfileSerializer.serialize(formValues);
// { first_name: 'Alice', address: { city: 'NY' }, email_opt_in: '1', updated_at: '...' }

// Deserialize: API → form
const formValues = userProfileSerializer.deserialize(apiResponse);
// { firstName: 'Alice', city: 'NY', receiveEmails: true }
```

---

## 8.6 — Auto-Save Manager

### Responsibility
Watches a form for changes and periodically saves the state to storage. On the next page load, detects a saved draft and offers to restore it. Handles conflicts between multiple open tabs editing the same form.

```js
/**
 * @typedef {Object} AutoSaveConfig
 * @property {string}   storageKey       - Key in storage e.g. 'draft:order-form'
 * @property {number}   [debounceMs]     - Write delay after last change (default: 1000)
 * @property {'localStorage'|'sessionStorage'|'indexedDB'} [adapter]  (default: 'localStorage')
 * @property {string[]} [omitFields]     - Fields to never save (e.g. passwords)
 * @property {boolean}  [promptRestore]  - Ask user before restoring draft (default: true)
 * @property {number}   [draftTTLMs]     - Expire draft after N ms (default: 7 days)
 * @property {boolean}  [saveOnUnload]   - Force-save on beforeunload (default: true)
 */

/**
 * @typedef {Object} DraftRecord
 * @property {string}  formId
 * @property {Object}  values          - Saved form values
 * @property {number}  savedAt         - Unix ms
 * @property {number}  expiresAt
 * @property {string}  [version]       - App version at save time
 */
```

```js
class AutoSaveManager {
  /** @type {AutoSaveConfig} */
  #config = null;

  /** @type {StorageRouter} */
  #storage = null;

  /** @type {ReturnType<typeof setTimeout>|null} */
  #debounceTimer = null;

  /** @type {boolean} */
  #saveInProgress = false;

  /** @type {function} */
  #unsubscribeForm = null;

  /**
   * @param {AutoSaveConfig} config
   * @param {StorageRouter}  storage
   */
  constructor(config, storage) {}

  /**
   * Attach to a FormController.
   * Subscribes to state changes and schedules saves.
   *
   * @param {FormController} form
   */
  attach(form) {}

  /**
   * Detach from the form and cancel any pending save.
   */
  detach() {}

  /**
   * Check if a saved draft exists for the configured storageKey.
   * @returns {Promise<DraftRecord|null>}
   */
  async hasDraft() {}

  /**
   * Load the saved draft values.
   * @returns {Promise<DraftRecord|null>}
   */
  async loadDraft() {}

  /**
   * Delete the saved draft (called after successful submission or explicit discard).
   * @returns {Promise<void>}
   */
  async clearDraft() {}

  /**
   * Force an immediate save bypassing the debounce.
   * Called by beforeunload handler.
   * @returns {Promise<void>}
   */
  async flush() {}

  /**
   * Returns the timestamp of the last successful save.
   * @returns {number|null}
   */
  getLastSavedAt() {}

  /**
   * Subscribe to auto-save lifecycle events.
   * @param {'saving'|'saved'|'error'|'draft-found'|'draft-restored'|'draft-discarded'} event
   * @param {function(*): void} handler
   * @returns {function} unsubscribe
   */
  on(event, handler) {}

  /** @param {FormController} form */
  #scheduleWrite(form) {}

  /**
   * Perform the actual storage write.
   * Strips omitFields, wraps in DraftRecord envelope.
   * @param {Object} values
   */
  async #write(values) {}
}
```

### Auto-Save Draft Recovery Flow

```
App loads
    │
    ▼
AutoSaveManager.hasDraft()
    │
    ├── No draft → form.init() with initialValues from props
    │
    └── Draft found → config.promptRestore?
            │
            ├── true:
            │     Show "Restore unsaved draft from 3 min ago? [Restore] [Discard]"
            │     User clicks Restore → form.setValues(draft.values)
            │     User clicks Discard → autoSave.clearDraft()
            │
            └── false (silent restore):
                  form.setValues(draft.values)

User edits form
    │
    ▼ (debounced 1000ms after last change)
autoSave.#write(values)
    → storage.set('draft:order-form', { values, savedAt, expiresAt })
    → emit 'saved'

User submits form successfully
    │
    ▼
autoSave.clearDraft()
    → storage.delete('draft:order-form')
```

---

## 8.7 — Multi-Step Form Orchestrator

### Responsibility
Manages a sequence of form steps (wizard). Each step has its own fields, its own validation schema, and optional completion conditions. Navigation between steps is gated by validation. The orchestrator maintains the full cross-step value map so earlier steps can pre-fill later ones.

```js
/**
 * @typedef {Object} StepDefinition
 * @property {string}   id               - Unique step identifier
 * @property {string}   title            - Display name
 * @property {string[]} fields           - Field names owned by this step
 * @property {ValidationSchema} [validationSchema]
 * @property {function(values: Object): Promise<boolean>|boolean} [canEnter]
 *           Guard: can the user navigate to this step? (default: always true)
 * @property {function(values: Object): Promise<boolean>|boolean} [canLeave]
 *           Guard: can the user leave this step? Called before navigation.
 * @property {function(values: Object): Promise<void>} [onEnter]  - Side effect on step entry
 * @property {function(values: Object): Promise<void>} [onLeave]  - Side effect on step exit
 * @property {boolean}  [optional]       - Step can be skipped (default: false)
 * @property {boolean}  [skipped]        - Programmatically skip this step
 */

/**
 * @typedef {Object} StepState
 * @property {string}   id
 * @property {'pending'|'active'|'completed'|'error'|'skipped'} status
 * @property {boolean}  valid
 * @property {boolean}  touched
 * @property {number}   index
 */

/**
 * @typedef {Object} OrchestratorState
 * @property {number}       currentStepIndex
 * @property {StepState[]}  steps
 * @property {boolean}      canGoBack
 * @property {boolean}      canGoForward
 * @property {boolean}      isFirstStep
 * @property {boolean}      isLastStep
 * @property {number}       completedCount
 * @property {number}       totalSteps
 * @property {number}       progressPercent
 */
```

```js
class MultiStepFormOrchestrator {
  /** @type {StepDefinition[]} */
  #steps = [];

  /** @type {number} */
  #currentIndex = 0;

  /** @type {FormController} */
  #form = null;

  /** @type {Map<string, StepState>} */
  #stepStates = new Map();

  /** @type {AutoSaveManager|null} */
  #autoSave = null;

  /**
   * @param {StepDefinition[]}  steps
   * @param {FormController}    form     - Single form instance shared across all steps
   * @param {AutoSaveManager}   [autoSave]
   */
  constructor(steps, form, autoSave = null) {}

  /**
   * Initialize the orchestrator.
   * Validates step definitions, sets up step states, restores saved progress.
   * @returns {Promise<void>}
   */
  async init() {}

  // ── Navigation ────────────────────────────────────────────────────────

  /**
   * Attempt to advance to the next step.
   *
   * Flow:
   *  1. Validate all fields owned by current step
   *  2. Run current step's canLeave() guard
   */
  async next() {}

  /**
   * Go back to the previous step.
   * Does NOT re-validate. Calls onLeave/onEnter side effects.
   * @returns {Promise<void>}
   */
  async back() {}

  /**
   * Jump to a specific step by ID or index.
   * Only allowed to jump forward if all intermediate steps are valid,
   * or to any previously completed step.
   *
   * @param {string|number} stepIdOrIndex
   * @returns {Promise<{ success: boolean, reason?: string }>} 
   */
  async goTo(stepIdOrIndex) {}

  /**
   * Mark a step as skipped.
   * @param {string} stepId
   */
  skipStep(stepId) {}

  // ── State ─────────────────────────────────────────────────────────────

  /**
   * @returns {OrchestratorState}
   */
  getState() {}

  /**
   * @returns {StepDefinition}
   */
  getCurrentStep() {}

  /**
   * @returns {StepState}
   */
  getCurrentStepState() {}

  /**
   * Check if all non-optional steps are completed and valid.
   * @returns {boolean}
   */
  isComplete() {}

  /**
   * Submit the entire multi-step form.
   * Validates ALL steps before calling form.submit().
   * @returns {Promise<void>}
   */
  async submit() {}

  // ── Subscriptions ─────────────────────────────────────────────────────

  /**
   * @param {function(OrchestratorState): void} handler
   * @returns {function} unsubscribe
   */
  subscribe(handler) {}

  // ── Internal ──────────────────────────────────────────────────────────

  /**
   * Find the next non-skipped step from a given index.
   * @param {number} fromIndex
   * @param {'forward'|'back'} direction
   * @returns {number}  - New index, or -1 if none
   */
  #findNextStep(fromIndex, direction) {}

  /** @param {StepDefinition} step @param {Partial<StepState>} patch */
  #setStepState(step, patch) {}
}
```

### Multi-Step Navigation Flow

```
Step 1 (Contact Info) → Step 2 (Address) → Step 3 (Payment) → Step 4 (Review)

User on Step 2, clicks "Next":
    │
    ├── 1. validateField('street'), validateField('city'), etc.
    │         → All pass? continue
    │         → Any fail? set step status = 'error', abort
    │
    ├── 2. steps[1].canLeave({ ...allValues }) → true
    │
    ├── 3. steps[2].canEnter({ ...allValues })
    │         → Could check: "has user selected a delivery method?"
    │         → true? continue
    │
    ├── 4. steps[1].onLeave()  → side effect (e.g. save progress)
    │
    ├── 5. currentIndex = 2  (skip any 'skipped' steps)
    │
    ├── 6. steps[2].onEnter()  → side effect (e.g. pre-fill from billing address)
    │
    └── 7. Notify subscribers → UI renders Step 3

Progress bar:
  ████████░░░░  Step 2/4 — 50% complete
```

---

## 8.8 — File Upload Manager

### Responsibility
Handles all file upload scenarios: single file, multiple files, drag-and-drop, chunked large files, progress tracking, and retry on failure. Integrates with the HTTP Client (Module 4) for upload requests. Manages upload queue and concurrency.

```js
/**
 * @typedef {Object} UploadConfig
 * @property {string}   endpoint           - Upload URL
 * @property {string}   [method]           - Default: 'POST'
 * @property {number}   [maxFileSize]      - Bytes (default: 50MB)
 * @property {number}   [maxFiles]         - Max files per upload (default: 10)
 * @property {string[]} [accept]           - MIME types or extensions e.g. ['image/*', '.pdf']
 * @property {boolean}  [chunked]          - Enable chunked upload (default: false)
 * @property {number}   [chunkSize]        - Bytes per chunk (default: 5MB)
 * @property {number}   [concurrency]      - Parallel uploads (default: 3)
 * @property {number}   [maxRetries]       - Retry attempts per chunk (default: 3)
 * @property {function(file: File): Object} [buildMetadata]  - Extra form data per file
 * @property {function(response: *): string} [extractFileId] - Parse file ID from response
 */

/**
 * @typedef {Object} UploadFile
 * @property {string}   id                - UUID assigned on add
 * @property {File}     file              - Native File object
 * @property {'pending'|'uploading'|'paused'|'complete'|'error'|'cancelled'} status
 * @property {number}   progress          - 0–100
 * @property {number}   uploadedBytes
 * @property {number}   totalBytes
 * @property {number}   [bytesPerSecond]
 * @property {number}   [etaSeconds]
 * @property {string}   [error]
 * @property {number}   retryCount
 * @property {string}   [remoteId]        - Server-assigned ID after complete
 * @property {string}   [remoteUrl]       - Public URL if returned by server
 * @property {number}   addedAt
 * @property {number}   [completedAt]
 */
```

```js
class FileUploadManager {
  /** @type {Map<string, UploadFile>} */
  #files = new Map();

  /** @type {UploadConfig} */
  #config = null;

  /** @type {HTTPClient} */
  #http = null;

  /** @type {number} */
  #activeUploads = 0;

  /** @type {Map<string, AbortController>} */
  #abortControllers = new Map();

  /** @type {Set<function>} */
  #subscribers = new Set();

  /**
   * @param {UploadConfig} config
   * @param {HTTPClient}   httpClient
   */
  constructor(config, httpClient) {}

  // ── File management ────────────────────────────────────────────────────

  /**
   * Add files to the upload queue.
   * Validates size and MIME type before accepting.
   *
   * @param {File | File[] | FileList} files
   * @returns {{ accepted: UploadFile[], rejected: { file: File, reason: string }[] }}
   */
  add(files) {}

  /**
   * Remove a file from the queue (cancels if in-flight).
   * @param {string} fileId
   */
  remove(fileId) {}

  /**
   * Clear all files (cancels all in-flight).
   */
  clear() {}

  // ── Upload control ─────────────────────────────────────────────────────

  /**
   * Start uploading all pending files.
   * Respects concurrency limit.
   */
  startAll() {}

  /**
   * Start uploading a specific file.
   * @param {string} fileId
   */
  start(fileId) {}

  /**
   * Pause an in-flight upload (for chunked uploads only).
   * @param {string} fileId
   */
  pause(fileId) {}

  /**
   * Resume a paused chunked upload.
   * @param {string} fileId
   */
  resume(fileId) {}

  /**
   * Cancel an in-flight or pending upload.
   * @param {string} fileId
   */
  cancel(fileId) {}

  /**
   * Retry a failed upload.
   * @param {string} fileId
   */
  retry(fileId) {}

  // ── State ─────────────────────────────────────────────────────────────

  /**
   * Get a snapshot of all upload files.
   * @returns {UploadFile[]}
   */
  getFiles() {}

  /**
   * Get a specific file state.
   * @param {string} fileId
   * @returns {UploadFile|null}
   */
  getFile(fileId) {}

  /**
   * Overall progress (0–100) across all files.
   * @returns {number}
   */
  getTotalProgress() {}

  /**
   * Returns true if all files have reached a terminal state
   * (complete, error, or cancelled) and at least one completed.
   * @returns {boolean}
   */
  isAllComplete() {}

  // ── Drag-and-drop ─────────────────────────────────────────────────────

  /**
   * Install drag-and-drop handlers on a DOM element.
   * Handles dragenter, dragleave, dragover, drop.
   *
   * @param {Element}  dropZone
   * @param {Object}   [options]
   * @param {string}   [options.activeClass]    - CSS class on drag-over (default: 'drag-active')
   * @param {boolean}  [options.autoStart]      - Start upload on drop (default: true)
   * @param {function(UploadFile[]): void} [options.onDrop]
   * @returns {function} cleanup
   */
  installDropZone(dropZone, options = {}) {}

  // ── Subscriptions ─────────────────────────────────────────────────────

  /**
   * @param {function(Map<string, UploadFile>): void} handler
   * @returns {function} unsubscribe
   */
  subscribe(handler) {}

  // ── Internal ──────────────────────────────────────────────────────────

  /**
   * Execute a standard (non-chunked) upload.
   * @param {UploadFile} uploadFile
   * @returns {Promise<void>}
   */
  async #uploadSingle(uploadFile) {}

  /**
   * Execute a chunked upload.
   * Splits file into chunks, uploads sequentially (with retry),
   * sends final "complete" request.
   *
   * @param {UploadFile} uploadFile
   * @returns {Promise<void>}
   */
  async #uploadChunked(uploadFile) {}

  /**
   * Upload a single chunk. Retries on failure with exponential backoff.
   * @param {UploadFile}  uploadFile
   * @param {Blob}        chunk
   * @param {number}      chunkIndex
   * @param {number}      totalChunks
   * @returns {Promise<void>}
   */
  async #uploadChunk(uploadFile, chunk, chunkIndex, totalChunks) {}

  /**
   * Validate a file against config rules (size, type).
   * @param {File} file
   * @returns {{ valid: boolean, reason?: string }}
   */
  #validate(file) {}

  /**
   * Update a file's state and notify subscribers.
   * @param {string} fileId
   * @param {Partial<UploadFile>} patch
   */
  #setFileState(fileId, patch) {}
}
```

### Chunked Upload Protocol

```
Large file: video.mp4 (150MB), chunkSize: 5MB → 30 chunks

POST /api/uploads/initiate
Body: { filename: 'video.mp4', size: 157286400, totalChunks: 30 }
Response: { uploadId: 'upl-xyz', chunkUrls: [...] }  ← optional pre-signed URLs

For each chunk 0..29:
  PUT /api/uploads/upl-xyz/chunks/0
  Body: <5MB Blob>
  Headers: { Content-Range: 'bytes 0-5242879/157286400' }
  Response: { received: true }

  On failure: retry with backoff (max 3 attempts)
  On pause: AbortController.abort() — saves chunkIndex to UploadFile
  On resume: restart from saved chunkIndex

POST /api/uploads/upl-xyz/complete
Body: { uploadId: 'upl-xyz' }
Response: { fileId: 'file-abc', url: 'https://cdn.../video.mp4' }
```

---

## 8.9 — Form Diff Engine

### Responsibility
Computes a precise structural diff between the form's initial values and its current values. Used to power "You have unsaved changes" warnings, to determine which fields to include in PATCH requests, and to enable the undo/redo stack for forms.

```js
/**
 * @typedef {Object} FieldDiff
 * @property {string}  fieldName
 * @property {*}       initialValue
 * @property {*}       currentValue
 * @property {'added'|'removed'|'changed'} type
 */

/**
 * @typedef {Object} FormDiff
 * @property {boolean}     isDirty       - Any field has changed
 * @property {FieldDiff[]} changes       - Per-field change records
 * @property {string[]}    changedFields - Just the field names that changed
 * @property {string[]}    addedFields   - Fields with values that were initially absent
 * @property {string[]}    removedFields - Fields set to empty/null that had initial values
 * @property {Object}      patchPayload  - Only the changed field values (for PATCH requests)
 */
```

```js
class FormDiffEngine {
  /**
   * Compute a diff between initial and current form values.
   *
   * @param {Object}  initialValues
   * @param {Object}  currentValues
   * @param {Object}  [options]
   * @param {string[]} [options.ignoreFields]    - Fields to exclude from diff
   * @param {function(a: *, b: *): boolean} [options.equalityFn]
   *         Custom equality (default: deep structural equality)
   * @returns {FormDiff}
   */
  compute(initialValues, currentValues, options = {}) {}

  /**
   * Check if a specific field has changed.
   * @param {string} fieldName
   * @param {Object} initialValues
   * @param {Object} currentValues
   * @returns {boolean}
   */
  isFieldDirty(fieldName, initialValues, currentValues) {}

  /**
   * Compute a patch object — only the changed fields.
   * Useful for PATCH API calls that only update modified fields.
   *
   * @param {Object}  initialValues
   * @param {Object}  currentValues
   * @param {string[]} [ignoreFields]
   * @returns {Object}  - { changedFieldName: currentValue, ... }
   */
  computePatch(initialValues, currentValues, ignoreFields = []) {}

  /**
   * Deep equality check for two values.
   * Handles: primitives, arrays, plain objects, Date, null/undefined.
   * Does NOT handle: class instances, functions, Symbols.
   *
   * @param {*} a
   * @param {*} b
   * @returns {boolean}
   */
  static deepEqual(a, b) {}

  /**
   * Given a diff, produce a human-readable summary string.
   * e.g. "3 fields changed: firstName, email, phone"
   *
   * @param {FormDiff} diff
   * @returns {string}
   */
  static summarize(diff) {}
}
```

---

## Wiring: Full Bootstrap Sequence

```js
// forms/index.js — Form system factory assembled by DI Container

import FormController            from './FormController.js';
import ValidationEngine          from './ValidationEngine.js';
import ValidationSchemaRegistry  from './ValidationSchemaRegistry.js';
import FieldMaskManager          from './FieldMaskManager.js';
import { PatternMask, CreditCardMask, CurrencyMask, DateMask } from './masks/index.js';
import FormSerializer            from './FormSerializer.js';
import AutoSaveManager           from './AutoSaveManager.js';
import MultiStepFormOrchestrator from './MultiStepFormOrchestrator.js';
import FileUploadManager         from './FileUploadManager.js';
import FormDiffEngine            from './FormDiffEngine.js';

// ── 1. Build schema registry with built-in rules ───────────────────────
const schemaRegistry = new ValidationSchemaRegistry();
registerBuiltInRules(schemaRegistry);   // registers required, email, minLength, etc.

// ── 2. Build validation engine ─────────────────────────────────────────
const validationEngine = new ValidationEngine(schemaRegistry);

// ── 3. Build mask manager with named masks ─────────────────────────────
const maskManager = new FieldMaskManager();
maskManager.register('phone-us',      new PatternMask('(###) ###-####'));
maskManager.register('phone-intl',    new PatternMask('+# (###) ###-####'));
maskManager.register('date-us',       new DateMask({ format: 'MM/DD/YYYY' }));
maskManager.register('date-iso',      new DateMask({ format: 'YYYY-MM-DD' }));
maskManager.register('credit-card',   new CreditCardMask());
maskManager.register('currency-usd',  new CurrencyMask({ locale: 'en-US', currency: 'USD' }));
maskManager.register('ssn',          new PatternMask('###-##-####'));
maskManager.register('zip-us',        new PatternMask('#####'));
maskManager.register('zip-us-full',   new PatternMask('#####-####'));

// ── 4. Build diff engine ───────────────────────────────────────────────
const diffEngine = new FormDiffEngine();

// ── 5. Form factory — creates a configured FormController ──────────────
function createForm(config) {
  const autoSave = config.autoSave
    ? new AutoSaveManager(config.autoSave, storageRouter)
    : null;

  const form = new FormController(
    config,
    validationEngine,
    diffEngine,
    autoSave,
  );

  return form;
}

// ── 6. Multi-step factory ──────────────────────────────────────────────
function createMultiStepForm(steps, formConfig) {
  const form         = createForm(formConfig);
  const autoSave     = formConfig.autoSave
    ? new AutoSaveManager(formConfig.autoSave, storageRouter)
    : null;
  const orchestrator = new MultiStepFormOrchestrator(steps, form, autoSave);
  return { form, orchestrator };
}

// ── 7. File upload factory ─────────────────────────────────────────────
function createUploader(config) {
  return new FileUploadManager(config, httpClient);
}

export { createForm, createMultiStepForm, createUploader, schemaRegistry, maskManager };
```

### Usage Examples

```js
// ── Simple form ────────────────────────────────────────────────────────
const loginForm = createForm({
  formId: 'login',
  initialValues: { email: '', password: '', rememberMe: false },

  validationSchema: schemaRegistry.compile({
    fields: {
      email:    ['required', 'email'],
      password: ['required', 'minLength(8)'],
    },
  }),

  validateOnBlur:  true,
  reValidateOnChange: true,

  async onSubmit(values) {
    await authManager.loginWithCredentials(values.email, values.password);
  },

  onSubmitFail(values, errors) {
    eventBus.emit('ui:form:submit-failed', { formId: 'login', errors });
  },
});

// Register masks
loginForm.registerMask('email', maskManager.get('email-lowercase'));

// Subscribe
loginForm.subscribe((state) => {
  submitButton.disabled = !state.valid || state.submitting;
});

// Bind to DOM
emailInput.addEventListener('input',  (e) => loginForm.setValue('email', e.target.value));
emailInput.addEventListener('blur',   ()  => loginForm.setTouched('email'));
loginForm$.addEventListener('submit', (e) => loginForm.submit(e));

// ── Form with auto-save ────────────────────────────────────────────────
const orderForm = createForm({
  formId: 'new-order',
  initialValues: { productId: '', quantity: 1, notes: '' },

  validationSchema: schemaRegistry.compile({
    fields: {
      productId: ['required'],
      quantity:  ['required', 'min(1)', 'max(999)'],
    },
  }),

  autoSave: {
    storageKey:    'draft:new-order',
    debounceMs:    1000,
    adapter:       'localStorage',
    omitFields:    [],
    promptRestore: true,
    draftTTLMs:    7 * 24 * 60 * 60 * 1000,
  },

  async onSubmit(values) {
    const payload = orderSerializer.serialize(values);
    await httpClient.post('/api/orders', payload);
  },
});

// ── Multi-step checkout ────────────────────────────────────────────────
const { form: checkoutForm, orchestrator } = createMultiStepForm(
  [
    {
      id:     'contact',
      title:  'Contact Information',
      fields: ['firstName', 'lastName', 'email', 'phone'],
      validationSchema: schemaRegistry.compile({
        fields: {
          firstName: ['required'],
          lastName:  ['required'],
          email:     ['required', 'email'],
          phone:     ['required'],
        },
      }),
    },
    {
      id:     'shipping',
      title:  'Shipping Address',
      fields: ['street', 'city', 'state', 'zip'],
      validationSchema: schemaRegistry.compile('addressUS'),
    },
    {
      id:     'payment',
      title:  'Payment',
      fields: ['cardNumber', 'expiry', 'cvv'],
      onEnter: async () => {
        // Pre-load saved payment methods
        const methods = await httpClient.get('/api/payment-methods');
        checkoutForm.setValue('savedMethods', methods.data);
      },
    },
    {
      id:     'review',
      title:  'Review & Submit',
      fields: [],   // read-only review step
    },
  ],
  {
    formId: 'checkout',
    initialValues: {
      firstName: '', lastName: '', email: '', phone: '',
      street: '', city: '', state: '', zip: '',
      cardNumber: '', expiry: '', cvv: '',
    },
    autoSave: { storageKey: 'draft:checkout', debounceMs: 500 },
    async onSubmit(values) {
      await httpClient.post('/api/checkout', checkoutSerializer.serialize(values));
    },
  },
);

nextButton.addEventListener('click',  () => orchestrator.next());
backButton.addEventListener('click',  () => orchestrator.back());

orchestrator.subscribe((state) => {
  progressBar.style.width = `${state.progressPercent}%`;
  stepTitle.textContent   = orchestrator.getCurrentStep().title;
  backButton.disabled     = !state.canGoBack;
  nextButton.textContent  = state.isLastStep ? 'Submit' : 'Next';
});

// ── File upload with drag-and-drop ─────────────────────────────────────
const uploader = createUploader({
  endpoint:    '/api/documents/upload',
  maxFileSize: 50 * 1024 * 1024,     // 50MB
  maxFiles:    5,
  accept:      ['application/pdf', 'image/*'],
  chunked:     true,
  chunkSize:   5 * 1024 * 1024,      // 5MB chunks
  concurrency: 2,
  maxRetries:  3,
  extractFileId: (response) => response.data.fileId,
});

const cleanup = uploader.installDropZone(dropZoneEl, {
  activeClass: 'drop-zone--active',
  autoStart:   true,
  onDrop: (files) => console.log(`Dropped ${files.length} files`),
});

uploader.subscribe((files) => {
  renderUploadList([...files.values()]);
});
```
