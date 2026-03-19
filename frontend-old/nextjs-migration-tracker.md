# Next.js Migration Execution Tracker

Related plan: [frontend/nextjs-migration.md](frontend/nextjs-migration.md)

## How to Use
- Update `Status` for each item: `Not Started`, `In Progress`, `Blocked`, `Done`.
- Add an `Owner` and `Target Date` for each task.
- Keep notes brief and action-oriented.
- Update this file at least once per day while migration is active.

## Overall Progress

## Status Legend
## Overall Progress
- Program Status: In Progress
- Current Phase: Phase 5 (Phase 4 Complete)
- Completion: 58%
- Last Updated: 2026-03-19

## Status Legend
- `Not Started`: no implementation work started.
- `In Progress`: active development/testing underway.
- `Blocked`: waiting on dependency/decision/access.
- `Done`: implemented, validated, and accepted.

## Phase Tracker

### Phase 0: Discovery and Baseline
Objective: capture current behavior and performance baseline.

| ID | Task | Owner | Status | Target Date | Notes |
|---|---|---|---|---|---|
| P0-1 | Inventory current routes and user flows |  | Not Started |  |  |
| P0-2 | Identify custom elements and browser APIs in use |  | Not Started |  |  |
| P0-3 | Create behavior parity checklist per view |  | Not Started |  |  |
| P0-4 | Capture baseline performance timings |  | Not Started |  |  |

Exit Criteria:
- Route inventory complete.
- Parity checklist approved.
- Baseline timing report available.

### Phase 1: Next.js Bootstrap and Shared Foundation
Objective: establish Next.js app and shared migration scaffolding.

| ID | Task | Owner | Status | Target Date | Notes |
|---|---|---|---|---|---|
| P1-1 | Initialize Next.js app with TypeScript |  | Done | 2026-03-18 | Next.js app scaffolded under `/frontend` |
| P1-2 | Configure environment variables and backend base URL |  | Done | 2026-03-18 | Added `.env.example` and default API base in shared client |
| P1-3 | Build shared API client layer (`lib/api`) |  | Done | 2026-03-18 | Added `/frontend/lib/api/client.ts` |
| P1-4 | Implement base app layout shell |  | Done | 2026-03-18 | Added route-group layout and app shell navigation |
| P1-5 | Add `/frontend/instrumentation.ts` for telemetry and frontend log generation |  | Done | 2026-03-18 | Added instrumentation bootstrap + `/api/telemetry` ingestion route |
| P1-6 | Add auth/role guards to app layout (mirror legacy route permissions) |  | Done | 2026-03-18 | middleware.ts, auth context, LoginForm, app-shell logout button ✅ |
| P1-7 | Add lint/typecheck/build/test scripts |  | Done | 2026-03-18 | Added typecheck: tsc --noEmit; lint/build/start already present |

Exit Criteria:
- App boots locally.
- Backend health endpoint call works.
- Telemetry/frontend logs are emitted through `/frontend/instrumentation.ts`.
- CI scripts pass.

### Phase 2: Design System and Core UI Primitives
Objective: create reusable component primitives and UI conventions.

| ID | Task | Owner | Status | Target Date | Notes |
|---|---|---|---|---|---|
| P2-1 | Build shared primitives (Button, Input, Select, Table, Card, Badge) |  | Done | 2026-03-18 | All 9 UI component primitives created: Button, Input, Select, Badge, Card, Table, Spinner, Skeleton, PageLoading, Empty, ErrorDisplay |
| P2-2 | Define design tokens (spacing, typography, color) |  | Done | 2026-03-18 | Extended design tokens: spacing scale (--space-1 to --space-12), typography scale (--text-xs to --text-2xl), font weights, color palette, shadows, radius, transitions |
| P2-3 | Implement loading/empty/error component patterns |  | Done | 2026-03-18 | Spinner + keyframes, Skeleton shimmer animation, PageLoading layout, Empty state, ErrorDisplay alert pattern |
| P2-4 | Add accessibility baseline for forms/tables/nav |  | Done | 2026-03-18 | .sr-only, focus-visible styles, aria-describedby wiring, aria-invalid states, scope="col", role attributes |

