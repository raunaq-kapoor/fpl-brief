// Settings: GitHub token and repos, stored only on this device.
import { html } from "../ui.js";

export function renderSettings(_b, ctx) {
  const s = ctx.settings;
  return html`
    <h1 class="page">Settings</h1>
    <form data-form="settings">
      <label for="token">GitHub token</label>
      <input id="token" name="token" type="password" autocomplete="off" value="${s.token}">
      <p class="hint">A fine-grained token with Contents read and write on ${s.dataRepo}, and Actions read and write on ${s.codeRepo} (for Refresh now). It's stored only in this browser.</p>
      <label for="dataRepo">Data repo</label>
      <input id="dataRepo" name="dataRepo" type="text" value="${s.dataRepo}">
      <label for="codeRepo">Code repo</label>
      <input id="codeRepo" name="codeRepo" type="text" value="${s.codeRepo}">
      <label for="branch">Code repo branch</label>
      <input id="branch" name="branch" type="text" value="${s.branch}">
      <label for="entry">FPL team ID</label>
      <input id="entry" name="entry" type="text" inputmode="numeric" value="${s.entry}">
      <p><button class="btn primary" type="submit">Save and reload</button></p>
    </form>`;
}
