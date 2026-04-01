import AppShell from "@/components/AppShell";

export default function ErrandPage() {
  return (
    <AppShell title="Errand">
      <div className="rounded-2xl border bg-white p-6 text-center">
        <p className="text-xs font-semibold tracking-wide text-gray-500">COMING SOON</p>
        <h1 className="mt-2 text-2xl font-bold">Errand Feature</h1>
        <p className="mt-3 text-sm text-gray-600">
          We are finalizing how this will work for customers and logistics.
          This section is temporarily unavailable.
        </p>
      </div>
    </AppShell>
  );
}
