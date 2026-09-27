/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Proof uploads are limited to 4 MB per file (lib/attachments.js): Vercel refuses bodies above 4.5 MB.
      bodySizeLimit: "4.5mb",
    },
  },
  // Routes of the previous version keep working (bookmarks, e-mails).
  async redirects() {
    return [
      { source: "/dashboard", destination: "/home", permanent: true },
      { source: "/restaurant", destination: "/go/home", permanent: true },
      { source: "/menu", destination: "/go/menu-stock", permanent: true },
      { source: "/stock", destination: "/go/menu-stock", permanent: true },
      { source: "/daily-close", destination: "/go/report", permanent: true },
      { source: "/transactions", destination: "/go/history", permanent: true },
      { source: "/transaction/create", destination: "/go/sell", permanent: true },
      { source: "/debts", destination: "/go/debts", permanent: true },
      { source: "/cash-handover", destination: "/go/cash-handover", permanent: true },
      { source: "/reports", destination: "/statements", permanent: true },
      { source: "/reports/inbox", destination: "/boss/daily-reports", permanent: true },
      { source: "/reports/daily/:id", destination: "/boss/daily-reports/:id", permanent: true },
      { source: "/organization/employees", destination: "/boss/people", permanent: true },
      { source: "/organization/departments", destination: "/boss/departments", permanent: true },
      { source: "/organization/:path*", destination: "/boss/settings", permanent: true },
      { source: "/account/:id", destination: "/boss/settings", permanent: true },
      { source: "/sign-in/:path*", destination: "/login", permanent: true },
      { source: "/sign-up/:path*", destination: "/register", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
