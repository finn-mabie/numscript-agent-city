import type { TemplateSchema, ParamValue } from "./types.js";

// Ledger wire format for `vars` in a script payload:
// - monetary: "USD/2 100"
// - account:  "agents:alice"   (no leading @)
// - portion:  "5%" or "1/3"
// - string:   as-is
// - number:   stringified
export function renderVars(
  schema: TemplateSchema,
  params: Record<string, ParamValue>
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, spec] of Object.entries(schema.params)) {
    const v = params[name];
    switch (spec.type) {
      case "monetary": {
        const m = v as { asset: string; amount: number };
        vars[name] = `${m.asset} ${m.amount}`;
        break;
      }
      case "account": {
        // Canonical input form is "@agents:001:available". Strip @ for the ledger wire.
        const s = v as string;
        if (!s.startsWith("@")) {
          throw new Error(`Account param ${name} must have a leading "@": got "${s}"`);
        }
        vars[name] = s.slice(1);
        break;
      }
      case "portion":
      case "string":
        vars[name] = v as string;
        break;
      case "number":
        vars[name] = String(v);
        break;
    }
  }
  return vars;
}
