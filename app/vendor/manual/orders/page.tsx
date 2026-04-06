"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";
import { extractOrderNameFromNotes } from "@/lib/orderName";

type ManualRow = {
  id: string;
  status: string | null;
  total: number | null;
  notes: string | null;
  created_at: string;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function friendlyStatus(status: string | null) {
  const value = String(status ?? "").replace(/_/g, " ").trim();
  return value || "pending vendor";
}

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function VendorManualOrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<ManualRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("id,status,total,notes,created_at")
        .eq("vendor_id", user.id)
        .ilike("notes", "%[LOGI_DIRECT=1]%")
        .order("created_at", { ascending: false });

      if (error) {
        setMsg(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((((data ?? []) as ManualRow[]) || []).filter((row) => parseManualLogisticsNotes(row.notes).source === "vendor"));
      setLoading(false);
    })();
  }, [router]);

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">All manual orders</h1>
            <p className="mt-1 text-sm text-gray-600">Open any order to view details, copy the tracking link, or update status.</p>
          </div>
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/vendor/manual")}>
            Back
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        {loading ? <p className="text-sm text-gray-600">Loading...</p> : null}
        {!loading && msg ? <p className="text-sm text-red-600">{msg}</p> : null}
        {!loading && !msg && rows.length === 0 ? <p className="text-sm text-gray-600">No manual orders yet.</p> : null}

        {!loading && !msg && rows.length > 0 ? (
          <div className="grid gap-3">
            {rows.map((row) => {
              const manual = parseManualLogisticsNotes(row.notes);
              const orderName = extractOrderNameFromNotes(row.notes) || "Manual order";
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => router.push(`/vendor/manual/${row.id}`)}
                  className="rounded-2xl border p-4 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{orderName}</p>
                      <p className="mt-1 text-sm text-gray-600">{manual.customerName || "Customer"}</p>
                    </div>
                    <p className="font-semibold text-gray-900">{naira(Number(row.total ?? 0))}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500">
                    <span>{friendlyStatus(row.status)}</span>
                    <span>{fmtDate(row.created_at)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </main>
  );
}
