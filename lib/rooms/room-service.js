/**
 * Rooms and stays of a rooms department (e.g. Executive Stay), run by the operations inside their
 * transaction. No two stays of a room share a night: each stay takes a lock on its room, then
 * checks the room's stays. A free room of an event venue package is a complimentary stay that
 * names the venue booking it comes from (created from the venue: lib/venue/package-service).
 */
import { recordAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/format";
import { conflict, invalid, notFound } from "@/lib/errors";
import { nextReference, DOC_TYPES } from "@/lib/documents/sequence";
import { addDaysToKey, isDateKey, toDateKey } from "@/lib/timezone";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";
import { OCCUPYING, nightsOf, suggestedPrice } from "./stay-math";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function wholeOrNull(value, label, { min = 0, max = 1e9 } = {}) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label} must be a whole number${min > 0 ? ` of at least ${min}` : " (0 or more)"}.`);
  return n;
}

/** Adds a room, or changes one. */
export async function saveRoom(tx, { user, department }, input) {
  const name = text(input?.name, 60);
  if (!name) throw invalid("Enter the room's number or name.");
  const data = {
    name,
    roomType: text(input.roomType, 60),
    capacity: wholeOrNull(input.capacity, "The capacity", { min: 1, max: 50 }),
    nightlyRate: wholeOrNull(input.nightlyRate, "The rate of a night") ?? 0,
    weeklyRate: wholeOrNull(input.weeklyRate, "The rate of a week"),
    monthlyRate: wholeOrNull(input.monthlyRate, "The rate of a month"),
    description: text(input.description, 1000),
    notes: text(input.notes, 500),
    isActive: input.isActive === undefined ? true : Boolean(input.isActive),
  };
  try {
    if (input.id) {
      const existing = await tx.room.findFirst({ where: { id: input.id, departmentId: department.id } });
      if (!existing) throw notFound("Room not found.");
      const room = await tx.room.update({ where: { id: existing.id }, data });
      await recordAudit(tx, { user, departmentId: department.id, action: "ROOM_UPDATED", entityType: "Room", entityId: room.id, before: { name: existing.name, nightlyRate: existing.nightlyRate, isActive: existing.isActive }, after: data });
      return { roomId: room.id };
    }
    const room = await tx.room.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id } });
    await recordAudit(tx, { user, departmentId: department.id, action: "ROOM_CREATED", entityType: "Room", entityId: room.id, after: data });
    return { roomId: room.id };
  } catch (error) {
    if (error?.code === "P2002") throw conflict(`A room named "${name}" already exists.`);
    throw error;
  }
}

/** Locks a room and refuses the nights [inKey, outKey) when another stay holds one of them. */
export async function claimRoomNights(tx, { roomId, inKey, outKey, exceptId = null }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`room:${roomId}`}))`;
  const clash = await tx.roomBooking.findFirst({
    where: { roomId, status: { in: OCCUPYING }, checkIn: { lt: dbDate(outKey) }, checkOut: { gt: dbDate(inKey) }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { referenceNo: true, guestName: true, checkIn: true, checkOut: true },
  });
  if (clash) throw conflict(`The room is taken from ${dateKeyOf(clash.checkIn)} to ${dateKeyOf(clash.checkOut)} (${clash.referenceNo}, ${clash.guestName}). Choose another room or other dates.`);
}

const BOOKING_TYPES = ["NIGHT", "WEEK", "MONTH", "OTHER"];

/** The price of a stay: the given price, or the apartment's suggested one; a different price needs a reason. */
function stayPrice(room, nights, input, complimentary) {
  if (complimentary) return { total: 0, note: null };
  const bookingType = BOOKING_TYPES.includes(input.bookingType) ? input.bookingType : "NIGHT";
  const suggested = suggestedPrice(room, nights, bookingType);
  let total = wholeOrNull(input.totalPrice, "The price of the stay");
  const typed = total !== null;
  // Older forms send a rate of a night.
  if (total === null && input.nightlyRate !== undefined && input.nightlyRate !== "" && input.nightlyRate !== null) total = wholeOrNull(input.nightlyRate, "The rate of a night") * nights;
  if (total === null) total = suggested;
  const note = text(input.priceNote, 300);
  if (typed && total !== suggested && !note) throw invalid(`The usual price is ${formatMoney(suggested)}: say why this booking is priced differently.`);
  return { total, note, bookingType };
}

