import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from 'resend';


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

function formatNaira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
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
    const [vendor, customer] = await Promise.all([getContact(args.vendorId), getContact(args.customerId)]);
    const content = buildContent(args);

    const jobs: Promise<unknown>[] = [];

    if (vendor && content.vendorSubject) {
      jobs.push(
        sendEmail(
          vendor.email,
          content.vendorSubject,
          htmlLayout(vendor.name, content.vendorTitle, content.vendorBody, content.vendorHref, content.vendorCta)
        )
      );
    }

    if (customer && content.customerSubject) {
      jobs.push(
        sendEmail(
          customer.email,
          content.customerSubject,
          htmlLayout(
            customer.name,
            content.customerTitle,
            content.customerBody,
            content.customerHref,
            content.customerCta
          )
        )
      );
    }

    await Promise.allSettled(jobs);
  } catch (e) {
    console.warn("notifyOrderEvent failed:", e);
  }
}
