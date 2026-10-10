// The weekly brief: deadline, what needs a look, the team sheet with fixture strips, money, chips.
import { html, money, fmtDeadline, fmtDate, fmtTime, ago, untilText, CHIP_NAMES } from "../ui.js";

const STALE_HOURS = 6;

export function renderBrief(b, ctx) {
  const now = ctx.now;
  const teams = new Map(b.teams.map((t) => [t.id, t]));
  const players = new Map(b.players.map((p) => [p.id, p]));
  const target = b.gameweeks.target;
  const gws = target ? [0, 1, 2, 3, 4].map((i) => target.id + i).filter((g) => g <= 38) : [];

  return html`
    ${header(b, target, now, ctx)}
    ${banners(b, now, ctx)}
    <section aria-labelledby="looks-h">
      <h2 id="looks-h">Needs a look</h2>
      ${looks(b, players, teams)}
    </section>
    <section aria-labelledby="say-h">
      <h2 id="say-h">What the sources say</h2>
      ${sourcesSay(b, players)}
    </section>
    <section aria-labelledby="sheet-h">
      <h2 id="sheet-h">Your squad</h2>
      <div class="strip-key" aria-hidden="true">${gws.map((g) => html`<span>GW${g}</span>`)}</div>
      ${sheet(b, players, teams, gws)}
      <p class="small muted">Fixture strips run from GW${target?.id} for five gameweeks. Darker green is easier, red is harder (FPL's difficulty rating). Capitals are home games.</p>
    </section>
    <section aria-labelledby="sources-h">
      <h2 id="sources-h">Sources this gameweek</h2>
      ${sources(b)}
    </section>
    <section aria-labelledby="money-h">
      <h2 id="money-h">Money and transfers</h2>
      ${moneyFacts(b)}
      <a class="cta" href="#transfers">Plan transfers</a>
    </section>
    <section aria-labelledby="chips-h">
      <h2 id="chips-h">Chips left</h2>
      ${chips(b)}
    </section>`;
}

function header(b, target, now, ctx) {
  if (!target) return html`<div class="deadline"><h1>Season over</h1></div>`;
  return html`
    <div class="deadline">
      <h1>Gameweek ${target.id} deadline</h1>
      <p class="when">${fmtDeadline(target.deadline)}. <span class="left">${untilText(target.deadline, now)}</span></p>
      <p class="fresh">FPL data from ${ago(b.generatedAt, now)}. FPL price data updated ${fmtDate(b.freshness.prices)}, ${fmtTime(b.freshness.prices)}.
        ${ctx.canRefresh ? html`<button type="button" data-action="refresh">Refresh now</button>` : ""}</p>
    </div>`;
}

function banners(b, now, ctx) {
  const out = [];
  if (ctx.loadError) out.push(html`<p class="banner warn">${ctx.loadError} Showing the last brief saved on this device.</p>`);
  const hoursOld = (now - new Date(b.generatedAt)) / 3600000;
  if (hoursOld > STALE_HOURS) out.push(html`<p class="banner warn">This data is ${Math.round(hoursOld)} hours old. Scheduled refreshes may have failed.</p>`);
  for (const c of b.squad.checks.filter((x) => !x.ok)) out.push(html`<p class="banner">${c.message}</p>`);
  for (const e of b.errors) out.push(html`<p class="banner warn">${e.message}</p>`);
  return out;
}

