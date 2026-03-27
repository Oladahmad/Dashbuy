import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractOrderNameFromNotes } from "@/lib/orderName";


type NotifyEvent = "order_paid" | "vendor_accepted" | "delivery_out" | "delivered";

type Contact = {
  email: string;
  name: string;
};

type NotifyOrderArgs = {
  event: NotifyEvent;
  orderId: string;
  vendorId: string;
  customerId: string;
  amountNaira?: number | null;
  orderType?: string | null;
};

type NotifyContent = {
  vendorSubject: string;
  vendorTitle: string;
  vendorBody: string;
  vendorHref: string;
  vendorCta: string;
  customerSubject: string;
  customerTitle: string;
  customerBody: string;
  customerHref: string;
  customerCta: string;
};

type OrderSnapshot = {
  id: string;
  status: string | null;
  order_type: string | null;
  food_mode: string | null;
  subtotal: number | null;
  delivery_fee: number | null;
  total: number | null;
  delivery_address: string | null;
  customer_phone: string | null;
  created_at: string | null;
  notes: string | null;
};

type EmailItem = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
};

function formatNaira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function safeNumber(x: unknown, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fromAddress() {
  return (
    process.env.EMAIL_FROM ||
    process.env.NOTIFY_FROM_EMAIL ||
    process.env.MAIL_FROM ||
    "Dashbuy <onboarding@resend.dev>"
  );
}

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/+$/, "");
}

function supabaseBaseUrl() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
}

function normalizePublicImageUrl(bucket: "product-images" | "food-images", value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const base = supabaseBaseUrl();
  if (!base) return null;

  let path = raw.replace(/^\/+/, "");
  if (path.startsWith(`${bucket}/`)) {
    path = path.slice(bucket.length + 1);
  }
  if (path.startsWith("storage/v1/object/public/")) {
    const prefix = `storage/v1/object/public/${bucket}/`;
    if (path.startsWith(prefix)) {
      path = path.slice(prefix.length);
    }
  }

  const full = `${base}/storage/v1/object/public/${bucket}/${path}`;
  return encodeURI(full);
}

function orderLink(orderId: string, kind: "customer" | "vendor") {
  const base = appBaseUrl();
  if (!base) return "";
  return kind === "vendor" ? `${base}/vendor/orders/${orderId}` : `${base}/orders/${orderId}`;
}

function statusLabel(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "pending_payment") return "Awaiting payment";
  if (s === "pending_vendor") return "Paid - Awaiting vendor";
  if (s === "accepted") return "Accepted by vendor";
  if (s === "pending_pickup") return "Awaiting pickup";
  if (s === "picked_up") return "Out for delivery";
  if (s === "delivered") return "Delivered";
  if (s === "rejected" || s === "declined") return "Declined";
  if (s === "cancelled") return "Cancelled";
  if (s === "refunded") return "Refunded";
  return s || "Unknown";
}

function statusFromEvent(event: NotifyEvent, fallback: string | null) {
  if (event === "order_paid") return "pending_vendor";
  if (event === "vendor_accepted") return "accepted";
  if (event === "delivery_out") return "picked_up";
  if (event === "delivered") return "delivered";
  return fallback;
}

function orderTypeLabel(orderType: string | null, foodMode: string | null) {
  if ((orderType ?? "").toLowerCase() === "product") return "Product order";
  if ((foodMode ?? "plate").toLowerCase() === "combo") return "Food combo order";
  return "Food plate order";
}

