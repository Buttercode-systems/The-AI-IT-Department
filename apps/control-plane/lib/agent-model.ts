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

export function agentModelName() {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

export async function completeAgent(messages: AgentMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: agentModelName(),
      messages,
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
