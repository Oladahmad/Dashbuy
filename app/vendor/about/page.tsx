"use client";

import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";

export default function AboutPage() {
  const router = useRouter();

  return (
    <AppShell title="About Dashbuy">
      <div className="rounded-2xl border bg-white p-5">
        <h1 className="text-2xl font-bold">About Dashbuy</h1>
        <p className="mt-2 text-sm text-gray-600">
          Dashbuy helps you order food and shop everyday products around Ago with a simple, fast, mobile first experience.
        </p>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            className="rounded-xl bg-black px-4 py-3 text-white"
            onClick={() => router.push("/food")}
          >
            Go to Food
          </button>
          <button
            type="button"
            className="rounded-xl border px-4 py-3"
            onClick={() => router.push("/products")}
          >
            Go to Products
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-5">
        <p className="text-lg font-semibold">What we do</p>
        <div className="mt-3 grid gap-3 text-sm text-gray-700">
          <div className="rounded-xl border p-4">
            <p className="font-medium">Food ordering</p>
            <p className="mt-1 text-gray-600">
              You can order combo meals, or order single foods from restaurants where you select what you want per plate.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="font-medium">Products shopping</p>
            <p className="mt-1 text-gray-600">
              You can shop items from vendors and stores, search products, filter by category, and pay securely.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="font-medium">Delivery</p>
            <p className="mt-1 text-gray-600">
              We work with local logistics partners to deliver within Ago. Delivery fees depend on the order type and vendor grouping.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-5">
        <p className="text-lg font-semibold">How it works</p>
        <div className="mt-3 grid gap-3 text-sm text-gray-700">
          <div className="rounded-xl border p-4">
            <p className="font-medium">Step 1</p>
            <p className="mt-1 text-gray-600">
              Browse food or products and add what you want to your cart.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="font-medium">Step 2</p>
            <p className="mt-1 text-gray-600">
              Confirm your delivery address and review totals and delivery fees.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="font-medium">Step 3</p>
            <p className="mt-1 text-gray-600">
              Pay online with Paystack. After payment, your order is created and vendors get the request.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-xl border px-4 py-3"
          onClick={() => router.push("/orders")}
        >
          View your orders
        </button>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-5">
        <p className="text-lg font-semibold">Payments and safety</p>
        <div className="mt-3 grid gap-3 text-sm text-gray-700">
          <div className="rounded-xl border p-4">
            <p className="font-medium">Secure checkout</p>
            <p className="mt-1 text-gray-600">
              Payments are processed through Paystack. Your card details are handled by Paystack, not stored by Dashbuy.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="font-medium">Order tracking</p>
            <p className="mt-1 text-gray-600">
              You can review your orders in the Orders page. Status updates will be improved as v1 grows.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="font-medium">Support</p>
            <p className="mt-1 text-gray-600">
              If you have issues with an order, contact support with your order reference from the Orders page.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-5">
        <p className="text-lg font-semibold">Sell on Dashbuy</p>
        <p className="mt-2 text-sm text-gray-600">
          Dashbuy allows vendors to list products, and restaurants or food vendors to list combos or single food items.
        </p>

        <div className="mt-4 grid gap-3">
          <button
            type="button"
            className="w-full rounded-xl bg-black px-4 py-3 text-white"
            onClick={() => router.push("/auth/vendor-signup")}
          >
            Become a vendor
          </button>

          <button
            type="button"
            className="w-full rounded-xl border px-4 py-3"
            onClick={() => router.push("/account")}
          >
            Go to Account
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-5">
        <p className="text-lg font-semibold">Contact</p>
        <p className="mt-2 text-sm text-gray-600">
          For support, payments, or delivery issues, contact Dashbuy support.
        </p>

        <div className="mt-4 grid gap-2">
          <a
            className="w-full rounded-xl border px-4 py-3 text-center"
            href="https://wa.me/2347057602937"
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp support
          </a>

          <a
            className="w-full rounded-xl border px-4 py-3 text-center"
            href="tel:+2347072090735"
          >
            Call support
          </a>
        </div>

      </div>

      <div className="h-3" />
    </AppShell>
  );
}
