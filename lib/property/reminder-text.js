/**
 * Payment reminders to tenants (owner's choice: e-mail, and a WhatsApp link for the others): the
 * message and the wa.me link. Pure (safe for client components; unit-tested).
 */
import { formatMoney } from "@/lib/format";
import { CHARGE_KIND_LABELS } from "./account";

/** A phone number as WhatsApp wants it: digits with the country code (Cameroon 237 by default). */
export function waNumber(phone, country = "237") {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9) d = `${country}${d}`;
  return d.length >= 10 ? d : null;
}

/** The reminder: what is owed, by kind, and the next due date. */
export function reminderText({ business, tenant, office, outstanding, byKind = {}, monthsOwed = 0, next = null }) {
  const parts = Object.entries(byKind).filter(([, v]) => v > 0).map(([k, v]) => `${CHARGE_KIND_LABELS[k] || k}: ${formatMoney(v)}`);
  const lines = [
    `Hello ${tenant},`,
    outstanding > 0
      ? `This is a reminder from ${business || "your landlord"} for ${office}: ${formatMoney(outstanding)} is due${monthsOwed > 1 ? ` (${monthsOwed} months of rent)` : ""}.${parts.length > 1 ? ` ${parts.join(", ")}.` : ""}`
      : `This is a reminder from ${business || "your landlord"} for ${office}: ${next ? `${next.label} (${formatMoney(next.balance)}) is due on ${next.dueKey}.` : "your account is up to date. Thank you."}`,
    "Thank you for paying by Mobile Money, bank transfer or at the office, and keeping your receipt.",
  ];
  return lines.join("\n");
}

/** https://wa.me/<number>?text=… (null without a usable phone number). */
export function whatsappLink(phone, text) {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
