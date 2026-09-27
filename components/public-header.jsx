import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export function PublicHeader({ signedIn = false }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.jpg" alt="Springer Finance" width={36} height={36} className="rounded" priority />
        </Link>
        <nav className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/home">
              <Button size="sm">Open the app</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Register your business</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
