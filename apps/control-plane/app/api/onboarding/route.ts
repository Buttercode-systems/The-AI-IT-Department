import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../lib/server-supabase";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const { data, error } = await createSupabaseAdminClient().from("business_profiles").select("business_type,user_role,timezone,communication_style,operating_context,onboarding_completed_at").eq("organization_id", organizationId).single();
    if (error) throw error;
    return NextResponse.json({ profile: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const body = await request.json() as {
      business_type?: string;
      user_role?: string;
      timezone?: string;
      communication_style?: string;
      typical_customers?: string;
      working_hours?: string;
      important_rules?: string;
    };
    const required = [body.business_type, body.user_role, body.timezone].every((value) => typeof value === "string" && value.trim().length >= 2);
    if (!required) return NextResponse.json({ error: "ONBOARDING_FIELDS_REQUIRED" }, { status: 400 });
    const { data, error } = await createSupabaseAdminClient().from("business_profiles").update({
      business_type: body.business_type?.trim(),
      user_role: body.user_role?.trim(),
      timezone: body.timezone?.trim(),
      communication_style: body.communication_style?.trim() || "clear and professional",
      operating_context: {
        typical_customers: body.typical_customers?.trim() || null,
        working_hours: body.working_hours?.trim() || null,
        important_rules: body.important_rules?.trim() || null,
      },
      onboarding_completed_at: new Date().toISOString(),
    }).eq("organization_id", organizationId).select("*").single();
    if (error || !data) throw new Error("ONBOARDING_SAVE_FAILED");
    await createSupabaseAdminClient().from("audit_events").insert({ organization_id: organizationId, actor_user_id: user.id, source: "control_plane", tool_name: "complete_onboarding", resource_type: "business_profile", operation: "update", result: "success" });
    return NextResponse.json({ profile: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
