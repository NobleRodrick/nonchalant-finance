/**
 * The SYSCOHADA revised chart of accounts seeded for a company in Full accounting (pure data).
 * Official names in French; English labels shown in the app. The accountant may add sub-accounts
 * (more digits under an existing number) and switch accounts off; seeded accounts keep their number.
 * Classes: 1 equity & long-term debts, 2 fixed assets, 3 stocks, 4 third parties, 5 treasury,
 * 6 expenses, 7 income, 8 other (HAO) income and expenses and income tax.
 */
const A = (number, name, label, extra = {}) => ({ number, name, label, ...extra });

export const SYSCOHADA_ACCOUNTS = [
  // Class 1 — equity and long-term resources
  A("101", "Capital social", "Share capital"),
  A("104", "Compte de l'exploitant", "Owner's account"),
  A("111", "Réserve légale", "Legal reserve"),
  A("118", "Autres réserves", "Other reserves"),
  A("121", "Report à nouveau créditeur", "Retained earnings (credit)"),
  A("129", "Report à nouveau débiteur", "Retained losses (debit)"),
  A("131", "Résultat net : bénéfice", "Net result: profit"),
  A("139", "Résultat net : perte", "Net result: loss"),
  A("141", "Subventions d'équipement", "Investment grants"),
  A("162", "Emprunts et dettes auprès des établissements de crédit", "Bank loans"),
  A("165", "Dépôts et cautionnements reçus", "Deposits and guarantees received"),
  A("166", "Intérêts courus", "Accrued interest"),
  A("168", "Autres emprunts et dettes", "Other borrowings"),
  A("191", "Provisions pour litiges", "Provisions for disputes"),
  // Class 2 — fixed assets
  A("211", "Frais de développement", "Development costs"),
  A("213", "Logiciels et sites internet", "Software and websites"),
  A("221", "Terrains agricoles et forestiers", "Land"),
  A("231", "Bâtiments industriels, agricoles, administratifs et commerciaux sur sol propre", "Buildings"),
  A("234", "Aménagements, agencements et installations techniques", "Fittings and installations"),
  A("241", "Matériel et outillage industriel et commercial", "Equipment and tools"),
  A("244", "Matériel et mobilier", "Furniture and equipment"),
  A("2441", "Matériel de bureau", "Office equipment"),
  A("2444", "Mobilier de bureau", "Office furniture"),
  A("2446", "Matériel de location (articles loués)", "Rental equipment (items rented out)"),
  A("245", "Matériel de transport", "Vehicles"),
  A("275", "Dépôts et cautionnements versés", "Deposits and guarantees paid"),
  A("2813", "Amortissements des logiciels", "Depreciation of software"),
  A("2831", "Amortissements des bâtiments", "Depreciation of buildings"),
  A("2834", "Amortissements des aménagements et installations", "Depreciation of fittings"),
  A("2841", "Amortissements du matériel et outillage", "Depreciation of equipment and tools"),
  A("2844", "Amortissements du matériel et mobilier", "Depreciation of furniture and equipment"),
  A("2845", "Amortissements du matériel de transport", "Depreciation of vehicles"),
  // Class 3 — stocks
  A("311", "Marchandises", "Goods for resale"),
  A("321", "Matières premières", "Raw materials (food ingredients)"),
  A("335", "Emballages", "Packaging"),
  A("6031", "Variations des stocks de marchandises", "Change in stocks of goods"),
  A("6032", "Variations des stocks de matières premières", "Change in stocks of raw materials"),
  // Class 4 — third parties
  A("401", "Fournisseurs, dettes en compte", "Suppliers"),
  A("408", "Fournisseurs, factures non parvenues", "Suppliers, invoices to receive"),
  A("409", "Fournisseurs débiteurs (avances versées)", "Advances paid to suppliers"),
  A("4094", "Fournisseurs, créances pour emballages et matériels à rendre", "Crate deposits paid to suppliers"),
  A("411", "Clients", "Customers"),
  A("416", "Créances clients litigieuses ou douteuses", "Doubtful customers"),
  A("418", "Clients, produits à recevoir", "Customers, income to invoice"),
  A("4191", "Clients, avances et acomptes reçus", "Customer advances received"),
  A("4194", "Clients, dettes pour emballages et matériels consignés", "Bottle deposits received from customers"),
  A("421", "Personnel, avances et acomptes", "Staff advances"),
  A("422", "Personnel, rémunérations dues", "Salaries payable"),
  A("431", "Sécurité sociale (CNPS)", "Social security (CNPS)"),
  A("441", "État, impôt sur les bénéfices", "State, income tax"),
  A("442", "État, autres impôts et taxes", "State, other taxes"),
  A("4431", "État, TVA facturée sur ventes", "VAT collected on sales"),
  A("4432", "État, TVA facturée sur prestations de services", "VAT collected on services"),
  A("4441", "État, TVA due ou crédit de TVA", "VAT payable"),
  A("4449", "État, crédit de TVA à reporter", "VAT credit carried forward"),
  A("4451", "État, TVA récupérable sur immobilisations", "Deductible VAT on fixed assets"),
  A("4452", "État, TVA récupérable sur achats", "Deductible VAT on purchases"),
  A("4454", "État, TVA récupérable sur services extérieurs et autres charges", "Deductible VAT on services"),
  A("447", "État, impôts retenus à la source", "Taxes withheld at source"),
  A("462", "Associés, comptes courants", "Shareholders' current accounts"),
  A("465", "Associés, dividendes à payer", "Dividends payable"),
  A("471", "Débiteurs et créditeurs divers", "Other debtors and creditors"),
  A("4711", "Compte d'attente", "Suspense account"),
  A("476", "Charges constatées d'avance", "Prepaid expenses"),
  A("477", "Produits constatés d'avance", "Deferred income"),
  A("481", "Fournisseurs d'investissements", "Suppliers of fixed assets"),
  A("485", "Créances sur cessions d'immobilisations", "Receivables on assets sold"),
  // Class 5 — treasury
  A("513", "Chèques à encaisser", "Cheques and other payments to collect"),
  A("521", "Banques locales", "Banks"),
  A("5211", "Banque principale", "Main bank account"),
  A("552", "Monnaie électronique (téléphone portable)", "Mobile Money"),
  A("561", "Banques, crédits de trésorerie", "Bank overdrafts"),
  A("571", "Caisse", "Cash"),
  A("5711", "Caisses des départements", "Department cash drawers"),
  A("5712", "Caisse centrale (direction)", "Boss's cash (central cash)"),
  A("585", "Virements de fonds", "Transfers between treasury accounts"),
  // Class 6 — expenses
  A("601", "Achats de marchandises", "Purchases of goods"),
  A("602", "Achats de matières premières et fournitures liées", "Purchases of raw materials (food)"),
  A("604", "Achats stockés de matières et fournitures consommables", "Consumable supplies"),
  A("6051", "Fournitures non stockables, eau", "Water"),
  A("6052", "Fournitures non stockables, électricité", "Electricity"),
  A("6053", "Fournitures non stockables, autres énergies", "Fuel, gas and other energy"),
  A("6054", "Fournitures d'entretien non stockables", "Cleaning supplies"),
  A("6055", "Fournitures de bureau non stockables", "Office supplies"),
  A("6056", "Achats de petit matériel et outillage", "Small equipment"),
  A("6058", "Achats de travaux, matériels et équipements", "Works and equipment bought"),
  A("608", "Achats d'emballages", "Packaging"),
  A("612", "Transports sur ventes", "Delivery and transport on sales"),
  A("618", "Autres frais de transport", "Other transport costs"),
  A("622", "Locations et charges locatives", "Rentals (sound, lighting, equipment)"),
  A("624", "Entretien, réparations et maintenance", "Repairs and maintenance"),
  A("625", "Primes d'assurance", "Insurance"),
  A("627", "Publicité, publications, relations publiques", "Advertising and marketing"),
  A("628", "Frais de télécommunications", "Phone and internet"),
  A("631", "Frais bancaires", "Bank and Mobile Money charges"),
  A("632", "Rémunérations d'intermédiaires et de conseils", "Fees (accountant, lawyer, agents)"),
  A("637", "Rémunérations de personnel extérieur à l'entreprise", "Outside staff (security, cleaners, waiters)"),
  A("638", "Autres charges externes", "Other external costs"),
  A("641", "Impôts et taxes directs", "Taxes and licences"),
  A("646", "Droits d'enregistrement", "Registration duties"),
  A("647", "Pénalités et amendes fiscales", "Tax penalties"),
  A("651", "Pertes sur créances clients et autres débiteurs", "Bad debts written off"),
  A("658", "Charges diverses", "Other expenses"),
  A("6581", "Pertes et vols d'actifs", "Assets lost or stolen"),
  A("6582", "Dons", "Donations and gifts"),
  A("6588", "Autres charges diverses", "Fines and miscellaneous expenses"),
  A("661", "Rémunérations directes versées au personnel national", "Salaries and wages"),
  A("664", "Charges sociales", "Social charges"),
  A("671", "Intérêts des emprunts", "Interest on loans"),
  A("681", "Dotations aux amortissements d'exploitation", "Depreciation"),
  A("691", "Dotations aux provisions d'exploitation", "Provisions"),
  // Class 7 — income
  A("701", "Ventes de marchandises", "Sales of goods"),
  A("7019", "Rabais, remises et ristournes accordés", "Discounts and debts forgiven"),
  A("702", "Ventes de produits finis", "Sales of meals and products"),
  A("706", "Services vendus", "Services sold"),
  A("7061", "Locations de salles et événements", "Hall rental and events"),
  A("7062", "Hébergement (nuitées)", "Accommodation (nights)"),
  A("7063", "Location de matériel et décoration", "Equipment and decoration rental"),
  A("7064", "Loyers de bureaux et locaux", "Office rent"),
  A("7065", "Charges refacturées aux locataires", "Charges re-billed to tenants"),
  A("7066", "Dommages et pertes facturés aux clients", "Damages charged to customers"),
  A("707", "Produits accessoires", "Ancillary income"),
  A("7073", "Locations diverses", "Other rentals (stalls, space, equipment)"),
  A("7078", "Autres produits accessoires", "Other ancillary income (catering, services)"),
  A("758", "Produits divers", "Other income"),
  A("7581", "Indemnités et dédits reçus", "Kept on cancellations and penalties received"),
  A("771", "Intérêts de prêts et créances diverses", "Interest received"),
  A("791", "Reprises de provisions d'exploitation", "Provisions written back"),
  // Class 8 — HAO and income tax
  A("812", "Valeurs comptables des cessions d'immobilisations corporelles", "Book value of assets sold"),
  A("822", "Produits des cessions d'immobilisations corporelles", "Proceeds of assets sold"),
  A("831", "Charges HAO constatées", "Exceptional expenses"),
  A("841", "Produits HAO constatés", "Exceptional income"),
  A("891", "Impôts sur les bénéfices de l'exercice", "Income tax"),
];

