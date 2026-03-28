"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type VendorProfile = {
  id: string;
  store_name: string | null;
  full_name: string | null;
  store_address: string | null;
  address: string;
  logo_url: string | null;
};

type Plate = {
  id: string;
  name: string;
  plate_fee: number;
  is_active: boolean;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function vendorName(v: VendorProfile | null) {
  const store = (v?.store_name || "").trim();
  if (store) return store;
  const full = (v?.full_name || "").trim();
  if (full) return full;
  return "Vendor";
}

function vendorArea(v: VendorProfile | null) {
  const storeAddr = (v?.store_address || "").trim();
  if (storeAddr) return storeAddr;
  const addr = (v?.address || "").trim();
  if (addr) return addr;
  return "Ago";
}

export default function VendorPlateSelectPage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [plates, setPlates] = useState<Plate[]>([]);
  const [msg, setMsg] = useState("Loading...");

  useEffect(() => {
    (async () => {
      setMsg("Loading...");

      if (!vendorId) {
        setMsg("Vendor not found");
        return;
      }

      const res = await fetch(`/api/catalog/food/vendor/${vendorId}`, { cache: "no-store" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        vendor?: VendorProfile | null;
        plates?: Plate[];
      };

      if (!res.ok || !body.ok || !body.vendor) {
        setVendor(null);
        setPlates([]);
        setMsg(body.error ?? "Vendor not found");
        return;
      }

      setVendor(body.vendor);
      setPlates(Array.isArray(body.plates) ? body.plates : []);
      setMsg("");
    })();
  }, [vendorId]);

  if (msg) return <main className="p-6">{msg}</main>;

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <button
        type="button"
        className="rounded-xl border px-3 py-2 text-sm"
        onClick={() => router.push("/food")}
      >
        Back
      </button>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{vendorName(vendor)}</h1>
            <p className="mt-1 text-sm text-gray-600">{vendorArea(vendor)}</p>
            <p className="mt-2 text-xs text-gray-500">Select a plate to continue.</p>
          </div>

          {vendor?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vendor.logo_url}
              alt={vendorName(vendor)}
              className="h-12 w-12 shrink-0 rounded-xl border object-cover"
            />
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="text-base font-semibold">Available plates</h2>

        {plates.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No plates available for this vendor yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {plates.map((p) => (
              <a
                key={p.id}
                href={`/food/vendors/${vendorId}/build-plate?plateId=${p.id}`}
                className="rounded-xl border px-4 py-3 hover:bg-gray-50"
              >
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 text-sm text-gray-600">Plate fee: {naira(Number(p.plate_fee || 0))}</p>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
