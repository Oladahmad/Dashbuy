import Link from "next/link";

export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back button */}
        <div className="mb-4">
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-black"
          >
            ← Back
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          {/* Logo + header */}
          <div className="mb-6 text-center">
            <p className="text-2xl font-extrabold sm:text-3xl">
              <span className="text-orange-600">Dash</span>buy
            </p>

            <h1 className="mt-3 text-xl font-semibold">{title}</h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
            ) : null}
          </div>

          {/* Form */}
          {children}
        </div>
      </div>
    </div>
  );
}
