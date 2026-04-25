import { createClient } from "@supabase/supabase-js";

type Role = "customer" | "vendor_food" | "vendor_products" | "logistics" | "admin";

type PayoutRow = {
  id: string;
  amount: number | null;
  created_at: string;
  reference: string | null;
  order_id?: string | null;
  status?: string | null;
  type?: string | null;
  bank_name?: string | null;
  bank_code?: string | null;
  account_number?: string | null;
};

type OrderEarnRow = {
  subtotal: number | null;
  total: number | null;
  total_amount: number | null;
  delivery_fee: number | null;
};

type PayoutSummary = {
  role: Role;
  earned: number;
  paid: number;
  withdrawable: number;
  payouts: PayoutRow[];
};

function asNumber(x: unknown) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function anonClient() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const parts = h.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) return parts[1].trim();
  return "";
}

function commissionBase(order: OrderEarnRow) {
  const subtotal = asNumber(order.subtotal);
  if (subtotal > 0) return subtotal;
  const total = asNumber(order.total_amount ?? order.total);
  const delivery = asNumber(order.delivery_fee);
  return Math.max(0, total - delivery);
}

export async function requireActor(req: Request) {
  const token = readBearerToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing Authorization Bearer token" };
  }

  const anon = anonClient();
  const { data: authData, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !authData?.user) {
    return { ok: false as const, status: 401, error: "Not signed in" };
  }

  const a = adminClient();
  const { data: prof, error: profErr } = await a
    .from("profiles")
    .select("id,role")
    .eq("id", authData.user.id)
    .maybeSingle<{ id: string; role: Role }>();

  if (profErr) {
    return { ok: false as const, status: 500, error: "Profile error: " + profErr.message };
  }

  if (!prof) {
    return { ok: false as const, status: 404, error: "Profile not found" };
  }

  return { ok: true as const, actorId: prof.id, role: prof.role, admin: a };
}

export async function payoutSummaryForActor(actorId: string, role: Role): Promise<PayoutSummary> {
  const a = adminClient();
  const isVendor = role === "vendor_food" || role === "vendor_products" || role === "admin";
  const isLogistics = role === "logistics" || role === "admin";

  if (!isVendor && !isLogistics) {
    return { role, earned: 0, paid: 0, withdrawable: 0, payouts: [] };
  }

  let earned = 0;

  if (isVendor) {
    const { data: deliveredOrders, error: deliveredErr } = await a
      .from("orders")
      .select("subtotal,total,total_amount,delivery_fee")
      .eq("vendor_id", actorId)
      .eq("status", "delivered");

    if (deliveredErr) throw new Error("Delivered orders error: " + deliveredErr.message);

    earned = ((deliveredOrders ?? []) as OrderEarnRow[]).reduce((sum, o) => {
      const base = commissionBase(o);
      const net = Math.max(0, Math.round(base - base * 0.05));
      return sum + net;
    }, 0);
  } else {
    const { data: deliveredJobs, error: jobsErr } = await a
      .from("logistics_jobs")
      .select("order_id")
      .eq("status", "delivered");

    if (jobsErr) throw new Error("Delivered logistics jobs error: " + jobsErr.message);

    const orderIds = Array.from(
      new Set(((deliveredJobs ?? []) as Array<{ order_id: string }>).map((x) => x.order_id).filter(Boolean))
    );

    if (orderIds.length > 0) {
      const { data: orders, error: ordersErr } = await a
        .from("orders")
        .select("id,delivery_fee")
        .in("id", orderIds);

      if (ordersErr) throw new Error("Delivered orders lookup error: " + ordersErr.message);

      earned = ((orders ?? []) as Array<{ delivery_fee: number | null }>).reduce(
        (sum, o) => sum + asNumber(o.delivery_fee),
        0
      );
    }
  }

  const { data: payoutsRows, error: payoutsErr } = await a
    .from("vendor_payouts")
    .select("id,amount,created_at,reference,order_id,status,type,bank_name,bank_code,account_number")
    .eq("vendor_id", actorId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (payoutsErr) throw new Error("Payout history error: " + payoutsErr.message);

  const payouts = (payoutsRows ?? []) as PayoutRow[];
  const paid = payouts
    .filter((p) => {
      const status = String(p.status ?? "").toLowerCase();
      const type = String(p.type ?? "").toLowerCase();
      if (type === "emergency_request") return true;
      return status === "" || status === "initiated" || status === "successful" || status === "request_sent";
    })
    .reduce((sum, p) => sum + asNumber(p.amount), 0);
  const withdrawable = Math.max(0, earned - paid);

  return { role, earned, paid, withdrawable, payouts };
}
