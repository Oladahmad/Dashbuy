"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { formatAuthError, formatProfileSaveError } from "@/lib/authError";

export default function UserSignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSignup() {
    setLoading(true);
    setMsg(null);

    const emailRedirectTo = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          role: "customer",
          full_name: fullName,
          phone,
          address,
        },
      },
    });

    setLoading(false);

    if (error) {
      setMsg(formatAuthError(error.message));
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setMsg("Signup succeeded but user id was not returned. Try signing in after verify.");
      return;
    }

    const res = await fetch("/api/auth/ensure-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        role: "customer",
        fullName: fullName.trim(),
        phone: phone.trim(),
        address: address.trim(),
      }),
    });

    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setMsg(formatProfileSaveError(json?.error));
      return;
    }

    setMsg("Account created. Check your email to verify, then sign in.");
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-center">
          <Image src="/logo.png" alt="Dashbuy" width={64} height={64} className="h-16 w-auto" />
        </div>

      <h1 className="mt-4 text-center text-xl font-bold sm:text-2xl">Create user account</h1>
        <p className="mt-1 text-center text-sm text-gray-600">
          This account is for customers only.
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <label className="text-sm font-medium">Full name</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Phone</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Address</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Email</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>

          <div>
            <label className="text-sm font-medium">Password</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          </div>

          {msg ? <p className={`text-sm ${msg.includes("Check your email") ? "text-green-700" : "text-red-600"}`}>{msg}</p> : null}

          <button
            className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            onClick={onSignup}
            disabled={loading || !fullName || !phone || !address || !email || !password}
          >
            {loading ? "Creating..." : "Create account"}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button className="underline" type="button" onClick={() => router.push("/")}>
              Back
            </button>
            <a className="underline" href="/auth/login?mode=user">
              Sign in
            </a>
          </div>

          <div className="mt-3 rounded-xl border p-4 text-sm">
            <p className="font-semibold">Want to sell on Dashbuy</p>
            <a className="mt-2 inline-block underline" href="/auth/vendor-signup">
              Create vendor account
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