/** Refuses an apartment under maintenance or unavailable. */
function assertBookable(room) {
  if (!room.isActive) throw invalid(`Room ${room.name} is not in use.`);
  if (room.state === "MAINTENANCE") throw invalid(`${room.name} is under maintenance${room.stateNote ? ` (${room.stateNote})` : ""}: set it available before booking it.`);
  if (room.state === "UNAVAILABLE") throw invalid(`${room.name} is unavailable${room.stateNote ? ` (${room.stateNote})` : ""}: set it available before booking it.`);
}

/**
 * Creates a stay in `department` (a rooms department). `complimentary` stays (from a venue
 * package) cost nothing; others are priced at the apartment's suggested price unless a price is
 * given (with a reason when it differs).
 */
export async function createStay(tx, { user, department, now, timeZone }, input, { sourceVenueBookingId = null, complimentary = false } = {}) {
  const room = await tx.room.findFirst({ where: { id: input?.roomId || "-", departmentId: department.id } });
  if (!room) throw notFound("Room not found.");
  assertBookable(room);
  const inKey = input.checkInKey;
  const outKey = input.checkOutKey;
  if (!isDateKey(inKey) || !isDateKey(outKey)) throw invalid("Choose the arrival and departure dates.");
  if (outKey <= inKey) throw invalid("The departure must be after the arrival (at least one night).");
  const todayKey = toDateKey(now || new Date(), timeZone);
  if (inKey < todayKey && !input.allowPast) throw invalid("The arrival date has passed.");
  const guestName = text(input.guestName, 120);
  if (!guestName) throw invalid("Enter the guest's name.");
  await claimRoomNights(tx, { roomId: room.id, inKey, outKey });
  const nights = nightsOf(inKey, outKey);
  const price = stayPrice(room, nights, input, complimentary);
  const stay = await tx.roomBooking.create({
    data: {
      organizationId: user.organizationId,
      departmentId: department.id,
      roomId: room.id,
      referenceNo: await nextReference(tx, department.id, DOC_TYPES.ROOM_STAY),
      guestName,
      guestPhone: text(input.guestPhone, 40),
      guestEmail: text(input.guestEmail, 120),
      guestCount: wholeOrNull(input.guestCount, "The number of guests", { min: 1, max: 50 }),
      bookingType: complimentary ? "OTHER" : price.bookingType,
      priceNote: complimentary ? "Free with an event venue package" : price.note,
      checkIn: dbDate(inKey),
      checkOut: dbDate(outKey),
      status: input.status === "RESERVED" ? "RESERVED" : "CONFIRMED",
      nightlyRate: Math.round(price.total / nights),
      totalPrice: price.total,
      complimentary,
      sourceVenueBookingId,
      notes: text(input.notes, 1000),
      createdById: user.id,
    },
  });
  await recordAudit(tx, { user, departmentId: department.id, action: "STAY_CREATED", entityType: "RoomBooking", entityId: stay.id, after: { referenceNo: stay.referenceNo, room: room.name, checkIn: inKey, checkOut: outKey, totalPrice: price.total, complimentary, sourceVenueBookingId } });
  return { stayId: stay.id, referenceNo: stay.referenceNo, roomName: room.name, nights, totalPrice: stay.totalPrice };
}

/**
 * Changes a stay not finished yet: guest details, notes, price (with a reason), apartment and
 * dates (the new nights must be free; a guest in the apartment keeps the arrival date).
 */
