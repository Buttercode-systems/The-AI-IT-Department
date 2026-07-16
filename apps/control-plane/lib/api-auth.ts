import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./server-supabase";

export async function requireBearerUser(request: Request): Promise<User> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("UNAUTHORIZED");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return data.user;
}

export async function getUserOrganization(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .single();
  if (error || !data) throw new Error("WORKSPACE_REQUIRED");
  return data.organization_id as string;
}
