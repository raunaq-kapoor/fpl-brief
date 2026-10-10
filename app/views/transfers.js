// Transfer checker: pick players to sell and buy; budget, club limit, positions and hits are
// checked by core/rules.js (the same tested code the pipeline uses).
import { checkPlan } from "../../core/rules.js";
import { html, money, CHIP_NAMES } from "../ui.js";

const PLAN_KEY = "fpl.plan";
const safe = (fn, fb) => { try { return fn(); } catch { return fb; } };
const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

export function loadPlan(gw) {
  const p = safe(() => JSON.parse(localStorage.getItem(PLAN_KEY)), null);
  return p && p.gw === gw ? p : { gw, out: [], in: [], chip: null, query: "", pos: null };
}
export const savePlan = (p) => safe(() => localStorage.setItem(PLAN_KEY, JSON.stringify(p)));

export function renderTransfers(b, ctx) {
  const plan = ctx.plan;
  const players = new Map(b.players.map((p) => [p.id, p]));
  const teams = new Map(b.teams.map((t) => [t.id, t]));
  const squad = b.squad.picks.map((p) => ({ id: p.id, sell: p.sell }));
  const result = checkPlan({
    squad, bank: b.squad.bank, out: plan.out, in: plan.in, playersById: players, rules: b.rules,
    freeTransfers: b.squad.freeTransfers.remaining, chip: plan.chip,
  });
  const chipChoices = b.chips.available.filter((c) => c.now && (c.name === "wildcard" || c.name === "freehit"));

  return html`
    <h1 class="page">Transfers for GW${b.gameweeks.target?.id}</h1>
    <section aria-labelledby="result-h" class="result" aria-live="polite">
      <h2 id="result-h" class="visually-hidden">Result</h2>
      ${summary(result, b, plan, teams)}
    </section>
    <section aria-labelledby="sell-h">
      <h2 id="sell-h">Sell</h2>
      <ul class="pick-list">${b.squad.picks.map((p) => {
        const pl = players.get(p.id);
        const selling = plan.out.includes(p.id);
        return html`<li>
          <button type="button" class="pick${selling ? " on" : ""}" data-action="toggle-out" data-id="${p.id}" aria-pressed="${selling}">
            <span class="pos">${POS[pl.element_type]}</span>
            <strong>${pl.web_name}</strong> <span class="muted">${teams.get(pl.team)?.short_name}</span>
            <span class="amt">${money(p.sell)}</span>
          </button></li>`;
      })}</ul>
      <p class="small muted">Prices are what FPL pays you (selling price). Rises since you bought are halved.</p>
    </section>
    <section aria-labelledby="buy-h">
      <h2 id="buy-h">Buy</h2>
      ${plan.in.length ? html`<ul class="pick-list">${plan.in.map((id) => {
        const pl = players.get(id);
        return html`<li><button type="button" class="pick on" data-action="remove-in" data-id="${id}" aria-label="Remove ${pl.web_name}">
          <span class="pos">${POS[pl.element_type]}</span><strong>${pl.web_name}</strong> <span class="muted">${teams.get(pl.team)?.short_name}</span>
          <span class="amt">${money(pl.now_cost)}</span></button></li>`;
      })}</ul>` : ""}
      <label for="q">Find a player</label>
      <input id="q" type="search" autocomplete="off" placeholder="Name" value="${plan.query}" data-action="search">
      <div class="pos-filter" role="group" aria-label="Position">
        ${[null, 1, 2, 3, 4].map((pos) => html`<button type="button" class="btn${plan.pos === pos ? " primary" : ""}" data-action="pos" data-pos="${pos ?? ""}" aria-pressed="${plan.pos === pos}">${pos ? POS[pos] : "All"}</button>`)}
      </div>
      <div id="results">${results(b, plan, players, teams, result)}</div>
    </section>
    ${chipChoices.length ? html`<section aria-labelledby="chip-h">
      <h2 id="chip-h">Playing a chip?</h2>
      <div class="pos-filter">${[null, ...chipChoices.map((c) => c.name)].map((c) => html`<button type="button" class="btn${plan.chip === c ? " primary" : ""}" data-action="chip" data-chip="${c ?? ""}" aria-pressed="${plan.chip === c}">${c ? CHIP_NAMES[c] : "No chip"}</button>`)}</div>
    </section>` : ""}
    <p><button type="button" class="btn" data-action="clear">Clear plan</button></p>`;
}

