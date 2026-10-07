/**
 * SYSCOHADA financial statements from account figures (pure): the income statement (compte de
 * résultat) with its intermediate balances, the balance sheet (bilan) and the cash-flow statement
 * (tableau des flux de trésorerie). Inputs are { [accountNumber]: debit − credit } maps (and, for
 * customers and suppliers, balances by partner so advances are shown apart).
 */

const sumWhere = (bal, test) => Object.entries(bal).reduce((s, [n, v]) => (test(n) ? s + v : s), 0);
const starts = (n, list) => list.some((p) => n.startsWith(p));

/** Income (credit) of accounts starting with `prefixes`, minus `except` prefixes. */
function income(mv, prefixes, except = []) {
  return -sumWhere(mv, (n) => starts(n, prefixes) && !starts(n, except));
}
function expense(mv, prefixes, except = []) {
  return sumWhere(mv, (n) => starts(n, prefixes) && !starts(n, except));
}

/**
 * Income statement of a period from its movements { number: debit − credit } (classes 6–8).
 * Returns the lines in the SYSCOHADA order (code, label, amount, kind: income | expense | total).
 */
export function incomeStatement(mv) {
  const L = {};
  L.TA = income(mv, ["701"], ["7019"]);
  L.DISC = income(mv, ["7019"]); // negative: discounts given and debts forgiven
  L.RA = expense(mv, ["601"]);
  L.RB = expense(mv, ["6031"]);
  L.XA = L.TA - L.RA - L.RB;
  L.TB = income(mv, ["702", "703", "704"]);
  L.TC = income(mv, ["705", "706"]);
  L.TD = income(mv, ["707"]);
  L.XB = L.TA + L.DISC + L.TB + L.TC + L.TD;
  L.TE = income(mv, ["73"]);
  L.TF = income(mv, ["72"]);
  L.TG = income(mv, ["71"]);
  L.TH = income(mv, ["75"]);
  L.TI = income(mv, ["781"]);
  L.RC = expense(mv, ["602"]);
  L.RD = expense(mv, ["6032"]);
  L.RE = expense(mv, ["604", "605", "608"]);
  L.RF = expense(mv, ["6033"]);
  L.RG = expense(mv, ["61"]);
  L.RH = expense(mv, ["62", "63"]);
  L.RI = expense(mv, ["64"]);
  L.RJ = expense(mv, ["65"]);
  L.XC = L.XB + L.TE + L.TF + L.TG + L.TH + L.TI - (L.RA + L.RB + L.RC + L.RD + L.RE + L.RF + L.RG + L.RH + L.RI + L.RJ);
  L.RK = expense(mv, ["66"]);
  L.XD = L.XC - L.RK;
  L.TJ = income(mv, ["791", "798", "799"]);
  L.RL = expense(mv, ["681", "691"]);
  L.XE = L.XD + L.TJ - L.RL;
  L.TK = income(mv, ["77"]);
  L.TL = income(mv, ["797"]);
  L.TM = income(mv, ["787"]);
  L.RM = expense(mv, ["67"]);
  L.RN = expense(mv, ["697"]);
  L.XF = L.TK + L.TL + L.TM - L.RM - L.RN;
  L.XG = L.XE + L.XF;
  L.TN = income(mv, ["82"]);
  L.TO = income(mv, ["84", "86", "88"]);
  L.RO = expense(mv, ["81"]);
  L.RP = expense(mv, ["83", "85"]);
  L.XH = L.TN + L.TO - L.RO - L.RP;
  L.RQ = expense(mv, ["87"]);
  L.RS = expense(mv, ["89"]);
  L.XI = L.XG + L.XH - L.RQ - L.RS;
  return L;
}

