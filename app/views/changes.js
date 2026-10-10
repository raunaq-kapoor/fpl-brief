// What changed since you last looked: FPL status, news, price and fixture changes for your
// squad and watchlist (everyone else's price moves are left out as noise).
import { html, money, fmtDate, fmtTime } from "../ui.js";

const STATUS = { a: "available", d: "doubtful", i: "injured", s: "suspended", u: "unavailable", n: "not eligible" };

export function renderChanges(b, ctx) {
  const players = new Map(b.players.map((p) => [p.id, p]));
  const teams = new Map(b.teams.map((t) => [t.id, t]));
  const mine = new Set(b.squad.picks.map((p) => p.id));
  const watching = new Set(b.watchlist);
  const since = ctx.lastSeen ?? new Date(ctx.now - 7 * 86400000).toISOString();
  const fresh = b.changes.filter((c) => c.at > since).sort((a, c) => c.at.localeCompare(a.at));

  const groups = [
    { title: "Your squad", items: fresh.filter((c) => c.kind === "player" && mine.has(c.id)) },
    { title: "Players you're watching", items: fresh.filter((c) => c.kind === "player" && watching.has(c.id) && !mine.has(c.id)) },
    { title: "Fixtures", items: fresh.filter((c) => c.kind === "fixture") },
  ];
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return html`
    <h1 class="page">What changed</h1>
    <p class="muted">${ctx.lastSeen ? `Since you last marked this seen, ${fmtDate(since)} at ${fmtTime(since)}.` : "In the last 7 days."} Source: FPL, checked ${fmtDate(b.generatedAt)} at ${fmtTime(b.generatedAt)}.</p>
    ${total ? groups.filter((g) => g.items.length).map((g) => html`
      <section><h2>${g.title}</h2><ul class="changes">${g.items.map((c) => row(c, players, teams))}</ul></section>`)
      : html`<p class="empty">No changes for your squad or watchlist. Price, injury and fixture changes will show here.</p>`}
    <p><button type="button" class="btn primary" data-action="mark-seen">Mark all as seen</button></p>`;
}

function row(c, players, teams) {
  const when = html`<span class="when">${fmtDate(c.at)}, ${fmtTime(c.at)}</span>`;
  if (c.kind === "fixture") {
    const detail = c.field === "kickoff_time"
      ? `Kick-off moved from ${c.from ? `${fmtDate(c.from)} ${fmtTime(c.from)}` : "unscheduled"} to ${c.to ? `${fmtDate(c.to)} ${fmtTime(c.to)}` : "unscheduled"}`
      : `Moved from ${c.from ? `GW${c.from}` : "unscheduled"} to ${c.to ? `GW${c.to}` : "unscheduled (blank)"}`;
    const match = `${teams.get(c.team_h)?.short_name ?? "?"} v ${teams.get(c.team_a)?.short_name ?? "?"}`;
    return html`<li><span class="what"><strong>${match}</strong></span>${when}<span class="detail">${detail}</span></li>`;
  }
  const p = players.get(c.id);
  const name = html`<span class="what"><strong>${p?.web_name ?? c.id}</strong> <span class="muted small">${teams.get(p?.team)?.short_name}</span></span>`;
  let detail;
  if (c.field === "now_cost") {
    const up = c.to > c.from;
    detail = html`Price <span class="${up ? "up" : "down"}">${up ? "rose" : "fell"}</span> from ${money(c.from)} to ${money(c.to)}`;
  } else if (c.field === "status") detail = `Now ${STATUS[c.to] ?? c.to} (was ${STATUS[c.from] ?? c.from})`;
  else if (c.field === "chance_of_playing_next_round") detail = `Chance of playing ${c.from ?? 100}% → ${c.to ?? 100}%`;
  else detail = c.to ? `News: “${c.to}”` : "News cleared";
  return html`<li>${name}${when}<span class="detail">${detail}</span></li>`;
}