function summary(r, b, plan, teams) {
  const ft = b.squad.freeTransfers.remaining;
  const blocking = r.errors.filter((e) => e.code !== "count_mismatch");
  const pendingSide = plan.out.length !== plan.in.length;
  return html`
    <dl class="facts">
      <div><dt>Money left</dt><dd class="${r.remaining < 0 ? "bad" : ""}">${money(r.remaining)}</dd></div>
      <div><dt>Transfers</dt><dd>${r.transfers}<span class="note">${plan.chip ? CHIP_NAMES[plan.chip] : `${ft} free`}</span></dd></div>
      <div><dt>Points hit</dt><dd class="${r.hitPoints ? "bad" : ""}">${r.hitPoints ? `−${r.hitPoints}` : "0"}</dd></div>
    </dl>
    ${!plan.out.length && !plan.in.length ? html`<p class="empty">Pick a player to sell, then find who to buy.</p>`
      : pendingSide ? html`<p class="status">${plan.out.length > plan.in.length ? `Choose ${plan.out.length - plan.in.length} more to buy.` : `Choose ${plan.in.length - plan.out.length} more to sell.`}</p>`
      : blocking.length ? html`<ul class="problems">${blocking.map((e) => html`<li><span class="card out" aria-hidden="true"></span>${e.code === "club_limit" ? `${e.have} ${teams.get(e.team)?.name} players (max ${e.limit})` : e.message}</li>`)}</ul>`
      : html`<p class="status good">This plan is legal and affordable.</p>`}`;
}

function results(b, plan, players, teams, r) {
  const q = plan.query.trim().toLowerCase();
  const outPositions = plan.out.map((id) => players.get(id)?.element_type);
  const pos = plan.pos ?? (plan.out.length > plan.in.length ? outPositions[plan.in.length] ?? null : null);
  if (!q && !pos) return html`<p class="small muted">Type a name or choose a position.</p>`;
  const owned = new Set(b.squad.picks.map((p) => p.id).filter((id) => !plan.out.includes(id)));
  const list = b.players
    .filter((p) => !owned.has(p.id) && !plan.in.includes(p.id) && !p.removed)
    .filter((p) => !pos || p.element_type === pos)
    .filter((p) => !q || p.web_name.toLowerCase().includes(q) || (teams.get(p.team)?.short_name ?? "").toLowerCase() === q)
    .sort((a, b2) => Number(b2.form) - Number(a.form) || b2.now_cost - a.now_cost)
    .slice(0, 25);
  if (!list.length) return html`<p class="empty">No players match. Try part of a surname.</p>`;
  return html`<ul class="pick-list">${list.map((p) => {
    const level = ["i", "s", "u", "n"].includes(p.status) ? "out" : p.status === "d" || (p.chance_of_playing_next_round ?? 100) < 100 ? "doubt" : "ok";
    const afford = p.now_cost <= r.remaining;
    return html`<li><button type="button" class="pick" data-action="add-in" data-id="${p.id}">
      <span class="card ${level}" aria-label="${level === "ok" ? "Available" : level === "out" ? "Out" : "Doubt"}" role="img"></span>
      <span class="pos">${POS[p.element_type]}</span><strong>${p.web_name}</strong> <span class="muted">${teams.get(p.team)?.short_name} form ${p.form}</span>
      <span class="amt${afford ? "" : " bad"}">${money(p.now_cost)}</span></button></li>`;
  })}</ul>
  <p class="small muted">Sorted by FPL form. Red prices are more than the money you have left.</p>`;
}

/** Applies a click/input to the plan; returns true if it changed. */
export function applyAction(plan, el, value) {
  const id = Number(el.dataset.id);
  switch (el.dataset.action) {
    case "toggle-out":
      plan.out = plan.out.includes(id) ? plan.out.filter((x) => x !== id) : [...plan.out, id];
      return true;
    case "add-in": plan.in = [...plan.in, id]; plan.query = ""; plan.pos = null; return true;
    case "remove-in": plan.in = plan.in.filter((x) => x !== id); return true;
    case "pos": plan.pos = el.dataset.pos ? Number(el.dataset.pos) : null; return true;
    case "chip": plan.chip = el.dataset.chip || null; return true;
    case "search": plan.query = value; return true;
    case "clear": Object.assign(plan, { out: [], in: [], chip: null, query: "", pos: null }); return true;
    default: return false;
  }
}
