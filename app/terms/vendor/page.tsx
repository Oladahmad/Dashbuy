import Link from "next/link";
import Image from "next/image";

export default function VendorTermsPage() {
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Dashbuy" width={40} height={40} className="h-10 w-10 rounded-lg" />
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Dashbuy</p>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Vendor Terms and Conditions</h1>
      </div>

      <div className="mt-4 space-y-3">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">1. Vendor Responsibility</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            You must provide accurate listing details, prices, availability, and fulfillment readiness. Misleading listings or fake inventory are prohibited.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">2. Order Fulfillment</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Accepted orders must be prepared on time. Vendors must cooperate with riders and provide correct pickup details to avoid fulfillment delays.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">3. Pricing, Quality, and Compliance</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Vendors are responsible for lawful products/food quality, safe packaging, and current pricing. Repeated quality issues or non-compliant items may lead to account action.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">4. Settlement and Payout</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Earnings are settled based on delivered orders and platform payout policy. Pending, cancelled, disputed, or refunded orders may not qualify for payout.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">5. Fraud Prevention and Enforcement</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Fraud, fake confirmations, repeated cancellations, abusive behavior, or system manipulation can lead to suspension, payout hold, or permanent account termination.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">6. Policy Updates</h2>
          <p className="mt-2 text-base leading-7 text-gray-800">
            Dashbuy may update operational and policy terms when required for safety, legal compliance, and platform reliability.
          </p>
        </section>
      </div>

      <div className="mt-4">
        <Link href="/vendor/account" className="inline-flex rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
          Back
        </Link>
      </div>
    </main>
  );
}
