import type { Template, ParamSpec } from "@nac/template-engine";
import { POST_OFFER_TOOL } from "./offers.js";
import { SEND_DM_TOOL } from "./dms.js";

// Anthropic-compatible tool shape. Kept structural to avoid coupling to any specific SDK version.
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
  };
}

const parseMinor = (s: string): number => Number(s.replace(/_/g, ""));
const parsePortion = (s: string): number => {
  const t = s.trim();
  if (t.endsWith("%")) return Number(t.slice(0, -1)) / 100;
  const [n, d] = t.split("/");
  return d ? Number(n) / Number(d) : Number(t);
};

function paramJsonSchema(spec: ParamSpec): Record<string, unknown> {
  switch (spec.type) {
    case "monetary": {
      const amount: Record<string, unknown> = { type: "integer", minimum: 0 };
      if (spec.max !== undefined) amount.maximum = parseMinor(spec.max);
      if (spec.min !== undefined) amount.minimum = parseMinor(spec.min);
      const asset: Record<string, unknown> = { type: "string" };
      if (spec.asset) asset.const = spec.asset;
      return {
        type: "object",
        properties: { asset, amount },
        required: ["asset", "amount"],
        additionalProperties: false,
        description: spec.description
      };
    }
    case "account": {
      const s: Record<string, unknown> = { type: "string" };
      if (spec.const !== undefined) s.const = spec.const;
      if (spec.pattern !== undefined) s.pattern = spec.pattern;
      if (spec.description) s.description = spec.description;
      return s;
    }
    case "portion": {
      const s: Record<string, unknown> = {
        type: "string",
        pattern: "^(\\d+(\\.\\d+)?%|\\d+/\\d+)$"
      };
      if (spec.description) s.description = spec.description;
      // portion bounds are strings in the template schema; record them as JSON-schema `examples` hints.
      const hints: string[] = [];
      if (spec.min !== undefined) hints.push(`min ${spec.min}`);
      if (spec.max !== undefined) hints.push(`max ${spec.max}`);
      if (hints.length) s.description = `${s.description ?? ""} (${hints.join(", ")})`.trim();
      return s;
    }
    case "string": {
      const s: Record<string, unknown> = { type: "string" };
      if (spec.pattern) s.pattern = spec.pattern;
      if (spec.maxLength !== undefined) s.maxLength = spec.maxLength;
      if (spec.description) s.description = spec.description;
      return s;
    }
    case "number": {
      const s: Record<string, unknown> = { type: "number" };
      if (spec.minimum !== undefined) s.minimum = spec.minimum;
      if (spec.maximum !== undefined) s.maximum = spec.maximum;
      if (spec.description) s.description = spec.description;
      return s;
    }
  }
}

function toolFor(t: Template): AnthropicTool {
  const properties: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(t.schema.params)) {
    properties[name] = paramJsonSchema(spec);
  }
  return {
    name: t.schema.id,
    description: t.schema.description,
    input_schema: {
      type: "object",
      properties,
      required: Object.keys(t.schema.params),
      additionalProperties: false
    }
  };
}

export const IDLE_TOOL: AnthropicTool = {
  name: "idle",
  description: "Skip this tick. Use when no reasonable action is available.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false }
};

export function toolsForTemplates(templates: Template[]): AnthropicTool[] {
  return [...templates.map(toolFor), POST_OFFER_TOOL, SEND_DM_TOOL, IDLE_TOOL];
}
