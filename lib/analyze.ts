import Anthropic from "@anthropic-ai/sdk";
import type { AnalysedSource, Gap, RawSource, VerdictState } from "./types";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    return new Anthropic({ apiKey, timeout: 180000, maxRetries: 3 });
}

/**
 * Every call below forces a tool schema, so Claude must return structured data
 * that we validate before it touches the page. The model never writes the
 * output directly, and it is never given the chance to invent a source: it
 * only ever sees sources we actually retrieved, referenced by index.
 */
async function toolCall<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  description: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    tools: [
      {
        name: opts.toolName,
        description: opts.description,
        input_schema: opts.schema as any,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
  });

  const block = res.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Model returned no structured output");
  return block.input as T;
}

/* ───────────────────── 1. understand the claim ───────────────────── */

export interface Framing {
  restated: string;
  queries: string[];
  domain: "scientific" | "historical" | "technical" | "policy" | "other";
}

export async function frame(asked: string): Promise<Framing> {
  return toolCall<Framing>({
    system:
      "You turn a person's question into something that can be checked against a literature. " +
      "You do not answer it, and you do not indicate whether you think it is true.",
    user:
      `Someone entered this into an evidence search tool:\n\n"${asked}"\n\n` +
      `Restate it as a single testable proposition in plain language. Keep the user's actual ` +
      `meaning; do not soften a claim into something weaker, and do not sharpen it into ` +
      `something stronger than they asked. Then write 3 to 4 search queries that would ` +
      `surface the relevant literature, including queries that would find evidence against ` +
      `the proposition as well as for it.\n\n` +
      `Writing good queries matters more than it looks:\n` +
      `- Search for the underlying phenomenon, not the claim's own vocabulary. Nobody ` +
      `publishes papers titled "is the earth flat", but there is an enormous literature on ` +
      `geodesy, satellite measurement and planetary shape. Go there instead.\n` +
      `- For historical or governmental claims, target the document record: inquiry reports, ` +
      `declassified files, hearings, court proceedings.\n` +
      `- For "has this been built before" questions, target the technique and the application ` +
      `rather than a product name.\n` +
      `- Use keywords a researcher would use, not a question.`,
    toolName: "frame_claim",
    description: "Record the restated claim and the searches to run.",
    schema: {
      type: "object",
      properties: {
        restated: {
          type: "string",
          description: "One sentence, a testable proposition, no verdict implied.",
        },
        queries: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 4,
          description: "Search queries. Keyword-style, not questions.",
        },
        domain: {
          type: "string",
          enum: ["scientific", "historical", "technical", "policy", "other"],
        },
      },
      required: ["restated", "queries", "domain"],
    },
    maxTokens: 900,
  });
}

/* ───────────────────── 2. read each source ───────────────────── */

interface Read {
  index: number;
  relevance: number;
  findings: string;
  limitations: string;
}