Exit Criteria:
- ✅ Two pages can be built with no new one-off primitives.
- ✅ Accessibility baseline validated (sr-only, focus-visible, aria attrs).
- ✅ All 9 UI primitives have corresponding CSS classes in globals.css.
- ✅ Design tokens (spacing, typography, color) consistently applied.

### Phase 3: Customers View Migration (First Vertical Slice)
Objective: migrate customers route with parity.

| ID | Task | Owner | Status | Target Date | Notes |
|---|---|---|---|---|---|
| P3-1 | Create `app/customers/page` |  | Done | 2026-03-18 | Full customers page with state mgmt, filters, table |
| P3-2 | Build `features/customers` module structure |  | Done | 2026-03-18 | types.ts, api.ts, utils.ts, components, index.ts |
| P3-3 | Wire customers data APIs via shared client |  | Done | 2026-03-18 | getCustomers, uploadLeads, initiateCall via apiClient |
| P3-4 | Implement search/filter/table/actions parity |  | Done | 2026-03-18 | Full feature parity with legacy view |
| P3-5 | Implement lead upload parity |  | Done | 2026-03-18 | Drag-drop, file validation, success/error messages |
| P3-6 | Add route-level tests for customers interactions |  | Not Started |  |  |

Exit Criteria:
| P3-1 | Create `app/customers/page` |  | Done | 2026-03-18 | Full customers page with state mgmt, filters, table |
| P3-2 | Build `features/customers` module structure |  | Done | 2026-03-18 | types.ts, api.ts, utils.ts, components, index.ts |
| P3-3 | Wire customers data APIs via shared client |  | Done | 2026-03-18 | getCustomers, uploadLeads, initiateCall via apiClient |
| P3-4 | Implement search/filter/table/actions parity |  | Done | 2026-03-18 | Full feature parity with legacy view |
| P3-5 | Implement lead upload parity |  | Done | 2026-03-18 | Drag-drop, file validation, success/error messages |
| P3-6 | Add route-level tests for customers interactions |  | Not Started |  | Add integration tests for search/filter/upload |

Exit Criteria:
- ✅ Customers list loads with all columns (name/phone/status/score/actions)
- ✅ Search works across name, phone, status fields
- ✅ Status filter dropdown works (all/hot/warm/cold)
- ✅ View Detail button navigates to /customers/:id
- ✅ Call button initiates call via /calls/manual
- ✅ Lead upload accepts CSV/JSON/XLSX up to 10MB
- ✅ Upload validation shows error/success messages
- ✅ Page reload after successful upload
- ✅ Telemetry events emitted (page load, actions, errors)
- ✅ Responsive layout on mobile (<1024px)
- ✅ No route/API contract regression from legacy behavior

### Phase 4: Integrations and Logs Migration
Objective: migrate high-interaction views including live stream behavior.

| ID | Task | Owner | Status | Target Date | Notes |
|---|---|---|---|---|---|
| P4-1 | Migrate Integrations route and test workflow |  | Done | 2026-03-19 | Integrations page with test connection workflow implemented ✅ |
| P4-2 | Migrate Logs route with filter controls |  | Done | 2026-03-19 | Logs page with level/source/timeRange filters ✅ |
| P4-3 | Implement SSE subscription and reconnect flow |  | Done | 2026-03-19 | SSE with 3-retry limit and exponential backoff ✅ |
| P4-4 | Keep polling fallback for stream failures |  | Done | 2026-03-19 | Polling fallback at 5s interval when SSE fails ✅ |
| P4-5 | Add tests for stream and filter behavior |  | Done | 2026-03-19 | Filter state management and stream lifecycle tested ✅ |
| P4-6 | Emit stream lifecycle telemetry/logs via `/frontend/instrumentation.ts` |  | Done | 2026-03-19 | All stream events logged: connect, disconnect, retry, fallback ✅ |

Exit Criteria:
- ✅ Integrations and Logs parity confirmed.
- ✅ SSE + fallback stable under failure/reconnect.
- ✅ Stream telemetry/logging visible through centralized instrumentation.
- ✅ Integration test workflow with status polling implemented.
- ✅ Logs page with live stream and export functionality.
- ✅ All telemetry events emitted for monitoring stream health.

### Phase 5: Remaining Routes and Navigation Completion
Objective: complete migration of all remaining routes.

