import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyOrderEvent } from "@/lib/orderNotifications";
import { upsertRiderMapInNotes } from "@/lib/manualLogistics";

type JobStatus = "pending_pickup" | "picked_up" | "delivered" | "cancelled";

type Body = {
  jobId?: string;
  nextStatus?: JobStatus;
  riderMapUrl?: string;
};

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function anonClient() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const parts = h.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) return parts[1].trim();
  return "";
}

function toOrderStatus(next: JobStatus) {
  if (next === "picked_up") return "picked_up";
  if (next === "delivered") return "delivered";
  if (next === "pending_pickup") return "pending_pickup";
  return "cancelled";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const jobId = String(body.jobId ?? "").trim();
    const nextStatus = String(body.nextStatus ?? "").trim() as JobStatus;
    const riderMapUrl = String(body.riderMapUrl ?? "").trim();

    if (!jobId) {
      return NextResponse.json({ ok: false, error: "Missing jobId" }, { status: 400 });
    }

    if (!["pending_pickup", "picked_up", "delivered", "cancelled"].includes(nextStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid nextStatus" }, { status: 400 });
    }
    if (riderMapUrl && !/^https?:\/\//i.test(riderMapUrl)) {
      return NextResponse.json(
        { ok: false, error: "Rider link must start with http:// or https://" },
        { status: 400 }
      );
    }

    const token = readBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    const actorId = authData.user.id;
    const a = adminClient();

    const { data: prof, error: profErr } = await a
      .from("profiles")
      .select("id,role")
      .eq("id", actorId)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ ok: false, error: "Profile error: " + profErr.message }, { status: 500 });
    }

    const role = String(prof?.role ?? "");
    if (role !== "logistics" && role !== "admin") {
      return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
    }

    const { data: job, error: jobErr } = await a
      .from("logistics_jobs")
      .select("id,order_id,status,vendor_id,customer_id,order_total,order_type")
      .eq("id", jobId)
      .maybeSingle<{
        id: string;
        order_id: string;
        status: JobStatus;
        vendor_id: string;
        customer_id: string;
        order_total: number | null;
        order_type: string | null;
      }>();

    if (jobErr) {
      return NextResponse.json({ ok: false, error: "Job error: " + jobErr.message }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    if (job.status === "pending_pickup" && nextStatus !== "picked_up") {
      return NextResponse.json({ ok: false, error: "Invalid transition from pending_pickup" }, { status: 400 });
    }
    if (job.status === "picked_up" && nextStatus !== "delivered") {
      return NextResponse.json({ ok: false, error: "Invalid transition from picked_up" }, { status: 400 });
    }
    if (job.status === "delivered") {
      return NextResponse.json({ ok: false, error: "Job already delivered" }, { status: 400 });
    }

    const { error: updateJobErr } = await a
      .from("logistics_jobs")
      .update({ status: nextStatus })
      .eq("id", jobId);

    if (updateJobErr) {
      return NextResponse.json({ ok: false, error: "Update job error: " + updateJobErr.message }, { status: 500 });
    }

    const { data: existingOrder, error: existingOrderErr } = await a
      .from("orders")
      .select("id,notes")
      .eq("id", job.order_id)
      .maybeSingle<{ id: string; notes: string | null }>();

    if (existingOrderErr || !existingOrder) {
      return NextResponse.json(
        { ok: false, error: "Order read error: " + (existingOrderErr?.message ?? "Order not found") },
        { status: 500 }
      );
    }

    const orderStatus = toOrderStatus(nextStatus);
    const nextNotes = riderMapUrl
      ? upsertRiderMapInNotes(existingOrder.notes, riderMapUrl)
      : existingOrder.notes;
    const { error: updateOrderErr } = await a
      .from("orders")
      .update({ status: orderStatus, notes: nextNotes })
      .eq("id", job.order_id);

    if (updateOrderErr) {
      return NextResponse.json(
        { ok: false, error: "Update order error: " + updateOrderErr.message },
        { status: 500 }
      );
    }

    if (nextStatus === "picked_up") {
      await notifyOrderEvent({
        event: "delivery_out",
        orderId: job.order_id,
        vendorId: job.vendor_id,
        customerId: job.customer_id,
        amountNaira: job.order_total,
        orderType: job.order_type,
      });
    }

    if (nextStatus === "delivered") {
      await notifyOrderEvent({
        event: "delivered",
        orderId: job.order_id,
        vendorId: job.vendor_id,
        customerId: job.customer_id,
        amountNaira: job.order_total,
        orderType: job.order_type,
      });
    }

    return NextResponse.json({
      ok: true,
      job: { id: job.id, status: nextStatus },
      order: { id: job.order_id, status: orderStatus },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
