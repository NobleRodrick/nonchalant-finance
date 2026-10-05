import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, loginAs, ok, setupVenueOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import { cancelBooking, createBooking, saveHall, saveLead, setLeadStatus } from "@/actions/venue";
import { listLeads } from "@/lib/venue/lead-queries";
import { conversionBy, followUpsDue, leadStats } from "@/lib/venue/lead-math";

describe("lead conversion (pure)", () => {
  it("conversion rate = booked ÷ closed; open leads do not count; by source", () => {
    const leads = [
      { status: "BOOKED", source: "Facebook" },
      { status: "BOOKED", source: "Referral" },
      { status: "LOST", source: "Facebook" },
      { status: "CANCELLED", source: "Facebook" },
      { status: "NEW", source: "Walk-in" },
    ];
    expect(leadStats(leads)).toMatchObject({ total: 5, open: 1, booked: 2, lost: 1, cancelled: 1, closed: 4, conversionRate: 50, bookedShare: 40 });
    expect(conversionBy(leads, (l) => l.source).find((g) => g.key === "Facebook")).toMatchObject({ total: 3, booked: 1, conversionRate: 33.3 });
    expect(leadStats([]).conversionRate).toBeNull();
    expect(followUpsDue([{ status: "NEW", followUpKey: "2026-10-01" }, { status: "LOST", followUpKey: "2026-10-01" }, { status: "CONTACTED", followUpKey: "2026-10-09" }], "2026-10-05")).toHaveLength(1);
  });
});

describe.skipIf(!hasDb)("event venue: leads", () => {
  let o;
  const d = (n) => addDaysToKey(today(), n);
  beforeAll(async () => {
    o = await setupVenueOrganization("Leads");
    await loginAs(o.head.id);
    ok(await saveHall({ departmentId: o.venue.id, name: "Salle", basePrice: 500000 }));
  });

  it("records enquiries, follows them up, loses one with a reason, books one", async () => {
    fails(await saveLead({ departmentId: o.venue.id, clientName: "" }), /name of the person/);
    const a = ok(await saveLead({ departmentId: o.venue.id, clientName: "Mme Biya", phone: "6", eventType: "Wedding", guests: 400, proposedDateKey: d(60), source: "Facebook", followUpKey: d(-1), priceDiscussed: 450000 }));
    const b = ok(await saveLead({ departmentId: o.venue.id, clientName: "M. Fotso", source: "Referral" }));
    ok(await saveLead({ departmentId: o.venue.id, clientName: "Lycée", source: "Walk-in" }));
    expect(a.status).toBe("NEW");
    expect((await db.venueLead.findUnique({ where: { id: a.leadId } })).handledById).toBe(o.head.id);
    ok(await setLeadStatus({ departmentId: o.venue.id, leadId: a.leadId, status: "NEGOTIATING", followUpKey: d(2) }));
    fails(await setLeadStatus({ departmentId: o.venue.id, leadId: b.leadId, status: "LOST" }), /why the lead is lost/);
    ok(await setLeadStatus({ departmentId: o.venue.id, leadId: b.leadId, status: "LOST", reason: "Price too high" }));
    fails(await setLeadStatus({ departmentId: o.venue.id, leadId: a.leadId, status: "BOOKED" }), /making its booking/);

    // Booked from the lead: the lead is Booked and linked; it cannot be booked twice.
    const bk = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(60), eventType: "Wedding", leadId: a.leadId, agreedPrice: 450000, priceNote: "As discussed", client: { name: "Mme Biya", phone: "6" } }));
    const lead = await db.venueLead.findUnique({ where: { id: a.leadId }, include: { booking: true } });
    expect(lead.status).toBe("BOOKED");
    expect(lead.booking.id).toBe(bk.bookingId);
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: d(61), eventType: "Wedding", leadId: a.leadId, client: { name: "Mme Biya", phone: "6" } }), /already booked/);
    fails(await setLeadStatus({ departmentId: o.venue.id, leadId: a.leadId, status: "LOST", reason: "x" }), /booked: cancel its booking/);

    const leads = await listLeads({ departmentId: o.venue.id });
    expect(leadStats(leads)).toMatchObject({ total: 3, open: 1, booked: 1, lost: 1, conversionRate: 50 });

    // Cancelling the booking cancels its lead.
    ok(await cancelBooking({ departmentId: o.venue.id, bookingId: bk.bookingId, reason: "Family event cancelled" }));
    expect((await db.venueLead.findUnique({ where: { id: a.leadId } })).status).toBe("CANCELLED");
  });

  it("another organization's head cannot read or change the leads", async () => {
    const other = await setupVenueOrganization("Other");
    const lead = await db.venueLead.findFirst({ where: { departmentId: o.venue.id } });
    await loginAs(other.head.id);
    fails(await setLeadStatus({ departmentId: other.venue.id, leadId: lead.id, status: "LOST", reason: "x" }), /Lead not found/);
    expect(await listLeads({ departmentId: other.venue.id })).toEqual([]);
  });
});
