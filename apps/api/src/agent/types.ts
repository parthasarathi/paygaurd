// Contract between the agent backend and the web UI. Keep identical to web/src/agentTypes.ts.
export type Tone = "neutral" | "good" | "bad" | "warn";

export type Block =
  | { type: "text"; text: string }
  | { type: "stats"; items: { label: string; value: string; hint?: string; tone?: Tone }[] }
  | { type: "flags"; items: { id: string; type: string; severity: string; status: string; summary: string; exposureMinor: number; currency: string; invoiceNumber: string; vendorName: string }[] }
  | { type: "invoices"; items: { id: string; invoiceNumber: string; vendorName: string; totalMinor: number; currency: string; status: string; canPay: boolean; openFlags: number; missingDocs: string[] }[] }
  | { type: "link"; label: string; to: string };

export interface AgentReply {
  blocks: Block[];
  suggestions: string[]; // follow-up prompts shown as chips
  steps: string[]; // what the agent looked at, e.g. "Checked 2 invoices", shown as a collapsed trail
  localOnly: true; // always true: answered from rules and the database, zero LLM tokens
}

export interface AgentBriefing extends AgentReply {
  greeting: string; // first line, e.g. "Good afternoon, Admin"
}
