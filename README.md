# The AI IT Department

> Connect, configure, test, and deploy a useful AI workspace for a business—without requiring the business owner to understand connectors, OAuth, MCP, APIs, or prompt engineering.

## Status

**Stage:** Production blueprint and validation  
**Working name:** The AI IT Department  
**Initial wedge:** Google Workspace onboarding for owner-led small businesses

## Product thesis

Powerful AI tools already exist. The adoption bottleneck is the last mile:

- choosing the right tools;
- connecting each user's own accounts safely;
- understanding permissions;
- configuring the assistant around the business;
- verifying that every connection works; and
- turning connected tools into useful, repeatable outcomes.

The AI IT Department is a guided provisioning layer that takes a business from "we use Gmail, Calendar and spreadsheets" to a tested, role-aware AI workspace.

## First production outcome

A new user should be able to:

1. describe their business and role;
2. receive a recommended setup;
3. connect their own Google account through OAuth;
4. see connection and permission status;
5. run safe connection tests;
6. activate an initial set of useful capabilities; and
7. receive a readiness report.

## Repository documents

- [`PROJECT.md`](PROJECT.md) — product contract and boundaries
- [`docs/PRODUCTION_EVALUATION.md`](docs/PRODUCTION_EVALUATION.md) — feasibility, risks, go/no-go verdict and validation gates
- [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) — production architecture, flows, data model and delivery plan

## Architecture direction

```text
ChatGPT App UI
      |
      v
OAuth-protected MCP server
      |
      v
Application control plane
  |        |         |
Auth   Integration   Policy / Audit
       adapters
  |        |
Google   Microsoft (later)
```

ChatGPT authenticates to our application. Each customer separately authorizes their own Google or Microsoft account. Provider tokens remain encrypted in our backend and are never embedded in prompts or exposed to another customer.

## MVP boundaries

### Included

- individual and small-team onboarding;
- Google Gmail, Calendar, Drive, Docs, Sheets and Contacts;
- per-user OAuth and revocation;
- guided setup checklist;
- connection health tests;
- least-privilege permission explanation;
- read operations first;
- explicit confirmation for consequential write operations;
- audit trail and readiness report.

### Not included initially

- a general automation builder;
- autonomous background employees;
- arbitrary third-party integrations;
- enterprise identity provisioning;
- replacing ChatGPT;
- silently installing native ChatGPT connectors;
- bypassing provider or workspace administrator consent.

## Non-negotiable principles

1. **Every user connects their own account.**
2. **Least privilege by default.**
3. **Read before write.**
4. **No consequential action without clear user intent.**
5. **Connection success must be tested, not assumed.**
6. **Tokens never enter model context.**
7. **The product must deliver a useful outcome, not merely a connected account.**

## Immediate build sequence

1. Scaffold the monorepo and local development environment.
2. Implement application authentication and organization tenancy.
3. Implement the OAuth-protected MCP server.
4. Build the ChatGPT onboarding component.
5. Add Google account linking in the companion control plane.
6. Add encrypted token storage and connection health checks.
7. Ship one complete workflow: daily business briefing.
8. Run production security and end-to-end acceptance gates.
