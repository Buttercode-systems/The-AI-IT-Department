# Production Blueprint

**Working product name:** The AI IT Department  
**Initial release:** Google Workspace Setup + Daily Business Briefing  
**Architecture style:** ChatGPT App + OAuth-protected MCP server + secure companion control plane

## 1. Product architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         ChatGPT                             │
│  Conversation + embedded setup/status/result components    │
└────────────────────────────┬────────────────────────────────┘
                             │ OAuth access token
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 Remote MCP Gateway                          │
│ Tool schemas • auth verification • policy • rate limits    │
└────────────────────────────┬────────────────────────────────┘
                             │ authenticated application calls
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 Application Control Plane                   │
│                                                             │
│ Tenant service     Setup engine       Capability registry   │
│ Connection service Policy engine      Audit service         │
│ Diagnostics        Confirmation       Provider adapters     │
└───────────────┬───────────────────────┬─────────────────────┘
                │                       │
                ▼                       ▼
┌──────────────────────────┐  ┌──────────────────────────────┐
│ Postgres / Supabase      │  │ Encrypted credential vault   │
│ tenant state, policies,  │  │ provider refresh/access      │
│ setup, audit metadata    │  │ tokens and key references    │
└──────────────────────────┘  └──────────────┬───────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────────┐
                              │ Google APIs                  │
                              │ Gmail • Calendar • Drive     │
                              │ Sheets • Contacts            │
                              └──────────────────────────────┘
