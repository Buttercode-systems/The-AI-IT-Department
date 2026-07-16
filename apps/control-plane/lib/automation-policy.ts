const MUTATING_TOOLS = new Set([
  "create_gmail_draft",
  "save_memory",
  "forget_memory",
  "propose_send_email",
  "propose_create_calendar_event",
  "propose_update_calendar_event",
  "propose_delete_calendar_event",
  "propose_share_drive_file",
  "create_automation",
  "pause_automation",
  "resume_automation",
  "delete_automation",
]);

export type AutomationApprovalMode = "always_ask" | "read_only_only";

export function automationToolAllowed(toolName: string, approvalMode: AutomationApprovalMode) {
  if (approvalMode === "read_only_only") return !MUTATING_TOOLS.has(toolName);
  return true;
}

export function isMutatingAutomationTool(toolName: string) {
  return MUTATING_TOOLS.has(toolName);
}
