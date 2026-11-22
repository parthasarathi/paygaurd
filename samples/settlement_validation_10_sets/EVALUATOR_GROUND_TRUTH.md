# Evaluator Ground Truth — 10 Sets
Each Set_NN folder contains exactly three input PDFs: contract, PO, invoice. Keep this guide out of the app's upload flow during blind testing.
All parties, IDs, addresses, tax identifiers and bank details are fictional. Synthetic test data only; no payment or tax validity.

## Set 01: DISPUTE — HOLD / REVIEW
- Contract: MSA-26-101 | PO: PO-26-0501 | Invoice: INV-26-0901
- PO total: INR 120,183.00; invoice total: INR 120,183.00; variance: INR 0.00
- Dispute pattern: reference
- Finding: Invoice PO reference does not match the supplied purchase order.

## Set 02: DISPUTE — HOLD / REVIEW
- Contract: MSA-26-102 | PO: PO-26-0502 | Invoice: INV-26-0902
- PO total: INR 166,675.00; invoice total: INR 166,675.00; variance: INR 0.00
- Dispute pattern: reference
- Finding: Invoice PO reference does not match the supplied purchase order.

## Set 03: VALID — MATCH
- Contract: MSA-26-103 | PO: PO-26-0503 | Invoice: INV-26-0903
- PO total: INR 75,005.52; invoice total: INR 75,005.52; variance: INR 0.00
- Expected: parties, references, line descriptions, quantities, unit prices, tax rate and totals match.

## Set 04: DISPUTE — HOLD / REVIEW
- Contract: MSA-26-104 | PO: PO-26-0504 | Invoice: INV-26-0904
- PO total: INR 328,807.00; invoice total: INR 576,607.00; variance: INR 247,800.00
- Dispute pattern: duplicate
- Finding: Potential duplicate invoice line: 55-inch digital display repeated with same quantity and price.

## Set 05: VALID — MATCH
- Contract: MSA-26-105 | PO: PO-26-0505 | Invoice: INV-26-0905
- PO total: INR 238,655.00; invoice total: INR 238,655.00; variance: INR 0.00
- Expected: parties, references, line descriptions, quantities, unit prices, tax rate and totals match.

## Set 06: DISPUTE — HOLD / REVIEW
- Contract: MSA-26-106 | PO: PO-26-0506 | Invoice: INV-26-0906
- PO total: INR 112,973.20; invoice total: INR 116,442.40; variance: INR 3,469.20
- Dispute pattern: duplicate
- Finding: Potential duplicate invoice line: Medical gloves box of 100 repeated with same quantity and price.

## Set 07: DISPUTE — HOLD / REVIEW
- Contract: MSA-26-107 | PO: PO-26-0507 | Invoice: INV-26-0907
- PO total: INR 164,142.72; invoice total: INR 163,139.72; variance: INR -1,003.00
- Dispute pattern: quantity
- Finding: Quantity discrepancy: Industrial safety helmet PO quantity 8, invoice quantity 7; request GRN/acceptance evidence.

## Set 08: DISPUTE — HOLD / REVIEW
- Contract: MSA-26-108 | PO: PO-26-0508 | Invoice: INV-26-0908
- PO total: INR 342,200.00; invoice total: INR 341,197.00; variance: INR -1,003.00
- Dispute pattern: quantity
- Finding: Quantity discrepancy: Industrial safety helmet PO quantity 4, invoice quantity 3; request GRN/acceptance evidence.

## Set 09: VALID — MATCH
- Contract: MSA-26-109 | PO: PO-26-0509 | Invoice: INV-26-0909
- PO total: INR 112,029.20; invoice total: INR 112,029.20; variance: INR 0.00
- Expected: parties, references, line descriptions, quantities, unit prices, tax rate and totals match.

## Set 10: VALID — MATCH
- Contract: MSA-26-110 | PO: PO-26-0510 | Invoice: INV-26-0910
- PO total: INR 246,738.00; invoice total: INR 246,738.00; variance: INR 0.00
- Expected: parties, references, line descriptions, quantities, unit prices, tax rate and totals match.

## Acceptance checks
- Extract header fields and line items from all three documents.
- Link documents by IDs and party identities, not filenames alone.
- Recalculate line totals, subtotals, tax and grand totals independently.
- Distinguish commercial mismatches from arithmetic errors.
- Quantity shortfall requires delivery/GRN evidence; do not automatically label it overbilling.
- A match across these three files is not proof of delivery; surface missing goods receipt/acceptance evidence where required.
- Never execute payment.