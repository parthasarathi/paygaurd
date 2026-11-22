export const normalizeKey = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

// Invoice numbers are compared without separators, case or leading zeros: "INV-0042" == "inv 42".
export const normalizeInvoiceNumber = (s: string) => {
  const k = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return k.replace(/^([a-z]*)0+(?=\d)/, "$1");
};
