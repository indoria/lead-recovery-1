# Phase Closure Checklist

This checklist converts the implementation plan into release gates with objective pass/fail criteria.

## How to use this checklist

1. Work top-down by phase.
2. A phase is closed only when all `Must pass` items are checked.
3. Record evidence links (PR, test run, API response, screenshot) next to each item.
4. If any blocker remains open, do not mark the phase as closed.

## Phase 1 Closure Gate - Foundation and Infrastructure

### Must pass

- [x] Core workflow interfaces are present and used by workflow modules (`execute`, `validateInputs`, `getDependencies`, `isFusable`, `canSkip`).
- [x] Core domain models exist for customer, lead, funnel/stage, call session/transcript.
- [x] Config loading and validation are active for app and workflow configs.
- [x] Structured logger includes correlation-id support and PII masking.
- [x] Module registry and dependency wiring work in app bootstrap.
- [x] Unit tests for foundation components pass.

### Evidence required

- [x] Test report: foundation unit tests green. (2026-03-16: 5/5 suites, 15/15 tests)
- [x] Sample API run showing module listing and one module execution. (2026-03-16 evidence: live Nest startup mapped `/api/workflow/modules`, `/api/workflow/execute`, `/api/workflow/simulate-call`; API execution paths covered in integration spec `backend/tests/integration/workflow-phase2.api.spec.ts` via `POST /api/workflow/simulate-call` assertions.)

### Sign-off

- [ ] Engineering Lead
- [ ] QA Lead

## Phase 2 Closure Gate - Core Call Workflow

### Must pass

- [ ] Modules 3-7 are implemented and wired: call-preparation, call-initiation, welcome-message, response-processing, conversation-loop.
- [ ] STT/TTS/LLM/Telephony adapters have working mock + real adapters behind interfaces.
- [ ] End-to-end simulate-call flow returns transcript, end reason, and assessment.
- [ ] Rule-based assessment generated for each completed call.
- [ ] Integration scenarios pass: happy path, decline, hang-up, max-turns, TTS fallback, STT empty escalation.
- [ ] PII is masked in logs for call workflow paths.

### Must fix before closure (from current audit)

- [ ] Decide and enforce one architecture for response-processing: either separate orchestrator step or explicitly documented internal sub-step of conversation-loop.

### Evidence required

- [ ] Integration test report for all Phase 2 scenarios.
- [ ] Sample transcript output from simulate-call.
- [ ] Latency sample showing response pipeline budget tracking.

### Sign-off

- [ ] Engineering Lead
- [ ] QA Lead
- [ ] Product Owner

## Phase 3 Closure Gate - Adaptability and Orchestration

### Must pass

- [ ] Orchestrator builds and executes plans from workflow YAML.
- [ ] Fusion rules are evaluated and reflected in dry-run plan output.
- [ ] Skip conditions with default outputs are honored.
- [ ] Fused adapter registry supports CRM, telephony-welcome, and full-conversational-ai paths.
- [ ] Workflow inspection endpoints return workflows, plan, adapters, and active fusions.
- [ ] Plan/build and fusion behavior covered by unit + integration tests.

### Evidence required

- [ ] API responses for `/workflows`, `/workflows/:id/plan`, `/fusions`.
- [ ] Test evidence for no-fusion and fusion-enabled plans.

### Sign-off

- [ ] Engineering Lead
- [ ] QA Lead

## Phase 4 Closure Gate - Advanced Conversation Features

### Must pass

- [ ] Accomplishment assessment module returns bounded conversion probability and recommendation.
- [ ] Sentiment analyzer is integrated into deviation/assessment logic.
- [ ] Exception handling supports steer/redirect/escalate paths.
- [ ] Conversation logging persists sessions and emits analytics events.
- [ ] Analytics endpoints work: summary, metrics, funnel chart, heatmap, model performance, cohorts, forecast, top leads.
- [ ] Pending objection review flow works: list, approve, reject.
- [ ] Escalation flow works: list tickets and resolve tickets.
- [ ] ML lifecycle endpoints work: train, rollback, history, current.

### Must fix before closure (from current audit)

- [ ] Add explicit training entrypoint contract if required by plan (script and/or documented API-first replacement).

### Evidence required

- [ ] Analytics endpoint response samples.
- [ ] One escalation ticket created and resolved.
- [ ] One pending objection approved/rejected.
- [ ] Model history output showing at least one training event.

