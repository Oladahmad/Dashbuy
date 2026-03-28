"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Plate = {
  id: string;
  name: string;
  plate_fee: number;
  is_active: boolean;
};

export default function VendorPlatesPage() {
  const [plates, setPlates] = useState<Plate[]>([]);
  const [msg, setMsg] = useState("Loading...");

  const [name, setName] = useState("");
  const [fee, setFee] = useState("");

  async function getCurrentVendorId() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  function explainPlateError(message: string) {
    if (message.includes("plate_templates.vendor_id")) {
      return "Database update needed: add vendor_id column to plate_templates first.";
    }
    return message;
  }

  async function load() {
    setMsg("Loading...");

    const userId = await getCurrentVendorId();
    if (!userId) {
      setMsg("Please login first at /auth");
      return;
    }

    const { data: p, error: pErr } = await supabase
      .from("plate_templates")
      .select("id,name,plate_fee,is_active")
      .eq("vendor_id", userId)
      .order("plate_fee", { ascending: true });

    if (pErr) {
      setMsg("Error loading plates: " + explainPlateError(pErr.message));
      return;
    }

    setPlates(p ?? []);
    setMsg("");
  }

  useEffect(() => {
    void load();
  }, []);

  async function addPlate() {
    if (!name.trim()) {
      setMsg("Plate name is required");
      return;
    }

    const feeValue = Number(fee.trim());
    if (!fee.trim() || !Number.isFinite(feeValue) || feeValue < 0) {
      setMsg("Enter a valid plate fee");
      return;
    }

    setMsg("Saving...");

    const userId = await getCurrentVendorId();
    if (!userId) {
      setMsg("Please login first at /auth");
      return;
    }

    const { error } = await supabase.from("plate_templates").insert({
      vendor_id: userId,
      name: name.trim(),
      plate_fee: feeValue,
      is_active: true,
    });

    if (error) {
      setMsg("Error: " + explainPlateError(error.message));
      return;
    }

    setName("");
    setFee("");
    await load();
    setMsg("Plate added.");
  }

  async function toggleActive(id: string, current: boolean) {
    const userId = await getCurrentVendorId();
    if (!userId) {
      setMsg("Please login first at /auth");
      return;
    }

    const { error } = await supabase
      .from("plate_templates")
      .update({ is_active: !current })
      .eq("id", id)
      .eq("vendor_id", userId);

    if (error) {
      setMsg("Error: " + explainPlateError(error.message));
      return;
    }

    await load();
  }

  if (msg.startsWith("Loading")) {
    return (
      <main className="rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-600">{msg}</p>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <section className="rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-600">Plate templates</p>
        <h1 className="text-base font-semibold">Create delivery plate options</h1>
      </section>

      {msg ? (
        <section className="rounded-2xl border bg-white p-4">
          <p className="text-sm">{msg}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold">Add plate</h2>
        <p className="mt-1 text-sm text-gray-600">
          Set a name and fee customers will see when building a plate.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-xl border px-3 py-3 text-sm"
            placeholder="Plate name (e.g. Standard plate)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="rounded-xl border px-3 py-3 text-sm"
            type="text"
            inputMode="numeric"
            placeholder="Plate fee (e.g. 200)"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </div>

        <button
          className="mt-3 w-full rounded-xl bg-black px-4 py-3 text-sm text-white sm:w-auto"
          onClick={addPlate}
          type="button"
        >
          Add plate
        </button>
      </section>

      <section className="rounded-2xl border bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Available plates</h2>
          <p className="text-sm text-gray-600">{plates.length}</p>
        </div>

        {plates.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No plates yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {plates.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-gray-600">N{Number(p.plate_fee || 0).toLocaleString()}</p>
                </div>

                <button
                  className="rounded-lg border px-3 py-1.5 text-sm"
                  onClick={() => toggleActive(p.id, p.is_active)}
                  type="button"
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
