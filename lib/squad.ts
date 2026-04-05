type SquadInitParams = {
  amountKobo: number;
  email: string;
  transactionRef: string;
  callbackUrl: string;
  customerName?: string;
  metadata?: Record<string, unknown>;
  paymentChannels?: string[];
};

type SquadVerifyResponse = {
  status?: number;
  success?: boolean;
  message?: string;
  data?: {
    transaction_amount?: number;
    transaction_ref?: string;
    transaction_status?: string;
    transaction_currency_id?: string;
    gateway_transaction_ref?: string;
    transaction_type?: string;
    created_at?: string;
  };
};

function squadBaseUrl() {
  return (process.env.SQUAD_BASE_URL || "https://sandbox-api-d.squadco.com").replace(/\/+$/, "");
}

function squadSecretKey() {
  const key = process.env.SQUAD_SECRET_KEY || "";
  if (!key) throw new Error("SQUAD_SECRET_KEY missing in env");
  return key;
}

export async function squadInitiatePayment(params: SquadInitParams) {
  const res = await fetch(`${squadBaseUrl()}/transaction/initiate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${squadSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountKobo,
      email: params.email,
      currency: "NGN",
      initiate_type: "inline",
      transaction_ref: params.transactionRef,
      callback_url: params.callbackUrl,
      customer_name: params.customerName || undefined,
      payment_channels: params.paymentChannels && params.paymentChannels.length > 0 ? params.paymentChannels : undefined,
      metadata: params.metadata || undefined,
    }),
  });

  const json = (await res.json().catch(() => null)) as
    | {
        status?: number;
        success?: boolean;
        message?: string;
        data?: { checkout_url?: string; transaction_ref?: string };
      }
    | null;

  return {
    ok: res.ok && !!json?.data?.checkout_url,
    status: res.status,
    json,
  };
}

export async function squadVerifyTransaction(reference: string) {
  const res = await fetch(`${squadBaseUrl()}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${squadSecretKey()}`,
      "Content-Type": "application/json",
    },
  });

  const json = (await res.json().catch(() => null)) as SquadVerifyResponse | null;
  return { ok: res.ok && !!json?.success, status: res.status, json };
}