export const INCOME_STATEMENT_LINES = [
  ["TA", "Ventes de marchandises", "Sales of goods", "income"],
  ["RA", "Achats de marchandises", "Purchases of goods", "expense"],
  ["RB", "Variation de stocks de marchandises", "Change in stocks of goods", "expense"],
  ["XA", "MARGE COMMERCIALE", "Trading margin", "total"],
  ["TB", "Ventes de produits fabriqués", "Sales of meals and products", "income"],
  ["TC", "Travaux, services vendus", "Services sold (events, nights, rent, rentals)", "income"],
  ["TD", "Produits accessoires", "Ancillary income", "income"],
  ["DISC", "Rabais, remises et ristournes accordés", "Discounts and debts forgiven", "income"],
  ["XB", "CHIFFRE D'AFFAIRES", "Turnover", "total"],
  ["TE", "Production stockée (ou déstockage)", "Production stocked", "income"],
  ["TF", "Production immobilisée", "Own work capitalised", "income"],
  ["TG", "Subventions d'exploitation", "Operating grants", "income"],
  ["TH", "Autres produits", "Other income", "income"],
  ["TI", "Transferts de charges d'exploitation", "Expenses transferred", "income"],
  ["RC", "Achats de matières premières et fournitures liées", "Raw materials (food)", "expense"],
  ["RD", "Variation de stocks de matières premières", "Change in stocks of raw materials", "expense"],
  ["RE", "Autres achats", "Other purchases (supplies, energy, water)", "expense"],
  ["RF", "Variation de stocks d'autres approvisionnements", "Change in other stocks", "expense"],
  ["RG", "Transports", "Transport", "expense"],
  ["RH", "Services extérieurs", "External services", "expense"],
  ["RI", "Impôts et taxes", "Taxes and licences", "expense"],
  ["RJ", "Autres charges", "Other expenses (losses, bad debts, gifts)", "expense"],
  ["XC", "VALEUR AJOUTÉE", "Value added", "total"],
  ["RK", "Charges de personnel", "Staff costs", "expense"],
  ["XD", "EXCÉDENT BRUT D'EXPLOITATION", "Gross operating surplus (EBITDA)", "total"],
  ["TJ", "Reprises d'amortissements, provisions et dépréciations", "Depreciation and provisions written back", "income"],
  ["RL", "Dotations aux amortissements, aux provisions et dépréciations", "Depreciation and provisions", "expense"],
  ["XE", "RÉSULTAT D'EXPLOITATION", "Operating result", "total"],
  ["TK", "Revenus financiers et assimilés", "Financial income", "income"],
  ["TL", "Reprises de provisions financières", "Financial provisions written back", "income"],
  ["TM", "Transferts de charges financières", "Financial expenses transferred", "income"],
  ["RM", "Frais financiers et charges assimilées", "Financial expenses (interest)", "expense"],
  ["RN", "Dotations aux provisions financières", "Financial provisions", "expense"],
  ["XF", "RÉSULTAT FINANCIER", "Financial result", "total"],
  ["XG", "RÉSULTAT DES ACTIVITÉS ORDINAIRES", "Result of ordinary activities", "total"],
  ["TN", "Produits des cessions d'immobilisations", "Proceeds of assets sold", "income"],
  ["TO", "Autres produits HAO", "Other exceptional income", "income"],
  ["RO", "Valeurs comptables des cessions d'immobilisations", "Book value of assets sold", "expense"],
  ["RP", "Autres charges HAO", "Other exceptional expenses", "expense"],
  ["XH", "RÉSULTAT HORS ACTIVITÉS ORDINAIRES", "Exceptional result", "total"],
  ["RQ", "Participation des travailleurs", "Employee profit sharing", "expense"],
  ["RS", "Impôts sur le résultat", "Income tax", "expense"],
  ["XI", "RÉSULTAT NET", "Net result", "total"],
];

/**
 * Where a balance-sheet account's balance goes: [code, side] — side "A" (asset, shown as debit −
 * credit) or "P" (liability, shown as credit − debit). Every account of classes 1–5 lands in exactly
 * one line, so the two totals always agree. Customers (41) and suppliers (40) are split by partner
 * before (advances apart).
 */
export function balanceLine(number, v) {
  const n = String(number);
  const c = n[0];
  if (c === "1") {
    if (starts(n, ["101", "102", "103", "104"])) return ["CA", "P"];
    if (n.startsWith("105")) return ["CD", "P"];
    if (n.startsWith("106")) return ["CE", "P"];
    if (n.startsWith("109")) return ["CB", "P"];
    if (n.startsWith("11")) return ["CF", "P"];
    if (n.startsWith("12")) return ["CH", "P"];
    if (n.startsWith("13")) return ["CJ", "P"];
    if (n.startsWith("14")) return ["CL", "P"];
    if (n.startsWith("15")) return ["CM", "P"];
    if (n.startsWith("17")) return ["DB", "P"];
    if (n.startsWith("19")) return ["DC", "P"];
    return ["DA", "P"];
  }
  if (c === "2") {
    const k = n.startsWith("28") || n.startsWith("29") ? n[2] : n[1];
    if (k === "0" || k === "1") return ["AD", "A"];
    if (k === "6" || k === "7") return ["AQ", "A"];
    return ["AI", "A"];
  }
  if (c === "3") return ["BB", "A"];
  if (c === "4") {
    if (n.startsWith("40")) return v >= 0 ? ["BH", "A"] : ["DJ", "P"];
    if (n.startsWith("419")) return ["DI", "P"];
    if (n.startsWith("41")) return v >= 0 ? ["BI", "A"] : ["DI", "P"];
    if (n.startsWith("499")) return ["DN", "P"];
    if (n.startsWith("49")) return ["BI", "A"];
    if (n.startsWith("48")) return v >= 0 ? ["BA", "A"] : ["DH", "P"];
    if (v >= 0) return ["BJ", "A"];
    return starts(n, ["42", "43", "44"]) ? ["DK", "P"] : ["DM", "P"];
  }
  if (c === "5") {
    if (n.startsWith("50")) return ["BQ", "A"];
    if (n.startsWith("51")) return ["BR", "A"];
    if (n.startsWith("565")) return ["DQ", "P"];
    if (n.startsWith("56")) return ["DR", "P"];
    return v >= 0 ? ["BS", "A"] : ["DR", "P"];
  }
  return null;
}

