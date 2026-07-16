import { z } from "zod";

export const ProviderSchema = z.enum(["google"]);
export type Provider = z.infer<typeof ProviderSchema>;

export const ConnectionStatusSchema = z.enum([
  "pending",
  "connected",
  "degraded",
  "revoked",
  "error",
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const BusinessProfileSchema = z.object({
  businessName: z.string().min(2).max(120),
  industry: z.string().min(2).max(80),
  primaryRole: z.string().min(2).max(80),
  teamSize: z.enum(["solo", "2-10", "11-50", "51-200", "200+"]),
  timezone: z.string().min(1).default("Africa/Johannesburg"),
  desiredOutcomes: z.array(z.string().min(2).max(120)).min(1).max(8),
});
export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

export const SetupStateSchema = z.object({
  organizationId: z.string().uuid(),
  stage: z.enum([
    "started",
    "discovery",
    "plan_ready",
    "provider_link_required",
    "verifying",
    "capability_configuration",
    "acceptance_test",
    "ready",
    "blocked",
  ]),
  profileComplete: z.boolean(),
  progressPercent: z.number().int().min(0).max(100),
  connections: z.array(
    z.object({
      provider: ProviderSchema,
      status: ConnectionStatusSchema,
      accountLabel: z.string().nullable(),
      grantedScopes: z.array(z.string()),
      lastVerifiedAt: z.string().datetime().nullable(),
    }),
  ),
  blockers: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      nextAction: z.string(),
    }),
  ),
});
export type SetupState = z.infer<typeof SetupStateSchema>;

export const ConnectionLinkRequestSchema = z.object({
  provider: ProviderSchema,
  returnTo: z.string().url().optional(),
});

export const ConnectionLinkResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
});

export const DailyBriefingSchema = z.object({
  generatedAt: z.string().datetime(),
  timezone: z.string(),
  summary: z.string(),
  urgentItems: z.array(z.object({ title: z.string(), sourceId: z.string() })),
  meetings: z.array(
    z.object({
      title: z.string(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      sourceId: z.string(),
    }),
  ),
  followUps: z.array(z.object({ title: z.string(), sourceId: z.string() })),
  suggestedActions: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type DailyBriefing = z.infer<typeof DailyBriefingSchema>;
