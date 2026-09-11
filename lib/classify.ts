import type { Tier } from "./types";

/**
 * Tier is decided from metadata, never by asking the model.
 *
 * This is deliberate. Whether something counts as evidence is the single most
 * consequential judgement this app makes, and an LLM guessing "is this peer
 * reviewed?" can be confidently wrong in a way that misleads a reader. The
 * repositories we query already record publication type and venue type, so we
 * read the fact rather than infer it.
 */

const GOV_HOSTS = [
  ".gov", ".gov.uk", ".gov.au", ".gc.ca", ".europa.eu", ".gov.in",
  "who.int", "un.org", "oecd.org", "nih.gov", "cdc.gov", "epa.gov",
  "nist.gov", "fda.gov", "noaa.gov", "ec.europa.eu", "efsa.europa.eu",
  "courtlistener.com", "supremecourt.gov", "congress.gov", "gao.gov",
  "archives.gov", "cia.gov", "nationalarchives.gov.uk",
];

const PREPRINT_VENUES = [
  "arxiv", "biorxiv", "medrxiv", "chemrxiv", "ssrn", "osf", "preprints.org",
  "research square", "authorea", "psyarxiv", "socarxiv",
];

export function isGovHost(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return GOV_HOSTS.some((h) => host === h.replace(/^\./, "") || host.endsWith(h));
  } catch {
    return false;
  }
}

export interface ClassifyInput {
  workType?: string;      // OpenAlex `type`: article, preprint, report, dataset…
  venue?: string;         // journal or repository name
  venueType?: string;     // OpenAlex source type: journal, repository, conference…
  hasIssn?: boolean;
  url?: string;
  fromNewsApi?: boolean;
}

export function classify(input: ClassifyInput): { tier: Tier; reason: string } {
  const venue = (input.venue || "").toLowerCase();
  const type = (input.workType || "").toLowerCase();
  const venueType = (input.venueType || "").toLowerCase();

  if (input.fromNewsApi) {
    return { tier: "press", reason: "returned by the news/web index" };
  }

  // Preprint servers announce themselves, either by work type or by venue name.
  if (type === "preprint" || PREPRINT_VENUES.some((v) => venue.includes(v))) {
    return { tier: "preprint", reason: `preprint venue (${input.venue || type})` };
  }

  // Government, intergovernmental and court material.
  if (isGovHost(input.url) || type === "report") {
    return {
      tier: "primary",
      reason: isGovHost(input.url) ? "published on a government or IGO domain" : "work type is report",
    };
  }

  // Peer review is inferred from *venue type*, not from the model's opinion.
  // A journal with an ISSN running an article is the signal we trust.
  if ((type === "article" || type === "review" || type === "book-chapter") &&
      (venueType === "journal" || input.hasIssn)) {
    return { tier: "peer", reason: `article in indexed journal (${input.venue || "unnamed"})` };
  }

  if (venueType === "conference" || type === "proceedings-article") {
    return { tier: "peer", reason: "peer-reviewed conference proceedings" };
  }

  if (venueType === "repository") {
    return { tier: "preprint", reason: "hosted in a repository without journal review" };
  }

  return { tier: "other", reason: `unrecognised type (${type || "unknown"})` };
}
