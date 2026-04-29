import { supabaseAdmin } from "@/lib/supabaseAdmin";

type VendorRole = "vendor_food" | "admin";

export type VendorActor = {
  userId: string;
  role: VendorRole;
};

export async function requireVendorActor(req: Request): Promise<VendorActor> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    const error = new Error("Missing Authorization Bearer token");
    error.name = "AuthError";
    throw error;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error("Invalid session");
    authError.name = "AuthError";
    throw authError;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .maybeSingle<{ id: string; role: string | null }>();

  if (profileError) throw new Error("Profile error: " + profileError.message);

  const role = (profile?.role ?? "customer").toLowerCase();
  if (role !== "vendor_food" && role !== "admin") {
    const roleError = new Error("Vendor access required");
    roleError.name = "RoleError";
    throw roleError;
  }

  return {
    userId: data.user.id,
    role: role as VendorRole,
  };
}
