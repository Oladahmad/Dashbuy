import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function formatNaira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fromAddress() {
  return process.env.NOTIFY_FROM_EMAIL || process.env.MAIL_FROM || "Dashbuy <onboarding@resend.dev>";
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

function buildContent(args: NotifyOrderArgs) {
  const orderLabel = `#${args.orderId.slice(0, 8)}`;
  const orderType = (args.orderType ?? "order").toString();
  const amount = args.amountNaira ? formatNaira(args.amountNaira) : null;

  if (args.event === "order_paid") {
    return {
      vendorSubject: `Payment received for ${orderLabel}`,
      vendorHtml: `<p>A customer payment has been confirmed.</p><p><strong>Order:</strong> ${orderLabel}<br/><strong>Type:</strong> ${orderType}${amount ? `<br/><strong>Amount:</strong> ${amount}` : ""}</p>`,
      customerSubject: "",
      customerHtml: "",
    };
  }

  if (args.event === "vendor_accepted") {
    return {
      vendorSubject: `You accepted ${orderLabel}`,
      vendorHtml: `<p>You accepted this order and logistics has been prepared.</p><p><strong>Order:</strong> ${orderLabel}</p>`,
      customerSubject: `Your order ${orderLabel} was accepted`,
      customerHtml: `<p>Your vendor has accepted your order and it is being prepared.</p><p><strong>Order:</strong> ${orderLabel}</p>`,
    };
  }

  if (args.event === "delivery_out") {
    return {
      vendorSubject: `Delivery is out for ${orderLabel}`,
      vendorHtml: `<p>Your order is now with logistics (picked up).</p><p><strong>Order:</strong> ${orderLabel}</p>`,
      customerSubject: `Delivery is out for your order ${orderLabel}`,
      customerHtml: `<p>Your order has been picked up and is on the way.</p><p><strong>Order:</strong> ${orderLabel}</p>`,
    };
  }

  return {
    vendorSubject: `Order ${orderLabel} delivered`,
    vendorHtml: `<p>This order has been delivered successfully.</p><p><strong>Order:</strong> ${orderLabel}</p>`,
    customerSubject: `Order ${orderLabel} delivered`,
    customerHtml: `<p>Your order has been marked delivered.</p><p><strong>Order:</strong> ${orderLabel}</p>`,
  };
}

export async function notifyOrderEvent(args: NotifyOrderArgs) {
  try {
    const [vendor, customer] = await Promise.all([getContact(args.vendorId), getContact(args.customerId)]);
    const content = buildContent(args);

    const jobs: Promise<unknown>[] = [];

    if (vendor && content.vendorSubject) {
      jobs.push(
        sendEmail(
          vendor.email,
          content.vendorSubject,
          `<p>Hello ${vendor.name},</p>${content.vendorHtml}<p>Dashbuy</p>`
        )
      );
    }

    if (customer && content.customerSubject) {
      jobs.push(
        sendEmail(
          customer.email,
          content.customerSubject,
          `<p>Hello ${customer.name},</p>${content.customerHtml}<p>Dashbuy</p>`
        )
      );
    }

    await Promise.allSettled(jobs);
  } catch (e) {
    console.warn("notifyOrderEvent failed:", e);
  }
}

