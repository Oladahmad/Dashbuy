import { createClient } from "@supabase/supabase-js";

type VerifyResult = { ok: boolean; error?: string; already?: boolean };

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function creditWalletFromPaystack({
  customerId,
  amount,
  reference,
}: {
  customerId: string;
  amount: number;
  reference: string;
}): Promise<VerifyResult> {
  return creditWalletTransaction({
    customerId,
    amount,
    reference,
    provider: "paystack",
  });
}

export async function creditWalletTransaction({
  customerId,
  amount,
  reference,
  provider,
}: {
  customerId: string;
  amount: number;
  reference: string;
  provider: string;
}): Promise<VerifyResult> {
  const a = adminClient();

  const { data: existing } = await a
    .from("wallet_transactions")
    .select("id,status")
    .eq("reference", reference)
    .maybeSingle<{ id: string; status: string | null }>();

  if (existing && (existing.status ?? "").toLowerCase() === "success") {
    return { ok: true, already: true };
  }

  if (!existing) {
    await a.from("wallet_transactions").insert({
      customer_id: customerId,
      amount,
      reference,
      provider,
      type: "topup",
      status: "success",
    });
  } else {
    await a.from("wallet_transactions").update({ status: "success" }).eq("reference", reference);
  }

  const { data: walletRow } = await a
    .from("customer_wallets")
    .select("balance")
    .eq("customer_id", customerId)
    .maybeSingle<{ balance: number | null }>();
  const current = Number(walletRow?.balance ?? 0);
  const next = current + Number(amount || 0);

  await a
    .from("customer_wallets")
    .upsert({ customer_id: customerId, balance: next }, { onConflict: "customer_id" });

  return { ok: true };
}
