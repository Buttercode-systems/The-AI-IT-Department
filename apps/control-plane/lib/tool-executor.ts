import { executeAgentTool } from "./agent-tools";
import { executeAutomationAgentTool, isAutomationAgentTool } from "./automation-agent-tools";

export async function executeConversationalTool(
  name: string,
  args: Record<string, unknown>,
  context: { organizationId: string; userId: string; conversationId: string },
) {
  if (isAutomationAgentTool(name)) {
    return executeAutomationAgentTool(name, args, { organizationId: context.organizationId, userId: context.userId });
  }
  return executeAgentTool(name, args, context);
}
