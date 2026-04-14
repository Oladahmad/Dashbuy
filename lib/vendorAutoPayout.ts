import { createClient } from "@supabase/supabase-js";
import { findSquadBankByName } from "@/lib/squadBanks";
import { squadLookupAccount, squadRequeryTransfer, squadTransfer } from "@/lib/squad";
import { sendTransactionalEmail, simpleEmailLayout } from "@/lib/mailer";

type OrderRow = {
  id: string;
  vendor_id: string;
  subtotal: number | null;
  total: number | null;
  total_amount: number | null;
  delivery_fee: number | null;
};

type VendorProfile = {
  id: string;
  bank_code?: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  store_name: string | null;
  full_name: string | null;
};

type PayoutResult =
  | {
      ok: true;
      skipped?: boolean;
      message?: string;
      amount?: number;
      reference?: string;
      vendorName?: string;
      status?: string;
    }
  | { ok: false; error: string; amount?: number; reference?: string; vendorName?: string; status?: string };

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function asNumber(x: unknown) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function commissionBase(order: OrderRow) {
  const subtotal = asNumber(order.subtotal);
  if (subtotal > 0) return subtotal;
  const total = asNumber(order.total_amount ?? order.total);
  const delivery = asNumber(order.delivery_fee);
  return Math.max(0, total - delivery);
}

function vendorNetAmount(order: OrderRow) {
  const base = commissionBase(order);
  return Math.max(0, Math.round(base - base * 0.05));
}

function payoutReference(orderId: string) {
  const merchantId = String(process.env.SQUAD_MERCHANT_ID ?? "").trim();
  if (!merchantId) throw new Error("SQUAD_MERCHANT_ID missing in env");
  const compact = orderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
  return `${merchantId}_pickup_${compact}`;
}

export async function triggerVendorPickupPayout(orderId: string) {
  const a = adminClient();

  const { data: order, error: orderErr } = await a
    .from("orders")
    .select("id,vendor_id,subtotal,total,total_amount,delivery_fee")
    .eq("id", orderId)
    .maybeSingle<OrderRow>();

  if (orderErr) return { ok: false as const, error: "Order lookup failed: " + orderErr.message };
  if (!order?.vendor_id) return { ok: false as const, error: "Order vendor not found" };

  const amount = vendorNetAmount(order);
  if (amount <= 0) {
    return { ok: false as const, error: "No payout amount available for this order", amount };
  }

  const reference = payoutReference(order.id);
  const { data: existing } = await a
    .from("vendor_payouts")
    .select("id,reference,order_id")
    .or(`reference.eq.${reference},order_id.eq.${order.id}`)
    .maybeSingle<{ id: string; reference: string | null }>();

  if (existing?.id) {
    return {
      ok: true as const,
      skipped: true as const,
      message: "Vendor payout already recorded for this order",
      amount,
      reference,
      status: "initiated",
    };
  }

  const { data: vendor, error: vendorErr } = await a
    .from("profiles")
    .select("id,bank_code,bank_name,bank_account_number,bank_account_name,store_name,full_name")
    .eq("id", order.vendor_id)
    .maybeSingle<VendorProfile>();

  if (vendorErr) return { ok: false as const, error: "Vendor profile lookup failed: " + vendorErr.message, amount, reference };
  if (!vendor) return { ok: false as const, error: "Vendor profile not found", amount, reference };

  const bankName = String(vendor.bank_name ?? "").trim();
  const accountNumber = String(vendor.bank_account_number ?? "").trim();
  const accountName = String(vendor.bank_account_name ?? "").trim();

  if (!bankName || !accountNumber || !accountName) {
    return { ok: false as const, error: "Vendor bank details are incomplete", amount, reference, vendorName: String(vendor.store_name ?? vendor.full_name ?? "Vendor") };
  }

  const matchedBank = String(vendor.bank_code ?? "").trim()
    ? { code: String(vendor.bank_code).trim(), name: bankName }
    : findSquadBankByName(bankName);
  if (!matchedBank?.code) {
    return {
      ok: false as const,
      error: `Vendor bank is not mapped for Squad payout yet: ${bankName}`,
      amount,
      reference,
      vendorName: String(vendor.store_name ?? vendor.full_name ?? "Vendor"),
    };
  }

  const lookup = await squadLookupAccount(matchedBank.code, accountNumber);
  if (!lookup.ok || !lookup.json?.data?.account_name) {
    return {
      ok: false as const,
      error: lookup.json?.message ?? "Squad account lookup failed",
      amount,
      reference,
      vendorName: String(vendor.store_name ?? vendor.full_name ?? "Vendor"),
    };
  }

  const resolvedAccountName = String(lookup.json.data.account_name).trim();
  const transfer = await squadTransfer({
    transactionReference: reference,
    amountKobo: amount * 100,
    bankCode: matchedBank.code,
    accountNumber,
    accountName: resolvedAccountName || accountName,
    remark: `Dashbuy payout ${order.id.slice(0, 8)}`,
  });

  if (!transfer.ok) {
    const failedRef =
      String(transfer.json?.data?.transaction_reference ?? reference).trim() || reference;
    const { error: insertFailedErr } = await a.from("vendor_payouts").insert({
      vendor_id: order.vendor_id,
      order_id: order.id,
      amount,
      reference,
      type: "pickup_auto_payout",
      status: "failed",
      bank_name: bankName,
      bank_code: matchedBank.code,
      account_number: accountNumber,
      squad_transfer_reference: failedRef,
      squad_requery_status: String(transfer.json?.message ?? "failed"),
    });
    if (insertFailedErr) {
      return { ok: false as const, error: "Vendor payout save failed: " + insertFailedErr.message, amount, reference, vendorName: String(vendor.store_name ?? vendor.full_name ?? "Vendor"), status: "failed" };
    }
    return {
      ok: false as const,
      error: transfer.json?.message ?? "Squad transfer failed",
      amount,
      reference: failedRef,
      vendorName: String(vendor.store_name ?? vendor.full_name ?? "Vendor"),
      status: "failed",
    };
  }

  const requery = await squadRequeryTransfer(reference);
  const requeryStatus = String(
    requery.json?.data?.transaction_status ?? requery.json?.message ?? (requery.ok ? "successful" : requery.status === 404 ? "initiated" : "unknown")
  ).trim();
  if (!requery.ok && requery.status !== 404) {
    const { error: insertErr } = await a.from("vendor_payouts").insert({
      vendor_id: order.vendor_id,
      order_id: order.id,
      amount,
      reference,
      type: "pickup_auto_payout",
      status: "initiated",
      bank_name: bankName,
      bank_code: matchedBank.code,
      account_number: accountNumber,
      squad_transfer_reference: String(transfer.json?.data?.transaction_reference ?? reference).trim() || reference,
      squad_requery_status: requeryStatus,
    });
    if (insertErr) {
      return { ok: false as const, error: "Vendor payout save failed: " + insertErr.message, amount, reference, vendorName: String(vendor.store_name ?? vendor.full_name ?? "Vendor"), status: "initiated" };
    }
    return {
      ok: true as const,
      amount,
      reference,
      status: "initiated",
      vendorName: String(vendor.store_name ?? vendor.full_name ?? "Vendor"),
      message: `Vendor payout of N${amount.toLocaleString()} initiated successfully`,
    };
  }

  const finalReference =
    String(
      requery.json?.data?.nip_transaction_reference ??
        transfer.json?.data?.nip_transaction_reference ??
        transfer.json?.data?.transaction_reference ??
        reference
    ).trim() || reference;

  const normalizedStatus = /reverse/i.test(requeryStatus)
    ? "reversed"
    : /fail/i.test(requeryStatus)
      ? "failed"
      : requery.status === 404
        ? "initiated"
        : "successful";

  const { error: insertErr } = await a.from("vendor_payouts").insert({
    vendor_id: order.vendor_id,
    order_id: order.id,
    amount,
    reference,
    type: "pickup_auto_payout",
    status: normalizedStatus,
    bank_name: bankName,
    bank_code: matchedBank.code,
    account_number: accountNumber,
    squad_transfer_reference: finalReference,
    squad_requery_status: requeryStatus,
  });

  if (insertErr) {
    return { ok: false as const, error: "Vendor payout save failed: " + insertErr.message, amount, reference: finalReference, vendorName: String(vendor.store_name ?? vendor.full_name ?? "Vendor"), status: normalizedStatus };
  }

  const result: PayoutResult = {
    ok: true as const,
    amount,
    reference: finalReference,
    message: `Vendor payout of N${amount.toLocaleString()} initiated successfully`,
    vendorName: String(vendor.store_name ?? vendor.full_name ?? "Vendor"),
    status: normalizedStatus,
  };

  await sendVendorPayoutAlertEmail({
    orderId: order.id,
    result,
    bankName,
    bankCode: matchedBank.code,
    accountNumber,
  });

  return result;
}

