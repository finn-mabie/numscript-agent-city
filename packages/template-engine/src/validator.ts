import type { TemplateSchema, ParamValue, InvokeError } from "./types.js";

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: InvokeError };

// Parse "1000_00" → 100000, "20%" → 0.2, "1/3" → 0.333...
function parseMinorUnits(s: string): number {
  return Number(s.replace(/_/g, ""));
}
function parsePortion(s: string): number {
  const trimmed = s.trim();
  if (trimmed.endsWith("%")) return Number(trimmed.slice(0, -1)) / 100;
  const [n, d] = trimmed.split("/");
  if (d) return Number(n) / Number(d);
  return Number(trimmed);
}

export function validateParams(
  schema: TemplateSchema,
  params: Record<string, ParamValue>
): ValidationResult {
  for (const [name, spec] of Object.entries(schema.params)) {
    const v = params[name];
    if (v === undefined) {
      return { ok: false, error: err("MissingParam", `Missing required param: ${name}`) };
    }

    switch (spec.type) {
      case "monetary": {
        if (typeof v !== "object" || v === null || !("asset" in v) || !("amount" in v)) {
          return { ok: false, error: err("TypeMismatch", `${name} must be { asset, amount }`) };
        }
        if (spec.asset && v.asset !== spec.asset) {
          return { ok: false, error: err("AssetMismatch", `${name}: expected ${spec.asset}, got ${v.asset}`) };
        }
        if (typeof v.amount !== "number" || !Number.isInteger(v.amount) || v.amount < 0) {
          return { ok: false, error: err("TypeMismatch", `${name}.amount must be non-negative integer (minor units)`) };
        }
        if (spec.max !== undefined && v.amount > parseMinorUnits(spec.max)) {
          return { ok: false, error: err("BoundsError", `${name}.amount exceeds max ${spec.max}`) };
        }
        if (spec.min !== undefined && v.amount < parseMinorUnits(spec.min)) {
          return { ok: false, error: err("BoundsError", `${name}.amount below min ${spec.min}`) };
        }
        break;
      }
      case "account": {
        if (typeof v !== "string") {
          return { ok: false, error: err("TypeMismatch", `${name} must be string (account address)`) };
        }
        if (spec.const !== undefined && v !== spec.const) {
          return { ok: false, error: err("ConstMismatch", `${name} must equal ${spec.const}`) };
        }
        if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(v)) {
          return { ok: false, error: err("PatternMismatch", `${name} does not match pattern ${spec.pattern}`) };
        }
        break;
      }
      case "account_list": {
        if (typeof v !== "string") {
          return { ok: false, error: err("TypeMismatch", `${name} must be string (wildcard pattern)`) };
        }
        if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(v)) {
          return { ok: false, error: err("PatternMismatch", `${name} does not match pattern ${spec.pattern}`) };
        }
        break;
      }
      case "portion": {
        if (typeof v !== "string") {
          return { ok: false, error: err("TypeMismatch", `${name} must be string portion like "5%" or "1/3"`) };
        }
        const p = parsePortion(v);
        if (!Number.isFinite(p) || p < 0 || p > 1) {
          return { ok: false, error: err("TypeMismatch", `${name} must be a portion in [0, 1]`) };
        }
        if (spec.max !== undefined && p > parsePortion(spec.max)) {
          return { ok: false, error: err("BoundsError", `${name} exceeds max ${spec.max}`) };
        }
        if (spec.min !== undefined && p < parsePortion(spec.min)) {
          return { ok: false, error: err("BoundsError", `${name} below min ${spec.min}`) };
        }
        break;
      }
      case "string": {
        if (typeof v !== "string") {
          return { ok: false, error: err("TypeMismatch", `${name} must be string`) };
        }
        if (spec.maxLength !== undefined && v.length > spec.maxLength) {
          return { ok: false, error: err("BoundsError", `${name} longer than maxLength ${spec.maxLength}`) };
        }
        if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(v)) {
          return { ok: false, error: err("PatternMismatch", `${name} does not match pattern ${spec.pattern}`) };
        }
        break;
      }
      case "number": {
        if (typeof v !== "number") {
          return { ok: false, error: err("TypeMismatch", `${name} must be number`) };
        }
        if (spec.minimum !== undefined && v < spec.minimum) {
          return { ok: false, error: err("BoundsError", `${name} < minimum ${spec.minimum}`) };
        }
        if (spec.maximum !== undefined && v > spec.maximum) {
          return { ok: false, error: err("BoundsError", `${name} > maximum ${spec.maximum}`) };
        }
        break;
      }
    }
  }
  return { ok: true };
}

function err(code: string, message: string): InvokeError {
  return { phase: "validate", code, message };
}