export async function updateStay(tx, { user, department, now, timeZone }, input) {
  const stay = await tx.roomBooking.findFirst({ where: { id: input?.stayId || "-", departmentId: department.id }, include: { room: true } });
  if (!stay) throw notFound("Stay not found.");
  if (!["RESERVED", "CONFIRMED", "CHECKED_IN"].includes(stay.status)) throw invalid(`Stay ${stay.referenceNo} is ${stay.status.toLowerCase().replace("_", " ")}: it can no longer change.`);
  if (stay.complimentary && (input.totalPrice !== undefined || input.roomId || input.checkInKey || input.checkOutKey)) throw invalid("A free room of a venue package is changed from the venue booking.");
  const data = {};
  if (input.guestName !== undefined) {
    data.guestName = text(input.guestName, 120);
    if (!data.guestName) throw invalid("Enter the guest's name.");
  }
  for (const [k, max] of [["guestPhone", 40], ["guestEmail", 120], ["notes", 1000]]) if (input[k] !== undefined) data[k] = text(input[k], max);
  if (input.guestCount !== undefined) data.guestCount = wholeOrNull(input.guestCount, "The number of guests", { min: 1, max: 50 });
  const inKey = input.checkInKey || dateKeyOf(stay.checkIn);
  const outKey = input.checkOutKey || dateKeyOf(stay.checkOut);
  const roomId = input.roomId || stay.roomId;
  const moved = inKey !== dateKeyOf(stay.checkIn) || outKey !== dateKeyOf(stay.checkOut) || roomId !== stay.roomId;
  if (moved) {
    if (!isDateKey(inKey) || !isDateKey(outKey) || outKey <= inKey) throw invalid("The departure must be after the arrival (at least one night).");
    if (stay.status === "CHECKED_IN" && (inKey !== dateKeyOf(stay.checkIn) || roomId !== stay.roomId)) throw invalid("The guest is in the apartment: only the departure date can change.");
    const todayKey = toDateKey(now || new Date(), timeZone);
    if (stay.status !== "CHECKED_IN" && inKey < todayKey) throw invalid("The arrival date has passed.");
    let room = stay.room;
    if (roomId !== stay.roomId) {
      room = await tx.room.findFirst({ where: { id: roomId, departmentId: department.id } });
      if (!room) throw notFound("Room not found.");
      assertBookable(room);
    }
    await claimRoomNights(tx, { roomId, inKey, outKey, exceptId: stay.id });
    Object.assign(data, { roomId, checkIn: dbDate(inKey), checkOut: dbDate(outKey) });
  }
  const nights = nightsOf(inKey, outKey);
  if (input.totalPrice !== undefined && input.totalPrice !== null && input.totalPrice !== "") {
    const total = wholeOrNull(input.totalPrice, "The price of the stay");
    if (total !== stay.totalPrice) {
      const note = text(input.priceNote, 300);
      if (!note) throw invalid("Say why the price changes.");
      Object.assign(data, { totalPrice: total, priceNote: note });
    }
  }
  if (input.bookingType && BOOKING_TYPES.includes(input.bookingType)) data.bookingType = input.bookingType;
  data.nightlyRate = Math.round((data.totalPrice ?? stay.totalPrice) / nights);
  const updated = await tx.roomBooking.update({ where: { id: stay.id }, data });
  await recordAudit(tx, { user, departmentId: department.id, action: "STAY_UPDATED", entityType: "RoomBooking", entityId: stay.id, before: { roomId: stay.roomId, checkIn: dateKeyOf(stay.checkIn), checkOut: dateKeyOf(stay.checkOut), totalPrice: stay.totalPrice }, after: { roomId, checkIn: inKey, checkOut: outKey, totalPrice: updated.totalPrice, priceNote: updated.priceNote } });
  return { stayId: stay.id, referenceNo: stay.referenceNo, nights, totalPrice: updated.totalPrice };
}

const NEXT = { checkin: { from: ["RESERVED", "CONFIRMED"], to: "CHECKED_IN" }, checkout: { from: ["CHECKED_IN"], to: "CHECKED_OUT" }, confirm: { from: ["RESERVED"], to: "CONFIRMED" } };

/**
 * Confirm, check in or check out a stay (the time is recorded). A guest checks in from the
 * arrival date. Checking out before the planned departure ends the stay that day (at least one
 * night); its price may change then, with a reason.
 */