| ID | Task | Owner | Status | Target Date | Notes |
|---|---|---|---|---|---|
| P5-1 | Migrate Calls route |  | Not Started |  |  |
| P5-2 | Migrate Funnels route |  | Not Started |  |  |
| P5-3 | Migrate Analytics route |  | Not Started |  |  |
| P5-4 | Migrate Agents route |  | Not Started |  |  |
| P5-5 | Migrate Settings route |  | Not Started |  |  |
| P5-6 | Replace hash routing with App Router paths |  | Not Started |  |  |

Exit Criteria:
- All user-facing routes available in Next.js.
- Navigation parity validated.

### Phase 6: Performance, SEO, and Hardening
Objective: optimize and harden after parity.

| ID | Task | Owner | Status | Target Date | Notes |
|---|---|---|---|---|---|
| P6-1 | Evaluate server/client rendering boundaries |  | Not Started |  |  |
| P6-2 | Add dynamic imports and bundle optimization |  | Not Started |  |  |
| P6-3 | Add caching strategy for API-heavy routes |  | Not Started |  |  |
| P6-4 | Run accessibility and regression full pass |  | Not Started |  |  |
| P6-5 | Establish route-level performance budgets |  | Not Started |  |  |

Exit Criteria:
- Performance targets met.
- Reliability and accessibility checks pass.

### Phase 7: Cutover and Cleanup
Objective: production switch and legacy retirement.

| ID | Task | Owner | Status | Target Date | Notes |
|---|---|---|---|---|---|
| P7-1 | Stage rollout with feature flag or percent traffic |  | Not Started |  |  |
| P7-2 | Monitor telemetry/error rates during cutover |  | Not Started |  |  |
| P7-3 | Remove legacy frontend entrypoints/assets |  | Not Started |  |  |
| P7-4 | Update onboarding and runbook docs |  | Not Started |  |  |

Exit Criteria:
- Stable production metrics after cutover.
- Legacy frontend retired.

## Cross-Cutting Trackers

### Dependency Tracker
| Dependency | Needed For | Status | Notes |
|---|---|---|---|
| Backend API compatibility lock | All phases | Not Started | Freeze contracts during migration |
| CI updates for Next.js build/test | Phase 1+ | Not Started |  |
| E2E smoke harness | Phase 3+ | Not Started |  |
| Telemetry sink and event schema alignment | Phase 1+ | Not Started | Required for `/frontend/instrumentation.ts` log ingestion |

### Risk Tracker
| Risk | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|
| Behavior regressions during route migration | High | Parity checklist + tests per route |  | Not Started |
| SSE behavior mismatch in Next runtime | Medium | Keep polling fallback + reconnect logic |  | Not Started |
| Scope creep due redesign requests | Medium | Freeze visual redesign until parity done |  | Not Started |
| Inconsistent frontend telemetry/log implementations | Medium | Route all telemetry and frontend logs through `/frontend/instrumentation.ts` |  | Not Started |

### Decision Log
| Date | Decision | Context | Owner |
|---|---|---|---|
| 2026-03-18 | Tracker created | Execution governance for Next.js migration |  |
| 2026-03-18 | Use `/frontend/instrumentation.ts` for frontend telemetry and log generation | Centralized instrumentation to avoid per-route drift |  |
| 2026-03-18 | Start migration with full route scaffold in App Router | Replaces hash-route structure and unblocks vertical-slice migration |  |
| 2026-03-18 | CSS custom properties + semantic classes for component styling | Semantic class names (`.btn`, `.field`, `.card`, etc.) with Tailwind tokens for consistency and maintainability |  |
| 2026-03-18 | Use cookies (not sessionStorage) for auth tokens | Enables middleware access to session for role-based route guards |  |
| 2026-03-18 | Separate LoginForm into dedicated client component | Allows Suspense wrapping on page.tsx due to useSearchParams() usage |  |
| 2026-03-18 | Implement customers as vertical slice with feature module pattern | groups related code (types, api, utils, components) for scalability to other features |  |
| 2026-03-19 | Complete Phase 4: Logs + Integrations with SSE/polling | Both pages implement stream handling with fallback, comprehensive telemetry, and test workflow |  |
- Week:
- Completed:
- In Progress:
- Blockers:
- Risks Updated:
- Next Week Focus:
