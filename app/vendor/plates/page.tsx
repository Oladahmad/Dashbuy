"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Vendor = { id: string; name: string };

type Plate = {
  id: string;
  name: string;
  plate_fee: number;
  is_active: boolean;
};

export default function VendorPlatesPage() {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [plates, setPlates] = useState<Plate[]>([]);
  const [msg, setMsg] = useState("Loading...");

  const [name, setName] = useState("");
  const [fee, setFee] = useState<number>(0);

  async function load() {
    setMsg("Loading...");

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      setMsg("Please login first at /auth");
      return;
    }

    const { data: v, error: vErr } = await supabase
      .from("vendors")
      .select("id,name")
      .eq("owner_id", userId)
      .single();

    if (vErr || !v) {
      setMsg("No vendor profile found. Go and create vendor profile");
      return;
    }

    setVendor(v);

    const { data: p, error: pErr } = await supabase
      .from("plate_templates")
      .select("id,name,plate_fee,is_active")
      .eq("vendor_id", v.id)
      .order("plate_fee", { ascending: true });

    if (pErr) {
      setMsg("Error loading plates: " + pErr.message);
      return;
    }

    setPlates(p ?? []);
    setMsg("");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function addPlate() {
    if (!vendor) return;

    if (!name.trim()) {
      setMsg("Plate name is required");
      return;
    }

    setMsg("Saving...");

    const { error } = await supabase.from("plate_templates").insert({
      vendor_id: vendor.id,
      name: name.trim(),
      plate_fee: fee,
      is_active: true,
    });

    if (error) {
      setMsg("Error: " + error.message);
      return;
    }

    setName("");
    setFee(0);
    await load();
    setMsg("Added ✅");
  }

  async function toggleActive(id: string, current: boolean) {
    const { error } = await supabase
      .from("plate_templates")
      .update({ is_active: !current })
      .eq("id", id);

    if (error) {
      setMsg("Error: " + error.message);
      return;
    }

    await load();
  }

  if (msg.startsWith("Loading")) return <main className="p-6">{msg}</main>;

  return (
    <main className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Plate Templates</h1>

      {vendor && (
        <p className="mt-1 text-sm text-gray-600">
          Vendor: <strong>{vendor.name}</strong>
        </p>
      )}

      {msg && <p className="mt-3 text-sm">{msg}</p>}

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Add plate</h2>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <input
            className="rounded border p-2"
            placeholder="Plate name (e.g. Standard plate)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="rounded border p-2"
            type="number"
            placeholder="Plate fee (₦)"
            value={fee}
            onChange={(e) => setFee(Number(e.target.value))}
          />
        </div>

        <button
          className="mt-3 rounded bg-black px-4 py-2 text-white"
          onClick={addPlate}
        >
          Add plate
        </button>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Your plates</h2>

        {plates.length === 0 ? (
          <p className="mt-2 text-gray-600">No plates yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {plates.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border p-3"
              >
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-gray-600">₦{p.plate_fee}</p>
                </div>

                <button
                  className="rounded border px-3 py-1"
                  onClick={() => toggleActive(p.id, p.is_active)}
                >
                  {p.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
