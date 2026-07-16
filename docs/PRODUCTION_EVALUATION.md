# Production Evaluation

**Product:** The AI IT Department  
**Evaluation date:** 2026-07-16  
**Decision:** **Proceed, with a narrowly scoped Google Workspace pilot and explicit validation gates.**

## 1. Executive verdict

The concept is technically feasible and commercially credible, but only if positioned as a **setup, policy, diagnostics, and activation layer** rather than “another GPT” or “a connector marketplace.”

The strongest version of the product owns the difficult last mile:

- discovering what a business actually needs;
- guiding individual authorization;
- explaining and reconciling permissions;
- verifying that connections work;
- activating useful role-specific capabilities;
- enforcing confirmations and policies; and
- diagnosing failures after setup.

The weakest version merely links users to OAuth pages and displays connection badges. That would be easy for platforms and integration vendors to absorb.

## 2. Scorecard

| Dimension | Score | Assessment |
|---|---:|---|
| Problem severity | 9/10 | AI adoption is constrained by setup complexity, trust and unclear business value. |
| Technical feasibility | 8/10 | Apps SDK, MCP and OAuth support the core flow; provider and admin constraints remain. |
| MVP feasibility | 9/10 | A Google-only, read-first pilot is buildable without a large integration catalogue. |
| Differentiation | 7/10 | Strong if the product owns diagnostics, policy and outcome templates; weak if it is only onboarding. |
| Platform risk | 6/10 | OpenAI, Google and Microsoft can improve native onboarding. The product must add value above connection UI. |
| Security complexity | 6/10 | Token custody, tenant isolation and write controls are serious production responsibilities. |
| Distribution potential | 8/10 | ChatGPT-native discovery plus consultants, MSPs and business communities provide plausible channels. |
| Monetisation potential | 8/10 | Setup, managed readiness, team governance and premium capability packs can support paid plans. |
| Overall | **8.1/10** | Proceed through gated implementation and user validation. |

## 3. What is technically possible

OpenAI's current Apps SDK supports apps that extend ChatGPT with an MCP server and embedded UI. Customer-specific data and write actions should authenticate users, and authenticated MCP servers are expected to implement OAuth 2.1-compatible authorization. ChatGPT acts as the OAuth client to the product's authorization layer.

This enables:

- an embedded onboarding and status interface inside ChatGPT;
- sign-in to The AI IT Department;
- secure calls from ChatGPT to tenant-scoped MCP tools;
- interactive setup progress and recovery states; and
- user-specific business results.

A second authorization relationship is required for Google or Microsoft. The customer authorizes the provider account to our backend. The product stores encrypted provider credentials and invokes provider APIs behind policy-enforced MCP tools.

## 4. What is not safely promised

The product must not promise that it can:

- silently enable all native ChatGPT apps or connectors;
- bypass Google or Microsoft consent screens;
- bypass organization administrator approval;
- guarantee access to scopes disabled by a managed workspace;
- make every setup one-click;
- perform consequential actions without user confirmation;
- connect arbitrary providers without adapter-specific implementation; or
- eliminate all browser redirects during OAuth.

The correct promise is **guided setup with the fewest necessary steps, clear consent, verification and recovery**.

## 5. Recommended architecture decision

### Adopt

- ChatGPT App built with the Apps SDK.
- Remote MCP server as the product tool surface.
- OAuth 2.1 authorization between ChatGPT and our application.
- Separate provider OAuth linking in a secure companion control plane.
- Supabase/Postgres for application data and tenant isolation during MVP.
- Vercel for the web/control-plane surface and a compatible hosted Node service for MCP.
- Provider adapters behind a common connection and capability interface.
- Read-first capabilities and explicit write confirmation.

### Reject for the core product

- A Custom GPT as the only application surface.
- User-provided API keys pasted into chat.
- Direct provider tokens exposed to the model.
- A broad automation canvas.
- Browser automation for provider consent.
- Storing full copies of customer mailboxes or drives.

## 6. Competitive and platform pressure

The product competes indirectly with:

- native ChatGPT apps and connector onboarding;
- Google Gemini and Microsoft Copilot within their own ecosystems;
- Zapier, Make and n8n for cross-tool automation;
- SaaS onboarding and integration platforms;
- managed service providers and AI consultants; and
- vertical AI assistants with preconfigured integrations.

It should not compete on the existence of connectors. It should compete on:

