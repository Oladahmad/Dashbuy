"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Image from "next/image";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return password.trim().length >= 6 && confirmPassword.trim().length >= 6 && !loading;
  }, [password, confirmPassword, loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const nextPassword = password.trim();
    const nextConfirm = confirmPassword.trim();

    if (nextPassword.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }

    if (nextPassword !== nextConfirm) {
      setMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Password updated successfully. You can continue into Dashbuy.");
    setPassword("");
    setConfirmPassword("");
    setTimeout(() => router.replace("/auth/login"), 1200);
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-center">
          <Image src="/logo.png" alt="Dashbuy" width={64} height={64} className="h-16 w-auto" />
        </div>

        <h1 className="mt-4 text-center text-xl font-bold sm:text-2xl">Reset password</h1>
        <p className="mt-1 text-center text-sm text-gray-600">
          Enter your new password to regain access to Dashbuy.
        </p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium">New password</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              type="password"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Confirm password</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              type="password"
            />
          </div>

          {msg ? (
            <p className={`text-sm ${msg.includes("successfully") ? "text-green-700" : "text-red-600"}`}>{msg}</p>
          ) : null}

          <button
            className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            disabled={!canSubmit}
            type="submit"
          >
            {loading ? "Updating..." : "Update password"}
          </button>

          <button
            className="w-full rounded-xl border px-4 py-3 text-sm"
            onClick={() => router.push("/auth/login")}
            type="button"
          >
            Back to sign in
          </button>
        </form>
      </div>
    </main>
  );
}
