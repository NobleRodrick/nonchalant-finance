import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { guardPath } from "@/lib/page-guards";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function MainLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // A temporary password is replaced before anything else.
  if (user.mustChangePassword) redirect("/change-password");
  // Refuse a page the person may not open before the loading screen is sent (real 404 status).
  await guardPath(user, (await headers()).get("x-sf-path"));
  return <AppShell user={user}>{children}</AppShell>;
}
