// Deterministic FPL rules. Prices are integers in tenths of £m, exactly as the FPL API
// sends them (95 = £9.5m). Nothing here calls the network or an LLM; the browser and
// the pipeline both import this file.

export const POSITIONS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };
export const HIT_COST = 4;

/** Limits read from bootstrap-static (`element_types`, `game_settings`), not hard-coded. */
export function rulesFromBootstrap(bootstrap) {
  const gs = bootstrap.game_settings;
  const squadSelect = {};
  const playMin = {};
  const playMax = {};
  for (const t of bootstrap.element_types) {
    squadSelect[t.id] = t.squad_select;
    playMin[t.id] = t.squad_min_play;
    playMax[t.id] = t.squad_max_play;
  }
  return {
    squadSelect, playMin, playMax,
    squadSize: gs.squad_squadsize,
    startingSize: gs.squad_squadplay,
    teamLimit: gs.squad_team_limit,
    budget: gs.squad_total_spend,
    sellOnFee: gs.transfers_sell_on_fee,
    maxFreeTransfers: 1 + gs.max_extra_free_transfers,
  };
}

/** What FPL pays you: rises are halved and rounded down (50% sell-on fee); falls are taken in full. */
export function sellPrice(purchase, now) {
  return now <= purchase ? now : purchase + Math.floor((now - purchase) / 2);
}

/**
 * Replays the season to recover what was paid for each player now in the squad (the public API
 * doesn't expose it; only the logged-in `my-team` endpoint does) and the bank after each
 * gameweek's transfers, so callers can check the replay against FPL's own `history[].bank`.
 *
 * - Initial squad players cost their season-start price (prices are fixed until the GW1 deadline).
 * - `element_out_cost` on a transfer is taken as the amount received; the bank check catches it if not.
 * - Free Hit transfers are skipped: the squad reverts after that gameweek.
 */
export function replayTransfers({ initialPicks, startPrice, transfers, chips = [], budget, upToGw }) {
  const freeHitGws = new Set(chips.filter((c) => c.name === "freehit").map((c) => c.event));
  const ordered = [...transfers].sort((a, b) => a.time.localeCompare(b.time));
  const lastGw = Math.max(upToGw ?? 1, ...ordered.map((t) => t.event));
  const purchase = new Map(initialPicks.map((id) => [id, startPrice(id)]));
  let bank = budget - initialPicks.reduce((sum, id) => sum + startPrice(id), 0);
  const bankByGw = new Map([[1, bank]]);
  for (let gw = 2; gw <= lastGw; gw++) {
    if (freeHitGws.has(gw)) continue;
    for (const t of ordered.filter((x) => x.event === gw)) {
      bank += t.element_out_cost - t.element_in_cost;
      purchase.delete(t.element_out);
      purchase.set(t.element_in, t.element_in_cost);
    }
    bankByGw.set(gw, bank);
  }
  return { purchase, bank, bankByGw };
}

/** Squad legality: size, players per position, players per club. */
export function validateSquad(ids, playersById, rules) {
  const errors = [];
  if (new Set(ids).size !== ids.length) errors.push({ code: "duplicate", message: "Same player twice" });
  if (ids.length !== rules.squadSize) {
    errors.push({ code: "squad_size", message: `Squad has ${ids.length} players, needs ${rules.squadSize}` });
  }
  const byPos = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const byTeam = new Map();
  for (const id of ids) {
    const p = playersById.get(id);
    if (!p) { errors.push({ code: "unknown_player", id, message: `Unknown player ${id}` }); continue; }
    byPos[p.element_type]++;
    byTeam.set(p.team, (byTeam.get(p.team) ?? 0) + 1);
  }
  for (const [pos, need] of Object.entries(rules.squadSelect)) {
    if (byPos[pos] !== need) {
      errors.push({ code: "position_count", position: POSITIONS[pos], have: byPos[pos], need,
        message: `${POSITIONS[pos]}: ${byPos[pos]} (needs ${need})` });
    }
  }
  for (const [team, n] of byTeam) {
    if (n > rules.teamLimit) {
      errors.push({ code: "club_limit", team, have: n, limit: rules.teamLimit,
        message: `${n} players from one club (max ${rules.teamLimit})` });
    }
  }
  return { ok: errors.length === 0, errors, byPos, byTeam };
}

