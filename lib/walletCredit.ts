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
  type = "topup",
}: {
  customerId: string;
  amount: number;
  reference: string;
  provider: string;
  type?: string;
}): Promise<VerifyResult> {
  try {
    const a = adminClient();

    const { data: existing, error: existingErr } = await a
    .from("wallet_transactions")
    .select("id,status")
    .eq("reference", reference)
    .maybeSingle<{ id: string; status: string | null }>();
    if (existingErr) return { ok: false, error: existingErr.message };

    if (existing && (existing.status ?? "").toLowerCase() === "success") {
      return { ok: true, already: true };
    }

    if (!existing) {
      const { error: insertErr } = await a.from("wallet_transactions").insert({
        customer_id: customerId,
        amount,
        reference,
        provider,
        type,
        status: "success",
      });
      if (insertErr) return { ok: false, error: insertErr.message };
    } else {
      const { error: updateTxErr } = await a
        .from("wallet_transactions")
        .update({ status: "success", provider, type })
        .eq("reference", reference);
      if (updateTxErr) return { ok: false, error: updateTxErr.message };
    }

    const { data: walletRow, error: walletErr } = await a
      .from("customer_wallets")
      .select("balance")
      .eq("customer_id", customerId)
      .maybeSingle<{ balance: number | null }>();
    if (walletErr) return { ok: false, error: walletErr.message };

    const current = Number(walletRow?.balance ?? 0);
    const next = current + Number(amount || 0);

    const { error: walletUpsertErr } = await a
      .from("customer_wallets")
      .upsert({ customer_id: customerId, balance: next }, { onConflict: "customer_id" });
    if (walletUpsertErr) return { ok: false, error: walletUpsertErr.message };

    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Wallet credit failed" };
  }
}
