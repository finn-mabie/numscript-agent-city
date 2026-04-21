import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicTool } from "./tool-schema.js";

export interface Action {
  tool: string;                         // "idle" | template id
  input: Record<string, unknown>;       // empty for idle; typed params for a template
  reasoning: string;                    // model's brief explanation (≤ 280 chars)
}

export interface LLMClient {
  pickAction(ctx: { system: string; user: string }, tools: AnthropicTool[]): Promise<Action>;
}

export interface AnthropicLLMOptions {
  apiKey: string;
  model: string;                        // e.g. "claude-sonnet-4-6"
  maxTokens?: number;
}

export function anthropicLLM(opts: AnthropicLLMOptions): LLMClient {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const maxTokens = opts.maxTokens ?? 512;

  return {
    async pickAction({ system, user }, tools) {
      const res = await client.messages.create({
        model: opts.model,
        max_tokens: maxTokens,
        system,
        tools: tools as any,           // SDK's Tool type lines up structurally with AnthropicTool
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: user }]
      });

      // Find the first tool_use block. With tool_choice:any there should be exactly one.
      const toolUse = res.content.find((b) => b.type === "tool_use") as any;
      if (!toolUse) {
        return { tool: "idle", input: {}, reasoning: "LLM did not select a tool; defaulting to idle." };
      }

      // Claude may preface the tool call with a text block containing reasoning.
      const textBlock = res.content.find((b) => b.type === "text") as any;
      const reasoning = textBlock?.text?.toString().slice(0, 280) ?? "";

      return {
        tool: String(toolUse.name),
        input: (toolUse.input ?? {}) as Record<string, unknown>,
        reasoning
      };
    }
  };
}
