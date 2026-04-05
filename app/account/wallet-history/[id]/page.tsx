"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

type WalletHistoryItem = {
  id: string;
  amount: number | null;
  reference: string;
  provider: string | null;
  type: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

type RejectDetail = {
  orderId: string;
  orderType: string | null;
  foodMode: string | null;
  status: string | null;
  total: number | null;
  createdAt: string;
  reason: string;
  vendor: { full_name: string | null; phone: string | null; address: string | null } | null;
  customer: { full_name: string | null; phone: string | null; address: string | null } | null;
};

type PaymentOrderDetail = {
  orderId: string;
  orderType: string | null;
  foodMode: string | null;
  status: string | null;
  total: number | null;
  createdAt: string;
  vendor: { full_name: string | null; phone: string | null; address: string | null } | null;
};

type WithdrawDetail = {
  id: string;
  amount: number | null;
  status: string | null;
  reference: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function titleForType(type: string | null) {
  if (type === "rejected_refund") return "Rejected order refund";
  if (type === "topup") return "Bank funding";
  return "Wallet transaction";
}

export default function WalletHistoryDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [item, setItem] = useState<WalletHistoryItem | null>(null);
  const [rejectDetail, setRejectDetail] = useState<RejectDetail | null>(null);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrderDetail[]>([]);
  const [withdrawRequest, setWithdrawRequest] = useState<WithdrawDetail | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (!token) {
        router.replace("/auth/login?next=%2Faccount%2Fwallet-history");
        return;
      }

      const res = await fetch(`/api/wallet/history/${encodeURIComponent(String(params.id ?? ""))}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        item?: WalletHistoryItem;
        rejectOrder?: RejectDetail | null;
        paymentOrders?: PaymentOrderDetail[];
        withdrawRequest?: WithdrawDetail | null;
      } | null;
      if (!res.ok || !body?.ok || !body.item) {
        setMsg(body?.error ?? "Unable to load wallet history details.");
        setLoading(false);
        return;
      }

      setItem(body.item);
      setRejectDetail(body.rejectOrder ?? null);
      setPaymentOrders(body.paymentOrders ?? []);
      setWithdrawRequest(body.withdrawRequest ?? null);
      setLoading(false);
    })();
  }, [params.id, router]);

  return (
    <AppShell title="Wallet history details">
      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{item ? titleForType(item.type) : "Wallet history details"}</p>
            <p className="mt-1 text-sm text-gray-600">Full funding details for this wallet record.</p>
          </div>
          <button className="rounded-full border px-4 py-2 text-sm font-medium" type="button" onClick={() => router.push("/account/wallet-history")}>
            Back
          </button>
        </div>
      </div>

      {loading ? <div className="mt-4 rounded-3xl border bg-white p-5 text-sm text-gray-600 shadow-sm">Loading details...</div> : null}
      {!loading && msg ? <div className="mt-4 rounded-3xl border bg-white p-5 text-sm text-orange-600 shadow-sm">{msg}</div> : null}

      {!loading && !msg && item ? (
        <>
          <div className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Amount</p>
                <p className={`mt-2 text-xl font-semibold ${item.type === "payment" || item.type === "withdrawal_request" ? "text-red-600" : "text-emerald-700"}`}>
                  {item.type === "payment" || item.type === "withdrawal_request" ? "-" : "+"}{naira(Number(item.amount ?? 0))}
                </p>
              </div>
              <div className="rounded-2xl border p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Status</p>
                <p className="mt-2 text-xl font-semibold text-gray-900">{String(item.status ?? "-").replace(/_/g, " ")}</p>
              </div>
              <div className="rounded-2xl border p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Reference</p>
                <p className="mt-2 break-all text-sm text-gray-900">{item.reference}</p>
              </div>
              <div className="rounded-2xl border p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Created</p>
                <p className="mt-2 text-sm text-gray-900">{fmtDate(item.created_at)}</p>
              </div>
            </div>
          </div>

          {item.type === "topup" ? (
            <div className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-lg font-semibold">Funding details</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Funding type</p>
                  <p className="mt-2 text-sm text-gray-900">Payment gateway wallet funding</p>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Provider</p>
                  <p className="mt-2 text-sm text-gray-900">{item.provider ?? "-"}</p>
                </div>
                <div className="rounded-2xl border p-4 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Meaning</p>
                  <p className="mt-2 text-sm text-gray-900">This record shows money you added into your Dashbuy wallet through the payment gateway.</p>
                </div>
              </div>
            </div>
          ) : null}

          {item.type === "payment" ? (
            <div className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-lg font-semibold">Wallet payment details</p>
              {paymentOrders.length === 0 ? (
                <p className="mt-4 text-sm text-gray-600">No order details were found for this wallet payment.</p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {paymentOrders.map((order) => (
                    <div key={order.orderId} className="rounded-2xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-gray-900">{order.orderType ?? "Order"}{order.foodMode ? ` / ${order.foodMode}` : ""}</p>
                        <p className="font-semibold text-gray-900">{naira(Number(order.total ?? 0))}</p>
                      </div>
                      <div className="mt-2 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                        <p><span className="font-medium text-gray-900">Order ID:</span> {order.orderId}</p>
                        <p><span className="font-medium text-gray-900">Status:</span> {order.status ?? "-"}</p>
                        <p><span className="font-medium text-gray-900">Created:</span> {fmtDate(order.createdAt)}</p>
                        <p><span className="font-medium text-gray-900">Vendor:</span> {order.vendor?.full_name ?? "Vendor"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {item.type === "rejected_refund" && rejectDetail ? (
            <div className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-lg font-semibold">Rejected order details</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Order ID</p>
                  <p className="mt-2 break-all text-sm text-gray-900">{rejectDetail.orderId}</p>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Order status</p>
                  <p className="mt-2 text-sm text-gray-900">{rejectDetail.status ?? "-"}</p>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Order type</p>
                  <p className="mt-2 text-sm text-gray-900">{rejectDetail.orderType ?? "-"}{rejectDetail.foodMode ? ` / ${rejectDetail.foodMode}` : ""}</p>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Order total</p>
                  <p className="mt-2 text-sm text-gray-900">{naira(Number(rejectDetail.total ?? 0))}</p>
                </div>
                <div className="rounded-2xl border p-4 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Reason</p>
                  <p className="mt-2 text-sm text-gray-900">{rejectDetail.reason || "No reason recorded."}</p>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Vendor details</p>
                  <p className="mt-2 text-sm text-gray-900">{rejectDetail.vendor?.full_name ?? "Vendor"}</p>
                  <p className="mt-1 text-sm text-gray-600">{rejectDetail.vendor?.phone ?? "No phone"}</p>
                  <p className="mt-1 text-sm text-gray-600">{rejectDetail.vendor?.address ?? "No address"}</p>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Customer details</p>
                  <p className="mt-2 text-sm text-gray-900">{rejectDetail.customer?.full_name ?? "Customer"}</p>
                  <p className="mt-1 text-sm text-gray-600">{rejectDetail.customer?.phone ?? "No phone"}</p>
                  <p className="mt-1 text-sm text-gray-600">{rejectDetail.customer?.address ?? "No address"}</p>
                </div>
              </div>
            </div>
          ) : null}

          {item.type === "withdrawal_request" && withdrawRequest ? (
            <div className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-lg font-semibold">Withdrawal request details</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Bank name</p>
                  <p className="mt-2 text-sm text-gray-900">{withdrawRequest.bank_name ?? "-"}</p>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Account name</p>
                  <p className="mt-2 text-sm text-gray-900">{withdrawRequest.account_name ?? "-"}</p>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Account number</p>
                  <p className="mt-2 text-sm text-gray-900">{withdrawRequest.account_number ?? "-"}</p>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Status</p>
                  <p className="mt-2 text-sm text-gray-900">{withdrawRequest.status ?? "-"}</p>
                </div>
                <div className="rounded-2xl border p-4 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Note</p>
                  <p className="mt-2 text-sm text-gray-900">{withdrawRequest.note || "No note added."}</p>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
