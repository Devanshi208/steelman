export type Tier = "peer" | "primary" | "preprint" | "press" | "other";

export type Access =
  | { kind: "free"; url: string }
  | { kind: "preprint"; url: string; publisher?: string }
  | { kind: "paywalled"; publisher?: string; url?: string }
  | { kind: "unknown" };

/** A source after retrieval, before Claude has looked at it. */
export interface RawSource {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  year: number | null;
  doi?: string;
  url?: string;
  abstract: string;
  citations: number;
  tier: Tier;
  /** how the tier was decided — shown nowhere, useful when debugging */
  tierReason: string;
  access: Access;
  workType?: string;
}

/** A source after Claude has summarised it. */
export interface AnalysedSource extends RawSource {
  findings: string;
  limitations: string;
  relevance: number; // 0-10
}

export interface Gap {
  title: string;
  detail: string;
}

export type VerdictState =
  | "supported"
  | "partial"
  | "contested"
  | "contradicted"
  | "untested";

export interface SearchResult {
  id: string;
  asked: string;
  restated: string;
  primer: string[];
  sources: AnalysedSource[];
  counts: {
    total: number;
    free: number;
    preprintAvailable: number;
    paywalled: number;
    earliest: number | null;
    latest: number | null;
  };
  gaps: Gap[];
  verdict: {
    state: VerdictState;
    paragraphs: string[];
  };
  createdAt: number;
  partial?: boolean;
  notice?: string;
}

export const TIER_LABEL: Record<Tier, string> = {
  peer: "Peer-reviewed research",
  primary: "Government and primary documents",
  preprint: "Preprints and unreviewed work",
  press: "Journalism",
  other: "Other sources",
};

export const TIER_NOTE: Record<Tier, string> = {
  peer: "Published after external review by other researchers in the field. The strongest evidence available here, though review standards vary considerably between journals.",
  primary:
    "Agency reports, court records, declassified files, regulatory filings. Primary material rather than someone's description of it.",
  preprint:
    "Posted publicly before peer review. Often the newest work in a field, and sometimes the work that will not survive review. Treat as a lead, not a finding.",
  press:
    "Reported coverage. Useful for context and for tracing back to the underlying studies, not as evidence in its own right.",
  other:
    "Sources that do not fit the categories above. Weigh these yourself.",
};

export const TIER_ORDER: Tier[] = ["peer", "primary", "preprint", "press", "other"];

export const VERDICT_LABEL: Record<VerdictState, string> = {
  supported: "Well supported",
  partial: "Partially supported",
  contested: "Contested",
  contradicted: "Contradicted",
  untested: "Not yet tested",
};