function looks(b, players, teams) {
  const items = [];
  const consider = [
    ...b.squad.picks.map((p) => ({ id: p.id, mine: true })),
    ...b.watchlist.filter((id) => !b.squad.picks.some((p) => p.id === id)).map((id) => ({ id, mine: false })),
  ];
  for (const { id, mine } of consider) {
    const f = b.focus[id];
    const p = players.get(id);
    if (!f || !p) continue;
    const club = teams.get(p.team)?.short_name;
    const who = `${p.web_name}${mine ? "" : " (watching)"}`;
    const a = f.availability;
    if (a.level !== "ok") {
      items.push({
        rank: a.level === "out" ? 0 : 1, level: a.level, who, club,
        what: a.reasons.length ? a.reasons.join(" ") : `Marked ${a.statusText}${a.chance != null ? ` (${a.chance}% chance)` : ""}`,
        src: a.newsAdded ? `FPL injury news, ${fmtDate(a.newsAdded)} at ${fmtTime(a.newsAdded)}` : "FPL status",
      });
    }
    for (const flag of f.rotation?.flags ?? []) {
      if (flag.code === "availability") continue;
      items.push({
        rank: flag.code === "blank" ? 0 : 2, level: flag.code === "blank" ? "out" : "doubt", who, club,
        what: flag.code === "blank" ? "No fixture this gameweek" : `Minutes risk. ${flag.detail}.`,
        src: "FPL match data",
      });
    }
  }
  for (const c of b.claims?.conflicts ?? []) {
    const p = players.get(c.playerId);
    if (!p) continue;
    const fplText = { ok: "available", doubt: "a doubt", out: "out" }[c.fpl];
    items.push({
      rank: 0.5, level: "conflict", who: p.web_name, club: teams.get(p.team)?.short_name,
      what: html`Sources disagree. FPL status: ${fplText}${b.focus[c.playerId]?.availability.newsAdded ? ` (news from ${fmtDate(b.focus[c.playerId].availability.newsAdded)})` : ""}. ${c.claim.sourceName} says: <q>${c.claim.quote}</q>`,
      src: html`<a href="${c.claim.url}" target="_blank" rel="noopener noreferrer">${c.claim.sourceName}, ${fmtDate(c.claim.publishedAt)}</a>`,
    });
  }
  if (!items.length) return html`<p class="empty">Nothing flagged. Every player in your squad is fit and has started regularly.</p>`;
  items.sort((x, y) => x.rank - y.rank);
  return html`<ul class="looks">${items.map((i) => html`
    <li>
      <span class="who"><span class="card ${i.level}" role="img" aria-label="${{ out: "Out", doubt: "Doubt", conflict: "Sources disagree" }[i.level]}"></span>${i.who}</span>
      <span class="muted small"> ${i.club}</span>
      <p class="what">${i.what}</p>
      <p class="src">${i.src}</p>
    </li>`)}</ul>`;
}

function stripCell(entry, teams) {
  if (!entry.fixtures.length) return html`<span class="blank" title="GW${entry.gw}: no fixture">–</span>`;
  const label = (f) => {
    const t = teams.get(f.opponent)?.short_name ?? "?";
    return f.home ? t.toUpperCase() : t.toLowerCase();
  };
  if (entry.fixtures.length > 1) {
    const hardest = Math.max(...entry.fixtures.map((f) => f.fdr));
    return html`<span class="f${hardest} dbl" title="GW${entry.gw}: double gameweek">${entry.fixtures.map((f) => html`<b>${label(f)}</b>`)}</span>`;
  }
  const f = entry.fixtures[0];
  return html`<span class="f${f.fdr}" title="GW${entry.gw}: ${f.home ? "home" : "away"} v ${teams.get(f.opponent)?.name}, difficulty ${f.fdr}">${label(f)}</span>`;
}

