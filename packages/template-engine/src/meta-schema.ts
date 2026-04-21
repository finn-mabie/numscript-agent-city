// JSON Schema (Draft-07) that every `schema.json` in /templates must conform to.
// Run against each schema by the loader so typos like "pattren" fail at load
// time instead of silently disabling a pattern check at runtime.

export const META_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["id", "description", "params"],
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
    description: { type: "string", minLength: 1 },
    params: {
      type: "object",
      additionalProperties: {
        oneOf: [
          { $ref: "#/definitions/monetarySpec" },
          { $ref: "#/definitions/accountSpec" },
          { $ref: "#/definitions/portionSpec" },
          { $ref: "#/definitions/stringSpec" },
          { $ref: "#/definitions/numberSpec" }
        ]
      }
    }
  },
  definitions: {
    monetarySpec: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { const: "monetary" },
        asset: { type: "string" },
        max: { type: "string" },
        min: { type: "string" },
        description: { type: "string" }
      }
    },
    accountSpec: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { const: "account" },
        pattern: { type: "string" },
        const: { type: "string" },
        description: { type: "string" }
      }
    },
    portionSpec: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { const: "portion" },
        max: { type: "string" },
        min: { type: "string" },
        description: { type: "string" }
      }
    },
    stringSpec: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { const: "string" },
        pattern: { type: "string" },
        maxLength: { type: "integer", minimum: 0 },
        description: { type: "string" }
      }
    },
    numberSpec: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { const: "number" },
        minimum: { type: "number" },
        maximum: { type: "number" },
        description: { type: "string" }
      }
    }
  }
} as const;
