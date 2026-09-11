import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

async function time(name, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`✅ ${name} — ${Date.now() - t}ms — ${r}`);
  } catch (e) {
    console.log(`❌ ${name} — ${Date.now() - t}ms — ${e.name}: ${e.message}`);
  }
}

console.log("\n--- key check ---");
console.log("key length:", (env.ANTHROPIC_API_KEY || "").length, "(want ~108)");
console.log("email:", env.CONTACT_EMAIL || "MISSING");

console.log("\n--- can we reach the source APIs? ---");

await time("OpenAlex", async () => {
  const r = await fetch("https://api.openalex.org/works?search=microplastics%20fertility&per_page=5&mailto=" + env.CONTACT_EMAIL);
  const d = await r.json();
  return `${d.results?.length ?? 0} results`;
});

await time("Europe PMC", async () => {
  const r = await fetch("https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=microplastics&format=json&pageSize=5");
  const d = await r.json();
  return `${d.resultList?.result?.length ?? 0} results`;
});

await time("Unpaywall", async () => {
  const r = await fetch(`https://api.unpaywall.org/v2/10.1038/nature12373?email=${env.CONTACT_EMAIL}`);
  return r.status === 200 ? "ok" : `status ${r.status}`;
});

console.log("\n--- can we reach Claude? ---");

await time("Anthropic API", async () => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || "claude-sonnet-5",
      max_tokens: 20,
      messages: [{ role: "user", content: "Say OK" }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text || "responded";
});

console.log("");