function sheet(b, players, teams, gws) {
  const row = (pick) => {
    const p = players.get(pick.id);
    const f = b.focus[pick.id];
    const level = f?.availability.level ?? "ok";
    const armband = pick.isCaptain ? "C" : pick.isViceCaptain ? "V" : "";
    return html`
      <li class="row${pick.pending ? " pending" : ""}">
        <span class="name"><span class="card ${level}" role="img" aria-label="${level === "ok" ? "Available" : level === "out" ? "Out" : "Doubt"}"></span><strong>${p.web_name}</strong>${armband ? html`<span class="armband" aria-label="${armband === "C" ? "Captain" : "Vice-captain"}">${armband}</span>` : ""}<span class="club">${teams.get(p.team)?.short_name}</span></span>
        <span class="price" title="Selling price (bought at ${money(pick.purchase)})">${money(pick.sell)}${pick.now !== pick.sell ? html`<span class="now">now ${money(pick.now)}</span>` : ""}</span>
        <span class="strip">${(f?.next ?? []).filter((n) => gws.includes(n.gw)).map((n) => stripCell(n, teams))}</span>
      </li>`;
  };
  const starters = b.squad.picks.filter((p) => p.slot && p.slot <= 11);
  const bench = b.squad.picks.filter((p) => !p.slot || p.slot > 11);
  return html`
    <h3>Starting eleven, as last set</h3>
    <ul class="sheet">${starters.map(row)}</ul>
    <h3>Bench</h3>
    <ul class="sheet">${bench.map(row)}</ul>`;
}

const TYPE_TITLES = { captain: "Captain picks", buy: "Buy", sell: "Sell", differential: "Differentials", fixture: "Fixtures", price: "Price changes", chip: "Chips", availability: "Team news" };
const STANCE_TEXT = { fit: "Fit", doubt: "Doubt", out: "Out", buy: "Buy", sell: "Sell", captain: "Captain", avoid: "Avoid", differential: "Differential", rise: "Price rise", fall: "Price fall", neutral: "Note" };

function claimLine(c, players, showNames) {
  const resolved = c.playerIds.map((id) => players.get(id)?.web_name).filter(Boolean);
  const names = (resolved.length ? resolved : c.names).join(", ");
  return html`<li>
    ${showNames ? html`<strong class="claim-who">${names}</strong>` : ""}<span class="stance">${STANCE_TEXT[c.stance] ?? c.stance}</span>
    <p class="claim">${c.sentence}</p>
    <blockquote><q>${c.quote}</q></blockquote>
    <p class="src"><a href="${c.url}" target="_blank" rel="noopener noreferrer">${c.sourceName}, ${fmtDate(c.publishedAt)}</a>${c.flags.includes("unresolved_name") ? ". Name not matched to an FPL player" : ""}</p>
  </li>`;
}

function sourcesSay(b, players) {
  const cl = b.claims;
  if (!cl) return html`<p class="empty">Sources weren't read in this run.</p>`;
  if (!cl.provider) return html`<p class="empty">Claims are waiting for a Gemini key. Add the GEMINI_API_KEY secret to the code repo and the next refresh reads this week's articles.</p>`;
  const focusIds = new Set([...b.squad.picks.map((p) => p.id), ...b.watchlist]);
  const mine = new Map();
  const other = new Map();
  let hiddenNews = 0;
  for (const c of cl.items) {
    const ids = c.playerIds.filter((id) => focusIds.has(id));
    if (ids.length) for (const id of ids) mine.set(id, [...(mine.get(id) ?? []), c]);
    else if (c.type !== "availability" || c.flags.length) other.set(c.type, [...(other.get(c.type) ?? []), c]);
    else hiddenNews++;
  }
  const rejected = Object.values(cl.perDoc).reduce((n, d) => n + (d.rejected ?? 0), 0);
  const pending = Object.values(cl.perDoc).filter((d) => d.status === "pending").length;
  return html`
    ${!mine.size && !other.size ? html`<p class="empty">No claims yet for this gameweek. Guides usually appear two to three days before the deadline.</p>` : ""}
    ${mine.size ? html`<h3>About your players</h3>${[...mine].map(([id, list]) => html`
      <h4>${players.get(id)?.web_name}${b.watchlist.includes(id) && !b.squad.picks.some((p) => p.id === id) ? " (watching)" : ""}</h4>
      <ul class="claims">${list.map((c) => claimLine(c, players, false))}</ul>`)}` : ""}
    ${[...other].map(([type, list]) => html`<h3>${TYPE_TITLES[type] ?? type}</h3><ul class="claims">${list.map((c) => claimLine(c, players, true))}</ul>`)}
    <p class="small muted">Read by ${cl.provider === "fake" ? "the dev stand-in (not Gemini)" : "Gemini"}. A claim is kept only if its quote appears word for word in the article${rejected === 1 ? "; 1 didn't and was dropped" : rejected ? `; ${rejected} didn't and were dropped` : ""}.${pending ? ` ${pending} article${pending > 1 ? "s" : ""} still to read.` : ""}${hiddenNews ? ` ${hiddenNews} team-news claim${hiddenNews > 1 ? "s" : ""} about players you don't own or watch ${hiddenNews > 1 ? "are" : "is"} not shown.` : ""}</p>`;
}

