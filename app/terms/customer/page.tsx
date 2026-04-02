import Link from "next/link";
import Image from "next/image";

export default function CustomerTermsPage() {
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Dashbuy" width={40} height={40} className="h-10 w-10 rounded-lg" />
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Dashbuy</p>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Customer Terms and Conditions</h1>
      </div>

      <div className="mt-4 space-y-3">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">1. Account and Identity</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            You must provide accurate profile, contact, and delivery details. You are responsible for all activity under your account and for keeping your login credentials secure.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">2. Orders and Payments</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Orders are subject to vendor confirmation, stock/menu availability, and payment verification. Prices, delivery fees, and totals shown at checkout are the amounts charged for the order session.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">3. Delivery and Location</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Delivery time depends on vendor preparation, rider availability, traffic, weather, and location accuracy. Inaccurate address/geopoint may delay or prevent successful delivery.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">4. Cancellations, Refunds, and Disputes</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Refund or cancellation decisions depend on order status, vendor confirmation stage, and logistics stage. Report payment or order disputes promptly with order reference and evidence.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">5. Acceptable Use</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Fraud, payment abuse, fake orders, harassment, or misuse of platform services can lead to order blocking, account restrictions, or permanent account removal.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">6. Limitation and Changes</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Dashbuy coordinates transactions between customers, vendors, and logistics partners and may update features, fees, or policies to improve platform safety, compliance, and performance.
          </p>
        </section>
      </div>

         <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">7. Support and Disputes</h2>
          <p className="mt-2 text-sm text-gray-700">
            If you have payment or order issues, contact support immediately from your account page and include order reference details.
          </p>
          </section>

      <div className="mt-4">
        <Link href="/account" className="inline-flex rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
          Back
        </Link>
      </div>
    </main>
  );
}
