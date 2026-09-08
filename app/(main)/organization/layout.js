import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function OrganizationLayout({ children }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  if (!user.organizationId) {
    redirect("/onboarding");
  }

  return children;
}
