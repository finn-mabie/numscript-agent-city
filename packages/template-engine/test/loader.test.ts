import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadTemplates, loadTemplate } from "../src/loader.js";

const FIX = join(__dirname, "__fixtures__/templates");

beforeAll(() => {
  rmSync(FIX, { recursive: true, force: true });
  mkdirSync(join(FIX, "demo"), { recursive: true });
  writeFileSync(join(FIX, "demo/template.num"), "send [USD/2 100] (source=@a destination=@b)");
  writeFileSync(join(FIX, "demo/schema.json"), JSON.stringify({
    id: "demo",
    description: "demo",
    params: { x: { type: "monetary", asset: "USD/2" } }
  }));
  writeFileSync(join(FIX, "demo/example.json"), JSON.stringify({ x: { asset: "USD/2", amount: 100 } }));
  writeFileSync(join(FIX, "demo/README.md"), "# demo");
});

describe("loader", () => {
  it("loads a single template by id", async () => {
    const t = await loadTemplate(FIX, "demo");
    expect(t.id).toBe("demo");
    expect(t.source).toContain("send [USD/2 100]");
    expect(t.schema.params.x.type).toBe("monetary");
    expect(t.example).toEqual({ x: { asset: "USD/2", amount: 100 } });
    expect(t.readme).toContain("demo");
  });

  it("discovers all templates in a directory", async () => {
    const all = await loadTemplates(FIX);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("demo");
  });

  it("throws when a required file is missing", async () => {
    await expect(loadTemplate(FIX, "does-not-exist")).rejects.toThrow(/not found|ENOENT/);
  });

  it("rejects a schema with a misspelled property (pattren instead of pattern)", async () => {
    const dir = join(FIX, "typo-schema");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "template.num"), "send [USD/2 1] (source=@a destination=@b)");
    writeFileSync(join(dir, "schema.json"), JSON.stringify({
      id: "typo-schema",
      description: "has a typo",
      params: { who: { type: "account", pattren: "^@.+$" } }
    }));
    writeFileSync(join(dir, "example.json"), JSON.stringify({ who: "@x" }));
    writeFileSync(join(dir, "README.md"), "# typo");
    await expect(loadTemplate(FIX, "typo-schema")).rejects.toThrow(/Invalid template schema/);
  });

  it("rejects a schema whose param type is unknown", async () => {
    const dir = join(FIX, "unknown-type");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "template.num"), "send [USD/2 1] (source=@a destination=@b)");
    writeFileSync(join(dir, "schema.json"), JSON.stringify({
      id: "unknown-type",
      description: "unknown type",
      params: { x: { type: "account_list", pattern: "agents:*" } }
    }));
    writeFileSync(join(dir, "example.json"), JSON.stringify({ x: "agents:*" }));
    writeFileSync(join(dir, "README.md"), "# unknown");
    await expect(loadTemplate(FIX, "unknown-type")).rejects.toThrow(/Invalid template schema/);
  });
});
