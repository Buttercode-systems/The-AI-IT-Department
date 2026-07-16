import { agentTools } from "./agent-tools";

export type AgentMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

type Completion = {
  choices?: Array<{ message?: AgentMessage }>;
  error?: { message?: string };
};

type ModelConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: "groq" | "vercel" | "openai";
};

function modelConfig(): ModelConfig {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return {
      apiKey: groqKey,
      baseUrl: "https://api.groq.com/openai/v1",
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      provider: "groq",
    };
  }

  const gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (gatewayToken) {
    return {
      apiKey: gatewayToken,
      baseUrl: "https://ai-gateway.vercel.sh/v1",
      model: process.env.AI_MODEL || "openai/gpt-5.5",
      provider: "vercel",
    };
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) throw new Error("MODEL_PROVIDER_NOT_CONFIGURED");
  return {
    apiKey: openAiKey,
    baseUrl: "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    provider: "openai",
  };
}

export function agentModelName() {
  try { return modelConfig().model; }
  catch { return process.env.GROQ_MODEL || process.env.AI_MODEL || process.env.OPENAI_MODEL || "llama-3.3-70b-versatile"; }
}

export async function completeAgent(messages: AgentMessage[]) {
  const config = modelConfig();
  // Groq's OpenAI-compatible endpoint currently rejects messages[].name.
  const providerMessages = config.provider === "groq"
    ? messages.map(({ name: _name, ...message }) => message)
    : messages;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: providerMessages,
      tools: agentTools,
      tool_choice: "auto",
      temperature: 0.2,
    }),
    cache: "no-store",
  });

  const payload = await response.json() as Completion;
  if (!response.ok) throw new Error(payload.error?.message || "MODEL_REQUEST_FAILED");
  const message = payload.choices?.[0]?.message;
  if (!message) throw new Error("MODEL_EMPTY_RESPONSE");
  return message;
}
