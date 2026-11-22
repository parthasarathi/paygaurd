import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { extractionSchema, type Extraction } from "./schema";

const PROMPT = `You extract structured data from business documents for an invoice-audit tool.
Classify the document (contract, invoice, purchase_order, other) and call record_document.
Rules:
- Copy numbers exactly; never infer or fix them. Amounts are in major units (52,000.00 -> 52000).
- For contracts: capture each numbered clause/section (ref, page, verbatim text) and every priced item as a rate whose clauseRef points to the clause or schedule line it comes from (use e.g. "2 (line 1)" when the clause is a schedule table row). Use unit "each" when none is stated.
- For invoices: capture every line item with its page. Use unit "each" when none is stated.
- For purchase orders: capture the PO number, the contract it cites, the order date and the total including tax.
- Fill only the section matching the document kind; set the others to null.`;

export async function extractFromPdf(pdf: Buffer, creds: { apiKey: string; model: string }): Promise<Extraction> {
  const client = new Anthropic({ apiKey: creds.apiKey });
  const res = await client.messages.create({
    model: creds.model,
    max_tokens: 8000,
    tools: [{ name: "record_document", description: "Record the extracted document", input_schema: z.toJSONSchema(extractionSchema) as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: "record_document" },
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
        { type: "text", text: PROMPT },
      ],
    }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Model returned no structured output");
  return extractionSchema.parse(block.input);
}

export async function verifyKey(creds: { apiKey: string; model: string }) {
  const client = new Anthropic({ apiKey: creds.apiKey });
  await client.messages.create({ model: creds.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
}
