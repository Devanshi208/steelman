import { NextRequest, NextResponse } from "next/server";
import { frame, readSources, synthesise } from "@/lib/analyze";
import { gather } from "@/lib/sources";
import { claimKey, getCached, putCached, underLimit } from "@/lib/cache";
import type { SearchResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function counts(sources: SearchResult["sources"]) {
  const years = sources.map((s) => s.year).filter((y): y is number => Boolean(y));
  return {
    total: sources.length,
    free: sources.filter((s) => s.access.kind === "free").length,
    preprintAvailable: sources.filter((s) => s.access.kind === "preprint").length,
    paywalled: sources.filter((s) => s.access.kind === "paywalled").length,
    earliest: years.length ? Math.min(...years) : null,
    latest: years.length ? Math.max(...years) : null,
  };
}

export async function POST(req: NextRequest) {
  let asked = "";
  try {
    const body = await req.json();
    asked = String(body?.claim || "").trim();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a claim." }, { status: 400 });
  }

  if (asked.length < 6) {
    return NextResponse.json({ error: "Enter a claim or question of at least a few words." }, { status: 400 });
  }
  if (asked.length > 400) {
    return NextResponse.json({ error: "That is too long. Keep it under 400 characters." }, { status: 400 });
  }

  const id = claimKey(asked);

  const cached = await getCached(id);
  if (cached) return NextResponse.json(cached);

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous";

  if (!(await underLimit(ip))) {
    return NextResponse.json(
      { error: "Search limit reached for this hour. Cached searches still work." },
      { status: 429 }
    );
  }

  try {
    // 1 — understand what is being claimed, and what to search for
        console.log(`\n▸ search: "${asked}"`);
    const framing = await frame(asked);
  

    // 2 — retrieve. Nothing here is generated; every source is a real record.
        const raw = await gather(framing.queries);
    console.log(`  retrieved ${raw.length} sources`);

    if (!raw.length) {
      return NextResponse.json(
        { error: "No sources found. Try rephrasing, or use more specific terms." },
        { status: 404 }
      );
    }

    // 3 — read the abstracts we actually retrieved
    const scored = await readSources(framing.restated, raw);

    if (!scored.length) {
      return NextResponse.json(
        {
          error:
            "Sources were found, but none had a readable abstract to assess. Try rephrasing with more specific terms.",
        },
        { status: 404 }
      );
    }

    /**
     * Relevance is a preference, not a gate. A claim with no direct literature —
     * because it is settled, or fringe, or simply unstudied — should still show
     * whatever the record does contain, with a note explaining the thinness.
     * Returning an error would teach the user that we found nothing, which is a
     * different and false statement.
     */
    let analysed = scored.filter((s) => s.relevance >= 4);
    let notice: string | undefined;

    if (analysed.length < 4) {
      analysed = scored.slice(0, 10);
      notice =
        "Little research addresses this claim directly. The sources below are the closest " +
        "relevant work found, and several only touch on it indirectly. Read them with that in mind.";
    }

    // 4 — orient the reader, name the gaps, assess
    const synth = await synthesise(asked, framing.restated, analysed);

    const result: SearchResult = {
      id,
      asked,
      restated: framing.restated,
      primer: synth.primer,
      sources: analysed,
      counts: counts(analysed),
      gaps: synth.gaps,
      verdict: synth.verdict,
      createdAt: Date.now(),
      notice,
    };

    await putCached(id, result);
    return NextResponse.json(result);
  } catch (err: any) {
    const message = String(err?.message || err);
    console.error("search failed:", message);

    if (message.includes("ANTHROPIC_API_KEY")) {
      return NextResponse.json(
        { error: "The server has no Anthropic API key configured." },
        { status: 500 }
      );
    }
    if (message.toLowerCase().includes("rate") || message.includes("429")) {
      return NextResponse.json(
        { error: "The model is rate limited right now. Wait a moment and try again." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "The search did not complete. Try again, or rephrase the claim." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const cached = await getCached(id);
  if (!cached) return NextResponse.json({ error: "Not found or expired." }, { status: 404 });
  return NextResponse.json(cached);
}
