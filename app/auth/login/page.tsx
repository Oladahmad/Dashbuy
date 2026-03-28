"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { formatLoginError } from "@/lib/authError";

type Role = "customer" | "vendor_food" | "vendor_products" | "logistics" | "admin";
type LoginFieldErrors = { email?: string; password?: string };

function LoginPageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const modeParam = useMemo(() => sp.get("mode") || "user", [sp]);
  const nextParam = useMemo(() => sp.get("next") || "", [sp]);
  const [mode, setMode] = useState<"user" | "vendor">(modeParam === "vendor" ? "vendor" : "user");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  function validateLogin() {
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const errors: LoginFieldErrors = {};
    if (!cleanEmail) errors.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errors.email = "Enter a valid email address.";
    if (!cleanPassword) errors.password = "Enter your password.";
    else if (cleanPassword.length < 6) errors.password = "Password must be at least 6 characters.";
    return errors;
  }

  async function onSignIn() {
    const errors = validateLogin();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMsg(null);
      return;
    }

    setLoading(true);
    setMsg(null);
    setFieldErrors({});

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (error) {
      setLoading(false);
      setMsg(formatLoginError(error.message));
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setLoading(false);
      setMsg("Could not read user id after sign in.");
      return;
    }

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle<{ role: Role }>();

    if (pErr) {
      setLoading(false);
      setMsg(`Profile error: ${pErr.message}`);
      return;
    }

    const role: Role = (profile?.role ?? "customer") as Role;
    const safeNext =
      nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";

    // Logistics always goes to logistics dashboard
    if (role === "logistics") {
      router.replace("/logistics");
      return;
    }

    // Vendor mode: only vendors and admin can enter vendor area
    if (mode === "vendor") {
      const isVendor = role === "vendor_food" || role === "vendor_products" || role === "admin";
      if (!isVendor) {
        setLoading(false);
        setMsg("This account is not a vendor. Switch to User mode.");
        await supabase.auth.signOut();
        return;
      }
      router.replace(role === "admin" ? "/admin/custom-food-requests" : "/vendor");
      return;
    }

    // User mode: customers go home, admin goes to admin area
    if (role === "admin") {
      router.replace("/admin/custom-food-requests");
      return;
    }

    router.replace(safeNext || "/");
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-center">
          <Image src="/logo.png" alt="Dashbuy" width={64} height={64} className="h-16 w-auto" />
        </div>

      <h1 className="mt-4 text-center text-xl font-bold sm:text-2xl">Sign in</h1>
        <p className="mt-1 text-center text-sm text-gray-600">Select user or vendor mode, then sign in.</p>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border p-1">
          <button
            className={`rounded-lg px-3 py-2 text-sm ${mode === "user" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setMode("user")}
            type="button"
          >
            User
          </button>
          <button
            className={`rounded-lg px-3 py-2 text-sm ${mode === "vendor" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setMode("vendor")}
            type="button"
          >
            Vendor
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              placeholder="you@example.com"
              type="email"
            />
            {fieldErrors.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
          </div>

          <div>
            <label className="text-sm font-medium">Password</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border px-3 py-2">
                <input
                  className="w-full outline-none"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder="Enter password"
                  type={showPw ? "text" : "password"}
                />
              <button
                type="button"
                className="text-sm text-gray-600"
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            {fieldErrors.password ? <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p> : null}
          </div>

          {msg ? <p className="text-sm text-red-600">{msg}</p> : null}

          <button
            className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            onClick={onSignIn}
            disabled={loading || !email || !password}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="rounded-xl border bg-gray-50 px-3 py-3">
            <p className="text-xs text-gray-600">Forgot your password?</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-sm text-gray-800">Reset it securely and continue.</p>
              <a
                className="shrink-0 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
                href="/auth/reset-password"
              >
                Reset password
              </a>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <a className="underline" href="/auth/signup">
              Create account
            </a>
            <a className="underline" href="/auth/vendor-signup">
              Vendor signup
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white flex items-center justify-center p-6"><div className="w-full max-w-md rounded-2xl border bg-white p-6 text-sm text-gray-600">Loading login...</div></main>}>
      <LoginPageInner />
    </Suspense>
  );
}
