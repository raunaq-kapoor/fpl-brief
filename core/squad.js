// Builds "my squad for the next deadline" from public endpoints only, with self-checks that
// say plainly when the reconstruction can't be trusted.
import { replayTransfers, rulesFromBootstrap, sellPrice, freeTransfers } from "./rules.js";

/**
 * @param bootstrap      bootstrap-static
 * @param history        /entry/{id}/history/
 * @param transfers      /entry/{id}/transfers/
 * @param initialPicks   /entry/{id}/event/{started_event}/picks/
 * @param latestPicks    picks for the latest gameweek whose deadline has passed
 */
export function buildSquad({ bootstrap, history, transfers, initialPicks, latestPicks, startedEvent = 1 }) {
  const rules = rulesFromBootstrap(bootstrap);
  const players = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const latestGw = latestPicks.entry_history.event;
  const startPrice = (id) => players.get(id).now_cost - players.get(id).cost_change_start;
  const pending = transfers.filter((t) => t.event > latestGw);

  const replay = replayTransfers({
    initialPicks: initialPicks.picks.map((p) => p.element),
    startPrice,
    transfers,
    chips: history.chips,
    budget: rules.budget,
    upToGw: latestGw + 1,
  });

  const checks = [];
  const freeHit = new Set((history.chips ?? []).filter((c) => c.name === "freehit").map((c) => c.event));
  const bankMisses = history.current
    .filter((h) => !freeHit.has(h.event) && replay.bankByGw.get(h.event) !== h.bank)
    .map((h) => `GW${h.event}: replay £${(replay.bankByGw.get(h.event) / 10).toFixed(1)}m vs FPL £${(h.bank / 10).toFixed(1)}m`);
  checks.push({
    code: "bank_replay",
    ok: bankMisses.length === 0,
    message: bankMisses.length ? `Sell prices may be wrong. Bank replay differs: ${bankMisses.join("; ")}` : "Bank replay matches FPL for every gameweek",
  });

  const latestIds = new Set(latestPicks.picks.map((p) => p.element));
  const expected = new Set(latestIds);
  for (const t of pending) { expected.delete(t.element_out); expected.add(t.element_in); }
  const replayIds = new Set(replay.purchase.keys());
  const sameSquad = replayIds.size === expected.size && [...expected].every((id) => replayIds.has(id));
  checks.push({
    code: "squad_matches_picks",
    ok: sameSquad,
    message: sameSquad ? "Reconstructed squad matches FPL picks" : "Reconstructed squad differs from FPL picks",
  });

  const slot = new Map(latestPicks.picks.map((p) => [p.element, p]));
  const pendingIn = new Set(pending.map((t) => t.element_in));
  const picks = [...expected].map((id) => {
    const p = players.get(id);
    const pick = slot.get(id);
    const purchase = replay.purchase.get(id) ?? p.now_cost;
    return {
      id,
      slot: pick?.position ?? null,
      isCaptain: pick?.is_captain ?? false,
      isViceCaptain: pick?.is_vice_captain ?? false,
      position: p.element_type,
      team: p.team,
      purchase,
      now: p.now_cost,
      sell: sellPrice(purchase, p.now_cost),
      pending: pendingIn.has(id),
      provenance: "computed",
    };
  }).sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99) || a.position - b.position);

  const ft = freeTransfers({ history, startedEvent, max: rules.maxFreeTransfers });
  return {
    forGw: latestGw + 1,
    bank: replay.bank,
    picks,
    freeTransfers: { ...ft, remaining: Math.max(0, ft.count - pending.length), pendingTransfers: pending.length },
    checks,
  };
}
