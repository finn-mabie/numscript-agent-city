import { loadTemplate } from "./loader.js";
import { validateParams } from "./validator.js";
import { renderVars } from "./renderer.js";
import { LedgerClient } from "./ledger-client.js";
import type { InvokeResult, ParamValue } from "./types.js";

export interface InvokeOptions {
  rootDir: string;
  templateId: string;
  params: Record<string, ParamValue>;
  reference?: string;
  client: LedgerClient;
}

export async function invoke(opts: InvokeOptions): Promise<InvokeResult> {
  const { rootDir, templateId, params, reference, client } = opts;

  let template;
  try {
    template = await loadTemplate(rootDir, templateId);
  } catch (e: any) {
    return {
      ok: false, templateId, params, renderedNumscript: "",
      error: { phase: "load", code: "TemplateNotFound", message: e.message }
    };
  }

  const validation = validateParams(template.schema, params);
  if (!validation.ok) {
    return { ok: false, templateId, params, renderedNumscript: template.source, error: validation.error };
  }

  const vars = renderVars(template.schema, params);

  const dry = await client.dryRun({ plain: template.source, vars, reference });
  if (!dry.ok) {
    return {
      ok: false, templateId, params, renderedNumscript: template.source,
      error: { phase: "dry-run", code: dry.code, message: dry.message }
    };
  }
  const dryRun = { postings: dry.postings, txMeta: dry.txMeta, accountMeta: {} };

  const committed = await client.commit({ plain: template.source, vars, reference });
  if (!committed.ok) {
    return {
      ok: false,
      templateId, params, renderedNumscript: template.source, dryRun,
      error: { phase: "commit", code: committed.code, message: committed.message }
    };
  }

  return {
    ok: true, templateId, params, renderedNumscript: template.source,
    dryRun, committed: committed.tx
  };
}
