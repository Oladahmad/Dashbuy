import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { creditWalletFromPaystack } from "@/lib/walletCredit";

type Body = {
  kind?: "order" | "wallet";
  id?: string;
  action?: "mark_paid" | "credit_wallet" | "ignore";
};

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing Authorization Bearer token" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle<{ role: string | null }>();
    if ((profile?.role ?? "") !== "admin") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const kind = body?.kind;
    const id = body?.id;
    const action = body?.action;
    if (!kind || !id || !action) {
      return NextResponse.json({ ok: false, error: "Missing request data" }, { status: 400 });
    }

    if (kind === "order") {
      const { data: row } = await supabaseAdmin
        .from("order_dedicated_accounts")
        .select("id,order_ids,amount,last_paid_amount,last_reference")
        .eq("id", id)
        .maybeSingle<{ id: string; order_ids: string[]; amount: number; last_paid_amount: number | null; last_reference: string | null }>();
      if (!row) return NextResponse.json({ ok: false, error: "Order mismatch not found" }, { status: 404 });

      if (action === "mark_paid") {
        const orderIds = Array.isArray(row.order_ids) ? row.order_ids : [];
        if (orderIds.length > 0) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "pending_vendor", paystack_reference: row.last_reference ?? null })
            .in("id", orderIds);
        }
        await supabaseAdmin
          .from("order_dedicated_accounts")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", id);
        return NextResponse.json({ ok: true });
      }

      if (action === "ignore") {
        await supabaseAdmin.from("order_dedicated_accounts").update({ status: "ignored" }).eq("id", id);
        return NextResponse.json({ ok: true });
      }
    }

    if (kind === "wallet") {
      const { data: row } = await supabaseAdmin
        .from("wallet_dedicated_accounts")
        .select("id,customer_id,amount,last_paid_amount,last_reference")
        .eq("id", id)
        .maybeSingle<{
          id: string;
          customer_id: string;
          amount: number;
          last_paid_amount: number | null;
          last_reference: string | null;
        }>();
      if (!row) return NextResponse.json({ ok: false, error: "Wallet mismatch not found" }, { status: 404 });

      if (action === "credit_wallet") {
        const paidAmount = Number(row.last_paid_amount ?? 0);
        const reference = row.last_reference ?? `wallet_mismatch_${row.id}`;
        if (paidAmount > 0) {
          await creditWalletFromPaystack({ customerId: row.customer_id, amount: paidAmount, reference });
        }
        await supabaseAdmin
          .from("wallet_dedicated_accounts")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", id);
        return NextResponse.json({ ok: true });
      }

      if (action === "ignore") {
        await supabaseAdmin.from("wallet_dedicated_accounts").update({ status: "ignored" }).eq("id", id);
        return NextResponse.json({ ok: true });
      }
    }

    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