/** Treasury accounts matched against bank / MoMo statements. */
export const RECONCILABLE = new Set(["521", "5211", "552", "513"]);

export const JOURNALS = [
  { code: "VE", name: "Ventes", label: "Sales and revenue", kind: "SALES" },
  { code: "AC", name: "Achats", label: "Purchases and expenses", kind: "PURCHASES" },
  { code: "CA", name: "Caisse", label: "Cash", kind: "CASH" },
  { code: "BQ", name: "Banque", label: "Bank", kind: "BANK" },
  { code: "MM", name: "Monnaie électronique", label: "Mobile Money", kind: "MOBILE_MONEY" },
  { code: "OD", name: "Opérations diverses", label: "General entries", kind: "GENERAL" },
  { code: "AN", name: "À-nouveaux", label: "Opening balances", kind: "OPENING" },
];

export const JOURNAL_LABELS = Object.fromEntries(JOURNALS.map((j) => [j.code, j.label]));

/** Class of an account number (1–8). */
export function accountClass(number) {
  return Number(String(number)[0]);
}

/**
 * Nature of an account for statements: balance-sheet (classes 1–5) or income statement (6–8, but
 * 6031/6032 stock changes are expenses too). The sign of its normal balance: debit for assets and
 * expenses, credit for equity, liabilities and income.
 */
export function accountNature(number) {
  const n = String(number);
  const c = accountClass(n);
  if (c === 6 || n.startsWith("81") || n.startsWith("83") || n.startsWith("85") || n.startsWith("87") || n.startsWith("89")) return "EXPENSE";
  if (c === 7 || n.startsWith("82") || n.startsWith("84") || n.startsWith("86") || n.startsWith("88")) return "INCOME";
  if (c === 1) return "EQUITY_LIABILITY";
  if (c === 2 || c === 3) return n.startsWith("28") || n.startsWith("29") || n.startsWith("39") ? "CONTRA_ASSET" : "ASSET";
  return "THIRD_PARTY"; // 4 and 5: asset or liability depending on the balance
}

export function isIncomeStatementAccount(number) {
  const n = accountNature(number);
  return n === "EXPENSE" || n === "INCOME";
}

/** A valid account number: digits only, 3 to 10, and a class 1 to 8. */
export function validAccountNumber(number) {
  return /^[1-8]\d{2,9}$/.test(String(number || ""));
}
