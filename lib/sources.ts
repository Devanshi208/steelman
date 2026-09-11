import { classify, isGovHost } from "./classify";
import type { Access, RawSource } from "./types";

const EMAIL = process.env.CONTACT_EMAIL || "steelman@example.com";
const UA = `Steelman/0.1 (mailto:${EMAIL})`;

async function getJson(url: string, timeoutMs = 12000): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAlex ships abstracts as a word→positions map. Put the words back in order. */
function fromInverted(idx: Record<string, number[]> | null | undefined): string {
  if (!idx) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const p of positions) words[p] = word;
  }
  return words.filter(Boolean).join(" ").slice(0, 2600);
}

function dedupeKey(s: { doi?: string; title: string }) {
  if (s.doi) return s.doi.toLowerCase();
  return s.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 90);
}

/* ─────────────────────────── OpenAlex ─────────────────────────── */

async function openAlex(query: string, perPage = 25): Promise<RawSource[]> {
  const url =
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}` +
    `&per_page=${perPage}&sort=relevance_score:desc&mailto=${encodeURIComponent(EMAIL)}`;

  const data = await getJson(url);
  if (!data?.results) return [];

  return data.results.map((w: any): RawSource => {
    const loc = w.primary_location || {};
    const src = loc.source || {};
    const venue = src.display_name || "";
    const landing = loc.landing_page_url || w.doi || undefined;

    const { tier, reason } = classify({
      workType: w.type,
      venue,
      venueType: src.type,
      hasIssn: Boolean(src.issn_l || (src.issn && src.issn.length)),
      url: landing,
    });

    let access: Access = { kind: "unknown" };
    const oa = w.open_access || {};
    if (oa.is_oa && oa.oa_url) {
      access = { kind: "free", url: oa.oa_url };
    } else if (landing) {
      access = { kind: "paywalled", publisher: venue || undefined, url: landing };
    }

    return {
      id: String(w.id || w.doi || Math.random()),
      title: (w.display_name || "Untitled").trim(),
      authors: (w.authorships || [])
        .slice(0, 4)
        .map((a: any) => a.author?.display_name)
        .filter(Boolean),
      venue,
      year: w.publication_year ?? null,
      doi: w.doi ? String(w.doi).replace("https://doi.org/", "") : undefined,
      url: landing,
      abstract: fromInverted(w.abstract_inverted_index),
      citations: w.cited_by_count ?? 0,
      tier,
      tierReason: reason,
      access,
      workType: w.type,
    };
  });
}

/* ─────────────────────────── Europe PMC ─────────────────────────── */

async function europePmc(query: string, size = 15): Promise<RawSource[]> {
  const url =
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}` +
    `&format=json&pageSize=${size}&resultType=core`;

  const data = await getJson(url);
  const hits = data?.resultList?.result;
  if (!Array.isArray(hits)) return [];

  return hits.map((r: any): RawSource => {
    const venue = r.journalInfo?.journal?.title || r.bookOrReportDetails?.publisher || "";
    const isPre = String(r.pubType || "").toLowerCase().includes("preprint");

    const { tier, reason } = classify({
      workType: isPre ? "preprint" : "article",
      venue,
      venueType: isPre ? "repository" : "journal",
      hasIssn: Boolean(r.journalInfo?.journal?.issn),
    });

    const free = r.isOpenAccess === "Y";
    const url = r.doi ? `https://doi.org/${r.doi}` : r.fullTextUrlList?.fullTextUrl?.[0]?.url;

    return {
      id: `epmc:${r.id || r.pmid || r.doi}`,
      title: (r.title || "Untitled").replace(/\.$/, ""),
      authors: (r.authorString || "").split(", ").slice(0, 4).filter(Boolean),
      venue,
      year: r.pubYear ? Number(r.pubYear) : null,
      doi: r.doi,
      url,
      abstract: (r.abstractText || "").replace(/<[^>]+>/g, "").slice(0, 2600),
      citations: r.citedByCount ?? 0,
      tier,
      tierReason: reason,
      access: free && url ? { kind: "free", url } : { kind: "paywalled", publisher: venue, url },
      workType: isPre ? "preprint" : "article",
    };
  });
}

/* ─────────────────────── Unpaywall: the signpost ─────────────────────── */

/**
 * For anything paywalled, ask Unpaywall whether a legal free copy exists —
 * an author preprint, a PubMed Central deposit, an institutional repository.
 * This is what turns "you can't read this" into "here is where you can".
 */
async function addOpenCopies(sources: RawSource[]): Promise<void> {
  const targets = sources.filter((s) => s.access.kind === "paywalled" && s.doi).slice(0, 20);

  await Promise.all(
    targets.map(async (s) => {
      const data = await getJson(
        `https://api.unpaywall.org/v2/${encodeURIComponent(s.doi!)}?email=${encodeURIComponent(EMAIL)}`,
        8000
      );
      const best = data?.best_oa_location;
      if (best?.url) {
        const publisher = s.access.kind === "paywalled" ? s.access.publisher : undefined;
        s.access = { kind: "preprint", url: best.url_for_pdf || best.url, publisher };
      }
    })
  );
}

/* ─────────────────────── Web / news (optional) ─────────────────────── */

async function braveSearch(query: string, count = 10): Promise<RawSource[]> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      { signal: ctrl.signal, headers: { Accept: "application/json", "X-Subscription-Token": key } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.web?.results || [];

    return items.map((r: any): RawSource => {
      const gov = isGovHost(r.url);
      const { tier, reason } = gov
        ? { tier: "primary" as const, reason: "government or IGO domain" }
        : classify({ fromNewsApi: true });

      let year: number | null = null;
      const m = String(r.page_age || r.age || "").match(/(19|20)\d{2}/);
      if (m) year = Number(m[0]);

      return {
        id: `web:${r.url}`,
        title: r.title || r.url,
        authors: [],
        venue: r.profile?.name || new URL(r.url).hostname.replace(/^www\./, ""),
        year,
        url: r.url,
        abstract: (r.description || "").replace(/<[^>]+>/g, ""),
        citations: 0,
        tier,
        tierReason: reason,
        access: { kind: "free", url: r.url },
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────── orchestration ─────────────────────────── */

export async function gather(queries: string[]): Promise<RawSource[]> {
  const jobs: Promise<RawSource[]>[] = [];

  for (const q of queries.slice(0, 4)) {
    jobs.push(openAlex(q));
    jobs.push(europePmc(q));
    jobs.push(braveSearch(q));
  }

  const batches = await Promise.all(jobs);

  const seen = new Map<string, RawSource>();
  for (const batch of batches) {
    for (const s of batch) {
      if (!s.title || s.title === "Untitled") continue;
      const key = dedupeKey(s);
      const existing = seen.get(key);
      // keep whichever copy carries more information
      if (!existing || (s.abstract.length > existing.abstract.length)) {
        seen.set(key, existing ? { ...existing, ...s, abstract: s.abstract || existing.abstract } : s);
      }
    }
  }

  const all = [...seen.values()];
  await addOpenCopies(all);

  // Rank: tier weight first, then citations, then recency.
  const weight = { peer: 5, primary: 4, preprint: 3, press: 2, other: 1 } as const;
  all.sort((a, b) => {
    const w = weight[b.tier] - weight[a.tier];
    if (w !== 0) return w;
    if (b.citations !== a.citations) return b.citations - a.citations;
    return (b.year ?? 0) - (a.year ?? 0);
  });

  return all.slice(0, 45);
}
