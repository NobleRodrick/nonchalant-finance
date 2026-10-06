/** Property rental documents: kinds, titles and default texts (pure). */
export const PROPERTY_DOCUMENTS = {
  receipt: { title: "Receipt" },
  bill: { title: "Monthly bill" },
  statement: { title: "Tenant statement" },
  agreement: { title: "Rental agreement" },
  settlement: { title: "Move-out settlement" },
};

export const DEFAULT_LEASE_TERMS = [
  "1. The office is let for professional use only, to the tenant named above, who may not sublet it without written agreement.",
  "2. Rent is paid in advance on the due day stated above. Utilities and charges are paid as stated, on presentation of the monthly bill.",
  "3. The deposit (caution) guarantees the tenant's obligations. It is not rent: it is returned at the end of the contract, less any unpaid rent, charges or damages found at the final inspection.",
  "4. The tenant keeps the office in good condition and reports any damage at once. Repairs caused by the tenant are billed to the tenant.",
  "5. Either party may end the contract with the notice stated above, in writing. The office is returned clean, with its keys, after a final inspection.",
  "6. Rent may be revised at the dates agreed; the new rent applies from the month stated in writing.",
].join("\n");
