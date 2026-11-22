import {
  pgTable, uuid, text, integer, bigint, timestamp, date, jsonb, numeric, boolean, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// All money is stored as integer minor units (e.g. cents) alongside an ISO currency code.
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" });

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  // Share of verified (recovered/avoided) savings charged to the customer, in basis points.
  feeShareBps: integer("fee_share_bps").notNull().default(2000),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"), // admin | member
  createdAt: createdAt(),
});

export const vendors = pgTable("vendors", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  // Normalised name used for matching extracted vendor names to vendors.
  nameKey: text("name_key").notNull(),
  taxId: text("tax_id"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("vendors_org_key").on(t.orgId, t.nameKey)]);

export const documents = pgTable("documents", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  kind: text("kind").notNull(), // invoice | contract | purchase_order
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  storagePath: text("storage_path").notNull(),
  sha256: text("sha256").notNull(),
  source: text("source").notNull().default("upload"), // upload | api | email | folder
  sourceRef: text("source_ref"), // e.g. email sender + subject, folder path, API key name
  status: text("status").notNull().default("uploaded"), // uploaded | extracting | extracted | failed
  error: text("error"),
  extraction: jsonb("extraction"), // raw structured extraction incl. source refs
  // True when the structured data was reused from an identical earlier file, so no LLM call was made.
  extractionCached: boolean("extraction_cached").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("documents_org_sha").on(t.orgId, t.sha256)]);

export const contracts = pgTable("contracts", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
  documentId: uuid("document_id").references(() => documents.id),
  contractNumber: text("contract_number").notNull(),
  title: text("title").notNull(),
  currency: text("currency").notNull().default("USD"),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  paymentTermsDays: integer("payment_terms_days"),
  createdAt: createdAt(),
});

// A clause is the citable unit: every rate and every flag points back at one.
export const contractClauses = pgTable("contract_clauses", {
  id: id(),
  contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  ref: text("ref").notNull(), // e.g. "4.2" or "Schedule A"
  page: integer("page"),
  text: text("text").notNull(),
});

export const contractRates = pgTable("contract_rates", {
  id: id(),
  contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  clauseId: uuid("clause_id").references(() => contractClauses.id),
  // Precise citation as written, e.g. "2 (line 1)"; clauseId points at the enclosing clause.
  clauseRef: text("clause_ref"),
  sku: text("sku"), // vendor item code, if the contract names one
  description: text("description").notNull(),
  descriptionKey: text("description_key").notNull(),
  unit: text("unit").notNull(),
  unitPriceMinor: money("unit_price_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  // Allowed deviation in basis points before it is flagged as drift.
  toleranceBps: integer("tolerance_bps").notNull().default(0),
}, (t) => [index("rates_contract").on(t.contractId)]);

export const invoices = pgTable("invoices", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
  contractId: uuid("contract_id").references(() => contracts.id),
  documentId: uuid("document_id").references(() => documents.id),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceNumberKey: text("invoice_number_key").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  poNumber: text("po_number"),
  contractNumber: text("contract_number"), // contract cited on the invoice, as written
  currency: text("currency").notNull().default("USD"),
  subtotalMinor: money("subtotal_minor").notNull(),
  taxMinor: money("tax_minor").notNull().default(0),
  totalMinor: money("total_minor").notNull(),
  status: text("status").notNull().default("received"), // received | on_hold | approved | paid | rejected
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("invoices_vendor").on(t.orgId, t.vendorId),
  index("invoices_numkey").on(t.orgId, t.vendorId, t.invoiceNumberKey),
]);

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  sku: text("sku"),
  description: text("description").notNull(),
  descriptionKey: text("description_key").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  unitPriceMinor: money("unit_price_minor").notNull(),
  amountMinor: money("amount_minor").notNull(),
  serviceDate: date("service_date"),
  page: integer("page"),
});

