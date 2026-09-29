import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  title: { default: "Springer Finance", template: "%s · Springer Finance" },
  description: "Run every part of your business from one place: departments, their heads and teams, daily reports, cash and statements, in FCFA.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        {children}
        <Toaster richColors position="top-right" />
        {/* Real page-load timings from users' browsers, when Speed Insights is enabled in the Vercel dashboard. */}
        {process.env.VERCEL ? <Script src="/_vercel/speed-insights/script.js" strategy="afterInteractive" /> : null}
      </body>
    </html>
  );
}
