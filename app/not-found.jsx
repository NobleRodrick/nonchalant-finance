import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-5xl font-bold">404</h1>
      <p className="mt-3 text-slate-600">This page does not exist or you do not have access to it.</p>
      <Link href="/home" className="mt-6">
        <Button>Back to the app</Button>
      </Link>
    </div>
  );
}
