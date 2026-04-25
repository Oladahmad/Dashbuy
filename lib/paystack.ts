type PaystackInitializeParams = {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
  name?: string;
};

type PaystackResponse<T> = {
  status?: boolean;
  message?: string;
  data?: T;
};

type PaystackTransferStatus = "success" | "failed" | "pending" | "processing" | "queued" | "reversed";

function paystackSecretKey() {
  const key = String(process.env.PAYSTACK_SECRET_KEY ?? "").trim();
  if (!key) throw new Error("PAYSTACK_SECRET_KEY missing in env");
  return key;
}

async function paystackFetch<T>(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paystackSecretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json().catch(() => null)) as PaystackResponse<T> | null;
  return {
    ok: res.ok && !!json?.status,
    status: res.status,
    json,
  };
}

export async function paystackInitializeTransaction(params: PaystackInitializeParams) {
  return paystackFetch<{
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata ?? undefined,
      channels: params.channels && params.channels.length > 0 ? params.channels : undefined,
      ...(params.name ? { name: params.name } : {}),
    }),
  });
}

export async function paystackVerifyTransaction(reference: string) {
  return paystackFetch<{
    status?: string;
    amount?: number;
    currency?: string;
    paid_at?: string;
    reference?: string;
    metadata?: Record<string, unknown>;
    gateway_response?: string;
    customer?: { customer_code?: string };
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export async function paystackListBanks() {
  return paystackFetch<Array<{ name?: string; code?: string; active?: boolean }>>("/bank?country=nigeria&currency=NGN");
}

export async function paystackResolveAccount(bankCode: string, accountNumber: string) {
  const query = `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;
  return paystackFetch<{ account_name?: string; account_number?: string }>(query);
}

export async function paystackCreateTransferRecipient(params: {
  accountName: string;
  accountNumber: string;
  bankCode: string;
}) {
  return paystackFetch<{ recipient_code?: string; name?: string }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: params.accountName,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: "NGN",
    }),
  });
}

export async function paystackInitiateTransfer(params: {
  amountKobo: number;
  recipientCode: string;
  reference: string;
  reason: string;
}) {
  return paystackFetch<{
    transfer_code?: string;
    reference?: string;
    status?: PaystackTransferStatus | string;
  }>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: params.amountKobo,
      recipient: params.recipientCode,
      reason: params.reason,
      reference: params.reference,
    }),
  });
}
