import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

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

type OrderRecord = {
  id: string;
  order_type: string | null;
  food_mode: string | null;
  status: string | null;
  subtotal: number | null;
  delivery_fee: number | null;
  total: number | null;
  total_amount: number | null;
  delivery_address: string | null;
  customer_phone: string | null;
  created_at: string | null;
};

type OrderItemSummary = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl?: string | null;
};

type OrderEmailContext = {
  order: OrderRecord;
  items: OrderItemSummary[];
};

function formatNaira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available";
  try {
    return new Date(value).toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function productImageUrl(path: string | null | undefined) {
  const clean = String(path ?? "").trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/product-images/${clean}`;
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

function orderLink(orderId: string, kind: "customer" | "vendor") {
  const base = appBaseUrl();
  if (!base) return "";
  return kind === "vendor" ? `${base}/vendor/orders/${orderId}` : `${base}/orders/${orderId}`;
}

function htmlLayout(name: string, title: string, body: string, ctaHref?: string, ctaLabel?: string) {
  const cta =
    ctaHref && ctaLabel
      ? `<p style="margin:24px 0 0;"><a href="${ctaHref}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;">${ctaLabel}</a></p>`
      : "";

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f6f6f6;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;padding:24px;color:#111111;">
        <p style="margin:0 0 16px;">Hello ${name},</p>
        <h2 style="margin:0 0 12px;font-size:20px;">${title}</h2>
        <div style="font-size:14px;line-height:1.6;color:#333333;">${body}</div>
        ${cta}
        <p style="margin:24px 0 0;color:#666666;font-size:13px;">Dashbuy</p>
      </div>
    </div>
  `;
}

function metricCard(label: string, value: string) {
  return `
    <div style="flex:1 1 140px;border:1px solid #e5e7eb;border-radius:14px;padding:14px;background:#fafafa;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(label)}</div>
      <div style="margin-top:6px;font-size:16px;font-weight:700;color:#111827;">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderOrderItems(items: OrderItemSummary[]) {
  if (items.length === 0) {
    return `<p style="margin:16px 0 0;color:#4b5563;">Item details will appear on your order page.</p>`;
  }

  return `
    <div style="margin-top:18px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#111827;">Order items</p>
      <div style="display:grid;gap:12px;">
        ${items
          .map((item) => {
            const image = item.imageUrl
              ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" style="width:56px;height:56px;object-fit:cover;border-radius:12px;border:1px solid #e5e7eb;background:#f9fafb;" />`
              : `<div style="width:56px;height:56px;border-radius:12px;border:1px solid #e5e7eb;background:#f9fafb;display:flex;align-items:center;justify-content:center;font-size:22px;">🛍️</div>`;

            return `
              <div style="display:flex;gap:12px;align-items:center;border:1px solid #e5e7eb;border-radius:14px;padding:12px;background:#ffffff;">
                ${image}
                <div style="flex:1 1 auto;">
                  <div style="font-size:14px;font-weight:600;color:#111827;">${escapeHtml(item.name)}</div>
                  <div style="margin-top:4px;font-size:12px;color:#6b7280;">
                    Qty: ${item.qty} · Unit price: ${formatNaira(item.unitPrice)} · Line total: ${formatNaira(item.lineTotal)}
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

function detailedOrderSection(ctx: OrderEmailContext, orderTypeLabel: string) {
  const total = ctx.order.total_amount ?? ctx.order.total ?? 0;
  const subtotal = ctx.order.subtotal ?? 0;
  const delivery = ctx.order.delivery_fee ?? 0;
  const status = String(ctx.order.status ?? "pending");

  return `
    <div style="margin-top:18px;">
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${metricCard("Order ID", `#${ctx.order.id.slice(0, 8)}`)}
        ${metricCard("Type", orderTypeLabel)}
        ${metricCard("Total", formatNaira(total))}
      </div>
      <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:16px;padding:16px;background:#fafafa;">
        <div style="display:grid;gap:8px;font-size:13px;color:#374151;">
          <div><strong>Order status:</strong> ${escapeHtml(status)}</div>
          <div><strong>Date:</strong> ${escapeHtml(formatDateTime(ctx.order.created_at))}</div>
          <div><strong>Delivery address:</strong> ${escapeHtml(ctx.order.delivery_address || "Not provided")}</div>
          <div><strong>Customer phone:</strong> ${escapeHtml(ctx.order.customer_phone || "Not provided")}</div>
          <div><strong>Subtotal:</strong> ${formatNaira(subtotal)}</div>
          <div><strong>Delivery fee:</strong> ${formatNaira(delivery)}</div>
          <div><strong>Total:</strong> ${formatNaira(total)}</div>
        </div>
      </div>
      ${renderOrderItems(ctx.items)}
    </div>
  `;
}

async function getOrderEmailContext(orderId: string): Promise<OrderEmailContext | null> {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("id,order_type,food_mode,status,subtotal,delivery_fee,total,total_amount,delivery_address,customer_phone,created_at")
    .eq("id", orderId)
    .maybeSingle<OrderRecord>();

  if (orderErr || !order) return null;

  if (order.order_type === "product") {
    const { data: rows } = await supabaseAdmin
      .from("order_items")
      .select("qty,unit_price,line_total,products:product_id(name,image_path)")
      .eq("order_id", orderId);

    const items = ((rows ?? []) as unknown as Array<{
      qty: number | null;
      unit_price: number | null;
      line_total: number | null;
      products: { name: string | null; image_path: string | null } | Array<{ name: string | null; image_path: string | null }> | null;
    }>).map((row) => ({
      name: firstRelated(row.products)?.name?.trim() || "Product item",
      qty: Number(row.qty ?? 1),
      unitPrice: Number(row.unit_price ?? 0),
      lineTotal: Number(row.line_total ?? 0),
      imageUrl: productImageUrl(firstRelated(row.products)?.image_path),
    }));

    return { order, items };
  }

  const comboItemsPromise = supabaseAdmin
    .from("combo_order_items")
    .select("qty,unit_price,line_total,food_items:combo_food_id(name,image_url)")
    .eq("order_id", orderId);

  const plateIdsPromise = supabaseAdmin.from("order_plates").select("id").eq("order_id", orderId);

  const [comboItemsRes, plateIdsRes] = await Promise.all([comboItemsPromise, plateIdsPromise]);
  const comboItems = ((comboItemsRes.data ?? []) as unknown as Array<{
    qty: number | null;
    unit_price: number | null;
    line_total: number | null;
    food_items: { name: string | null; image_url: string | null } | Array<{ name: string | null; image_url: string | null }> | null;
  }>).map((row) => ({
    name: firstRelated(row.food_items)?.name?.trim() || "Food combo",
    qty: Number(row.qty ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    lineTotal: Number(row.line_total ?? 0),
    imageUrl: firstRelated(row.food_items)?.image_url || "",
  }));

  const plateIds = ((plateIdsRes.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  let plateItems: OrderItemSummary[] = [];
  if (plateIds.length > 0) {
    const { data: plateRows } = await supabaseAdmin
      .from("order_plate_items")
      .select("qty,unit_price,line_total,food_items:food_item_id(name,image_url),food_item_variants:variant_id(name)")
      .in("order_plate_id", plateIds);

    plateItems = ((plateRows ?? []) as unknown as Array<{
      qty: number | null;
      unit_price: number | null;
      line_total: number | null;
      food_items: { name: string | null; image_url: string | null } | Array<{ name: string | null; image_url: string | null }> | null;
      food_item_variants: { name: string | null } | Array<{ name: string | null }> | null;
    }>).map((row) => ({
      name: [
        firstRelated(row.food_items)?.name?.trim() || "Food item",
        firstRelated(row.food_item_variants)?.name?.trim() || "",
      ]
        .filter(Boolean)
        .join(" · "),
      qty: Number(row.qty ?? 1),
      unitPrice: Number(row.unit_price ?? 0),
      lineTotal: Number(row.line_total ?? 0),
      imageUrl: firstRelated(row.food_items)?.image_url || "",
    }));
  }

  return { order, items: [...plateItems, ...comboItems] };
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("RESEND_API_KEY not set in server env. Restart Next.js after updating .env.local. Skipping email:", subject);
    return { ok: false, error: { name: "missing_api_key", message: "RESEND_API_KEY not set" } };
  }

  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from: fromAddress(),
    to: [to],
    subject,
    html,
  });

  if (error) {
    console.warn("Resend send failed:", { to, subject, error });
    return { ok: false, error };
  }

  console.log("Resend email sent:", { to, subject, id: data?.id ?? "no-id" });
  return { ok: true, data };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(to: string, subject: string, html: string) {
  const first = await sendEmail(to, subject, html);
  if (first.ok) return first;

  const errorName = String(first.error?.name ?? "").toLowerCase();
  const errorMessage = String(first.error?.message ?? "").toLowerCase();
  const shouldRetry =
    errorName.includes("application_error") ||
    errorName.includes("rate_limit") ||
    errorMessage.includes("too many requests") ||
    errorMessage.includes("unable to fetch data");

  if (!shouldRetry) return first;

  await sleep(1200);
  return sendEmail(to, subject, html);
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

function buildContent(args: NotifyOrderArgs, ctx: OrderEmailContext | null): NotifyContent {
  const orderLabel = `#${args.orderId.slice(0, 8)}`;
  const orderType = (args.orderType ?? "order").toString();
  const amount = args.amountNaira ? formatNaira(args.amountNaira) : ctx?.order.total_amount || ctx?.order.total ? formatNaira(ctx?.order.total_amount ?? ctx?.order.total ?? 0) : null;
  const vendorHref = orderLink(args.orderId, "vendor");
  const customerHref = orderLink(args.orderId, "customer");
  const orderDetails = ctx ? detailedOrderSection(ctx, orderType) : "";

  if (args.event === "order_paid") {
    return {
      vendorSubject: `Payment received for ${orderLabel}`,
      vendorTitle: "Customer payment confirmed",
      vendorBody: `<p>A customer payment has been confirmed for ${orderLabel}.</p><p>You can now review the order, prepare the items, and move quickly so delivery can start on time.</p><p><strong>Type:</strong> ${escapeHtml(orderType)}${amount ? `<br/><strong>Amount received:</strong> ${amount}` : ""}</p>${orderDetails}`,
      vendorHref,
      vendorCta: "View order",
      customerSubject: `Payment confirmed for your order ${orderLabel}`,
      customerTitle: "Payment completed successfully",
      customerBody: `<p>Your payment for ${orderLabel} was received successfully.</p><p>Your vendor has been notified and your order will move to the next stage as soon as it is reviewed.</p><p><strong>Order type:</strong> ${escapeHtml(orderType)}${amount ? `<br/><strong>Amount paid:</strong> ${amount}` : ""}</p>${orderDetails}`,
      customerHref,
      customerCta: "Track order",
    };
  }

  if (args.event === "vendor_accepted") {
    return {
      vendorSubject: `You accepted ${orderLabel}`,
      vendorTitle: "Order accepted",
      vendorBody: `<p>You accepted ${orderLabel} and logistics preparation has started.</p><p>Make sure the items are complete and ready for handoff.</p>${orderDetails}`,
      vendorHref,
      vendorCta: "View order",
      customerSubject: `Your order ${orderLabel} was accepted`,
      customerTitle: "Vendor accepted your order",
      customerBody: `<p>Your vendor has accepted ${orderLabel}. The order is now being prepared for pickup or delivery handoff.</p>${orderDetails}`,
      customerHref,
      customerCta: "Track order",
    };
  }

  if (args.event === "delivery_out") {
    return {
      vendorSubject: `Delivery is out for ${orderLabel}`,
      vendorTitle: "Order picked up",
      vendorBody: `<p>${orderLabel} has been picked up by logistics and is now out for delivery.</p><p>You can monitor the final leg from your vendor order page.</p>${orderDetails}`,
      vendorHref,
      vendorCta: "View order",
      customerSubject: `Delivery is out for your order ${orderLabel}`,
      customerTitle: "Your order is on the way",
      customerBody: `<p>${orderLabel} has been picked up and is currently on the way to your delivery address.</p><p>Please stay reachable on your phone so delivery is smooth.</p>${orderDetails}`,
      customerHref,
      customerCta: "Track order",
    };
  }

  return {
    vendorSubject: `Order ${orderLabel} delivered`,
    vendorTitle: "Order delivered",
    vendorBody: `<p>${orderLabel} has been delivered successfully.</p><p>This order has completed the delivery flow.</p>${orderDetails}`,
    vendorHref,
    vendorCta: "View order",
    customerSubject: `Order ${orderLabel} delivered`,
    customerTitle: "Order delivered",
    customerBody: `<p>Your order ${orderLabel} has been marked as delivered.</p><p>If anything is missing or incorrect, open the order page from the link below.</p>${orderDetails}`,
    customerHref,
    customerCta: "View order",
  };
}

export async function notifyOrderEvent(args: NotifyOrderArgs) {
  try {
    const [vendor, customer] = await Promise.all([getContact(args.vendorId), getContact(args.customerId)]);
    const orderCtx = await getOrderEmailContext(args.orderId);
    const content = buildContent(args, orderCtx);

    if (vendor && content.vendorSubject) {
      await sendWithRetry(
        vendor.email,
        content.vendorSubject,
        htmlLayout(vendor.name, content.vendorTitle, content.vendorBody, content.vendorHref, content.vendorCta)
      );
    } else if (content.vendorSubject) {
      console.warn("Vendor notification skipped: missing vendor contact", {
        orderId: args.orderId,
        vendorId: args.vendorId,
        event: args.event,
      });
    }

    if (customer && content.customerSubject) {
      if (vendor && content.vendorSubject) {
        await sleep(650);
      }

      await sendWithRetry(
        customer.email,
        content.customerSubject,
        htmlLayout(customer.name, content.customerTitle, content.customerBody, content.customerHref, content.customerCta)
      );
    } else if (content.customerSubject) {
      console.warn("Customer notification skipped: missing customer contact", {
        orderId: args.orderId,
        customerId: args.customerId,
        event: args.event,
      });
    }
  } catch (e) {
    console.warn("notifyOrderEvent failed:", e);
  }
}
