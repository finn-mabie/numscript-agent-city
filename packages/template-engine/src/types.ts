export type TemplateId = string;

export interface TemplateSchema {
  id: TemplateId;
  description: string;
  params: Record<string, ParamSpec>;
}

export type ParamSpec =
  | { type: "monetary"; asset?: string; max?: string; min?: string; description?: string }
  | { type: "account"; pattern?: string; const?: string; description?: string }
  | { type: "portion"; max?: string; min?: string; description?: string }
  | { type: "string"; pattern?: string; maxLength?: number; description?: string }
  | { type: "number"; minimum?: number; maximum?: number; description?: string };

export interface Template {
  id: TemplateId;
  source: string;              // raw .num file contents
  schema: TemplateSchema;      // parsed schema.json
  example: Record<string, unknown>;
  readme: string;
}

export type ParamValue =
  | { asset: string; amount: number }     // monetary
  | string                                 // account | string | portion
  | number;                                // number

export interface InvokeParams {
  templateId: TemplateId;
  params: Record<string, ParamValue>;
  reference?: string;
}

export interface InvokeResult {
  ok: boolean;
  templateId: TemplateId;
  params: Record<string, ParamValue>;
  renderedNumscript: string;
  dryRun?: LedgerPreview;
  committed?: LedgerTx;
  error?: InvokeError;
}

export interface LedgerPreview {
  postings: Array<{ source: string; destination: string; asset: string; amount: number }>;
  txMeta: Record<string, string>;
  accountMeta: Record<string, Record<string, string>>;
}

export interface LedgerTx extends LedgerPreview {
  id: string;
  timestamp: string;
}

export interface InvokeError {
  phase: "load" | "validate" | "render" | "dry-run" | "commit";
  code: string;
  message: string;
  detail?: unknown;
}
