import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkMessage(message: string | null | undefined) {
  const text = (message ?? "").toLowerCase();
  return (
    text.includes("fetch failed") ||
    text.includes("connect timeout") ||
    text.includes("tls") ||
    text.includes("ssl") ||
    text.includes("socket") ||
    text.includes("other side closed") ||
    text.includes("bad record mac") ||
    text.includes("timeout")
  );
}

async function retryOperation(
  fn: () => Promise<{ data: unknown; error: { message?: string | null } | null }>,
  attempts = 3
) {
  let last = await fn();

  for (let i = 0; i < attempts; i++) {
    const res = i === 0 ? last : await fn();
    last = res;
    if (!res.error) return res;
    if (!isTransientNetworkMessage(res.error.message)) return res;
    if (i < attempts - 1) {
      await sleep(250 * (i + 1));
    }
  }
  return last;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
    }

    const authRes = await retryOperation(() => supabaseAdmin.auth.getUser(token), 4);
    const authData = authRes.data as { user?: { id: string } | null } | null;
    const authErr = authRes.error;
    if (authErr || !authData?.user) {
      if (isTransientNetworkMessage(authErr?.message)) {
        return NextResponse.json(
          { ok: false, error: "Temporary Supabase network issue. Please retry." },
          { status: 503 }
        );
      }
      return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    }

    const userId = authData.user.id;
    const profileRes = await retryOperation(
      async () =>
        await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle<{ role: string }>(),
      3
    );
    const profile = profileRes.data as { role: string } | null;
    const profileErr = profileRes.error;
    if (profileErr) {
      if (isTransientNetworkMessage(profileErr.message)) {
        return NextResponse.json(
          { ok: false, error: "Temporary Supabase network issue. Please retry." },
          { status: 503 }
        );
      }
      return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
    }
    if ((profile?.role ?? "") !== "admin") {
      return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const requestsRes = await retryOperation(
      async () =>
        await supabaseAdmin
          .from("custom_food_requests")
          .select("id,order_id,restaurant_name,plate_name,plate_fee,items_subtotal,total_amount,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      3
    );
    const requests = (requestsRes.data as Array<{ id: string; order_id: string }> | null) ?? [];
    const requestsErr = requestsRes.error;
    if (requestsErr) {
      if (isTransientNetworkMessage(requestsErr.message)) {
        return NextResponse.json(
          { ok: false, error: "Temporary Supabase network issue. Please retry." },
          { status: 503 }
        );
      }
      return NextResponse.json({ ok: false, error: requestsErr.message }, { status: 500 });
    }

    const orderIds = requests.map((r) => r.order_id).filter(Boolean);
    let orderDeliveryFee: Array<{
      id: string;
      delivery_fee: number | null;
      subtotal: number | null;
      total: number | null;
      status: string | null;
      notes: string | null;
    }> = [];
    if (orderIds.length > 0) {
      const orderRowsRes = await retryOperation(
        async () =>
          await supabaseAdmin
            .from("orders")
            .select("id,delivery_fee,subtotal,total,status,notes")
            .in("id", orderIds),
        3
      );
      const orderRows = orderRowsRes.data as Array<{
        id: string;
        delivery_fee: number | null;
        subtotal: number | null;
        total: number | null;
        status: string | null;
        notes: string | null;
      }> | null;
      const orderRowsErr = orderRowsRes.error;
      if (orderRowsErr) {
        if (isTransientNetworkMessage(orderRowsErr.message)) {
          return NextResponse.json(
            { ok: false, error: "Temporary Supabase network issue. Please retry." },
            { status: 503 }
          );
        }
        return NextResponse.json({ ok: false, error: orderRowsErr.message }, { status: 500 });
      }
      orderDeliveryFee = orderRows ?? [];
    }

    const requestIds = requests.map((r) => r.id);
    let items: Array<{
      id: string;
      request_id: string;
      food_name: string;
      units: number;
      unit_price: number;
      line_total: number;
    }> = [];
    if (requestIds.length > 0) {
      const rowsRes = await retryOperation(
        async () =>
          await supabaseAdmin
            .from("custom_food_request_items")
            .select("id,request_id,food_name,units,unit_price,line_total")
            .in("request_id", requestIds)
            .order("id", { ascending: true }),
        3
      );
      const rows = rowsRes.data as
        | Array<{
            id: string;
            request_id: string;
            food_name: string;
            units: number;
            unit_price: number;
            line_total: number;
          }>
        | null;
      const rowsErr = rowsRes.error;
      if (rowsErr) {
        if (isTransientNetworkMessage(rowsErr.message)) {
          return NextResponse.json(
            { ok: false, error: "Temporary Supabase network issue. Please retry." },
            { status: 503 }
          );
        }
        return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });
      }
      items = rows ?? [];
    }

    return NextResponse.json({ ok: true, requests, items, orderDeliveryFee });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
