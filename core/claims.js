// The honesty gate for LLM output. A claim survives only if its quote is copied verbatim from
// the stored document, and any number it states appears in that quote. Player names are
// matched to FPL ids exactly or not at all. Deterministic; the model is never trusted here.

export const CLAIM_TYPES = ["availability", "captain", "buy", "sell", "differential", "fixture", "price", "chip"];
const MIN_QUOTE_CHARS = 12;

const fold = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Same text, minus typographic differences a model may introduce when copying. */
export function normaliseQuote(s) {
  return s
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalised text plus a map back to original character offsets. */
function normalisedWithMap(text) {
  let out = "";
  const map = [];
  let lastSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = normaliseQuote(text[i]) || " ";
    if (ch === " ") {
      if (lastSpace) continue;
      lastSpace = true;
    } else lastSpace = false;
    for (const c of ch) { out += c; map.push(i); }
  }
  return { out, map };
}

const nameKey = (s) => fold(s).toLowerCase().replace(/[^a-z' -]/g, "").replace(/\s+/g, " ").trim();

/** Exact (accent/case-insensitive) match on web name, full name or "first last". Ambiguous → unresolved. */
export function resolvePlayers(names, players) {
  const ids = [];
  const unresolved = [];
  for (const name of names ?? []) {
    const k = nameKey(name);
    const hits = players.filter((p) => [
      p.web_name, `${p.first_name} ${p.second_name}`, p.known_name,
      `${p.first_name?.split(" ")[0]} ${p.second_name?.split(" ").at(-1)}`,
    ].filter(Boolean).some((n) => nameKey(n) === k));
    if (hits.length === 1) ids.push(hits[0].id);
    else unresolved.push(name);
  }
  return { ids: [...new Set(ids)], unresolved };
}

const numbersIn = (s) => (s.match(/\d+(?:\.\d+)?/g) ?? []);

/**
 * @param raw   model output: [{ type, players[], stance, sentence, quote }]
 * @param doc   SourceDocument (with text)
 * @returns {{ accepted: object[], rejected: {claim, reason}[] }}
 */
export function verifyClaims(raw, doc, players) {
  const { out: haystack, map } = normalisedWithMap(doc.text);
  const accepted = [];
  const rejected = [];
  for (const c of raw ?? []) {
    const reject = (reason) => rejected.push({ claim: c, reason });
    const quote = normaliseQuote(c.quote ?? "");
    if (!CLAIM_TYPES.includes(c.type)) { reject("bad_type"); continue; }
    if (!c.sentence?.trim()) { reject("no_sentence"); continue; }
    if (quote.length < MIN_QUOTE_CHARS) { reject("no_quote"); continue; }
    const at = haystack.indexOf(quote);
    if (at < 0) { reject("quote_not_found"); continue; }
    const quoteNumbers = new Set(numbersIn(quote));
    if (numbersIn(c.sentence).some((n) => !quoteNumbers.has(n))) { reject("number_not_in_quote"); continue; }
    const { ids, unresolved } = resolvePlayers(c.players, players);
    accepted.push({
      documentId: doc.id, sourceId: doc.sourceId, sourceName: doc.sourceName, url: doc.url, publishedAt: doc.publishedAt,
      type: c.type, stance: c.stance, sentence: c.sentence.trim(),
      quote: doc.text.slice(map[at], map[at + quote.length - 1] + 1),
      charStart: map[at], charEnd: map[at + quote.length - 1] + 1,
      playerIds: ids, names: c.players ?? [],
      flags: unresolved.length ? ["unresolved_name"] : [],
    });
  }
  return { accepted, rejected };
}

/**
 * Availability claims that disagree with FPL's own status. Both sides are shown in the app,
 * with their dates; nothing is resolved automatically.
 * @param fplLevel Map<playerId, "ok" | "doubt" | "out">
 */
export function findConflicts(claims, fplLevel) {
  const out = [];
  for (const claim of claims.filter((c) => c.type === "availability")) {
    for (const playerId of claim.playerIds) {
      const fpl = fplLevel.get(playerId);
      if (!fpl) continue;
      const disagree = (claim.stance === "fit" && fpl !== "ok") || ((claim.stance === "out" || claim.stance === "doubt") && fpl === "ok");
      if (disagree) out.push({ playerId, fpl, claim });
    }
  }
  return out;
}