### Sign-off

- [ ] Engineering Lead
- [ ] Data/ML Lead
- [ ] QA Lead

## Phase 5 Closure Gate - UI and Administration

### Must pass

- [ ] SPA shell, routing, state, auth, events, http, telemetry, and UI component system are functional.
- [ ] Views are functional with backend data: dashboard, customers, funnels/editor, calls, agents, analytics, settings, account.
- [ ] Role-based route guards enforce admin-only sections.
- [ ] Lead ingestion UI supports CSV/JSON/XLSX with validation and import result handling.
- [ ] Real-time active-call transcript refresh works.
- [ ] Accessibility checks pass: keyboard nav, focus handling, aria labels, contrast.
- [ ] Mobile and tablet layouts are usable.

### Must fix before closure (from current audit)

- [ ] Implement missing backend APIs used by frontend (`/customers`, `/calls/*`, `/agents`, `/integrations/:id/test`) or remove fallbacks and align contracts.
- [ ] Remove hardcoded environment-specific API base URL and make it config-driven.

### Evidence required

- [ ] End-to-end UI test report for login, dashboard, customer import, funnel edit, manual call, analytics.
- [ ] Screen captures for desktop/tablet/mobile routes.
- [ ] API contract matrix showing every frontend call has a live backend endpoint.

### Sign-off

- [ ] Engineering Lead
- [ ] QA Lead
- [ ] UX/Design Reviewer
- [ ] Product Owner

## Phase 6 Closure Gate - Integration, Testing, Optimization

### Must pass

- [ ] Real adapters validated in environment for Sarvam STT, ElevenLabs TTS, Twilio telephony, Exotel telephony, Gemini LLM, CRM.
- [ ] Telephony adapter methods are complete (initiate, hangUp, streamAudio) and webhook security is enforced.
- [ ] Comprehensive test layers exist and run: unit, integration, e2e, load.
- [ ] Security baseline passes (authz, secrets handling, input validation, PII controls, dependency audit).
- [ ] Deployment assets support health checks and rollback.
- [ ] Performance target verified for agreed concurrent load.

### Must fix before closure (from current audit)

- [ ] Implement non-placeholder hangUp and streamAudio behavior in Twilio and Exotel adapters.
- [ ] Add telephony webhook signature validation path where required.
- [ ] Add missing e2e and load test suites/scripts and include them in CI.

### Evidence required

- [ ] Adapter integration test logs and sample successful calls.
- [ ] Security test report and dependency audit output.
- [ ] Load test summary with P95 latency and error rate.
- [ ] Deployment rehearsal and rollback rehearsal output.

### Sign-off

- [ ] Engineering Lead
- [ ] QA Lead
- [ ] Security Reviewer
- [ ] SRE/Infra Lead

## Phase 7 Closure Gate - Analytics and Self-Improvement

### Must pass

- [ ] Automated retraining trigger(s) work (threshold/weekly/manual).
- [ ] Versioned model history and rollback are operational.
- [ ] Pre-call lead scoring is active and exposed in API/UI.
- [ ] Suggestion engine generates actionable suggestions and supports accept/dismiss lifecycle.
- [ ] Advanced analytics views are available and data-backed.
- [ ] API v2 plan is implemented or explicitly deferred with approved scope note.

### Must fix before closure (from current audit)

- [ ] Finalize weekly automated pipeline orchestration and promotion criteria tracking in production ops.

### Evidence required

- [ ] 1 full training-to-promotion or training-to-reject cycle record.
- [ ] Suggestion lifecycle examples (pending -> accepted/dismissed).
- [ ] Pre-call score impact report (ranking vs conversion outcome sample).

### Sign-off

- [ ] Engineering Lead
- [ ] Data/ML Lead
- [ ] Product Owner

## Global Release Readiness (all phases)

### Mandatory before production sign-off

- [ ] CI pipeline blocks merges on failed lint/type-check/test.
- [ ] Cross-service observability: logs, metrics, correlation-id traces.
- [ ] Incident runbook and on-call ownership documented.
- [ ] API docs match implemented endpoints.
- [ ] Final UAT completed and approved.

### Final approvals

- [ ] Product Owner
- [ ] Engineering Manager
- [ ] QA Manager
- [ ] Security
- [ ] Ops/SRE
