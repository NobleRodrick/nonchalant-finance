/**
 * Reading form input in property rental operations: trimmed text, whole francs, dates and
 * months, with the message a person understands. Throws `invalid` errors.
 */
import { invalid } from "@/lib/errors";

export const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

/** Whole francs (0 or more); empty is 0 unless `required`. */
export function francs(value, label, { required = false, min = 0 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw invalid(`Enter ${label.toLowerCase()}.`);
    return 0;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw invalid(`${label} must be a whole number of francs${min ? ` of at least ${min}` : " (0 or more)"}.`);
  return n;
}

/** A whole number in [min, max]; empty gives `fallback`. */
export function whole(value, label, { min = 0, max = 1_000_000_000, fallback = null } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label} must be a whole number between ${min} and ${max}.`);
  return n;
}

/** A decimal number ≥ 0 (meter readings, sizes); empty gives null. */
export function decimal(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw invalid(`${label} must be a number (0 or more).`);
  return Math.round(n * 1000) / 1000;
}

/** "YYYY-MM-DD" → a date stored as a day; empty gives null unless `required`. */
export function dateKeyInput(value, label, { required = false } = {}) {
  if (!value) {
    if (required) throw invalid(`Choose ${label.toLowerCase()}.`);
    return null;
  }
  const v = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw invalid(`${label} is not a valid date.`);
  return v;
}

/** "YYYY-MM"; empty gives null unless `required`. */
export function monthInput(value, label, { required = false } = {}) {
  if (!value) {
    if (required) throw invalid(`Choose ${label.toLowerCase()}.`);
    return null;
  }
  const v = String(value).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw invalid(`${label} is not a valid month.`);
  return v;
}

export const dbDay = (dateKey) => (dateKey ? new Date(`${dateKey}T00:00:00.000Z`) : null);