function sources(b) {
  if (!b.sources) return html`<p class="empty">Sources weren't checked in this run.</p>`;
  const bySource = new Map(b.sources.status.map((s) => [s.id, { ...s, docs: [] }]));
  for (const d of b.sources.digest) bySource.get(d.sourceId)?.docs.push(d);
  return html`
    <p class="small muted">Checked ${fmtDate(b.freshness.sources)} at ${fmtTime(b.freshness.sources)}. Undated items count from the last deadline on.</p>
    ${[...bySource.values()].map((s) => html`
      <h3>${s.name}</h3>
      ${!s.ok ? html`<p class="banner warn">Couldn't check ${s.name}: ${s.message}.</p>`
        : s.docs.length ? html`<ul class="docs">${s.docs.map((d) => html`<li>
            <a href="${d.url}" target="_blank" rel="noopener noreferrer">${d.title}</a>
            <span class="small muted">${d.publishedAt ? `${fmtDate(d.publishedAt)}${d.publishedAt.endsWith("T00:00:00.000Z") ? "" : `, ${fmtTime(d.publishedAt)}`}` : "date unknown"}${d.kind === "headline" ? ", headline only" : ""}${d.imageUrls ? `, ${d.imageUrls} stats image${d.imageUrls > 1 ? "s" : ""} at source` : ""}${d.stale ? ", older than a week" : ""}${claimNote(b, d)}</span></li>`)}</ul>`
        : html`<p class="small muted">Nothing for this gameweek yet.</p>`}
      ${s.skipped?.length ? html`<p class="small muted">Skipped: ${s.skipped.join("; ")}</p>` : ""}`)}`;
}

function claimNote(b, d) {
  const c = b.claims?.perDoc?.[d.id];
  if (!c) return "";
  if (c.status === "pending") return `. Claims pending: ${c.message}`;
  return `. ${c.accepted} claim${c.accepted === 1 ? "" : "s"}${c.rejected ? `, ${c.rejected} dropped` : ""}`;
}

function moneyFacts(b) {
  const sellTotal = b.squad.picks.reduce((s, p) => s + p.sell, 0);
  const ft = b.squad.freeTransfers;
  return html`
    <dl class="facts">
      <div><dt>In the bank</dt><dd>${money(b.squad.bank)}</dd></div>
      <div><dt>Free transfers</dt><dd>${ft.remaining}<span class="note">worked out from your history</span></dd></div>
      <div><dt>Squad selling value</dt><dd>${money(sellTotal)}</dd></div>
    </dl>`;
}

function chips(b) {
  const now = b.chips.available.filter((c) => c.now);
  const later = b.chips.available.filter((c) => !c.now);
  return html`
    ${now.length ? html`<ul class="chips">${now.map((c) => html`<li class="now">${CHIP_NAMES[c.name]}, until GW${c.until}</li>`)}</ul>` : html`<p class="empty">No chips left before GW${later[0]?.from ?? 20}.</p>`}
    ${later.length ? html`<p class="small muted">From GW${later[0].from}: ${later.map((c) => CHIP_NAMES[c.name]).join(", ")}.</p>` : ""}`;
}
