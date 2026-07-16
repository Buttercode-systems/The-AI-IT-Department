import { NextResponse } from "next/server";
import { decideAndExecuteApproval } from "../../../../lib/agent-approvals";
import { getUserOrganization, requireBearerUser } from "../../../../lib/api-auth";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { createRuntimeContext, recordUsage, safeErrorCode } from "../../../../lib/runtime-controls";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const runtime = createRuntimeContext();
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const rateLimit = await consumeRateLimit(organizationId, user.id, "approval_decision", 30, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { decision?: "approve" | "reject" };
    if (body.decision !== "approve" && body.decision !== "reject") {
      return NextResponse.json({ error: "DECISION_REQUIRED" }, { status: 400 });
    }

    const approval = await decideAndExecuteApproval(id, body.decision, { organizationId, userId: user.id });
    await recordUsage({
      organizationId,
      userId: user.id,
      eventType: body.decision === "approve" ? "approval_executed" : "approval_rejected",
      metadata: { approval_id: id, correlation_id: runtime.correlationId, tool_name: approval.tool_name, status: approval.status },
    });
    return NextResponse.json(
      { approval, correlation_id: runtime.correlationId },
      { headers: { "x-correlation-id": runtime.correlationId, "x-ratelimit-remaining": String(rateLimit.remaining), "x-ratelimit-reset": rateLimit.reset_at } },
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const message = ["UNAUTHORIZED", "APPROVAL_NOT_FOUND", "APPROVAL_ALREADY_CLAIMED", "APPROVAL_EXPIRED", "APPROVAL_PAYLOAD_CHANGED"].includes(raw) ? raw : safeErrorCode(error);
    const status = message === "UNAUTHORIZED" ? 401 : message === "APPROVAL_NOT_FOUND" ? 404 : ["APPROVAL_ALREADY_CLAIMED", "APPROVAL_EXPIRED", "APPROVAL_PAYLOAD_CHANGED"].includes(message) ? 409 : 400;
    console.error("approval_decision_failed", { correlationId: runtime.correlationId, code: message });
    return NextResponse.json({ error: message, correlation_id: runtime.correlationId }, { status, headers: { "x-correlation-id": runtime.correlationId } });
  }
}
