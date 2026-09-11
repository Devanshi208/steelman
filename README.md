<h1 align="center">⚖︎ Steelman</h1>

<p align="center"><i>See what the evidence actually says — then decide for yourself.</i></p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-ece7dc?style=flat-square" />
  <img src="https://img.shields.io/badge/TypeScript-strict-5f92bd?style=flat-square" />
  <img src="https://img.shields.io/badge/Claude-tool--use-b08d57?style=flat-square" />
  <img src="https://img.shields.io/badge/sources-real-63a97f?style=flat-square" />
</p>

---

### ✦ What it is

Put in a claim, a question, or an idea you think might be new. Steelman searches the actual research record, then shows you what exists — **sorted by how strong the evidence is and where it came from.**

A *steelman* is the opposite of a strawman: the strongest honest version of a position, not a convenient caricature. That's the promise the name makes.

**It does not tell you what to think.** It organizes evidence and uncertainty. You do the concluding.

---

### 🔍 What you get back

**A plain-language primer** — what the topic even is, what's actually being argued, and what distinction the argument turns on. Written for someone who knows nothing about it.

**Every source, grouped by weight:**

| | |
|---|---|
| 🟢 **Peer-reviewed research** | checked by other scientists before publication |
| 🔵 **Government & primary documents** | original records, not descriptions of them |
| 🟣 **Preprints** | newest work, but not reviewed yet — a lead, not a finding |
| 🟡 **Journalism** | useful for context, not evidence in itself |

Each source shows **what it found** and, separately, **what it cannot tell you** — study design limits, correlation vs causation, disclosed conflicts. That second line is the one that teaches you to read critically.

**Access, honestly signposted:** free to read, paywalled, or *paywalled but a legal free copy exists over here*. Most people have no idea that last category is real.

**⚪ Not yet researched** — the questions nobody has answered, the studies nobody has run, the populations nobody has looked at. For anyone doing a literature review or hunting for a thesis gap, this is usually the most valuable panel on the page.

**An assessment, last.** After the evidence, never before it.

---

### 🧠 How it works

```
claim
  ↓  Claude restates it as a testable proposition + writes search queries
  ↓  OpenAlex · Europe PMC · Brave  (parallel retrieval)
  ↓  deterministic tier classification from metadata
  ↓  Unpaywall — find legal free copies of paywalled work
  ↓  Claude reads only the abstracts actually retrieved
  ↓  Claude writes primer, gaps, assessment
  ↓  cache → render
```

**The architectural principle:** *the model never decides what counts as evidence.*

Tier classification is read from repository metadata — publication type, venue type, ISSN presence — not inferred by an LLM. Whether something is peer-reviewed is the single most consequential judgement this app makes, and a model guessing at it can be confidently wrong in a way that misleads a reader.

Claude's role is narrower and safer: summarize text we actually retrieved, and never state anything an abstract doesn't. Every model response comes back through a **forced tool-use schema**, validated before it reaches the page. Sources are referenced by index, so a hallucinated citation has nowhere to enter.

---

### 🛠 Stack

**Next.js 15** · **TypeScript** · **Claude API** (tool use) · **Upstash Redis** · deployed on **Vercel**

Data sources — all free, no payment required:

[OpenAlex](https://openalex.org) (250M+ works) · [Europe PMC](https://europepmc.org) · [Unpaywall](https://unpaywall.org) · [Brave Search](https://brave.com/search/api) *(optional)*

---

### 🚀 Running it

```bash
git clone https://github.com/Devanshi208/steelman.git
cd steelman
npm install
cp .env.example .env.local   # add your keys
npm run dev
```

Open `http://localhost:3000`.

**Required in `.env.local`:**

```
ANTHROPIC_API_KEY=sk-ant-...
CONTACT_EMAIL=you@example.com
```

`CONTACT_EMAIL` is what OpenAlex and Unpaywall ask for so they can reach you if your requests misbehave. It isn't published anywhere.

**Optional:** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for caching that survives restarts, and `BRAVE_API_KEY` to enable the journalism tier.

---

### 💸 On cost

Each uncached search makes three Claude calls and reads up to 28 abstracts. Results are cached for two weeks by normalized claim, so the same question asked two different ways hits the same entry. There's a per-IP rate limit of 12 uncached searches an hour.

If you deploy this publicly, watch your API usage.

---

### 📏 Honest limits

- It reads **abstracts, not full papers.** An abstract can misrepresent its own paper.
- Coverage is strongest in science and medicine, weakest for claims that live in news and primary documents rather than journals.
- Paywalled full text stays paywalled. Steelman tells you where it is and whether a legal free copy exists — that's the honest version of help.
- Tier is not quality. A bad paper in a real journal still lands in the peer-reviewed tier. Read the limitations line.

---

### 🔭 Next up

- [ ] Stream results in as each tier completes, instead of one long wait
- [ ] Citation export — BibTeX, RIS
- [ ] Save searches (this is when accounts start to make sense, and not before)
- [ ] Show how a claim's evidence base changed over time

---

<p align="center">
  <sub>Built to organize evidence and uncertainty — not to manufacture certainty.</sub>
</p>