/**
 * Balance sheet at a date. `bal`: { number: debit − credit } of balance-sheet accounts (classes 1–5)
 * — customers' and suppliers' accounts may be given instead as `partners`: [{ number, balance }] by
 * partner, so a customer who paid ahead counts as an advance and a supplier paid ahead as an asset;
 * `result`: the current year's result; `priorResult`: results of previous years not yet allocated.
 */
export function balanceSheet({ bal, partners = null, result = 0, priorResult = 0 }) {
  const A = Object.fromEntries(BALANCE_SHEET_ASSET_LINES.map(([k]) => [k, 0]));
  const P = Object.fromEntries(BALANCE_SHEET_LIABILITY_LINES.map(([k]) => [k, 0]));
  const add = (number, v) => {
    if (!v) return;
    const target = balanceLine(number, v);
    if (!target) return;
    const [code, side] = target;
    if (side === "A") A[code] += v;
    else P[code] -= v;
  };
  // Accounts given by partner are left out of `bal` (both lists come from the same lines).
  const groups = new Set((partners || []).map((p) => String(p.number).slice(0, 2)));
  const byPartner = (n) => groups.has(n.slice(0, 2)) && !n.startsWith("419");
  for (const [n, v] of Object.entries(bal)) if (!byPartner(n)) add(n, v);
  for (const p of partners || []) add(p.number, p.balance);
  P.CH += priorResult;
  P.CJ += result;
  A.AZ = A.AD + A.AI + A.AQ;
  A.BK = A.BA + A.BB + A.BH + A.BI + A.BJ;
  A.BT = A.BQ + A.BR + A.BS;
  A.BZ = A.AZ + A.BK + A.BT;
  P.CP = P.CA + P.CB + P.CD + P.CE + P.CF + P.CH + P.CJ + P.CL + P.CM;
  P.DD = P.DA + P.DB + P.DC;
  P.DF = P.CP + P.DD;
  P.DP = P.DH + P.DI + P.DJ + P.DK + P.DM + P.DN;
  P.DT = P.DQ + P.DR;
  P.DZ = P.DF + P.DP + P.DT;
  return { assets: A, liabilities: P, balanced: A.BZ === P.DZ };
}

export const BALANCE_SHEET_ASSET_LINES = [
  ["AD", "Immobilisations incorporelles", "Intangible assets", "line"],
  ["AI", "Immobilisations corporelles (nettes)", "Equipment, furniture, buildings (net of depreciation)", "line"],
  ["AQ", "Immobilisations financières", "Financial assets (deposits paid)", "line"],
  ["AZ", "TOTAL ACTIF IMMOBILISÉ", "Total fixed assets", "total"],
  ["BA", "Actif circulant HAO", "Receivables on assets sold", "line"],
  ["BB", "Stocks et encours", "Stocks", "line"],
  ["BH", "Fournisseurs, avances versées", "Advances paid to suppliers", "line"],
  ["BI", "Clients", "Customers and tenants (owed to the business)", "line"],
  ["BJ", "Autres créances", "Other receivables (VAT credit, staff …)", "line"],
  ["BK", "TOTAL ACTIF CIRCULANT", "Total current assets", "total"],
  ["BQ", "Titres de placement", "Short-term investments", "line"],
  ["BR", "Valeurs à encaisser", "Cheques and payments to collect", "line"],
  ["BS", "Banques, chèques postaux, caisse et assimilés", "Bank, Mobile Money and cash", "line"],
  ["BT", "TOTAL TRÉSORERIE-ACTIF", "Total treasury", "total"],
  ["BZ", "TOTAL GÉNÉRAL", "Total assets", "grand"],
];

