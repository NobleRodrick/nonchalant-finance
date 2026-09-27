import { PublicHeader } from "@/components/public-header";

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <div className="flex justify-center px-4 pb-16 pt-16">{children}</div>
    </div>
  );
}
