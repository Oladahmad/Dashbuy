import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Admin tools</h2>
        <p className="mt-1 text-sm text-gray-600">Manage test-run operations and inspect platform activity.</p>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <p className="font-semibold">Custom food requests</p>
        <p className="mt-1 text-sm text-gray-600">
          View all manually listed restaurant food requests submitted from the Food page.
        </p>
        <Link href="/admin/custom-food-requests" className="mt-3 block rounded-xl border px-4 py-3 text-center">
          Open custom food requests
        </Link>
      </div>
    </div>
  );
}