export async function readSources(
  restated: string,
  sources: RawSource[]
): Promise<AnalysedSource[]> {
    // Prefer sources with a real abstract, but fall back to title-and-venue only
  // rather than discarding a source entirely. A paper with no abstract in the
  // index is still a paper.
  const withAbstract = sources.filter((s) => s.abstract && s.abstract.length > 90);
  const thin = sources.filter((s) => !s.abstract || s.abstract.length <= 90);
  const usable = [...withAbstract, ...thin].slice(0, 28);
  if (!usable.length) return [];
    console.log(`  readSources: ${usable.length} usable of ${sources.length}`);

  const listing = usable
    .map(
      (s, i) =>
        `[${i}] ${s.title}\nVenue: ${s.venue || "unknown"} (${s.year ?? "n.d."})\n` +
        `Abstract: ${s.abstract.slice(0, 1100)}`
    )
    .join("\n\n");

    const raw = await toolCall<{ reads: Read[] }>({
    system:
      "You summarise research sources for a tool that shows people evidence rather than conclusions. " +
      "You may only use information present in the abstract you are given. If an abstract does not " +
      "state something, you do not state it either. Never describe a finding the text does not report. " +
      "Never invent numbers, sample sizes, or results.",
    user:
      `Claim being assessed: "${restated}"\n\n` +
      `For each source below, write:\n` +
      `- findings: what this source actually reports, in 1-2 plain sentences.\n` +
      `- limitations: what this source cannot tell you. Study design limits, scope, ` +
      `whether it shows correlation rather than cause, funding or conflicts if the abstract ` +
      `mentions them. If the abstract gives no basis for judging limitations, say that plainly.\n` +
      `- relevance: 0-10 for how directly it bears on the claim. Sources that merely ` +
      `mention the topic score low.\n\n` +
      `Return one entry per source, using the index given.\n\n${listing}`,
    toolName: "record_reads",
    description: "Record a plain-language reading of each source.",
    schema: {
      type: "object",
      properties: {
        reads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "integer" },
              relevance: { type: "integer", minimum: 0, maximum: 10 },
              findings: { type: "string" },
              limitations: { type: "string" },
            },
            required: ["index", "relevance", "findings", "limitations"],
          },
        },
      },
      required: ["reads"],
    },
    maxTokens: 8000,
  });
  
      let cur: any = raw;
  for (let i = 0; i < 5; i++) {
    if (Array.isArray(cur)) break;
    if (typeof cur === "string") {
      try { cur = JSON.parse(cur); } catch { cur = []; break; }
      continue;
    }
    if (cur && typeof cur === "object" && "reads" in cur) {
      cur = (cur as any).reads;
      continue;
    }
    cur = [];
    break;
  }
  const reads: Read[] = Array.isArray(cur) ? cur : [];
  console.log(`  model returned ${reads.length} reads`);

  const out: AnalysedSource[] = [];
  for (const r of reads) {
    const base = usable[r.index];
    if (!base) continue; // index the model made up — drop it
    out.push({
      ...base,
      findings: r.findings,
      limitations: r.limitations,
      relevance: r.relevance,
    });
  }

  return out.sort((a, b) => b.relevance - a.relevance);
}

/* ───────────────────── 3. primer, gaps, assessment ───────────────────── */

export interface Synthesis {
  primer: string[];
  gaps: Gap[];
  verdict: { state: VerdictState; paragraphs: string[] };
}

export async function synthesise(
  asked: string,
  restated: string,
  sources: AnalysedSource[]
): Promise<Synthesis> {
  const digest = sources
    .slice(0, 24)
    .map(
      (s, i) =>
        `[${i}] (${s.tier}) ${s.title} — ${s.venue || "unknown"} ${s.year ?? ""}\n` +
        `Found: ${s.findings}\nLimits: ${s.limitations}`
    )
    .join("\n\n");

  return toolCall<Synthesis>({
    system:
      "You write for a tool whose purpose is to show people the evidence and let them decide. " +
      "You are allowed to say the evidence is weak, mixed, or absent. You are not allowed to " +
      "manufacture certainty in either direction, and you never treat an absence of evidence as " +
      "proof of the opposite. Base everything on the sources provided; if they do not support a " +
      "statement, leave it out.",
    user:
      `The user asked: "${asked}"\n` +
      `Restated as: "${restated}"\n\n` +
      `Sources retrieved:\n\n${digest}\n\n` +
      `Produce three things.\n\n` +
      `1. primer: 2-4 short paragraphs orienting someone who knows nothing about this topic. ` +
      `What the thing is, what is actually being argued about, and what distinction the ` +
      `argument turns on. Plain language, no jargon, no verdict.\n\n` +
      `2. gaps: 3-6 things that have NOT been researched. These are holes in the published ` +
      `record, not holes in this search. Questions nobody has answered, study designs nobody ` +
      `has run, populations nobody has looked at. Derive these from what the sources say they ` +
      `could not determine.\n\n` +
      `3. verdict: a state, plus 2-4 paragraphs explaining the reasoning. Use "contested" only ` +
      `when researchers genuinely disagree, not when the topic is merely controversial in public. ` +
      `Use "untested" when little or no evidence exists either way. Name the specific thing that ` +
      `would settle the question.`,
    toolName: "record_synthesis",
    description: "Record the primer, the research gaps, and the assessment.",
    schema: {
      type: "object",
      properties: {
        primer: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
        gaps: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short heading, under 9 words." },
              detail: { type: "string", description: "1-2 sentences." },
            },
            required: ["title", "detail"],
          },
        },
        verdict: {
          type: "object",
          properties: {
            state: {
              type: "string",
              enum: ["supported", "partial", "contested", "contradicted", "untested"],
            },
            paragraphs: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
          },
          required: ["state", "paragraphs"],
        },
      },
      required: ["primer", "gaps", "verdict"],
    },
    maxTokens: 4000,
  });
}
