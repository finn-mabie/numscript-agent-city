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
});
