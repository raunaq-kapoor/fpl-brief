// Availability, rotation-risk and DEFCON flags. Every flag carries the numbers it came from.

// CBIT (DEF) / CBIRT (MID, FWD) count needed for DEFCON points. Not in the API; checked
// against real 2026/27 GW5 scoring in test/flags.test.js.
export const DEFCON_THRESHOLD = { 2: 10, 3: 12, 4: 12 };

const OUT_STATUSES = new Set(["i", "s", "u", "n"]);
const STATUS_TEXT = { a: "available", d: "doubtful", i: "injured", s: "suspended", u: "unavailable", n: "not eligible" };

/** FPL's own availability for a player in gameweek `gw`: level is "ok" | "doubt" | "out". */
export function availability(p, gw) {
  const reasons = [];
  let level = "ok";
  const chance = p.chance_of_playing_next_round;
  if (OUT_STATUSES.has(p.status)) level = "out";
  else if (p.status === "d" || (chance != null && chance < 100)) level = "doubt";
  if (p.news) reasons.push(p.news);
  for (const r of p.scout_risks ?? []) {
    if (r.gameweek === gw) { level = "out"; reasons.push(r.notes); }
  }
  return {
    level,
    status: p.status,
    statusText: STATUS_TEXT[p.status] ?? p.status,
    chance,
    news: p.news || null,
    newsAdded: p.news_added,
    reasons,
    source: { id: "fpl-api", name: "FPL (official)", url: `https://fantasy.premierleague.com/`, date: p.news_added },
  };
}

/** A team's fixtures in a gameweek, FDR from that team's side. */
export function fixturesFor(teamId, gw, fixtures) {
  return fixtures
    .filter((f) => f.event === gw && (f.team_h === teamId || f.team_a === teamId))
    .map((f) => {
      const home = f.team_h === teamId;
      return { id: f.id, gw, home, opponent: home ? f.team_a : f.team_h, fdr: home ? f.team_h_difficulty : f.team_a_difficulty, kickoff: f.kickoff_time };
    });
}

/**
 * element-summary `history` already has rows for fixtures in the current gameweek that haven't
 * kicked off (0 minutes). Keep only matches that are finished or provisionally finished.
 */
export function completedMatches(history, fixtures) {
  const done = new Set(fixtures.filter((f) => f.finished || f.finished_provisional).map((f) => f.id));
  return history.filter((h) => done.has(h.fixture));
}

/** Per-match DEFCON hits from element-summary history rows (matches with minutes only). */
export function defcon(history, position) {
  const threshold = DEFCON_THRESHOLD[position];
  if (!threshold) return null;
  const played = history.filter((h) => h.minutes > 0);
  const hit = (rows) => ({ hits: rows.filter((h) => h.defensive_contribution >= threshold).length, of: rows.length });
  return { threshold, last5: hit(played.slice(-5)), season: hit(played) };
}

/**
 * Rotation/minutes risk for a target gameweek. `history` is element-summary history (oldest
 * first), `fixtureCount` the team's fixtures in that gameweek.
 */
export function rotationRisk({ player, history, fixtureCount }) {
  const flags = [];
  const notes = [];
  if (fixtureCount === 0) flags.push({ code: "blank", detail: "No fixture this gameweek" });
  if (fixtureCount > 1) notes.push({ code: "double", detail: `${fixtureCount} fixtures this gameweek` });
  const a = availability(player, null);
  if (a.level !== "ok") flags.push({ code: "availability", detail: `${a.statusText}${a.chance != null ? `, ${a.chance}% chance` : ""}` });

  const last5 = history.slice(-5);
  const starts = last5.filter((h) => h.starts > 0).length;
  const avgMinutes = last5.length ? Math.round(last5.reduce((s, h) => s + h.minutes, 0) / last5.length) : null;
  if (last5.length >= 3 && starts < Math.min(4, last5.length)) {
    flags.push({ code: "few_starts", detail: `Started ${starts} of last ${last5.length}` });
  }
  if (avgMinutes != null && last5.length >= 3 && avgMinutes < 60) {
    flags.push({ code: "low_minutes", detail: `Averaging ${avgMinutes} min over last ${last5.length}` });
  }
  return { flags, notes, last5: { matches: last5.length, starts, avgMinutes } };
}
