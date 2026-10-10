// Tiny view helpers: escaped HTML templates and formatters. No framework.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Raw HTML that `html` won't escape (only for strings built by `html`). */
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }

/** Tagged template: interpolations are escaped unless they are Raw (or arrays of Raw). */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    const part = Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("")
      : v instanceof Raw ? v.s : v === false || v == null ? "" : esc(v);
    out += part + strings[i + 1];
  });
  return new Raw(out);
}

export const money = (tenths) => `${tenths < 0 ? "−" : ""}£${(Math.abs(tenths) / 10).toFixed(1)}m`;

const dayTime = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
export const fmtDeadline = (iso) => dayTime.format(new Date(iso)).replace(",", "").replace(/ (\d\d:\d\d)/, ", $1");
export const fmtDate = (iso) => (iso ? shortDate.format(new Date(iso)) : "");
export const fmtTime = (iso) => (iso ? time.format(new Date(iso)) : "");

export function ago(iso, now = new Date()) {
  const mins = Math.round((now - new Date(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function untilText(iso, now = new Date()) {
  const mins = Math.floor((new Date(iso) - now) / 60000);
  if (mins <= 0) return "Deadline passed";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} day${d > 1 ? "s" : ""} ${h} hour${h === 1 ? "" : "s"} left`;
  return `${h} h ${m} min left`;
}

export const CHIP_NAMES = { wildcard: "Wildcard", freehit: "Free Hit", bboost: "Bench Boost", "3xc": "Triple Captain" };
export const POS_NAMES = { 1: "Goalkeepers", 2: "Defenders", 3: "Midfielders", 4: "Forwards" };
