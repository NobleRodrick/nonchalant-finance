/** Reading a bank or Mobile Money statement exported as CSV (pure: runs in the browser too). */
import { isDateKey } from "@/lib/timezone";

/**
 * Pure: parses CSV text of a statement into rows. Columns are found by their header: date, label /
 * description / libellé, reference / ref, amount / montant, or debit and credit. Dates as
 * YYYY-MM-DD or DD/MM/YYYY; amounts with spaces or dots as thousands separators.
 */
export function parseStatementCsv(textIn) {
  const raw = String(textIn || "").replace(/^﻿/, "").trim();
  if (!raw) return { rows: [], errors: ["The file is empty."] };
  const sep = (raw.split("\n")[0].match(/;/g) || []).length > (raw.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const split = (line) => {
    const out = [];
    let cur = "";
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = col("date");
  const iLabel = col("label", "description", "libell", "details", "narration");
  const iRef = col("ref", "réf");
  const iAmount = col("amount", "montant");
  const iDebit = col("debit", "débit", "withdraw", "sortie");
  const iCredit = col("credit", "crédit", "deposit", "entrée");
  if (iDate < 0 || (iAmount < 0 && (iDebit < 0 || iCredit < 0))) return { rows: [], errors: ["The first line must name the columns: date, label, amount (or debit and credit)."] };
  const num = (s) => {
    const v = String(s || "").replace(/\s| /g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : NaN;
  };
  const dateOf = (s) => {
    const v = String(s || "").trim();
    if (isDateKey(v.slice(0, 10))) return v.slice(0, 10);
    const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
  };
  const rows = [];
  const errors = [];
  lines.slice(1).forEach((line, i) => {
    const c = split(line);
    const dateKey = dateOf(c[iDate]);
    const amount = iAmount >= 0 ? num(c[iAmount]) : (num(c[iCredit]) || 0) - (num(c[iDebit]) || 0);
    if (!dateKey || !Number.isFinite(amount) || !amount) {
      if (c.some((x) => x)) errors.push(`Line ${i + 2} skipped (date or amount not read).`);
      return;
    }
    rows.push({ dateKey, label: (iLabel >= 0 ? c[iLabel] : "") || "Statement line", reference: iRef >= 0 ? c[iRef] || null : null, amount });
  });
  return { rows, errors };
}