export const payments = pgTable("payments", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  amountMinor: money("amount_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  paidOn: date("paid_on").notNull(),
  reference: text("reference"),
});

export const flags = pgTable("flags", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  invoiceLineId: uuid("invoice_line_id").references(() => invoiceLines.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // duplicate_invoice | rate_drift
  // Stable key so re-running detection never creates the same flag twice.
  fingerprint: text("fingerprint").notNull(),
  severity: text("severity").notNull().default("medium"), // low | medium | high
  // Amount that would be saved if the flag is upheld, in minor units.
  exposureMinor: money("exposure_minor").notNull(),
  currency: text("currency").notNull(),
  summary: text("summary").notNull(),
  // Machine-readable proof: expected vs actual, clause and record references.
  evidence: jsonb("evidence").notNull(),
  status: text("status").notNull().default("open"), // open | assigned | disputed | credit_pending | resolved | dismissed
  assigneeId: uuid("assignee_id").references(() => users.id),
  resolution: text("resolution"), // credit_note | refund | price_corrected | invoice_rejected | no_issue
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("flags_fingerprint").on(t.orgId, t.fingerprint), index("flags_status").on(t.orgId, t.status)]);

// Append-only audit trail for every flag state change and comment.
export const flagEvents = pgTable("flag_events", {
  id: id(),
  flagId: uuid("flag_id").notNull().references(() => flags.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id),
  type: text("type").notNull(), // detected | assigned | commented | disputed | credit_note_received | resolved | dismissed | reopened
  data: jsonb("data"),
  createdAt: createdAt(),
});

// Verified savings ledger; the fee owed is computed from rows here.
export const savings = pgTable("savings", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  flagId: uuid("flag_id").notNull().references(() => flags.id),
  kind: text("kind").notNull(), // avoided (caught before payment) | recovered (credit/refund after)
  amountMinor: money("amount_minor").notNull(),
  currency: text("currency").notNull(),
  feeShareBps: integer("fee_share_bps").notNull(),
  feeMinor: money("fee_minor").notNull(),
  evidenceRef: text("evidence_ref"), // credit note number, refund reference...
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  reversed: boolean("reversed").notNull().default(false),
});

export const orgSettings = pgTable("org_settings", {
  orgId: uuid("org_id").primaryKey().references(() => organizations.id),
  llmProvider: text("llm_provider").notNull().default("anthropic"),
  llmModel: text("llm_model"),
  // AES-256-GCM encrypted; never returned to the client.
  llmApiKeyEnc: text("llm_api_key_enc"),
  llmKeyLast4: text("llm_key_last4"),
  imapEnabled: boolean("imap_enabled").notNull().default(false),
  imapHost: text("imap_host"),
  imapPort: integer("imap_port").default(993),
  imapUser: text("imap_user"),
  imapPassEnc: text("imap_pass_enc"),
  imapFolder: text("imap_folder").default("INBOX"),
  imapLastPollAt: timestamp("imap_last_poll_at", { withTimezone: true }),
  imapLastError: text("imap_last_error"),
  webhookUrl: text("webhook_url"),
  webhookSecretEnc: text("webhook_secret_enc"),
  webhookEvents: text("webhook_events"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  // Only a SHA-256 of the key is stored; the key itself is shown once at creation.
  keyHash: text("key_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  createdAt: createdAt(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
  documentId: uuid("document_id").references(() => documents.id),
  poNumber: text("po_number").notNull(),
  contractNumber: text("contract_number"),
  orderDate: date("order_date"),
  currency: text("currency").notNull().default("USD"),
  totalMinor: money("total_minor").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("po_org_number").on(t.orgId, t.poNumber)]);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: id(),
  orgId: uuid("org_id").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload"),
  status: text("status").notNull(), // success | failed
  statusCode: integer("status_code"),
  error: text("error"),
  attempt: integer("attempt").notNull().default(1),
  durationMs: integer("duration_ms"),
  createdAt: createdAt(),
});
