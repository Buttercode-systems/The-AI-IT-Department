# PROJECT.md — The AI IT Department

## 1. Product definition

The AI IT Department is an AI-guided provisioning and operations layer for businesses adopting ChatGPT and connected work tools.

It interviews the user, understands the business context, recommends an appropriate tool setup, launches per-user authorization flows, verifies permissions and connectivity, activates role-relevant capabilities, and produces a readiness report.

The product is not another general chatbot. It is the setup, trust, policy, and orchestration layer that turns an existing AI platform into a useful business workspace.

## 2. Mission

Make a secure and genuinely useful AI workspace available to an ordinary business in less than ten minutes.

## 3. Initial target customer

Owner-led service businesses and small teams that:

- already use Google Workspace;
- rely heavily on email, calendar, documents and spreadsheets;
- want to use ChatGPT but do not understand connectors or permissions;
- do not have internal IT or AI operations staff; and
- need immediate administrative value rather than a custom automation project.

The first buyer is likely the owner, operations manager, office manager, executive assistant, consultant, or fractional technology provider.

## 4. Jobs to be done

### Primary job

> When I want my business to use AI, help me safely connect what we already use, configure the right capabilities, and prove that the setup works without making me become an AI or IT expert.

### Supporting jobs

- Explain why each permission is needed in plain language.
- Prevent accidental over-permissioning.
- Show exactly what is connected, broken, expired, or blocked.
- Recommend capabilities based on role and business type.
- Distinguish setup completion from actual business readiness.
- Help an administrator revoke access and inspect activity.

## 5. Core promise

**From disconnected tools to a tested AI workspace in one guided session.**

The MVP is successful only when the user receives at least one meaningful business outcome after setup. A row of green “connected” badges is not sufficient.

## 6. MVP use case

### Google Business Setup

The user connects a Google account and provisions a workspace capable of:

- reading selected Gmail messages;
- reading upcoming Calendar events;
- finding files in Drive;
- reading and updating approved Sheets only when explicitly requested;
- accessing Contacts where authorized; and
- producing a daily business briefing with source links and a clear action queue.

## 7. User journey

1. **Entry** — User opens the ChatGPT app and selects “Set up my business.”
2. **Discovery** — Assistant asks a short adaptive set of questions about business, role, team size, tools and desired outcomes.
3. **Recommendation** — Product proposes a setup plan and explains required permissions.
4. **Identity** — User signs in to The AI IT Department.
5. **Provider connection** — User launches the official Google authorization flow and approves their own account.
6. **Verification** — Backend validates granted scopes and performs non-destructive health checks.
7. **Configuration** — Product creates a role-aware workspace profile and initial capability set.
8. **Acceptance test** — User runs a real but safe task using their connected data.
9. **Readiness report** — Product reports what works, what is limited and what requires administrator approval.
10. **Operations** — User can manage permissions, revoke access, review audit history and rerun diagnostics.

## 8. Product surfaces

### A. ChatGPT app

The conversational front door and embedded UI for:

- discovery;
- recommendations;
- progress and status;
- capability invocation;
- setup guidance; and
- user-facing results.

### B. Companion control plane

A minimal secure web interface for:

- application sign-in;
- provider OAuth callbacks;
- connection management;
- organization and member settings;
- permission inspection;
- audit logs;
- revocation and deletion; and
- support diagnostics.

### C. MCP server

The authenticated tool surface used by ChatGPT. It exposes narrowly scoped tools backed by policy checks and provider adapters.

## 9. Functional requirements

### FR-01 Business discovery

The system must capture business type, role, team size, current stack, priority outcomes and risk tolerance with no more than five required questions.

### FR-02 Setup recommendation

The system must convert discovery answers into an explainable setup plan. It must distinguish required, recommended and optional connections.

### FR-03 Per-user account linking

Each user must authorize their own provider account through OAuth. No provider token may be shared between tenants or entered manually into the chat.

### FR-04 Scope reconciliation

The system must compare required scopes with granted scopes and present missing or excessive permissions clearly.

### FR-05 Connection tests

Every connection must have deterministic, non-destructive tests. A successful OAuth callback alone is not sufficient evidence of readiness.

### FR-06 Progressive capability activation

Capabilities must only become active when the required provider connection, scopes and policy checks pass.

### FR-07 Confirmation gates

Sending email, modifying calendars, editing documents, changing spreadsheet data, deleting data or sharing files must require explicit confirmation unless the user has deliberately configured a narrowly bounded approved policy.

### FR-08 Auditability

The system must record actor, tenant, tool, provider, resource class, action, result, confirmation state and timestamp without storing unnecessary content.

### FR-09 Revocation and deletion

Users must be able to disconnect a provider, revoke application access and request deletion of stored tokens and tenant data.

### FR-10 Failure recovery

Expired tokens, revoked scopes, administrator restrictions, provider outages and partial setup must lead to actionable recovery states rather than generic errors.

## 10. Non-functional requirements

- Tenant isolation enforced in database and application layers.
- Provider credentials encrypted at rest using a managed key service before production.
- No access or refresh token may be logged, returned to ChatGPT, or inserted into model context.
- All network traffic encrypted in transit.
- OAuth state, PKCE and redirect URI validation required.
- Idempotency for write tools.
- Rate limiting per user, tenant and integration.
- Structured audit events and error correlation IDs.
- Mobile-friendly embedded components.
- Graceful fallback from embedded UI to secure browser flows.
- Data minimization and configurable retention.
- Production observability for authentication, provider calls and MCP tool execution.

## 11. Success metrics

### Activation

- At least 60% of users who begin onboarding complete one provider connection.
- At least 50% complete the first verified business task.
- Median time from start to verified task under ten minutes.

### Reliability

- At least 95% successful connection-test completion for valid consumer Google accounts.
- At least 99% prevention of duplicate write execution through idempotency controls.
- Zero cross-tenant data exposure.

### Value

- At least 40% of activated users return within seven days.
- At least 30% run the daily briefing or another activated capability three times in the first week.
- At least 20% of qualified pilot businesses indicate willingness to pay after completing the first outcome.

## 12. Explicit non-goals for MVP

- Supporting every SaaS product.
- Building a Zapier or Make competitor.
- Operating unattended background agents.
- Automatically installing ChatGPT-native apps on behalf of the user.
- Acting as an identity provider for enterprise workforces.
- Handling regulated clinical, legal or financial decision-making.
- Importing an entire mailbox or Drive into our database.
- Training a model on customer content.

## 13. Product principles

- **Outcome before breadth:** one complete workflow is more valuable than ten superficial connectors.
- **Consent is part of UX:** authorization cannot be hidden or bypassed.
- **Trust is visible:** users should always know what can be read or changed.
- **Configuration is adaptive:** recommendations follow the business, not a static wizard.
- **Safe by construction:** tool schemas, scopes and policies should make dangerous behavior difficult.
- **Platform-resilient:** own the setup state, templates, diagnostics and policy layer rather than depending entirely on one platform’s native connector UI.

## 14. Definition of MVP done

The MVP is done when a first-time user can, from ChatGPT:

1. complete business discovery;
2. authenticate with the product;
3. connect their own Google account;
4. see verified connection and scope status;
5. generate a daily briefing from real Gmail and Calendar data;
6. inspect the source items used;
7. see an audit record;
8. disconnect Google and delete the stored credentials; and
9. complete the full journey on both mobile and desktop without developer intervention.
