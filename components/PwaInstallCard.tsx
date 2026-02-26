"use client";

import Image from "next/image";
import Link from "next/link";

export default function PwaInstallCard() {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border bg-white">
      <div className="relative border-b bg-black px-5 py-4 text-white">
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full border border-white/20" />
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-xl border border-white/20 bg-white">
            <Image src="/logo.png" alt="Dashbuy" width={40} height={40} className="h-10 w-10 object-cover" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/70">Install Dashbuy</p>
            <h3 className="text-base font-semibold">Use Dashbuy like a real app</h3>
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="text-sm text-gray-700">
          See simple step-by-step instructions for Android and iPhone, then install from your phone browser.
        </p>

        <div className="mt-4 flex gap-2">
          <Link
            href="/install"
            className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Open install guide
          </Link>
          <Link href="/install" className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm">
            Learn more
          </Link>
        </div>
      </div>
    </div>
  );
}