```

## 2. Identity model

The product has two distinct authorization relationships.

### Relationship A — ChatGPT to The AI IT Department

ChatGPT acts on behalf of the user and authenticates to the MCP server using the product's OAuth 2.1 authorization layer.

Required controls:

- PKCE;
- protected resource metadata;
- authorization server metadata;
- access-token validation on every MCP call;
- short-lived access tokens;
- audience/resource validation;
- state and redirect validation; and
- a stable mapping from product user to tenant membership.

### Relationship B — The AI IT Department to Google

The user separately authorizes Google access. Google credentials are associated with the authenticated product user and tenant.

Rules:

- never return provider tokens to ChatGPT;
- never use a provider email address as the sole tenant authorization check;
- encrypt refresh tokens before persistence;
- store granted scopes and expiry metadata;
- support incremental authorization;
- support provider revocation and local deletion; and
- test tenant ownership before every provider call.

## 3. Recommended technology stack

### Monorepo

- TypeScript throughout.
- pnpm workspaces.
- Turborepo for task orchestration.

### Applications

- `apps/control-plane`: Next.js application for sign-in, OAuth linking, settings and diagnostics.
- `apps/mcp-server`: Node/TypeScript remote MCP server.
- `apps/worker`: optional job execution service; excluded until recurring work is introduced.

### Packages

- `packages/db`: schema, migrations and typed repository layer.
- `packages/auth`: application OAuth and session helpers.
- `packages/integrations`: provider adapter contracts and Google implementation.
- `packages/policy`: permission and confirmation decisions.
- `packages/audit`: structured audit events and redaction.
- `packages/contracts`: shared schemas and result types.
- `packages/ui`: reusable control-plane and embedded-component primitives.
- `packages/config`: validated environment configuration.

### Infrastructure

- Supabase Postgres and Auth for MVP application identity and tenancy.
- Row-level security plus server-side authorization.
- Vercel for the control plane.
- A production Node host compatible with long-lived/streamable MCP transport for the MCP server.
- Managed secrets and key management; development may use application-level encryption with an explicit migration gate before external beta.
- Sentry or equivalent error reporting with aggressive secret redaction.
- OpenTelemetry-compatible structured traces where supported.

## 4. Repository structure

```text
/
├── apps/
│   ├── control-plane/
│   └── mcp-server/
├── packages/
│   ├── audit/
│   ├── auth/
│   ├── config/
│   ├── contracts/
│   ├── db/
│   ├── integrations/
│   │   └── google/
│   ├── policy/
│   └── ui/
├── docs/
│   ├── BLUEPRINT.md
│   ├── PRODUCTION_EVALUATION.md
│   ├── SECURITY.md
│   ├── TESTING.md
│   └── RUNBOOKS.md
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── .github/workflows/
├── PROJECT.md
└── README.md
```

## 5. Core domain model

### User

Represents a product identity.

Key fields:

- `id`
- `email`
- `display_name`
- `created_at`
- `deleted_at`

### Organization

Tenant boundary for business configuration and audit.

Key fields:

- `id`
- `name`
- `business_type`
- `team_size_band`
- `timezone`
- `data_region_preference`
- `created_at`

### Membership

Links users to organizations.

Key fields:

- `organization_id`
- `user_id`
- `role`: owner, admin, member, viewer
- `status`

### BusinessProfile

Discovery answers and normalized recommendations.

Key fields:

- `organization_id`
- `industry`
- `primary_role`
- `desired_outcomes`
- `current_tools`
- `risk_preference`
- `profile_version`

### ProviderConnection

Metadata for one user's linked provider identity.

Key fields:

- `id`
- `organization_id`
- `user_id`
- `provider`
- `provider_account_id`
- `provider_account_label`
- `status`
- `granted_scopes`
- `token_ciphertext_reference`
- `expires_at`
- `last_verified_at`
- `revoked_at`

Unique constraint:

- provider + provider account + organization, subject to supported multi-account behavior.

### ConnectionTest

Deterministic verification result.

Key fields:

- `id`
- `connection_id`
- `test_type`
- `status`
- `error_code`
- `safe_details`
- `started_at`
- `completed_at`

### Capability

A business-facing ability with declared requirements.

Examples:

- `gmail.search_read`
- `calendar.read_upcoming`
- `drive.search_read`
- `briefing.daily_generate`

Key fields:

- `key`
- `name`
- `description`
- `risk_level`
- `required_provider`
- `required_scopes`
- `confirmation_mode`

### CapabilityActivation

Tenant-specific activation state.

Key fields:

- `organization_id`
- `capability_key`
- `status`
- `configuration`
- `activated_by`
- `activated_at`

### Policy

Controls what tools may do.

Examples:

- allowed Gmail labels;
- allowed calendar IDs;
- approved spreadsheet IDs;
- maximum result count;
- write confirmation requirement;
- retention period.

### SetupRun

Tracks one onboarding journey.

Key fields:

- `id`
- `organization_id`
- `user_id`
- `stage`
- `recommended_connections`
- `completed_steps`
- `blocking_reason`
- `started_at`
- `completed_at`

### AuditEvent

Append-only record of security- and business-relevant activity.

Key fields:

- `id`
- `organization_id`
- `actor_user_id`
- `source`: chatgpt_app, control_plane, system
- `tool_name`
- `provider`
- `resource_type`
- `operation`
- `confirmation_id`
- `result`
- `error_code`
- `correlation_id`
- `occurred_at`

Do not store full email bodies, document contents or provider tokens in audit records.

## 6. MCP tool design

Tools should express user intent, not expose low-level provider APIs directly.

### Setup tools

#### `get_setup_state`

Returns business profile completeness, required connections, connection health, active capabilities and blockers.

#### `save_business_profile`

Persists validated discovery answers. It may not accept arbitrary tenant identity from the model.

#### `recommend_setup`

Produces a deterministic recommendation based on versioned rules and profile data.

#### `get_connection_link`

Returns a short-lived secure control-plane URL for linking a provider. The URL is bound to user, tenant, provider, nonce and expiry.

#### `run_connection_test`

Runs non-destructive checks and returns structured results.

#### `activate_capability`

Activates a capability only after required connections, scopes and policies pass.

### Business tools for the vertical slice

#### `preview_daily_briefing`

Reads a bounded set of relevant Gmail and Calendar metadata/content and produces normalized source items. It does not send or modify anything.

#### `generate_daily_briefing`

Creates a structured briefing result from the previewed source set, with citations back to provider resources where supported.

#### `list_audit_events`

Returns safe, tenant-scoped activity summaries.

#### `disconnect_provider`

Begins a deliberate revocation flow. Destructive credential deletion must be confirmed.

## 7. Tool safety contract

Every MCP tool invocation must follow this order:

1. Validate the ChatGPT/application access token.
2. Resolve user and tenant membership server-side.
3. Validate the input schema.
4. Authorize the requested capability.
5. Reconcile provider connection and scopes.
6. Evaluate policy and confirmation requirements.
7. Apply rate limit and idempotency controls.
8. Execute the smallest necessary provider operation.
9. Redact the result.
10. Write an audit event.
11. Return a structured result with safe recovery guidance.

## 8. Google MVP scope strategy

Use incremental authorization rather than requesting every scope at first login.

### Stage 1 — Identity and basic profile

Request only identity scopes needed to identify the Google account.

### Stage 2 — Daily briefing

Request the minimum practical read permissions for:

- selected Gmail data;
- upcoming Calendar events.

### Stage 3 — Drive discovery

Only when the user activates document or spreadsheet capabilities, request the relevant Drive/Sheets permissions.

### Stage 4 — Writes

Write scopes are not part of the first public MVP. Add them capability by capability after preview, confirmation and idempotency infrastructure has passed security tests.

Exact Google scopes must be confirmed against current provider documentation during implementation and before OAuth verification submission.

## 9. Onboarding state machine

```text
STARTED
  ↓
