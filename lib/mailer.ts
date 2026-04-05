function fromAddress() {
  return (
    process.env.EMAIL_FROM ||
    process.env.NOTIFY_FROM_EMAIL ||
    process.env.MAIL_FROM ||
    "Dashbuy <onboarding@resend.dev>"
  );
}

export async function sendTransactionalEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");

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

export function simpleEmailLayout(title: string, body: string) {
  const appBase = (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/+$/, "");
  const logoUrl = appBase ? `${appBase}/logo.png` : "";
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f6f6f6;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;padding:24px;color:#111111;">
        ${logoUrl ? `<p style="margin:0 0 14px;"><img src="${logoUrl}" alt="Dashbuy" style="height:28px;display:block;" /></p>` : ""}
        <h2 style="margin:0 0 12px;font-size:20px;">${title}</h2>
        <div style="font-size:14px;line-height:1.6;color:#333333;">${body}</div>
        <p style="margin:24px 0 0;color:#666666;font-size:13px;">Dashbuy</p>
      </div>
    </div>
  `;
}
