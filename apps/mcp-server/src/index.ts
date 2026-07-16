import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "the-ai-it-department-mcp",
    version: "0.1.0",
  });
});

function createServer(): McpServer {
  const server = new McpServer({
    name: "The AI IT Department",
    version: "0.1.0",
  });

  server.registerTool(
    "get_setup_state",
    {
      title: "Get setup state",
      description: "Returns the authenticated business workspace onboarding state.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            stage: "discovery",
            profileComplete: false,
            progressPercent: 10,
            connections: [],
            blockers: [],
            nextAction: "Complete the business profile.",
          }),
        },
      ],
      structuredContent: {
        stage: "discovery",
        profileComplete: false,
        progressPercent: 10,
        connections: [],
        blockers: [],
        nextAction: "Complete the business profile.",
      },
    }),
  );

  server.registerTool(
    "save_business_profile",
    {
      title: "Save business profile",
      description: "Validates and saves the business discovery answers.",
      inputSchema: {
        businessName: z.string().min(2).max(120),
        industry: z.string().min(2).max(80),
        primaryRole: z.string().min(2).max(80),
        teamSize: z.enum(["solo", "2-10", "11-50", "51-200", "200+"]),
        timezone: z.string().min(1).default("Africa/Johannesburg"),
        desiredOutcomes: z.array(z.string().min(2).max(120)).min(1).max(8),
      },
    },
    async (profile) => ({
      content: [
        {
          type: "text",
          text: `Business profile accepted for ${profile.businessName}. Google Workspace is the first recommended connection.`,
        },
      ],
      structuredContent: {
        saved: true,
        profile,
        recommendedConnections: ["google"],
        nextAction: "Connect Google Workspace.",
      },
    }),
  );

  server.registerTool(
    "get_connection_link",
    {
      title: "Connect a business account",
      description: "Creates a short-lived link for the authenticated user to connect their own provider account.",
      inputSchema: {
        provider: z.literal("google"),
      },
    },
    async ({ provider }) => {
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const nonce = randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const url = new URL(`/connect/${provider}`, appUrl);
      url.searchParams.set("nonce", nonce);

      return {
        content: [
          {
            type: "text",
            text: `Open the secure connection page to link ${provider}. The link expires in 10 minutes.`,
          },
        ],
        structuredContent: { provider, url: url.toString(), expiresAt },
      };
    },
  );

  return server;
}

app.post("/mcp", async (request, response) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({});

  response.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error("MCP request failed", error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_request, response) => {
  response.status(405).json({ error: "Use POST /mcp" });
});

const port = Number(process.env.PORT ?? 3100);
app.listen(port, () => {
  console.log(`MCP server listening on http://localhost:${port}`);
});