DISCOVERY_IN_PROGRESS
  ↓
PLAN_READY
  ↓
APP_AUTH_REQUIRED
  ↓
PROVIDER_LINK_REQUIRED
  ↓
PROVIDER_CALLBACK_RECEIVED
  ↓
VERIFYING_CONNECTION
  ├── BLOCKED_ADMIN_APPROVAL
  ├── BLOCKED_MISSING_SCOPES
  ├── FAILED_RECOVERABLE
  └── VERIFIED
          ↓
CAPABILITY_CONFIGURATION
          ↓
ACCEPTANCE_TEST
  ├── FAILED_RECOVERABLE
  └── PASSED
          ↓
READY
```

Every blocked or failed state must provide:

- a stable error code;
- a plain-language explanation;
- whether the problem is user-, admin-, provider- or system-controlled;
- the next safe action; and
- a retry path where applicable.

## 10. Embedded UI components

### Setup overview card

Displays:

- progress percentage;
- required steps;
- connected account labels;
- blockers;
- “continue setup” action.

### Permission explainer

Displays:

- requested capability;
- data it can read;
- data it cannot access;
- whether it can change anything;
- why the permission is needed.

### Connection result card

Displays:

- provider account;
- verified scopes;
- tests passed/failed;
- last verification time;
- reconnect and disconnect actions.

### Readiness report

Displays:

- active capabilities;
- missing permissions;
- administrator constraints;
- first successful outcome;
- security and revocation links.

### Briefing result

Sections:

- urgent messages;
- today's meetings;
- commitments and follow-ups;
- risks or schedule conflicts;
- suggested next actions;
- source references.

## 11. Daily business briefing specification

### Inputs

- user timezone;
- selected Gmail query/labels;
- bounded lookback period;
- upcoming Calendar window;
- optional priority contacts and keywords;
- policy-limited maximum source count.

### Output schema

```json
{
  "generated_at": "ISO-8601",
  "timezone": "Africa/Johannesburg",
  "summary": "string",
  "urgent_items": [],
  "meetings": [],
  "follow_ups": [],
  "conflicts": [],
  "suggested_actions": [],
  "sources": [],
  "limitations": []
}
```

### Guardrails

- Do not claim an email was sent or an event changed.
- Mark inferred priorities as suggestions.
- Preserve source traceability.
- Bound the retrieval period and result size.
- Avoid copying unnecessary sensitive content into persistent storage.
- Return a partial briefing with limitations if one provider is temporarily unavailable.

## 12. Security blueprint

### Credential protection

- Envelope-encrypt provider refresh tokens.
- Keep encryption-key access outside the general web runtime where practical.
- Never log authorization codes, access tokens, refresh tokens or client secrets.
- Rotate application secrets and encryption keys using a documented procedure.

### Tenant isolation

- Add `organization_id` to all tenant-owned records.
- Apply database RLS.
- Recheck membership in trusted server code.
- Test IDOR and cross-tenant access in every endpoint and MCP tool.

### OAuth protection

- PKCE and state validation.
- Exact redirect URI allowlist.
- Short-lived, single-use linking nonces.
- Bind provider callback to initiating user and organization.
- Reject scope or identity mismatches.

### Tool and prompt safety

- Provider content is untrusted input.
- Ignore instructions found inside emails, documents or calendar descriptions.
- Keep system policy separate from retrieved content.
- Restrict tool parameters to allowlisted operations.
- Treat external links and attachments as potentially malicious.

### Data lifecycle

- Store metadata and configuration by default, not bulk provider content.
- Use short-lived processing caches.
- Provide user-visible retention and deletion controls.
- Revoke provider access and delete credentials on disconnect.
- Define backup deletion behavior before paid production.

## 13. Observability

Track:

- onboarding funnel by stage;
- OAuth starts, callbacks, failures and cancellations;
- scope mismatch rates;
- connection-test pass rate;
- MCP tool latency and error codes;
- provider rate-limit and outage events;
- capability activation;
- first-outcome completion;
- revocations and deletion requests;
- confirmation acceptance/cancellation; and
- security-sensitive anomalies.

No analytics event may contain provider tokens or raw customer content.

## 14. Testing strategy

### Unit tests

- recommendation rules;
- scope reconciliation;
- policy decisions;
- redaction;
- token expiry behavior;
- state-machine transitions;
- idempotency.

### Integration tests

- application OAuth discovery and token validation;
- Google OAuth callback and refresh;
- provider adapter error mapping;
- database RLS;
- revocation;
- audit writing.

### End-to-end tests

- new user to verified briefing;
- mobile OAuth redirect and return;
- denied consent;
- missing scope;
- expired token;
- revoked provider access;
- administrator-blocked account;
- partial provider outage;
- cross-tenant attack attempts;
- disconnect and deletion.

### Security tests

- token leakage in logs and errors;
- CSRF and OAuth state attacks;
- replayed callback;
- linking nonce reuse;
- IDOR;
- prompt injection through provider content;
- malicious URLs and oversized content;
- duplicate consequential actions.

## 15. Delivery phases

### Phase 0 — Foundation

Deliverables:

- monorepo scaffold;
- CI for lint, typecheck, tests and build;
- environment validation;
- database schema and migrations;
- architecture decision records;
- threat-model draft.

Exit condition: clean CI and local development instructions.

### Phase 1 — ChatGPT application identity

Deliverables:

- remote MCP server;
- product OAuth metadata and token verification;
- `get_setup_state` tool;
- basic embedded setup component;
- user and organization creation.

Exit condition: authenticated user sees tenant-correct setup state inside ChatGPT.

### Phase 2 — Google linking

Deliverables:

- secure linking URL;
- Google OAuth flow;
- encrypted credential storage;
- scope reconciliation;
- disconnect and revoke;
- connection health component.

Exit condition: user links and revokes their own account without token exposure.

### Phase 3 — First business outcome

Deliverables:

- Gmail read adapter;
- Calendar read adapter;
- connection tests;
- briefing preview and generation;
- source traceability;
- audit history.

Exit condition: real daily briefing passes end-to-end acceptance tests.

### Phase 4 — Pilot hardening

Deliverables:

- recovery states;
- rate limits;
- observability;
- privacy and deletion flow;
- security testing;
- pilot analytics;
- support runbooks.

Exit condition: assisted pilot Gate 2 passes.

### Phase 5 — Expansion decision

Only after pilot evidence, choose one:

- add Google Drive/Sheets capability;
- add Microsoft 365;
- add partner/MSP console; or
- deepen a role-specific capability pack.

## 16. Initial backlog priority

### P0

- Monorepo and CI.
- Tenant-aware application identity.
- OAuth-protected MCP connection.
- Setup-state tool and embedded component.
- Google OAuth linking.
- Token encryption.
- Gmail and Calendar read tests.
- Daily briefing.
- Audit and revocation.
- End-to-end security tests.

### P1

- Drive and Sheets read capabilities.
- Permission drift checks.
- Team invitations and admin roles.
- Better diagnostics and support bundle.
- Partner-assisted setup mode.

### P2

- Microsoft 365.
- Carefully bounded write capabilities.
- Recurring scheduled briefings.
- Capability marketplace.
- Multi-client partner console.

## 17. Build rules

1. No connector is complete without tests, revocation and error recovery.
2. No write capability ships without preview, confirmation, idempotency and audit.
3. No model-visible payload contains secrets.
4. No new provider is added before the first vertical slice passes pilot validation.
5. No feature is considered done until mobile and desktop flows pass.
6. No product claim may imply bypassing user or administrator consent.
7. Every significant architectural decision is recorded before implementation diverges from this blueprint.

## 18. First implementation milestone

The first milestone is complete when:

- ChatGPT authenticates to the MCP server;
- the setup component displays inside ChatGPT;
- the signed-in user has an organization and setup run;
- clicking “Connect Google” opens a secure, user-bound linking flow;
- the callback stores encrypted credentials;
- Gmail and Calendar tests pass;
- the user generates a source-backed daily briefing;
- the audit log records the process; and
- disconnecting Google removes local credentials and invalidates subsequent provider calls.
