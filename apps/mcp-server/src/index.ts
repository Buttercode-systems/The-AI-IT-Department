import express from "express";
import { createClient, type User } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "1mb" }));

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase MCP environment variables");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Context = { user: User; organizationId: string; accessToken: string };

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok", service: "the-ai-it-department-mcp", version: "1.0.0" });
});

async function authenticate(authorization: string | undefined): Promise<Context> {
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) throw new Error("UNAUTHORIZED");
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", data.user.id)
    .limit(1)
    .single();
  if (membershipError || !membership) throw new Error("WORKSPACE_REQUIRED");
  return { user: data.user, organizationId: membership.organization_id as string, accessToken };
}

function toolResult(data: unknown, message?: string) {
  return {
    content: [{ type: "text" as const, text: message ?? JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function createServer(context: Context): McpServer {
  const server = new McpServer({ name: "The AI IT Department", version: "1.0.0" });

  server.registerTool("get_workspace_status", {
    title: "Get workspace status",
    description: "Returns the authenticated tenant's workspace, Google connection, latest verification and active capability state.",
    inputSchema: {},
  }, async () => {
    const [{ data: organization }, { data: connection }, { data: latestTest }, { data: capability }] = await Promise.all([
      admin.from("organizations").select("id,name,industry,timezone,created_at").eq("id", context.organizationId).single(),
      admin.from("provider_connections").select("provider,status,provider_account_label,granted_scopes,last_verified_at,revoked_at").eq("organization_id", context.organizationId).eq("provider", "google").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("connection_tests").select("status,gmail_ok,calendar_ok,scopes_ok,details,created_at").eq("organization_id", context.organizationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("capabilities").select("capability_key,status,config,activated_at,updated_at").eq("organization_id", context.organizationId).eq("capability_key", "daily_briefing").maybeSingle(),
    ]);
    return toolResult({ organization, connection, latestTest, capability });
  });

  server.registerTool("get_latest_briefing", {
    title: "Get latest daily briefing",
    description: "Returns the latest persisted source-backed briefing and its current items.",
    inputSchema: { includeCompleted: z.boolean().default(false) },
  }, async ({ includeCompleted }) => {
    const { data: briefing } = await admin.from("briefings").select("*").eq("organization_id", context.organizationId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (!briefing) return toolResult({ briefing: null, items: [] }, "No briefing has been generated yet.");
    let query = admin.from("briefing_items").select("id,item_type,priority,title,summary,reason,source_label,source_url,due_at,state,snoozed_until,created_at").eq("briefing_id", briefing.id).order("created_at");
    if (!includeCompleted) query = query.in("state", ["open", "snoozed"]);
    const { data: items } = await query;
    return toolResult({ briefing, items: items ?? [] });
  });

  server.registerTool("list_priority_actions", {
    title: "List priority actions",
    description: "Lists open and snoozed action items from the authenticated workspace.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(20) },
  }, async ({ limit }) => {
    const { data } = await admin.from("briefing_items")
      .select("id,item_type,priority,title,summary,reason,source_label,source_url,due_at,state,snoozed_until,created_at")
      .eq("organization_id", context.organizationId)
      .in("state", ["open", "snoozed"])
      .order("created_at", { ascending: false })
      .limit(limit);
    return toolResult({ actions: data ?? [] });
  });

  server.registerTool("update_action", {
    title: "Update an action",
    description: "Marks a briefing action done, dismissed, snoozed or open. This only changes the product action state and does not modify Gmail or Calendar.",
    inputSchema: {
      actionId: z.string().uuid(),
      state: z.enum(["open", "done", "dismissed", "snoozed"]),
      snoozedUntil: z.string().datetime().optional(),
    },
  }, async ({ actionId, state, snoozedUntil }) => {
    const update = {
      state,
      snoozed_until: state === "snoozed" ? snoozedUntil ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("briefing_items").update(update).eq("id", actionId).eq("organization_id", context.organizationId).select("*").single();
    if (error || !data) throw new Error("ACTION_NOT_FOUND");
    await admin.from("audit_events").insert({ organization_id: context.organizationId, actor_user_id: context.user.id, source: "mcp", tool_name: "update_action", resource_type: "briefing_item", resource_id: actionId, operation: state, result: "success" });
    return toolResult({ action: data });
  });

  server.registerTool("generate_daily_briefing", {
    title: "Generate daily briefing",
    description: "Triggers a new source-backed Gmail and Calendar briefing through the secure control plane.",
    inputSchema: {},
  }, async () => {
    const appUrl = process.env.APP_URL ?? "https://the-ai-it-department.vercel.app";
    const response = await fetch(`${appUrl}/api/briefings/generate`, { method: "POST", headers: { authorization: `Bearer ${context.accessToken}` } });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "BRIEFING_GENERATION_FAILED");
    return toolResult(result);
  });

  server.registerTool("get_audit_history", {
    title: "Get audit history",
    description: "Returns recent tenant activity without exposing provider tokens or message content.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(30) },
  }, async ({ limit }) => {
    const { data } = await admin.from("audit_events")
      .select("id,source,tool_name,provider,resource_type,resource_id,operation,result,created_at")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return toolResult({ events: data ?? [] });
  });

  return server;
}

app.post("/mcp", async (request, response) => {
  let server: McpServer | null = null;
  let transport: StreamableHTTPServerTransport | null = null;
  try {
    const context = await authenticate(request.headers.authorization);
    server = createServer(context);
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    response.on("close", () => { void transport?.close(); void server?.close(); });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (!response.headersSent) response.status(message === "UNAUTHORIZED" ? 401 : 400).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
  }
});

app.get("/mcp", (_request, response) => response.status(405).json({ error: "Use POST /mcp" }));

const port = Number(process.env.PORT ?? 3100);
app.listen(port, () => console.log(`MCP server listening on http://localhost:${port}`));
