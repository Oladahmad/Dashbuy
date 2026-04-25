import FoodLayoutClient from "./foodLayoutClient";

export default function FoodLayout({ children }: { children: React.ReactNode }) {
  return <FoodLayoutClient>{children}</FoodLayoutClient>;
}
