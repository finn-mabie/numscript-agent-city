import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Template, TemplateSchema } from "./types.js";

export async function loadTemplate(rootDir: string, id: string): Promise<Template> {
  const dir = join(rootDir, id);
  const [source, schemaRaw, exampleRaw, readme] = await Promise.all([
    readFile(join(dir, "template.num"), "utf8"),
    readFile(join(dir, "schema.json"), "utf8"),
    readFile(join(dir, "example.json"), "utf8"),
    readFile(join(dir, "README.md"), "utf8")
  ]);
  const schema = JSON.parse(schemaRaw) as TemplateSchema;
  if (schema.id !== id) {
    throw new Error(`Template id mismatch: dir=${id}, schema.id=${schema.id}`);
  }
  const example = JSON.parse(exampleRaw) as Record<string, unknown>;
  return { id, source, schema, example, readme };
}

export async function loadTemplates(rootDir: string): Promise<Template[]> {
  const entries = await readdir(rootDir);
  const ids: string[] = [];
  for (const entry of entries) {
    const s = await stat(join(rootDir, entry));
    if (s.isDirectory()) ids.push(entry);
  }
  return Promise.all(ids.map((id) => loadTemplate(rootDir, id)));
}
