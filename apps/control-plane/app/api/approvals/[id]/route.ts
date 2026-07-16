import { NextResponse } from "next/server";
import { decideAndExecuteApproval } from "../../../../lib/agent-approvals";
import { getUserOrganization, requireBearerUser } from "../../../../lib/api-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { decision?: "approve" | "reject" };
    if (body.decision !== "approve" && body.decision !== "reject") {
      return NextResponse.json({ error: "DECISION_REQUIRED" }, { status: 400 });
    }
    const approval = await decideAndExecuteApproval(id, body.decision, { organizationId, userId: user.id });
    return NextResponse.json({ approval });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "UNAUTHORIZED" ? 401 : message === "APPROVAL_NOT_FOUND" ? 404 : message === "APPROVAL_ALREADY_CLAIMED" ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
