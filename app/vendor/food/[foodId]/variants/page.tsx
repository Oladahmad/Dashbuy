"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";

type Variant = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
};

export default function VariantsPage() {
  const params = useParams();
  const router = useRouter();

  const foodId = params.foodId as string;

  const [variants, setVariants] = useState<Variant[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [msg, setMsg] = useState("Loading...");

  async function load() {
    const { data, error } = await supabase
      .from("food_item_variants")
      .select("id,name,price,is_available")
      .eq("food_item_id", foodId)
      .order("price", { ascending: true });

    if (error) {
      setMsg("Error: " + error.message);
      return;
    }

    setVariants(data ?? []);
    setMsg("");
  }

  useEffect(() => {
    if (foodId) load();
  }, [foodId]);

  async function addVariant() {
    if (!name.trim()) {
      setMsg("Variant name is required");
      return;
    }

    setMsg("Saving...");

    const { error } = await supabase.from("food_item_variants").insert({
      food_item_id: foodId,
      name: name.trim(),
      price,
      is_available: true,
    });

    if (error) {
      setMsg("Error: " + error.message);
      return;
    }

    setName("");
    setPrice(0);
    await load();
    setMsg("Added ✅");
  }

  async function toggleVariant(id: string, current: boolean) {
    const { error } = await supabase
      .from("food_item_variants")
      .update({ is_available: !current })
      .eq("id", id);

    if (error) {
      setMsg("Error: " + error.message);
      return;
    }

    await load();
  }

  return (
    <main className="p-6 max-w-xl">
      <button className="text-sm underline" onClick={() => router.back()}>
        ← Back
      </button>

      <h1 className="mt-3 text-2xl font-bold">Manage Variants</h1>

      {msg && <p className="mt-2 text-sm">{msg}</p>}

      <section className="mt-4 rounded border p-4">
        <h2 className="font-semibold">Add variant</h2>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <input
            className="rounded border p-2"
            placeholder="Name (e.g. ₦1500 / Small)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="rounded border p-2"
            type="number"
            placeholder="Price"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </div>

        <button
          className="mt-3 rounded bg-black px-4 py-2 text-white"
          onClick={addVariant}
        >
          Add
        </button>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Variants</h2>

        {variants.length === 0 ? (
          <p className="mt-2 text-gray-600">No variants yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {variants.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded border p-3"
              >
                <div>
                  <p className="font-semibold">{v.name}</p>
                  <p className="text-sm text-gray-600">₦{v.price}</p>
                </div>

                <button
                  className="rounded border px-3 py-1"
                  onClick={() => toggleVariant(v.id, v.is_available)}
                >
                  {v.is_available ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
