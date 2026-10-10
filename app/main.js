// Router and app state. Screens are pure functions of the bundle that return escaped HTML.
import { loadBundle, isMock, getSettings, saveSettings, requestRefresh, getLastSeen, setLastSeen } from "./data.js";
import { html } from "./ui.js";
import { renderBrief } from "./views/brief.js";
import { renderTransfers, loadPlan, savePlan, applyAction } from "./views/transfers.js";
import { renderChanges } from "./views/changes.js";
import { renderSettings } from "./views/settings.js";

const view = document.getElementById("view");
const state = { bundle: null, loadError: null, from: null, plan: null };

const screens = {
  brief: (b, ctx) => renderBrief(b, ctx),
  transfers: (b, ctx) => renderTransfers(b, { ...ctx, plan: state.plan ??= loadPlan(b.gameweeks.target?.id) }),
  changes: (b, ctx) => renderChanges(b, { ...ctx, lastSeen: getLastSeen() }),
  settings: (b, ctx) => renderSettings(b, { ...ctx, settings: getSettings() }),
};

function currentRoute() {
  const r = location.hash.slice(1) || "brief";
  return screens[r] ? r : "brief";
}

function render() {
  const route = currentRoute();
  for (const a of document.querySelectorAll(".tabs a")) {
    if (a.getAttribute("href") === `#${route}`) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const needsData = route !== "settings";
  if (needsData && !state.bundle) {
    view.innerHTML = String(html`<h1>FPL Brief</h1><p>${state.loadError ?? "Loading your brief…"}</p>${state.loadError ? html`<p><a href="#settings">Open Settings</a></p>` : ""}`);
    return;
  }
  const ctx = { now: new Date(), loadError: state.from === "cache" ? state.loadError : null, canRefresh: !isMock() && Boolean(getSettings().token) };
  view.innerHTML = String(screens[route](state.bundle, ctx));
}

function onPlanAction(el, value) {
  if (!state.plan || !applyAction(state.plan, el, value)) return;
  savePlan(state.plan);
  const again = el.dataset.id ? `[data-action="${el.dataset.action}"][data-id="${el.dataset.id}"]`
    : el.dataset.pos !== undefined ? `[data-action="pos"][data-pos="${el.dataset.pos}"]`
    : el.dataset.chip !== undefined ? `[data-action="chip"][data-chip="${el.dataset.chip}"]` : null;
  render();
  if (again && el.dataset.action !== "search") document.querySelector(again)?.focus();
  if (el.dataset.action === "search") {
    const q = document.getElementById("q");
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }
}

view.addEventListener("input", (e) => {
  if (e.target.dataset.action === "search") onPlanAction(e.target, e.target.value);
});

view.addEventListener("click", async (e) => {
  if (e.target.closest("[data-action='mark-seen']")) { setLastSeen(state.bundle.generatedAt); render(); return; }
  const planBtn = e.target.closest("[data-action]:not([data-action='refresh']):not([data-action='search'])");
  if (planBtn && currentRoute() === "transfers") { onPlanAction(planBtn); return; }
  const btn = e.target.closest("[data-action='refresh']");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "Starting…";
  try {
    await requestRefresh();
    btn.textContent = "Refresh started, check back in 2 minutes";
  } catch (err) {
    btn.textContent = err.message;
  }
});

view.addEventListener("submit", (e) => {
  if (e.target.dataset.form !== "settings") return;
  e.preventDefault();
  saveSettings({ ...getSettings(), ...Object.fromEntries(new FormData(e.target)) });
  location.reload();
});

window.addEventListener("hashchange", () => { render(); view.focus(); });

(async () => {
  render();
  try {
    const r = await loadBundle();
    Object.assign(state, { bundle: r.bundle, loadError: r.error ?? null, from: r.from });
  } catch (e) {
    state.loadError = e.message;
  }
  render();
})();