1. **Recommendation:** what this business should connect and why.
2. **Readiness:** whether permissions and data access actually work.
3. **Policy:** what the assistant may read or change.
4. **Activation:** useful capabilities tailored to role and industry.
5. **Recovery:** clear diagnosis when credentials, scopes or admin controls fail.
6. **Evidence:** auditable proof of actions and connection state.

## 7. Primary risks and mitigations

### Risk A — Platform absorption

OpenAI or providers may make connection setup substantially easier.

**Mitigation:** Build durable value in cross-provider readiness, business templates, policies, diagnostics, audit and managed deployment—not only connection buttons.

### Risk B — OAuth and verification friction

Google verification, sensitive scopes and workspace administrator policies can delay launch.

**Mitigation:** Begin with the smallest read scopes needed for the briefing. Use incremental authorization. Avoid restricted scopes in the first pilot where possible. Document admin-blocked states.

### Risk C — Token custody

A breach could expose provider access.

**Mitigation:** Encrypt tokens with envelope encryption, restrict decryption to the integration execution service, redact logs, rotate secrets, support revocation and complete a threat model before external beta.

### Risk D — Cross-tenant leakage

Incorrect authorization could expose one customer's data to another.

**Mitigation:** Enforce tenant identity at every tool boundary, use database row-level security, test horizontal privilege escalation, and never accept tenant IDs from untrusted tool arguments without server-side reconciliation.

### Risk E — Dangerous write actions

An assistant could send, edit or delete the wrong item.

**Mitigation:** Read-first MVP, previews, explicit confirmations, idempotency keys, narrow resource allowlists, audit events and reversible operations where possible.

### Risk F — No retained value after setup

A one-time setup wizard may have weak recurring revenue.

**Mitigation:** Include ongoing health monitoring, permission drift, broken-connection recovery, readiness reports, team policies, capability packs and recurring operational briefings.

### Risk G — Unclear buyer

End users may like the concept but resist paying.

**Mitigation:** Test three buyer paths separately: owner-led SMB subscription, one-time assisted setup, and consultant/MSP-managed client deployments.

## 8. Validation gates

Development should continue only while the following gates are passed.

### Gate 1 — Technical spike

**Pass criteria**

- ChatGPT connects to the remote MCP server through application OAuth.
- Embedded setup UI renders on mobile and desktop.
- One test user links a Google account.
- Provider tokens remain server-side.
- A Gmail or Calendar read test returns tenant-correct data.
- Revocation causes subsequent calls to fail safely.

### Gate 2 — Assisted pilot

Test with at least 10 target users.

**Pass criteria**

- 7/10 connect Google without developer intervention.
- 6/10 complete a verified briefing.
- Median completion time is under 15 minutes.
- At least 5 users describe the outcome as meaningfully useful.
- At least 3 demonstrate credible willingness to pay.

### Gate 3 — Unassisted beta

Test with at least 30 users.

**Pass criteria**

- 60% onboarding completion.
- 50% first-outcome activation.
- Fewer than 10% encounter an unrecoverable setup error.
- No critical security or cross-tenant finding.
- At least 40% seven-day retained usage among activated users.

### Gate 4 — Paid production

**Pass criteria**

- Threat model and security review complete.
- Privacy policy, terms, data deletion and incident response implemented.
- Provider OAuth app verification appropriate to the scopes is complete.
- Production monitoring, rate limits, backups and key rotation tested.
- Billing and support ownership defined.

## 9. Commercial hypothesis

### Initial offers to test

- **Guided Setup:** once-off fee for a verified AI workspace.
- **Workspace Care:** monthly connection health, permission and readiness monitoring.
- **AI Capability Packs:** role-specific workflows such as owner briefing, sales follow-up or operations coordination.
- **Partner Console:** consultants and MSPs deploy and manage multiple client workspaces.

Pricing should not be finalized before willingness-to-pay interviews and assisted pilots. The first test should compare a low-friction subscription with a higher-priced assisted setup.

## 10. Production recommendation

Proceed with a single vertical slice:

> A business owner connects Google Workspace and receives a verified daily business briefing from Gmail and Calendar, with source links, permission visibility, audit history and complete revocation.

Do not add Microsoft, Slack, CRM integrations, background agents or a workflow builder until this flow passes the assisted pilot.

## 11. Decision

**GO — controlled build.**

The concept has enough technical and commercial merit to justify production work. The build must remain evidence-driven and security-first. The next milestone is not “many connectors”; it is one complete, trusted and demonstrably valuable setup journey.