export async function moveStay(tx, { user, department, now, timeZone }, input) {
  const step = NEXT[input?.step];
  if (!step) throw invalid("Unknown step.");
  const stay = await tx.roomBooking.findFirst({ where: { id: input.stayId || "-", departmentId: department.id } });
  if (!stay) throw notFound("Stay not found.");
  if (!step.from.includes(stay.status)) throw invalid(`Stay ${stay.referenceNo} is ${stay.status.toLowerCase().replace("_", " ")}.`);
  const at = now || new Date();
  const todayKey = toDateKey(at, timeZone);
  const data = { status: step.to };
  const inKey = dateKeyOf(stay.checkIn);
  if (input.step === "checkin") {
    if (todayKey < inKey) throw invalid(`The guest arrives on ${inKey}: check in from that day (or change the arrival date).`);
    data.checkedInAt = at;
  }
  if (input.step === "checkout") {
    data.checkedOutAt = at;
    const outKey = dateKeyOf(stay.checkOut);
    if (todayKey < outKey) {
      const endKey = todayKey > inKey ? todayKey : addDaysToKey(inKey, 1);
      data.checkOut = dbDate(endKey);
      const nights = nightsOf(inKey, endKey);
      if (input.totalPrice !== undefined && input.totalPrice !== null && input.totalPrice !== "" && !stay.complimentary) {
        const total = wholeOrNull(input.totalPrice, "The price of the stay");
        if (total !== stay.totalPrice) {
          const note = text(input.priceNote, 300);
          if (!note) throw invalid("Say why the price changes.");
          Object.assign(data, { totalPrice: total, priceNote: note });
        }
      }
      data.nightlyRate = Math.round((data.totalPrice ?? stay.totalPrice) / nights);
    }
  }
  await tx.roomBooking.update({ where: { id: stay.id }, data });
  await recordAudit(tx, { user, departmentId: department.id, action: `STAY_${step.to}`, entityType: "RoomBooking", entityId: stay.id, before: { status: stay.status }, after: { status: step.to, checkOut: data.checkOut ? dateKeyOf(data.checkOut) : undefined, totalPrice: data.totalPrice } });
  return { stayId: stay.id, referenceNo: stay.referenceNo, status: step.to };
}

/** Sets an apartment available, under maintenance or unavailable (with a note). */
export async function setRoomState(tx, { user, department }, input) {
  const room = await tx.room.findFirst({ where: { id: input?.roomId || "-", departmentId: department.id } });
  if (!room) throw notFound("Room not found.");
  if (!["AVAILABLE", "MAINTENANCE", "UNAVAILABLE"].includes(input.state)) throw invalid("Choose: available, under maintenance or unavailable.");
  const note = text(input.note, 300);
  if (input.state !== "AVAILABLE" && !note) throw invalid("Say why the apartment cannot be let.");
  await tx.room.update({ where: { id: room.id }, data: { state: input.state, stateNote: input.state === "AVAILABLE" ? null : note } });
  await recordAudit(tx, { user, departmentId: department.id, action: "ROOM_STATE_CHANGED", entityType: "Room", entityId: room.id, before: { state: room.state }, after: { state: input.state, note } });
  return { roomId: room.id, state: input.state };
}

/** Cancels a stay (frees its nights). `departmentId` scope: the rooms department, or any of the organization for a package room. */
export async function cancelStay(tx, { user, now }, { stay, reason }) {
  if (!["RESERVED", "CONFIRMED"].includes(stay.status)) throw invalid(`Stay ${stay.referenceNo} is ${stay.status.toLowerCase().replace("_", " ")}: it cannot be cancelled.`);
  const why = text(reason, 300);
  if (!why) throw invalid("Say why the stay is cancelled.");
  await tx.roomBooking.update({ where: { id: stay.id }, data: { status: "CANCELLED", cancelledAt: now || new Date(), cancelReason: why } });
  await recordAudit(tx, { user, departmentId: stay.departmentId, action: "STAY_CANCELLED", entityType: "RoomBooking", entityId: stay.id, before: { status: stay.status }, after: { status: "CANCELLED", reason: why } });
  return { stayId: stay.id, referenceNo: stay.referenceNo };
}

/** Cancel operation of a rooms department. */
export async function cancelStayOfDepartment(tx, ctx, input) {
  const stay = await tx.roomBooking.findFirst({ where: { id: input?.stayId || "-", departmentId: ctx.department.id } });
  if (!stay) throw notFound("Stay not found.");
  return cancelStay(tx, ctx, { stay, reason: input.reason });
}