export const BALANCE_SHEET_LIABILITY_LINES = [
  ["CA", "Capital", "Capital and owner's account", "line"],
  ["CB", "Apporteurs capital non appelé", "Capital not called", "line"],
  ["CD", "Primes liées au capital social", "Share premium", "line"],
  ["CE", "Écarts de réévaluation", "Revaluation", "line"],
  ["CF", "Réserves", "Reserves", "line"],
  ["CH", "Report à nouveau", "Retained earnings (previous years)", "line"],
  ["CJ", "Résultat net de l'exercice", "Result of the year", "line"],
  ["CL", "Subventions d'investissement", "Investment grants", "line"],
  ["CM", "Provisions réglementées", "Regulated provisions", "line"],
  ["CP", "TOTAL CAPITAUX PROPRES", "Total equity", "total"],
  ["DA", "Emprunts et dettes financières diverses", "Loans and deposits received (cautions)", "line"],
  ["DB", "Dettes de location-acquisition", "Lease debts", "line"],
  ["DC", "Provisions pour risques et charges", "Provisions", "line"],
  ["DD", "TOTAL DETTES FINANCIÈRES", "Total financial debts", "total"],
  ["DF", "TOTAL RESSOURCES STABLES", "Total long-term resources", "total"],
  ["DH", "Dettes circulantes HAO", "Suppliers of fixed assets", "line"],
  ["DI", "Clients, avances reçues", "Customer advances (paid before the event, month or night)", "line"],
  ["DJ", "Fournisseurs d'exploitation", "Suppliers", "line"],
  ["DK", "Dettes fiscales et sociales", "Tax and social debts (VAT to pay …)", "line"],
  ["DM", "Autres dettes", "Other debts", "line"],
  ["DN", "Provisions pour risques à court terme", "Short-term provisions", "line"],
  ["DP", "TOTAL PASSIF CIRCULANT", "Total current liabilities", "total"],
  ["DQ", "Banques, crédits d'escompte", "Bank discount credit", "line"],
  ["DR", "Banques, crédits de trésorerie", "Bank overdrafts", "line"],
  ["DT", "TOTAL TRÉSORERIE-PASSIF", "Total treasury liabilities", "total"],
  ["DZ", "TOTAL GÉNÉRAL", "Total equity and liabilities", "grand"],
];

/** Treasury accounts (net treasury = these − overdrafts 56). */
export const isTreasury = (n) => starts(String(n), ["50", "51", "52", "53", "54", "55", "56", "57", "58"]);

/** Which section a counterpart account's flow belongs to. */
export function flowSection(number) {
  const n = String(number);
  if (starts(n, ["10", "11", "12", "13", "14", "15", "46"])) return "equity";
  if (starts(n, ["16", "17", "18", "19"])) return "borrowing";
  if (starts(n, ["2", "481", "482", "485", "82", "81"])) return "investing";
  return "operating";
}

/**
 * Cash-flow statement (direct method) from the entries of a period that move treasury: each
 * entry's net treasury movement is split over the sections of its other lines in proportion to
 * their amounts. `entries`: [{ lines: [{ number, debit, credit }] }]; opening / closing: net
 * treasury at the start and end. Transfers between treasury accounts cancel out.
 */
export function cashFlow({ entries, opening, closing }) {
  const s = { operating: 0, investing: 0, equity: 0, borrowing: 0 };
  const detail = { operatingIn: 0, operatingOut: 0, investingIn: 0, investingOut: 0, equityIn: 0, equityOut: 0, borrowingIn: 0, borrowingOut: 0 };
  for (const e of entries) {
    const cash = e.lines.filter((l) => isTreasury(l.number)).reduce((a, l) => a + l.debit - l.credit, 0);
    if (!cash) continue;
    const others = e.lines.filter((l) => !isTreasury(l.number));
    const weight = others.reduce((a, l) => a + Math.abs(l.debit - l.credit), 0);
    if (!weight) continue;
    let left = cash;
    others.forEach((l, i) => {
      const part = i === others.length - 1 ? left : Math.round((cash * Math.abs(l.debit - l.credit)) / weight);
      left -= part;
      const sec = flowSection(l.number);
      s[sec] += part;
      detail[`${sec}${part >= 0 ? "In" : "Out"}`] += Math.abs(part);
    });
  }
  const ZB = s.operating;
  const ZC = s.investing;
  const ZD = s.equity;
  const ZE = s.borrowing;
  const ZF = ZD + ZE;
  const ZG = ZB + ZC + ZF;
  return { ZA: opening, ZB, ZC, ZD, ZE, ZF, ZG, ZH: opening + ZG, closing, checks: opening + ZG === closing, detail };
}
