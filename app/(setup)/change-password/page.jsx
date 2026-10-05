import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your password" };

/** Only same-site relative paths are followed after the change. */
function safePath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/home";
}

/**
 * First sign-in with a temporary password (set by the Boss): the person chooses their own before
 * anything else. The rest of the app sends them here until they do.
 */
export default async function ChangePasswordPage({ searchParams }) {
  const user = await getCurrentUser();
  const next = safePath((await searchParams)?.redirect);
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect(next);
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <Image src="/logo.jpg" alt="Springer Finance" width={40} height={40} className="rounded-lg" />
        <div>
          <div className="text-lg font-bold text-slate-900">Choose your own password</div>
          <div className="text-sm text-slate-500">Welcome, {user.name}. The Boss gave you a temporary password; replace it to continue.</div>
        </div>
      </div>
      <ChangePasswordForm next={next} />
    </div>
  );
}
