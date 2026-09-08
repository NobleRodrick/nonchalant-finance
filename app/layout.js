import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/header";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Springer Finance - Multi-Tenant Operations & Financial Platform",
  description:
    "Empowering business owners and department accountants with real-time operations tracking, automated financial closing reports, and AI receipt scanning.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className}`}>
        {/* Header */}
        <Header />

        <main className="min-h-screen pt-20">{children}</main>
        <Toaster richColors />
        {/* Footer */}
        <footer className="bg-slate-50 border-t py-8 mt-16">
          <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
            <p>© 2026 Springer Finance. Operations & Financial Platform.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
