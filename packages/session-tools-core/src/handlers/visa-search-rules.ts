/**
 * visa_search_rules — retrieval over the versioned visa rule corpus.
 *
 * Pipeline (matches the VisaFlow design):
 *   1. HARD metadata filter: destination / visaType (exact, wildcard-aware),
 *      effectiveDate not in the future. Superseded docs lose to newer versions.
 *   2. Keyword scoring: field-weighted token overlap (title > tags > body),
 *      CJK bigrams + latin tokens so Chinese queries match.
 *   3. Returns top-k fragments with provenance (source, url, effectiveDate,
 *      version) — evidence is advisory; the reviewed Rule Pack pinned to the
 *      case remains the source of truth for material requirements.
 *
 * The scoring seam (`scoreDocs`) is where a vector ranker (pgvector cosine)
 * plugs in later: hybrid = keyword score fused with embedding similarity.
 */

import { join } from 'node:path';
import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { successResponse, errorResponse } from '../response.ts';
import { VISA_KB_SEED, type VisaRuleDoc } from './visa-kb-seed.ts';

export interface VisaSearchArgs {
  query: string;
  destination?: string;
  visaType?: string;
  node?: string;
  limit?: number;
}

interface ScoredDoc {
  doc: VisaRuleDoc;
  score: number;
  matchedTerms: string[];
}

/** Tokenize: latin words lowercased + CJK character bigrams. */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const latin = text.toLowerCase().match(/[a-z0-9][a-z0-9\-]*/g) ?? [];
  tokens.push(...latin);
  const cjkRuns = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }
  return tokens;
}

function uniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** Hard metadata filter — wildcards ('*' or undefined) pass everything. */
function matchesMetadata(doc: VisaRuleDoc, args: VisaSearchArgs): boolean {
  if (args.destination && args.destination !== '*'
    && doc.destination !== '*' && doc.destination.toUpperCase() !== args.destination.toUpperCase()) {
    return false;
  }
  if (args.visaType && args.visaType !== '*'
    && doc.visaType !== '*' && doc.visaType.toUpperCase() !== args.visaType.toUpperCase()) {
    return false;
  }
  if (args.node && args.node !== '*' && doc.node !== args.node) {
    return false;
  }
  return true;
}

/**
 * Keyword scoring with field boosts. Exported so a future hybrid ranker can
 * fuse this with vector similarity (pgvector cosine) without touching callers.
 */
function scoreDocs(docs: VisaRuleDoc[], args: VisaSearchArgs): ScoredDoc[] {
  const queryTokens = uniqueTokens(args.query);
  const results: ScoredDoc[] = [];

  for (const doc of docs) {
    const titleTokens = uniqueTokens(doc.title);
    const tagTokens = new Set(doc.tags.flatMap(t => tokenize(t)));
    const bodyTokens = uniqueTokens(doc.body);
    const destinationTokens = new Set(tokenize(`${doc.destinationName} ${doc.destination} ${doc.visaType}`));

    const matchedTerms: string[] = [];
    let score = 0;
    for (const token of Array.from(queryTokens)) {
      let hit = 0;
      if (titleTokens.has(token)) hit += 4;
      if (tagTokens.has(token)) hit += 3;
      if (destinationTokens.has(token)) hit += 3;
      if (bodyTokens.has(token)) hit += 1;
      if (hit > 0) {
        score += hit;
        matchedTerms.push(token);
      }
    }

    // Normalize into 0..1 (soft cap at 20 raw points).
    score = Math.min(score / 20, 1);

    // Metadata-only queries (no keyword hits) still surface filtered docs.
    if (matchedTerms.length === 0) score = Math.max(score, 0.3);

    results.push({ doc, score, matchedTerms });
  }

  return results;
}

