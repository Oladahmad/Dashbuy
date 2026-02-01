export default function StatCard({
  title,
  value,
  subtitle,
  gradient,
}: {
  title: string;
  value: string;
  subtitle?: string;
  gradient: string; // tailwind gradient classes
}) {
  return (
    <div className={`rounded-2xl p-4 text-white shadow-sm ${gradient}`}>
      <p className="text-xs/5 opacity-90">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {subtitle ? <p className="mt-1 text-xs opacity-90">{subtitle}</p> : null}
    </div>
  );
}
