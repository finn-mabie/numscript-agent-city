import { loadTemplate } from "./loader.js";
import { validateParams } from "./validator.js";
import { renderVars } from "./renderer.js";
import { LedgerClient } from "./ledger-client.js";
import type { InvokeResult, ParamValue, LedgerPreview } from "./types.js";

export type InvokeMode =
  /** Commit directly. Skips the pre-commit dry-run. Default. */
  | "commit"
  /** Dry-run only. Returns the preview without committing. */
  | "dry-run"
  /**
   * Dry-run first, then commit. The "show what would happen, then do it"
   * flow. Only reliable on ledger versions where `?dry_run=true` is
   * side-effect-free (NOT the case in Formance v2.3.1 — use "commit" there).
   */
  | "preview-then-commit";

export interface InvokeOptions {
  rootDir: string;
  templateId: string;
  params: Record<string, ParamValue>;
  reference?: string;
  client: LedgerClient;
  /** Defaults to `"commit"`. */
  mode?: InvokeMode;
}

export async function invoke(opts: InvokeOptions): Promise<InvokeResult> {
  const { rootDir, templateId, params, reference, client } = opts;
  const mode: InvokeMode = opts.mode ?? "commit";

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

  // Phase-order invariant: validate + render happen before ANY ledger write.
  // A rejected validation therefore cannot produce a posting.

  let dryRun: LedgerPreview | undefined;

  if (mode === "dry-run" || mode === "preview-then-commit") {
    const dry = await client.dryRun({ plain: template.source, vars, reference });
    if (!dry.ok) {
      return {
        ok: false, templateId, params, renderedNumscript: template.source,
        error: { phase: "dry-run", code: dry.code, message: dry.message }
      };
    }
    dryRun = { postings: dry.postings, txMeta: dry.txMeta, accountMeta: {} };

    if (mode === "dry-run") {
      // No commit. Return the preview as the "outcome."
      return {
        ok: true, templateId, params, renderedNumscript: template.source, dryRun
      };
    }
  }

  const committed = await client.commit({ plain: template.source, vars, reference });
  if (!committed.ok) {
    return {
      ok: false, templateId, params, renderedNumscript: template.source, dryRun,
      error: { phase: "commit", code: committed.code, message: committed.message }
    };
  }

  // If we skipped the dry-run, surface the commit's postings as `dryRun` too —
  // callers expect a preview-shape regardless of mode.
  const preview: LedgerPreview = dryRun ?? {
    postings: committed.tx.postings,
    txMeta: committed.tx.txMeta,
    accountMeta: {}
  };

  return {
    ok: true, templateId, params, renderedNumscript: template.source,
    dryRun: preview, committed: committed.tx
  };
}