/** Keep only the newest version per doc id (workspace overrides beat seed). */
function dedupeNewest(docs: VisaRuleDoc[]): VisaRuleDoc[] {
  const byId = new Map<string, VisaRuleDoc>();
  for (const doc of docs) {
    const existing = byId.get(doc.id);
    if (!existing || doc.version > existing.version) byId.set(doc.id, doc);
  }
  return Array.from(byId.values());
}

function activeOn(docs: VisaRuleDoc[], now = new Date()): VisaRuleDoc[] {
  const today = now.toISOString().slice(0, 10);
  return docs.filter(doc => !doc.effectiveDate || doc.effectiveDate <= today);
}

/** Load workspace-level corpus overrides: <workspace>/visa-kb/*.json arrays. */
function loadWorkspaceDocs(ctx: SessionToolContext): VisaRuleDoc[] {
  const dir = join(ctx.workspacePath, 'visa-kb');
  const docs: VisaRuleDoc[] = [];
  try {
    if (!ctx.fs.exists(dir) || !ctx.fs.isDirectory(dir)) return docs;
    for (const name of ctx.fs.readdir(dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const parsed = JSON.parse(ctx.fs.readFile(join(dir, name))) as unknown;
        if (Array.isArray(parsed)) docs.push(...(parsed as VisaRuleDoc[]));
      } catch {
        // Malformed override file — skip it, the seed corpus still answers.
      }
    }
  } catch {
    // fs quirks — fall back to seed-only.
  }
  return docs;
}

function formatResults(scored: ScoredDoc[], args: VisaSearchArgs): ToolResult {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);
  const top = scored.sort((a, b) => b.score - a.score).slice(0, limit);

  if (top.length === 0) {
    return successResponse(
      'No matching rule fragments found. Check destination/visaType spelling (e.g. US, SCHENGEN, B-1/B-2) or widen the query.'
    );
  }

  const lines: string[] = [
    `Retrieved ${top.length} rule fragment(s) for "${args.query}"`
      + `${args.destination ? ` [destination=${args.destination}]` : ''}`
      + `${args.visaType ? ` [visaType=${args.visaType}]` : ''}:`,
    '',
  ];

  top.forEach((entry, idx) => {
    const { doc, score } = entry;
    lines.push(`[${idx + 1}] ${doc.title}`);
    lines.push(`    source: ${doc.source}${doc.url ? ` | ${doc.url}` : ''}`);
    lines.push(`    effective: ${doc.effectiveDate} | doc version: ${doc.version} | node: ${doc.node}`);
    lines.push(`    relevance: ${score.toFixed(2)} (keyword)`);
    lines.push(`    ${doc.body}`);
    lines.push('');
  });

  lines.push(
    'Note: fragments are advisory evidence with provenance. Material requirements must follow the reviewed Rule Pack version pinned to the case; surface conflicts as pending confirmation instead of picking a side.'
  );

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: {
      results: top.map(({ doc, score }) => ({
        id: doc.id,
        title: doc.title,
        source: doc.source,
        url: doc.url,
        effectiveDate: doc.effectiveDate,
        version: doc.version,
        node: doc.node,
        retrieval: 'keyword',
        score: Number(score.toFixed(3)),
        snippet: doc.body,
      })),
    },
    isError: false,
  };
}

export async function handleVisaSearchRules(
  ctx: SessionToolContext,
  args: VisaSearchArgs
): Promise<ToolResult> {
  try {
    const query = args.query?.trim();
    if (!query && !args.destination && !args.visaType) {
      return errorResponse('Provide a query and/or destination/visaType to search the rule corpus.');
    }

    const merged = dedupeNewest([...loadWorkspaceDocs(ctx), ...VISA_KB_SEED]);
    const usable = activeOn(merged);

    const filtered = usable.filter(doc => matchesMetadata(doc, args));
    const pool = filtered.length > 0 ? filtered : usable;

    const scored = scoreDocs(pool, { ...args, query: query ?? '' });
    return formatResults(scored, args);
  } catch (error) {
    return errorResponse(`visa_search_rules failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