export function hitPoints(transferCount, freeTransfers) {
  return Math.max(0, transferCount - freeTransfers) * HIT_COST;
}

/**
 * Checks a transfer plan. `squad` is [{ id, sell }] (sell = selling price). Incoming players cost
 * their current `now_cost`. Returns the exact money left (tenths of £m) and every rule broken.
 * `chip` of "wildcard"/"freehit" makes the transfers free.
 */
export function checkPlan({ squad, bank, out, in: incoming, playersById, rules, freeTransfers, chip = null }) {
  const errors = [];
  const owned = new Map(squad.map((s) => [s.id, s]));
  if (out.length !== incoming.length) {
    errors.push({ code: "count_mismatch", message: `${out.length} out but ${incoming.length} in` });
  }
  for (const id of out) if (!owned.has(id)) errors.push({ code: "not_in_squad", id, message: `Player ${id} isn't in your squad` });
  for (const id of incoming) {
    const p = playersById.get(id);
    if (owned.has(id) && !out.includes(id)) errors.push({ code: "already_owned", id, message: `${p?.web_name ?? id} is already in your squad` });
    if (!p) errors.push({ code: "unknown_player", id, message: `Unknown player ${id}` });
    else if (p.can_transact === false || p.removed) errors.push({ code: "not_transferable", id, message: `${p.web_name} can't be bought right now` });
  }

  const proceeds = out.reduce((sum, id) => sum + (owned.get(id)?.sell ?? 0), 0);
  const cost = incoming.reduce((sum, id) => sum + (playersById.get(id)?.now_cost ?? 0), 0);
  const remaining = bank + proceeds - cost;
  if (remaining < 0) errors.push({ code: "budget", shortBy: -remaining, message: `Short by £${(-remaining / 10).toFixed(1)}m` });

  const newIds = [...squad.map((s) => s.id).filter((id) => !out.includes(id)), ...incoming];
  if (out.length === incoming.length) errors.push(...validateSquad(newIds, playersById, rules).errors);

  const freeChip = chip === "wildcard" || chip === "freehit";
  const transfers = out.length;
  return {
    ok: errors.length === 0,
    errors, remaining, proceeds, cost, newIds, transfers,
    hitPoints: freeChip ? 0 : hitPoints(transfers, freeTransfers),
  };
}

/**
 * Chips still playable, per half-season window from bootstrap `chips` ({name, start_event,
 * stop_event}). A window is spent if a chip of that name was played inside it.
 */
export function chipsAvailable(chipWindows, used, gw) {
  return chipWindows
    .filter((w) => w.stop_event >= gw)
    .filter((w) => !used.some((u) => u.name === w.name && u.event >= w.start_event && u.event <= w.stop_event))
    .map((w) => ({ name: w.name, from: w.start_event, until: w.stop_event, now: gw >= w.start_event }))
    .sort((a, b) => a.until - b.until || a.name.localeCompare(b.name));
}

/**
 * Free transfers available for the next gameweek, derived from `/entry/{id}/history/`.
 * +1 after each gameweek (capped at `max`); Wildcard and Free Hit weeks don't use any;
 * extra transfers (hits) take the bank to zero. Marked "computed": special top-ups FPL
 * sometimes grants aren't in the API, so the UI lets you override it.
 */
export function freeTransfers({ history, startedEvent = 1, max }) {
  const chipAt = new Map((history.chips ?? []).map((c) => [c.event, c.name]));
  const played = history.current.map((h) => h.event).filter((e) => e > startedEvent).sort((a, b) => a - b);
  let ft = 1; // for the gameweek after you joined
  let lastGw = startedEvent;
  for (const gw of played) {
    const h = history.current.find((x) => x.event === gw);
    const chip = chipAt.get(gw);
    if (chip !== "wildcard" && chip !== "freehit") ft = Math.max(0, ft - h.event_transfers);
    ft = Math.min(max, ft + 1);
    lastGw = gw;
  }
  return { forGw: lastGw + 1, count: ft, provenance: "computed" };
}
