import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  orderId?: string;
  orderIds?: string[];
};

type OrderRow = {
  id: string;
  customer_id: string;
  status: string | null;
  total: number | null;
};

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
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

function asText(x: unknown) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Customer", last: "Dashbuy" };
  if (parts.length === 1) return { first: parts[0], last: "Dashbuy" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function createPaystackCustomer(params: {
  secret: string;
  email: string;
  first: string;
  last: string;
  phone?: string;
  customerId: string;
}) {
  const res = await fetch("https://api.paystack.co/customer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      first_name: params.first,
      last_name: params.last,
      phone: params.phone || undefined,
      metadata: { customerId: params.customerId },
    }),
  });
  const json = await res.json();
  if (!res.ok || !json?.status) {
    return { ok: false as const, error: json?.message ?? "Failed to create customer" };
  }
  return { ok: true as const, customerCode: String(json?.data?.customer_code ?? "") };
}

async function createDedicatedAccount(params: {
  secret: string;
  customerCode: string;
  preferredBank: string;
  first: string;
  last: string;
  phone?: string;
}) {
  const res = await fetch("https://api.paystack.co/dedicated_account", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer: params.customerCode,
      preferred_bank: params.preferredBank,
      first_name: params.first,
      last_name: params.last,
      phone: params.phone || undefined,
    }),
  });
  const json = await res.json();
  return { res, json };
}

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json(
        { ok: false, error: "Invalid session (token missing/expired). Please login again." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const orderIds = Array.from(
      new Set(
        [
          asText(body?.orderId).trim(),
          ...(Array.isArray(body?.orderIds) ? body!.orderIds.map((x) => asText(x).trim()) : []),
        ].filter(Boolean)
      )
    );
    if (orderIds.length === 0) return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });

    const a = adminClient();
    const { data: orders, error: ordersErr } = await a
      .from("orders")
      .select("id,customer_id,status,total")
      .in("id", orderIds);
    if (ordersErr) return NextResponse.json({ ok: false, error: ordersErr.message }, { status: 500 });
    const rows = (orders as OrderRow[] | null) ?? [];
    if (rows.length !== orderIds.length) {
      return NextResponse.json({ ok: false, error: "One or more orders not found" }, { status: 404 });
    }

    const customerId = authData.user.id;
    const invalidOwner = rows.find((o) => o.customer_id !== customerId);
    if (invalidOwner) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });

    const invalidStatus = rows.find((o) => String(o.status ?? "") !== "pending_payment");
    if (invalidStatus) {
      return NextResponse.json({ ok: false, error: "One or more orders are not pending payment" }, { status: 400 });
    }

    const total = rows.reduce((sum, o) => sum + Number(o.total ?? 0), 0);
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ ok: false, error: "Order total is invalid" }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY missing in env" }, { status: 500 });

    const { data: profile } = await a
      .from("profiles")
      .select("full_name,phone")
      .eq("id", customerId)
      .maybeSingle<{ full_name: string | null; phone: string | null }>();

    const { data: userData } = await a.auth.admin.getUserById(customerId);
    const email = userData.user?.email || "";
    if (!email) return NextResponse.json({ ok: false, error: "Missing customer email" }, { status: 400 });

    const fullName = String(profile?.full_name ?? "").trim();
    const phone = String(profile?.phone ?? "").trim();
    const { first, last } = splitName(fullName || "Customer Dashbuy");

    // Check existing pending DVA for this exact order set
    const { data: existing } = await a
      .from("order_dedicated_accounts")
      .select("id,account_number,account_name,bank_name,amount,status")
      .eq("customer_id", customerId)
      .eq("status", "pending")
      .contains("order_ids", orderIds)
      .maybeSingle();

    if (existing?.account_number) {
      return NextResponse.json({
        ok: true,
        account_number: existing.account_number,
        account_name: existing.account_name,
        bank_name: existing.bank_name,
        amount: Number(existing.amount ?? total),
      });
    }

    // Ensure Paystack customer exists
    let customerCode = "";
    const { data: customerRow } = await a
      .from("paystack_customers")
      .select("customer_code")
      .eq("customer_id", customerId)
      .maybeSingle<{ customer_code: string }>();
    const preferredBank = process.env.PAYSTACK_DVA_BANK || "titan-paystack";
    if (customerRow?.customer_code) {
      customerCode = customerRow.customer_code;
    } else {
      const created = await createPaystackCustomer({ secret, email, first, last, phone, customerId });
      if (!created.ok || !created.customerCode) {
        return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
      }
      customerCode = created.customerCode;
      await a.from("paystack_customers").upsert(
        { customer_id: customerId, customer_code: customerCode, email },
        { onConflict: "customer_id" }
      );
    }

    let { res: dvaRes, json: dvaJson } = await createDedicatedAccount({
      secret,
      customerCode,
      preferredBank,
      first,
      last,
      phone,
    });
    const dvaErrorMsg = String(dvaJson?.message ?? "");
    if (!dvaRes.ok || !dvaJson?.status) {
      const shouldRetry = dvaErrorMsg.toLowerCase().includes("customer not found");
      if (!shouldRetry) {
        return NextResponse.json({ ok: false, error: dvaJson?.message ?? "Failed to create virtual account" }, { status: 400 });
      }
      const created = await createPaystackCustomer({ secret, email, first, last, phone, customerId });
      if (!created.ok || !created.customerCode) {
        return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
      }
      customerCode = created.customerCode;
      await a.from("paystack_customers").upsert(
        { customer_id: customerId, customer_code: customerCode, email },
        { onConflict: "customer_id" }
      );
      const retry = await createDedicatedAccount({
        secret,
        customerCode,
        preferredBank,
        first,
        last,
        phone,
      });
      dvaRes = retry.res;
      dvaJson = retry.json;
      if (!dvaRes.ok || !dvaJson?.status) {
        return NextResponse.json({ ok: false, error: dvaJson?.message ?? "Failed to create virtual account" }, { status: 400 });
      }
    }

    const accountNumber = String(dvaJson?.data?.account_number ?? "");
    const accountName = String(dvaJson?.data?.account_name ?? "");
    const bankName = String(dvaJson?.data?.bank?.name ?? "");
    const dedicatedId = Number(dvaJson?.data?.id ?? 0);

    await a.from("order_dedicated_accounts").insert({
      customer_id: customerId,
      order_ids: orderIds,
      amount: total,
      status: "pending",
      account_number: accountNumber,
      account_name: accountName,
      bank_name: bankName,
      provider: "paystack",
      paystack_customer_code: customerCode,
      paystack_dedicated_id: dedicatedId || null,
    });

    return NextResponse.json({
      ok: true,
      account_number: accountNumber,
      account_name: accountName,
      bank_name: bankName,
      amount: total,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
