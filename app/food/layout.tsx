import AppShell from "@/components/AppShell";

export default function FoodLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Food">{children}</AppShell>;
}
