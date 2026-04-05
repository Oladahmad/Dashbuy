import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  amount?: number | string;
  note?: string;
};

type ReqRow = {
  amount: number | null;
  status: string | null;
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

function fromAddress() {
  return (
    process.env.EMAIL_FROM ||
    process.env.NOTIFY_FROM_EMAIL ||
    process.env.MAIL_FROM ||
    "Dashbuy <onboarding@resend.dev>"
  );
}

function formatNaira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function clean(s: string) {
  return s.trim();
}

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const customerId = authData.user.id;
    const body = ((await req.json().catch(() => null)) ?? {}) as Body;
    const bankName = clean(String(body.bankName ?? ""));
    const accountNumber = clean(String(body.accountNumber ?? ""));
    const accountName = clean(String(body.accountName ?? ""));
    const amount = Math.floor(Number(body.amount ?? 0));
    const note = clean(String(body.note ?? ""));

    if (!bankName) return NextResponse.json({ ok: false, error: "Bank name is required." }, { status: 400 });
    if (!accountName) return NextResponse.json({ ok: false, error: "Account name is required." }, { status: 400 });
    if (!accountNumber || accountNumber.length < 10) {
      return NextResponse.json({ ok: false, error: "Enter a valid account number." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Enter a valid amount." }, { status: 400 });
    }

    const a = adminClient();
    const { data: profile } = await a
      .from("profiles")
      .select("id,full_name,phone")
      .eq("id", customerId)
      .maybeSingle<{ id: string; full_name: string | null; phone: string | null }>();

    const { data: walletRow } = await a
      .from("customer_wallets")
      .select("balance")
      .eq("customer_id", customerId)
      .maybeSingle<{ balance: number | null }>();
    const walletBalance = Number(walletRow?.balance ?? 0);

    const { data: reqRows } = await a
      .from("customer_withdraw_requests")
      .select("amount,status")
      .eq("customer_id", customerId);
    const reserved = ((reqRows as ReqRow[] | null) ?? [])
      .filter((r) => ["pending", "approved", "processing"].includes(String(r.status ?? "").toLowerCase()))
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const available = Math.max(0, walletBalance - reserved);

    if (amount > available) {
      return NextResponse.json(
        { ok: false, error: `Amount is above your available wallet balance (${formatNaira(available)}).` },
        { status: 400 }
      );
    }

    const requestRef = `cust_withdraw_${customerId.slice(0, 8)}_${Date.now()}_${amount}`;
    const { error: logErr } = await a.from("customer_withdraw_requests").insert({
      customer_id: customerId,
      amount,
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName,
      note: note || null,
      status: "pending",
      reference: requestRef,
    });

    if (logErr) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not save withdrawal request. If table is missing, run the SQL setup for customer_withdraw_requests.",
        },
        { status: 500 }
      );
    }

    const resendKey = process.env.RESEND_API_KEY;
    const adminMail = process.env.ADMIN_ALERT_EMAIL || process.env.ADMIN_EMAIL || "oladunjoyeahmad@gmail.com";
    if (resendKey && adminMail) {
      const subject = `Customer quick withdrawal request - ${requestRef}`;
      const html = `
        <div style="font-family:Segoe UI,Arial,sans-serif;background:#f7f7f7;padding:20px;">
          <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px;">
            <h2 style="margin:0 0 12px;">Customer quick withdrawal request</h2>
            <p style="margin:0 0 16px;">A customer submitted a withdrawal request after order rejection.</p>
            <div style="font-size:14px;line-height:1.7;color:#222;">
              <div><strong>Customer:</strong> ${profile?.full_name ?? "Customer"}</div>
              <div><strong>Phone:</strong> ${profile?.phone ?? "Not set"}</div>
              <div><strong>Customer ID:</strong> ${customerId}</div>
              <hr style="margin:14px 0;border:none;border-top:1px solid #e5e7eb;" />
              <div><strong>Amount:</strong> ${formatNaira(amount)}</div>
              <div><strong>Bank:</strong> ${bankName}</div>
              <div><strong>Account number:</strong> ${accountNumber}</div>
              <div><strong>Account name:</strong> ${accountName}</div>
              ${note ? `<div><strong>Note:</strong> ${note}</div>` : ""}
              <div><strong>Reference:</strong> ${requestRef}</div>
            </div>
          </div>
        </div>
      `;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [adminMail],
          subject,
          html,
        }),
      });
    }

    return NextResponse.json({ ok: true, message: "Withdrawal request submitted." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
