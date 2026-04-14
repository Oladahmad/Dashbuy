import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  amount?: number | string;
  note?: string;
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

function formatNaira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fromAddress() {
  return (
    process.env.EMAIL_FROM ||
    process.env.NOTIFY_FROM_EMAIL ||
    process.env.MAIL_FROM ||
    "Dashbuy <onboarding@resend.dev>"
  );
}

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const actorId = authData.user.id;
    const body = ((await req.json().catch(() => null)) ?? {}) as Body;
    const amount = Math.floor(Number(body.amount ?? 0));
    const note = String(body.note ?? "").trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Enter a valid amount." }, { status: 400 });
    }

    const a = adminClient();
    const { data: profile, error: pErr } = await a
      .from("profiles")
      .select("id,role,full_name,phone,store_name,bank_name,bank_account_number,bank_account_name")
      .eq("id", actorId)
      .maybeSingle<{
        id: string;
        role: string | null;
        full_name: string | null;
        phone: string | null;
        store_name: string | null;
        bank_name: string | null;
        bank_account_number: string | null;
        bank_account_name: string | null;
      }>();

    if (pErr || !profile) return NextResponse.json({ ok: false, error: "Profile not found." }, { status: 404 });

    if (!["vendor_food", "vendor_products", "admin"].includes(String(profile.role ?? ""))) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
    }

    if (!profile.bank_name || !profile.bank_account_number || !profile.bank_account_name) {
      return NextResponse.json(
        { ok: false, error: "Please add your bank details first in Vendor Account page." },
        { status: 400 }
      );
    }

    const { data: userData } = await a.auth.admin.getUserById(actorId);
    const vendorEmail = userData.user?.email ?? "No email";
    const vendorName = profile.store_name || profile.full_name || "Vendor";

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY is not set." }, { status: 500 });

    const requestRef = `emergency_request_${actorId.slice(0, 8)}_${Date.now()}_${amount}`;
    const subject = `Emergency Withdrawal Request - ${vendorName}`;
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;padding:20px;background:#f7f7f7;">
        <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:14px;padding:20px;">
          <h2 style="margin:0 0 12px;">Emergency Withdrawal Request</h2>
          <p style="margin:0 0 16px;">A vendor submitted an emergency withdrawal request.</p>
          <div style="line-height:1.7;font-size:14px;color:#222;">
            <div><strong>Vendor:</strong> ${vendorName}</div>
            <div><strong>Vendor email:</strong> ${vendorEmail}</div>
            <div><strong>Phone:</strong> ${profile.phone ?? "Not set"}</div>
            <div><strong>Role:</strong> ${profile.role ?? "N/A"}</div>
            <hr style="margin:14px 0;border:none;border-top:1px solid #e5e5e5;" />
            <div><strong>Amount requested:</strong> ${formatNaira(amount)}</div>
            <div><strong>Bank:</strong> ${profile.bank_name}</div>
            <div><strong>Account number:</strong> ${profile.bank_account_number}</div>
            <div><strong>Account name:</strong> ${profile.bank_account_name}</div>
            ${note ? `<div><strong>Note:</strong> ${note}</div>` : ""}
          </div>
        </div>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: ["oladunjoyeahmad@gmail.com"],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: `Could not send request email: ${text}` }, { status: 500 });
    }

    const { error: logErr } = await a.from("vendor_payouts").insert({
      vendor_id: actorId,
      amount,
      reference: requestRef,
      type: "emergency_request",
      status: "request_sent",
      bank_name: profile.bank_name,
      account_number: profile.bank_account_number,
      account_name: profile.bank_account_name,
    });
    if (logErr) {
      return NextResponse.json({ ok: false, error: "Request logged mail but history log failed: " + logErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Emergency withdrawal request sent." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
