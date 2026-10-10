// Where the bundle comes from: the private data repo via the GitHub API (token stored on this
// device), or the locally generated mock (`?mock=1`, from `npm run mock`).

const SETTINGS_KEY = "fpl.settings";
const CACHE_KEY = "fpl.bundle";
const SEEN_KEY = "fpl.lastSeen";
const DEFAULTS = { token: "", dataRepo: "raunaq-kapoor/fpl-assistant-data", codeRepo: "raunaq-kapoor/fpl-assistant", branch: "v2", entry: "" }; // team ID is entered in Settings, not shipped in public code

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
export const isMock = () => new URLSearchParams(location.search).has("mock");

export const getSettings = () => ({ ...DEFAULTS, ...safe(() => JSON.parse(localStorage.getItem(SETTINGS_KEY)), {}) });
export const saveSettings = (s) => safe(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)));
export const getLastSeen = () => safe(() => localStorage.getItem(SEEN_KEY), null);
export const setLastSeen = (iso) => safe(() => localStorage.setItem(SEEN_KEY, iso));

const api = (s, path, init = {}) => fetch(`https://api.github.com/${path}`, {
  ...init,
  headers: { Authorization: `Bearer ${s.token}`, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28", ...init.headers },
});

/** Returns { bundle, from: "network" | "cache" | "mock", error? } */
export async function loadBundle() {
  const s = getSettings();
  if (isMock()) {
    const q = new URLSearchParams(location.search);
    const file = q.get("mock") === "demo" ? "demo.json" : "latest.json";
    const res = await fetch(`dev/data/entries/${q.get("entry") ?? s.entry}/app/${file}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Mock data missing. Run `npm run mock` first, and add &entry=<team ID> to the URL.");
    return { bundle: await res.json(), from: "mock" };
  }
  if (!s.token || !s.entry) return { bundle: null, from: "none", error: "Add your FPL team ID and GitHub token in Settings to load your brief." };
  try {
    const res = await api(s, `repos/${s.dataRepo}/contents/entries/${s.entry}/app/latest.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 404 ? "No brief yet. The first scheduled run hasn't written one." : `GitHub said ${res.status}. Check the token in Settings.`);
    const bundle = await res.json();
    safe(() => localStorage.setItem(CACHE_KEY, JSON.stringify(bundle)));
    return { bundle, from: "network" };
  } catch (e) {
    const cached = safe(() => JSON.parse(localStorage.getItem(CACHE_KEY)), null);
    return { bundle: cached, from: "cache", error: e.message };
  }
}

/** Starts the refresh workflow (needs Actions: write on the code repo). */
export async function requestRefresh() {
  const s = getSettings();
  const res = await api(s, `repos/${s.codeRepo}/actions/workflows/refresh.yml/dispatches`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: s.branch, inputs: { force: "true" } }),
  });
  if (res.status !== 204) throw new Error(`Couldn't start a refresh (GitHub said ${res.status}).`);
}
