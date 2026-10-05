import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EmailTemplate from "@/emails/template";

describe("guest house report e-mail", () => {
  it("renders the figures of the digest", () => {
    const html = renderToStaticMarkup(
      EmailTemplate({
        userName: "Boss",
        type: "stay-report",
        data: { departmentName: "Executive Stay", kind: "weekly", periodLabel: "28 Sep – 04 Oct 2026", url: "https://x/y", digest: { bookings: 4, arrivals: 3, occupied: 2, available: 3, apartments: 5, checkIns: 3, checkOuts: 2, occupancyRate: 40, revenue: 250000, cashReceived: 180000, handedOver: 100000, toHandOver: 80000, outstanding: 70000, expenses: 30000, maintenance: 12000, netIncome: 208000, discrepancies: 0, byApartment: [{ name: "Apartment 1", revenue: 150000, profit: 140000 }], pendingRepairs: [{ room: "Apartment 2", title: "AC", priority: "HIGH" }], unvalidated: 1 } },
      })
    );
    expect(html).toContain("weekly report");
    expect(html).toContain("Apartment 1 (profit 140 000 FCFA)");
    expect(html).toContain("Apartment 2: AC (high)");
    expect(html).toContain("208 000 FCFA");
  });
});