function formatDateTime(iso: string | null) {
  if (!iso) return "Not available";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-NG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function metricCard(label: string, value: string) {
  return `
    <div style="flex:1 1 140px;border:1px solid #e5e7eb;border-radius:14px;padding:14px;background:#fafafa;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${esc(label)}</div>
      <div style="margin-top:6px;font-size:16px;font-weight:700;color:#111827;">${esc(value)}</div>
    </div>
  `;
}

function detailsBlock(snapshot: OrderSnapshot, event: NotifyEvent) {
  const resolvedStatus = statusFromEvent(event, snapshot.status);
  const subtotal = formatNaira(safeNumber(snapshot.subtotal, 0));
  const delivery = formatNaira(safeNumber(snapshot.delivery_fee, 0));
  const total = formatNaira(safeNumber(snapshot.total, 0));
  return `
    <div style="margin-top:18px;">
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${metricCard("Order ID", `#${snapshot.id.slice(0, 8)}`)}
        ${metricCard("Type", orderTypeLabel(snapshot.order_type, snapshot.food_mode))}
        ${metricCard("Status", statusLabel(resolvedStatus))}
      </div>
      <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:16px;padding:16px;background:#fafafa;">
        <div style="display:grid;gap:8px;font-size:13px;color:#374151;">
          <div><strong>Date:</strong> ${esc(formatDateTime(snapshot.created_at))}</div>
          <div><strong>Delivery address:</strong> ${esc(snapshot.delivery_address || "Not provided")}</div>
          <div><strong>Customer phone:</strong> ${esc(snapshot.customer_phone || "Not provided")}</div>
          <div><strong>Subtotal:</strong> ${esc(subtotal)}</div>
          <div><strong>Delivery fee:</strong> ${esc(delivery)}</div>
          <div><strong>Total:</strong> ${esc(total)}</div>
        </div>
      </div>
    </div>
  `;
}

function itemsBlock(items: EmailItem[]) {
  if (!items.length) return "";
  return `
    <div style="margin-top:18px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#111827;">Order items</p>
      <div style="display:grid;gap:12px;">
        ${items
          .slice(0, 12)
          .map((item) => {
            const image = item.imageUrl
              ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" style="width:56px;height:56px;object-fit:cover;border-radius:12px;border:1px solid #e5e7eb;background:#f9fafb;" />`
              : `<div style="width:56px;height:56px;border-radius:12px;border:1px solid #e5e7eb;background:#f9fafb;"></div>`;
            return `
              <div style="display:flex;gap:12px;align-items:center;border:1px solid #e5e7eb;border-radius:14px;padding:12px;background:#ffffff;">
                ${image}
                <div style="flex:1 1 auto;">
                  <div style="font-size:14px;font-weight:600;color:#111827;">${esc(item.name)}</div>
                  <div style="margin-top:4px;font-size:12px;color:#6b7280;">
                    Qty: ${esc(item.qty)} · Unit price: ${esc(formatNaira(item.unitPrice))} · Line total: ${esc(
              formatNaira(item.lineTotal)
            )}
                  </div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function htmlLayout(name: string, title: string, body: string, ctaHref?: string, ctaLabel?: string) {
  const logoUrl = appBaseUrl() ? `${appBaseUrl()}/logo.png` : "";
  const logoBlock = logoUrl
    ? `<p style="margin:0 0 14px;"><img src="${esc(logoUrl)}" alt="Dashbuy" style="height:28px;display:block;" /></p>`
    : "";
  const cta =
    ctaHref && ctaLabel
      ? `<p style="margin:24px 0 0;"><a href="${ctaHref}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;">${ctaLabel}</a></p>`
      : "";

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f6f6f6;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;padding:24px;color:#111111;">
        ${logoBlock}
        <p style="margin:0 0 16px;">Hello ${esc(name)},</p>
        <h2 style="margin:0 0 12px;font-size:20px;">${esc(title)}</h2>
        <div style="font-size:14px;line-height:1.6;color:#333333;">${body}</div>
        ${cta}
        <p style="margin:24px 0 0;color:#666666;font-size:13px;">Dashbuy</p>
      </div>
    </div>
  `;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("RESEND_API_KEY not set. Skipping email:", subject);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email send failed (${res.status}): ${body}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetrySend(error: unknown) {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return (
    msg.includes("rate_limit_exceeded") ||
    msg.includes("application_error") ||
    msg.includes("unable to fetch data")
  );
}

async function sendEmailWithRetry(to: string, subject: string, html: string) {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await sendEmail(to, subject, html);
      console.info(`[notify] email sent`, { to, subject, attempt });
      return;
    } catch (error) {
      const canRetry = attempt < maxAttempts && shouldRetrySend(error);
      console.warn(`[notify] email failed`, {
        to,
        subject,
        attempt,
        canRetry,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!canRetry) throw error;
      await sleep(700);
    }
  }
}

async function getContact(userId: string): Promise<Contact | null> {
  const [authRes, profileRes] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from("profiles").select("store_name,full_name").eq("id", userId).maybeSingle(),
  ]);

  const email = authRes.data.user?.email?.trim() ?? "";
  if (!email) return null;

  const storeName = String(profileRes.data?.store_name ?? "").trim();
  const fullName = String(profileRes.data?.full_name ?? "").trim();
  const name = storeName || fullName || "there";

  return { email, name };
}

async function fetchOrderSnapshot(orderId: string): Promise<{ order: OrderSnapshot | null; items: EmailItem[] }> {
  const { data: orderData } = await supabaseAdmin
    .from("orders")
    .select("id,status,order_type,food_mode,subtotal,delivery_fee,total,delivery_address,customer_phone,created_at,notes")
    .eq("id", orderId)
    .maybeSingle();

  const order = (orderData as OrderSnapshot | null) ?? null;
  if (!order) return { order: null, items: [] };

  const items: EmailItem[] = [];

  if ((order.order_type ?? "").toLowerCase() === "product") {
    const { data: productRows } = await supabaseAdmin
      .from("order_items")
      .select("id,qty,unit_price,line_total,products:product_id(name,image_path)")
      .eq("order_id", orderId);

    for (const row of (productRows as Array<Record<string, unknown>> | null) ?? []) {
      const product = (row.products as { name?: string; image_path?: string | null } | null) ?? null;
      items.push({
        id: String(row.id ?? crypto.randomUUID()),
        name: String(product?.name ?? "Product"),
        qty: safeNumber(row.qty, 1),
        unitPrice: safeNumber(row.unit_price, 0),
        lineTotal: safeNumber(row.line_total, safeNumber(row.unit_price, 0) * safeNumber(row.qty, 1)),
        imageUrl: normalizePublicImageUrl("product-images", product?.image_path ?? null),
      });
    }
    return { order, items };
  }

  const { data: comboRows } = await supabaseAdmin
    .from("combo_order_items")
    .select("id,qty,unit_price,line_total,food_items:combo_food_id(name,image_url)")
    .eq("order_id", orderId);

  for (const row of (comboRows as Array<Record<string, unknown>> | null) ?? []) {
    const food = (row.food_items as { name?: string; image_url?: string | null } | null) ?? null;
    items.push({
      id: `combo-${String(row.id ?? crypto.randomUUID())}`,
      name: String(food?.name ?? "Combo item"),
      qty: safeNumber(row.qty, 1),
      unitPrice: safeNumber(row.unit_price, 0),
      lineTotal: safeNumber(row.line_total, safeNumber(row.unit_price, 0) * safeNumber(row.qty, 1)),
      imageUrl: normalizePublicImageUrl("food-images", food?.image_url ?? null),
    });
  }

  const { data: plateRows } = await supabaseAdmin.from("order_plates").select("id").eq("order_id", orderId);
  const plateIds = ((plateRows as Array<{ id: string }> | null) ?? []).map((row) => row.id).filter(Boolean);

  if (plateIds.length > 0) {
    const { data: plateItems } = await supabaseAdmin
      .from("order_plate_items")
      .select("id,qty,unit_price,line_total,food_items:food_item_id(name,image_url),food_item_variants:variant_id(name)")
      .in("order_plate_id", plateIds);

    for (const row of (plateItems as Array<Record<string, unknown>> | null) ?? []) {
      const food = (row.food_items as { name?: string; image_url?: string | null } | null) ?? null;
      const variant = (row.food_item_variants as { name?: string } | null) ?? null;
      const baseName = String(food?.name ?? "Food item");
      const fullName = variant?.name ? `${baseName} - ${variant.name}` : baseName;
      items.push({
        id: `plate-${String(row.id ?? crypto.randomUUID())}`,
        name: fullName,
        qty: safeNumber(row.qty, 1),
        unitPrice: safeNumber(row.unit_price, 0),
        lineTotal: safeNumber(row.line_total, safeNumber(row.unit_price, 0) * safeNumber(row.qty, 1)),
        imageUrl: normalizePublicImageUrl("food-images", food?.image_url ?? null),
      });
    }
  }

  return { order, items };
}

function buildContent(args: NotifyOrderArgs): NotifyContent {
  const orderLabel = `#${args.orderId.slice(0, 8)}`;
  const orderType = (args.orderType ?? "order").toString();
  const amount = args.amountNaira ? formatNaira(args.amountNaira) : null;
  const vendorHref = orderLink(args.orderId, "vendor");
  const customerHref = orderLink(args.orderId, "customer");

  if (args.event === "order_paid") {
    return {
      vendorSubject: `Payment received for ${orderLabel}`,
      vendorTitle: "Customer payment confirmed",
      vendorBody: `<p>A customer payment has been confirmed for ${orderLabel}.</p><p><strong>Type:</strong> ${orderType}${amount ? `<br/><strong>Amount:</strong> ${amount}` : ""}</p>`,
      vendorHref,
      vendorCta: "View order",
      customerSubject: "",
      customerTitle: "",
      customerBody: "",
      customerHref: "",
      customerCta: "",
    };
  }

  if (args.event === "vendor_accepted") {
    return {
      vendorSubject: `You accepted ${orderLabel}`,
      vendorTitle: "Order accepted",
      vendorBody: `<p>You accepted ${orderLabel} and logistics preparation has started.</p>`,
      vendorHref,
      vendorCta: "View order",
      customerSubject: `Your order ${orderLabel} was accepted`,
      customerTitle: "Vendor accepted your order",
      customerBody: `<p>Your vendor has accepted ${orderLabel}. The order is now being prepared.</p>`,
      customerHref,
      customerCta: "Track order",
    };
  }

  if (args.event === "delivery_out") {
    return {
      vendorSubject: `Delivery is out for ${orderLabel}`,
      vendorTitle: "Order picked up",
      vendorBody: `<p>${orderLabel} has been picked up by logistics and is now out for delivery.</p>`,
      vendorHref,
      vendorCta: "View order",
      customerSubject: `Delivery is out for your order ${orderLabel}`,
      customerTitle: "Your order is on the way",
      customerBody: `<p>${orderLabel} has been picked up and is currently on the way to your delivery address.</p>`,
      customerHref,
      customerCta: "Track order",
    };
  }

  return {
    vendorSubject: `Order ${orderLabel} delivered`,
    vendorTitle: "Order delivered",
    vendorBody: `<p>${orderLabel} has been delivered successfully.</p>`,
    vendorHref,
    vendorCta: "View order",
    customerSubject: `Order ${orderLabel} delivered`,
    customerTitle: "Order delivered",
    customerBody: `<p>Your order ${orderLabel} has been marked as delivered.</p>`,
    customerHref,
    customerCta: "View order",
  };
}

export async function notifyOrderEvent(args: NotifyOrderArgs) {
  try {
    const [vendor, customer, snapshot] = await Promise.all([
      getContact(args.vendorId),
      getContact(args.customerId),
      fetchOrderSnapshot(args.orderId),
    ]);
    const content = buildContent(args);
    const order = snapshot.order;
    const items = snapshot.items;
    const orderName = extractOrderNameFromNotes(order?.notes ?? null);
    const label = orderName || `#${args.orderId.slice(0, 8)}`;
    const amount = formatNaira(
      safeNumber(order?.total, args.amountNaira != null ? safeNumber(args.amountNaira, 0) : 0)
    );

    function richBody(role: "vendor" | "customer", baseText: string) {
      if (!order) return `<p>${baseText}</p>`;
      return `
        <p>${baseText}</p>
        <p><strong>Order:</strong> ${esc(label)}<br/><strong>Total:</strong> ${esc(amount)}</p>
        ${detailsBlock(order, args.event)}
        ${itemsBlock(items)}
      `;
    }

    if (vendor && content.vendorSubject) {
      const vendorIntro =
        args.event === "order_paid"
          ? `A customer payment has been confirmed for ${esc(label)}. You can now prepare items and fulfill quickly.`
          : args.event === "vendor_accepted"
          ? `You accepted ${esc(label)}. Logistics preparation has started.`
          : args.event === "delivery_out"
          ? `${esc(label)} has been picked up and is now out for delivery.`
          : `${esc(label)} has been delivered successfully.`;
      await sendEmailWithRetry(
        vendor.email,
        content.vendorSubject,
        htmlLayout(
          vendor.name,
          content.vendorTitle,
          richBody("vendor", vendorIntro),
          content.vendorHref,
          content.vendorCta
        )
      );
    }

    if (customer && (content.customerSubject || args.event === "order_paid")) {
      const customerSubject = content.customerSubject || `Payment successful for ${label}`;
      const customerTitle = content.customerTitle || "Payment completed";
      const customerHref = content.customerHref || orderLink(args.orderId, "customer");
      const customerCta = content.customerCta || "View order";
      const customerIntro =
        args.event === "order_paid"
          ? `Your payment was successful for ${esc(label)}. Your order has been sent to the vendor.`
          : args.event === "vendor_accepted"
          ? `Your vendor has accepted ${esc(label)} and preparation is in progress.`
          : args.event === "delivery_out"
          ? `${esc(label)} has been picked up and is currently on the way to your delivery address.`
          : `Your order ${esc(label)} has been marked as delivered.`;
      if (vendor && content.vendorSubject) {
        await sleep(350);
      }
      await sendEmailWithRetry(
        customer.email,
        customerSubject,
        htmlLayout(customer.name, customerTitle, richBody("customer", customerIntro), customerHref, customerCta)
      );
    }
  } catch (e) {
    console.warn("notifyOrderEvent failed:", e);
  }
}