async function sendVendorPayoutAlertEmail(params: {
  orderId: string;
  result: PayoutResult;
  bankName: string;
  bankCode: string;
  accountNumber: string;
}) {
  const to = process.env.ADMIN_ALERT_EMAIL || process.env.ADMIN_EMAIL || "oladunjoyeahmad@gmail.com";
  if (!to) return;

  const vendorName = String(params.result.vendorName ?? "Vendor");
  const amountText = typeof params.result.amount === "number" ? `N${params.result.amount.toLocaleString()}` : "N/A";
  const shortRef = String(params.result.reference ?? "").slice(0, 18) || "N/A";
  const status = String(params.result.status ?? (params.result.ok ? "initiated" : "failed"));
  const title = `Vendor payout ${params.result.ok ? "update" : "failed"} - ${vendorName}`;
  const body = `
    <p>A vendor payout was triggered from logistics pickup.</p>
    <p><strong>Vendor:</strong> ${vendorName}</p>
    <p><strong>Order ID:</strong> ${params.orderId}</p>
    <p><strong>Amount:</strong> ${amountText}</p>
    <p><strong>Status:</strong> ${status}</p>
    <p><strong>Reference:</strong> ${shortRef}</p>
    <p><strong>Bank:</strong> ${params.bankName}</p>
    <p><strong>Bank code:</strong> ${params.bankCode}</p>
    <p><strong>Account number:</strong> ${params.accountNumber}</p>
    <p><strong>Provider message:</strong> ${params.result.ok ? params.result.message ?? "Payout request accepted." : params.result.error}</p>
  `;

  try {
    await sendTransactionalEmail(to, title, simpleEmailLayout("Vendor payout update", body));
  } catch (error) {
    console.warn("Vendor payout email failed:", error);
  }
}
