"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Image from "next/image";

type Mode = "request" | "update";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("request");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const recoveryHint =
      hash.includes("type=recovery") ||
      hash.includes("access_token=") ||
      search.includes("type=recovery") ||
      search.includes("access_token=");

    if (recoveryHint) setMode("update");

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update");
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const canSendReset = useMemo(() => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && !loading;
  }, [email, loading]);

  const canUpdate = useMemo(() => {
    return password.trim().length >= 6 && confirmPassword.trim().length >= 6 && !loading;
  }, [password, confirmPassword, loading]);

  async function onSendReset(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const nextEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setMsg("Enter a valid email address.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(nextEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Reset link sent. Check your inbox or spam, then open the link to set a new password.");
  }

  async function onUpdatePassword(e: React.FormEvent) {
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

    setMsg("Password updated successfully. Redirecting to sign in...");
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
          {mode === "request"
            ? "Enter your email first. We will send a secure reset link."
            : "Set your new password below."}
        </p>

        {mode === "request" ? (
          <form className="mt-5 space-y-3" onSubmit={onSendReset}>
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
              />
            </div>

            {msg ? (
              <p className={`text-sm ${msg.includes("Reset link sent") ? "text-green-700" : "text-red-600"}`}>{msg}</p>
            ) : null}

            <button
              className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
              disabled={!canSendReset}
              type="submit"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>

            <button
              className="w-full rounded-xl border px-4 py-3 text-sm"
              onClick={() => router.push("/auth/login")}
              type="button"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={onUpdatePassword}>
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
              disabled={!canUpdate}
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
        )}
      </div>
    </main>
  );
}
