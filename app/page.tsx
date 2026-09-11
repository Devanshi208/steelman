"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Network from "./components/Network";
import {
  TIER_LABEL,
  TIER_NOTE,
  TIER_ORDER,
  VERDICT_LABEL,
  type AnalysedSource,
  type SearchResult,
  type Tier,
} from "@/lib/types";

type Screen = "gate" | "search" | "loading" | "results";

const EXAMPLES = [
  "Do microplastics affect human fertility?",
  "Was MKUltra real?",
  "Does fluoride in water lower IQ?",
  "Does intermittent fasting extend lifespan?",
];

const STEPS = [
  "Reading the claim",
  "Searching the record",
  "Checking open access",
  "Sorting by evidence strength",
  "Finding the gaps",
];

const FILTERS = [
  { key: "all", label: "All sources" },
  { key: "peer", label: "Peer-reviewed only" },
  { key: "free", label: "Free to read" },
  { key: "recent", label: "Last 10 years" },
  { key: "primary", label: "Primary documents" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function Page() {
  const [screen, setScreen] = useState<Screen>("gate");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* advance the loading narration while the request is in flight */
  useEffect(() => {
    if (screen !== "loading") return;
    setStep(0);
    setSlow(false);
    const tick = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4200);
    const slowTimer = setTimeout(() => setSlow(true), 18000);
    return () => {
      clearInterval(tick);
      clearTimeout(slowTimer);
    };
  }, [screen]);

  const run = useCallback(async (claim: string) => {
    const asked = claim.trim();
    if (asked.length < 6) {
      setError("Enter a claim or question of at least a few words.");
      return;
    }
    setError("");
    setScreen("loading");
    setFilter("all");

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim: asked }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "The search did not complete.");
        setScreen("search");
        return;
      }

      setResult(data as SearchResult);
      setScreen("results");
      window.history.replaceState(null, "", `/?c=${encodeURIComponent(asked)}`);
      scrollTo(0, 0);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setScreen("search");
    }
  }, []);

  /* shared links: /?c=<claim> runs itself on load */
  useEffect(() => {
    const c = new URLSearchParams(location.search).get("c");
    if (c) {
      setQuery(c);
      run(c);
    }
  }, [run]);

  const copyLink = () => {
    navigator.clipboard?.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const visible = (s: AnalysedSource) => {
    if (filter === "peer") return s.tier === "peer";
    if (filter === "primary") return s.tier === "primary";
    if (filter === "free") return s.access.kind === "free" || s.access.kind === "preprint";
    if (filter === "recent") return (s.year ?? 0) >= new Date().getFullYear() - 10;
    return true;
  };

  return (
    <>
      <Network />

      {screen === "gate" && (
        <section className="screen fade">
          <h1 className="title">STEELMAN</h1>
          <div className="rule-under" />
          <p className="tagline">
            Before you argue with an idea, see the <em>strongest version</em> of what&apos;s
            already been established about it.
          </p>
          <button
            className="enter"
            onClick={() => {
              setScreen("search");
              setTimeout(() => inputRef.current?.focus(), 320);
            }}
          >
            Enter
          </button>
          <p className="gate-foot">
            No account. No tracking. Every search gets a link you can share.
          </p>
        </section>
      )}

      {screen === "search" && (
        <section className="screen fade">
          <button className="back-gate" onClick={() => setScreen("gate")}>
            Back
          </button>
          <h2 className="ask">What do you want the evidence on?</h2>
          <p className="ask-sub">
            A claim, a question, or an idea you think might be new. Steelman finds what the record
            already says, sorted by how strong the evidence is and where it came from.
          </p>

          <div className="field">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run(query)}
              placeholder="Do microplastics affect human fertility?"
              aria-label="Enter a claim or question"
              maxLength={400}
            />
            <button className="go" onClick={() => run(query)} aria-label="Search the evidence">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4.2-4.2" />
              </svg>
            </button>
          </div>

          {error && <p className="err">{error}</p>}

          <p className="try">Or start from one of these</p>
          <div className="chips">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                className="chip"
                onClick={() => {
                  setQuery(e);
                  run(e);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </section>
      )}

      {screen === "loading" && (
        <section className="screen fade">
          <div>
            {STEPS.map((label, i) => (
              <div key={label} className={`step ${i < step ? "done" : i === step ? "live" : ""}`}>
                <i />
                {label}
              </div>
            ))}
          </div>
          {slow && (
            <p className="slow">
              Still working. A first search reads dozens of abstracts and usually takes under a minute.
            </p>
          )}
        </section>
      )}

      {screen === "results" && result && (
        <main id="results" className="fade">
          <div className="bar">
            <button className="mark" onClick={() => setScreen("gate")}>
              STEELMAN
            </button>
            <div className="acts">
              <button className="act" onClick={copyLink}>
                {copied ? "Link copied" : "Copy link"}
              </button>
              <button className="act" onClick={() => window.print()}>
                Print or save PDF
              </button>
              <button
                className="act"
                onClick={() => {
                  setQuery("");
                  setScreen("search");
                  setTimeout(() => inputRef.current?.focus(), 320);
                }}
              >
                New search
              </button>
            </div>
          </div>

          <div className="wrap">
            {result.notice && <div className="notice">{result.notice}</div>}

            <section className="claim">
              <p className="asked">You asked: {result.asked}</p>
              <h1>{result.restated}</h1>
              <p className="note">
                Rewritten as a testable proposition. Everything below is assessed against this
                wording, not the original phrasing.
              </p>
            </section>

            <section className="primer">
              <h2>What this is about</h2>
              {result.primer.map((p, i) => (
                <p key={i}>{p}</p>
              ))}

              <div className="reading">
                <h3>How to read this page</h3>
                <p>
                  Sources below are grouped by how much weight they carry, strongest first.
                  Peer-reviewed research has been checked by other scientists. Primary documents are
                  original records rather than descriptions of them. Preprints have not been reviewed
                  yet. Journalism reports on the others and is not evidence itself.
                </p>
                <p>
                  Each source lists what it found and, separately, what it cannot tell you. The
                  assessment sits at the bottom of the page, after the evidence, on purpose.
                </p>
              </div>
            </section>

            <div className="ledger">
              <div className="led">
                <b>{result.counts.total}</b>
                <span>sources assessed</span>
              </div>
              <div className="led">
                <b>{result.counts.free}</b>
                <span>free to read</span>
              </div>
              <div className="led">
                <b>{result.counts.preprintAvailable}</b>
                <span>free copy found</span>
              </div>
              <div className="led">
                <b>{result.counts.paywalled}</b>
                <span>paywalled</span>
              </div>
              {result.counts.earliest && (
                <div className="led">
                  <b>
                    {result.counts.earliest}–{result.counts.latest}
                  </b>
                  <span>range of evidence</span>
                </div>
              )}
            </div>

            <div className="filters">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className="f"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="cols">
              <div>
                {TIER_ORDER.map((tier) => {
                  const items = result.sources.filter((s) => s.tier === tier && visible(s));
                  if (!items.length) return null;
                  return (
                    <section className="tier" key={tier}>
                      <div className="tier-head">
                        <h2 style={{ color: `var(--t-${tier})` }}>{TIER_LABEL[tier]}</h2>
                        <span className="n">
                          {items.length} {items.length === 1 ? "source" : "sources"}
                        </span>
                      </div>
                      <p className="tier-note">{TIER_NOTE[tier]}</p>
                      {items.map((s) => (
                        <SourceItem key={s.id} s={s} tier={tier} />
                      ))}
                    </section>
                  );
                })}
              </div>

              <aside className="gaps">
                <h2>Not yet researched</h2>
                <p className="lede">
                  These are gaps in the published record, not gaps in this search. Nobody has studied
                  them yet. If you are looking for where to work, this is usually the most useful part
                  of the page.
                </p>
                {result.gaps.map((g, i) => (
                  <div className="gap" key={i}>
                    <h4>{g.title}</h4>
                    <p>{g.detail}</p>
                  </div>
                ))}
              </aside>
            </div>

            <section className="verdict">
              <div
                className="frame"
                style={{ borderLeftColor: `var(--v-${result.verdict.state})` }}
              >
                <p className="state" style={{ color: `var(--v-${result.verdict.state})` }}>
                  {VERDICT_LABEL[result.verdict.state]}
                </p>
                {result.verdict.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                <p className="caution">
                  Steelman sorts and surfaces evidence. It does not tell you what to conclude, and a
                  verdict is never a substitute for reading the sources above.
                </p>
              </div>
            </section>
          </div>
        </main>
      )}
    </>
  );
}

function SourceItem({ s, tier }: { s: AnalysedSource; tier: Tier }) {
  const meta = [
    s.authors.length ? s.authors.slice(0, 3).join(", ") + (s.authors.length > 3 ? " et al." : "") : null,
    s.venue || null,
    s.year ? String(s.year) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="item" style={{ borderLeftColor: `var(--t-${tier})` }}>
      <h3>
        {s.url ? (
          <a href={s.url} target="_blank" rel="noopener noreferrer">
            {s.title}
          </a>
        ) : (
          s.title
        )}
      </h3>
      {meta && <p className="src">{meta}</p>}
      <p className="finds">{s.findings}</p>
      <p className="limit">{s.limitations}</p>
      <div className="tags">
        <span className="tag">
          <i style={{ background: `var(--t-${tier})` }} />
          {TIER_LABEL[tier].replace(" research", "").replace(" and primary documents", " document")}
        </span>

        {s.access.kind === "free" && (
          <span className="tag">
            <i style={{ background: "var(--v-supported)" }} />
            Free to read
          </span>
        )}
        {s.access.kind === "paywalled" && (
          <span className="tag">
            <i style={{ background: "var(--t-other)" }} />
            Paywalled{s.access.publisher ? ` at ${s.access.publisher}` : ""}
          </span>
        )}
        {s.access.kind === "preprint" && (
          <>
            <span className="tag">
              <i style={{ background: "var(--t-other)" }} />
              Paywalled{s.access.publisher ? ` at ${s.access.publisher}` : ""}
            </span>
            <a className="tag" href={s.access.url} target="_blank" rel="noopener noreferrer">
              Free copy available
            </a>
          </>
        )}

        {s.citations > 0 && (
          <span className="tag">Cited {s.citations.toLocaleString()} times</span>
        )}
      </div>
    </article>
  );
}
