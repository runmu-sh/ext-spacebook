// src/index.ts
import { defineExtension, h } from "@muclient/sdk";

// src/copy.ts
var COPY = {
  title: "Spacebook",
  // bar
  online: "Online",
  offline: "Offline",
  search: "Search buddies",
  add: "Add",
  // sections
  pending: "Pending",
  buddies: "Buddies",
  wants: "wants to be buddies",
  accept: "Accept",
  // row
  noBlurb: "No blurb",
  portrait: "Portrait",
  status: { online: "online", offline: "offline", deceased: "deceased", unknown: "unknown" },
  menu: "Row menu",
  // empty states
  awaiting: "Waiting for Spacebook",
  noBuddies: "No buddies yet",
  noMatch: "No buddy matches",
  /** The label line over the server's `error` text (kept verbatim under it). */
  noSignal: "No signal",
  // the bar
  refresh: "Refresh",
  /** The dim note under the bar when the list is the pad's last sync: "CACHED · 12 min ago". */
  cached: (ago) => `Cached \xB7 ${ago}`,
  /** A relative time, terse: "just now", "45 s ago", "12 min ago", "3 h ago", "2 d ago". */
  ago: { now: "just now", s: (n) => `${n} s ago`, min: (n) => `${n} min ago`, h: (n) => `${n} h ago`, d: (n) => `${n} d ago` },
  // foot
  you: "You",
  isPublic: "Public",
  isPrivate: "Private",
  editBlurb: "Edit blurb",
  goPrivate: "Go private",
  goPublic: "Go public",
  searchProfiles: "Search profiles",
  friendsShared: "Friends shared",
  friendsHidden: "Friends hidden",
  hideFriends: "Hide friends",
  shareFriends: "Share friends",
  // profile and search views
  back: "Back",
  openProfile: "Open profile",
  loading: "Loading",
  friends: "Friends",
  introduces: "Can introduce you to",
  noFriends: "No friends to show",
  noIntroductions: "Nobody they could introduce you to",
  results: "Results",
  noResults: "No public profiles match",
  addBuddy: "Add buddy",
  isBuddy: "Buddy",
  isYou: "You",
  privateProfile: "Private profile",
  searchHead: (term) => `Search: ${term}`,
  // prompts
  addTitle: "Add a buddy",
  addLabel: "Their name",
  addPlaceholder: "name",
  blurbTitle: "Your blurb",
  blurbLabel: (max) => `Up to ${max} characters`,
  blurbTooLong: (max) => `at most ${max} characters`,
  searchTitle: "Search profiles",
  searchLabel: "A word from a name, line of work or blurb",
  removeTitle: (name) => `Remove ${name}?`,
  removeBody: "They are told nothing; they can ask again.",
  removeConfirm: "Remove",
  // context menu
  buddyKind: "Buddy",
  page: "Page",
  viewProfile: "View profile",
  remove: "Remove buddy",
  // notifications
  requestTitle: "Spacebook",
  requestBody: (name) => `${name} wants to be buddies`,
  // settings
  settingsTitle: "Spacebook",
  settingOnline: "Show buddies who are online",
  settingOffline: "Show buddies who are offline",
  settingOfflineHint: "Deceased and unknown count as offline.",
  // commands sent as text
  cmdPage: (name) => `page ${name} `
};

// src/types.ts
var SETTINGS = { online: "filter.online", offline: "filter.offline" };
var BUDDY_KIND = "spacebook.buddy";
var BLURB_MAX = 49;

// src/index.ts
var ID = "spacebook";
var PKG = "Spacebook.List";
var SUPPORTS = ["Spacebook 1"];
var SEEN_KEY = "seen.pending";
var RETRY = { delays: [2e3, 6e3, 15e3, 4e4, 9e4], redeclareFrom: 1, redeclareMax: 24, redeclareGap: 3e4, refreshGap: 5e3 };
var retryDelay = (step) => RETRY.delays[Math.min(step, RETRY.delays.length - 1)] ?? 9e4;
var DECLARE_MAX = 1e3;
function agoOf(then, now = Date.now()) {
  const s = Math.max(0, Math.round(now / 1e3 - then));
  if (s < 10) return COPY.ago.now;
  if (s < 60) return COPY.ago.s(s);
  const m = Math.round(s / 60);
  if (m < 60) return COPY.ago.min(m);
  const hh = Math.round(m / 60);
  if (hh < 48) return COPY.ago.h(hh);
  return COPY.ago.d(Math.round(hh / 24));
}
var HOSTILE = /* @__PURE__ */ new Set(["rival", "adversary", "enemy", "nemesis", "hated enemy", "disliked", "wary rival", "feared", "dreaded", "terrifying", "menacing", "intimidating", "unnerving"]);
var isHostile = (acq) => HOSTILE.has(acq.trim().toLowerCase());
var KIND_SCHEMA = {
  type: "object",
  required: ["buddy"],
  properties: { buddy: { type: "object", required: ["key", "name"], properties: { key: { type: "string" }, name: { type: "string" }, status: { type: "string" }, acquaintance: { type: "string" }, location: { type: "string" }, blurb: { type: "string" }, portrait: { type: "string" } } } }
};
var R = `.ext-panel[data-ext="${ID}"] .mu-spacebook`;
var SPACEBOOK_CSS = `
${R} { height: 100%; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font-family: var(--font-mono); font-size: .9rem; box-sizing: border-box; }
${R} *, ${R} *::before, ${R} *::after { box-sizing: border-box; }
${R}:focus { outline: none; }
${R} .bar { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; padding: 4px 8px; background: var(--bg-elev); border-bottom: 1px solid var(--accent); }
${R} .bar .sh-field { flex: 1; min-width: 6ch; }
${R} .bar .refresh { margin-left: auto; }
${R} .note { margin: 0; padding: 3px 10px; font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-faint); border-bottom: 1px solid var(--border); }
${R} .scroll { flex: 1; overflow-y: auto; padding: 0 10px 6px; }
${R} .reason { margin: .9rem 0 0; display: flex; flex-direction: column; gap: 4px; }
${R} .reason .lbl { font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-faint); }
${R} .reason .why { font-size: .82rem; color: var(--fg-dim); }
${R} .sec-head { margin: .9rem 0 .4rem; }
${R} .pend { display: flex; align-items: center; gap: 10px; padding: 5px 0 5px 2.4ch; border-bottom: 1px solid var(--border); font-size: .82rem; position: relative; }
${R} .pend::before { content: "\u25B8"; position: absolute; left: .8ch; color: var(--gold); }
${R} .pend .who { flex: 1; min-width: 0; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${R} .pend .ask { font-size: .66rem; color: var(--fg-faint); letter-spacing: .08em; white-space: nowrap; }
${R} .row { display: grid; grid-template-columns: 56px 1fr; gap: 0 12px; width: 100%; padding: 8px 6px 8px 2.4ch; border: 0; border-bottom: 1px solid var(--border); background: none; color: inherit; text-align: left; position: relative; font: inherit; transition: background-color .12s ease; }
${R} .row::before { content: "\u25B8"; position: absolute; left: .6ch; top: 8px; color: transparent; transition: color .12s ease; }
${R} .row:hover, ${R} .row:focus-visible, ${R} .row[aria-expanded="true"] { background: var(--tint-row); }
${R} .row:hover::before, ${R} .row:focus-visible::before, ${R} .row[aria-expanded="true"]::before { color: var(--accent-bright); }
${R} .row:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: -2px; }
${R} .port { width: 56px; height: 56px; border: 1px solid var(--border-bright); background: var(--bg-deep); display: grid; place-items: center; font-size: .78rem; letter-spacing: .08em; color: var(--fg-dim); position: relative; overflow: hidden; }
${R} .port b { font-weight: 500; }
${R} .port small { position: absolute; bottom: 2px; left: 0; right: 0; text-align: center; font-size: .46rem; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-faint); }
${R} .port img { width: 100%; height: 100%; object-fit: cover; display: block; }
${R} .port.dead { color: var(--fg-faint); border-color: var(--border); }
${R} .port.dead b { text-decoration: line-through; }
${R} .meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
${R} .l1 { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
${R} .name { font-size: .86rem; color: var(--fg); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${R} .l2 { font-size: .78rem; color: var(--fg-dim); display: flex; gap: 1ch; flex-wrap: wrap; }
${R} .l2 .acq { color: var(--gold); }
${R} .l2 .acq.foe { color: var(--alert); }
${R} .l2 .at { color: var(--fg-faint); }
${R} .l2 .loc { color: var(--fg); text-decoration: underline; text-decoration-color: var(--border-bright); text-underline-offset: 3px; }
${R} .l3 { font-size: .76rem; color: var(--fg-dim); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${R} .l3.none { font-style: normal; font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-faint); }
${R} .awaiting { margin: .9rem 0 0; color: var(--fg-faint); font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }
${R} .foot { display: flex; flex-direction: column; gap: 3px; padding: 7px 10px 8px; background: var(--bg-elev); border-top: 1px solid var(--border-bright); }
${R} .foot .l { display: flex; align-items: center; gap: 10px; min-width: 0; }
${R} .foot .you { font-size: .82rem; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${R} .foot .blurb { flex: 1; min-width: 0; font-size: .76rem; color: var(--fg-dim); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${R} .foot .acts { display: flex; flex-wrap: wrap; gap: 4px; margin-left: -.5ch; }
${R} .row:disabled { cursor: default; }
${R} .row:disabled:hover { background: none; }
${R} .row:disabled:hover::before { color: transparent; }
${R} .row.head { border-bottom: 0; cursor: default; }
${R} .row.head:hover { background: none; }
${R} .row.head::before { display: none; }
${R} .l2 .role { color: var(--accent-bright); text-transform: lowercase; }
${R} .scroll > .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 0 6px 2.4ch; border-bottom: 1px solid var(--border); }
${R} .vtitle { flex: 1; min-width: 0; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
var STATUSES = ["online", "offline", "deceased", "unknown"];
var str = (v) => typeof v === "string" ? v : v === null || v === void 0 ? "" : String(v);
function recordOf(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v;
  const key = str(d.key), name = str(d.name).trim();
  if (!key || !name) return null;
  const s = str(d.status).toLowerCase();
  return { key, name, status: STATUSES.includes(s) ? s : "unknown", acquaintance: str(d.acquaintance).trim(), location: str(d.location).trim(), blurb: str(d.blurb).trim(), portrait: str(d.portrait).trim() || "placeholder", role: str(d.role).trim(), shares_friends: d.shares_friends !== false };
}
function cardOf(v) {
  const r = recordOf(v);
  if (!r) return null;
  const d = v;
  return { key: r.key, name: r.name, role: r.role, status: r.status, portrait: r.portrait, acquaintance: r.acquaintance, buddy: d.buddy === true, viewable: d.viewable === true, blurb: r.blurb, location: r.location };
}
var cardsOf = (v) => Array.isArray(v) ? v.map(cardOf).filter((c) => !!c) : [];
function profileOf(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data;
  if (typeof d.error === "string" && d.error) return { key: str(d.key), name: str(d.name).trim(), error: d.error };
  const c = cardOf(d);
  if (!c) return null;
  const visible = d.friends_visible === true;
  return { ...c, shares_friends: d.shares_friends === true, friends_visible: visible, friends_hidden: visible ? "" : str(d.friends_hidden).trim(), friends: visible ? cardsOf(d.friends) : [], introducer: d.introducer === true };
}
function resultsOf(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data;
  return { term: str(d.term).trim(), results: cardsOf(d.results) };
}
function listOf(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data;
  const self = d.self && typeof d.self === "object" ? d.self : {};
  const recs = (v) => Array.isArray(v) ? v.map(recordOf).filter((r) => !!r) : [];
  const out = {
    self: { name: str(self.name).trim(), blurb: str(self.blurb).trim(), public: !!self.public, share_friends: self.share_friends !== false, portrait: str(self.portrait).trim() || "placeholder" },
    pending: recs(d.pending),
    buddies: recs(d.buddies)
  };
  const error = str(d.error).trim();
  if (error) out.error = error;
  if (typeof d.cached === "number" && Number.isFinite(d.cached) && d.cached > 0) out.cached = Math.floor(d.cached);
  return out;
}
function initialsOf(name) {
  const words = name.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+/u, "")).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0].toUpperCase());
  return letters.join("") || (name.trim()[0] ?? "?").toUpperCase();
}
var sortBuddies = (list) => [...list].sort((a, b) => Number(b.status === "online") - Number(a.status === "online") || a.name.localeCompare(b.name, void 0, { sensitivity: "base" }));
function filterBuddies(list, f) {
  const q = f.query.trim().toLowerCase();
  return sortBuddies(list).filter((b) => {
    if (b.status === "online" ? !f.online : !f.offline) return false;
    return !q || [b.name, b.blurb, b.location, b.acquaintance].some((s) => s.toLowerCase().includes(q));
  });
}
var clampBlurb = (s) => [...s.trim()].slice(0, BLURB_MAX).join("");
function renderPanel(hostApi, query) {
  const css = hostApi.css;
  const list = hostApi.list();
  const f = hostApi.filter();
  const targets = [];
  const toggle = (which, label, on) => h("button", { class: `${css.toggle}${on ? "" : ` ${css.off}`}`, type: "button", "aria-pressed": String(on), "data-testid": `sb-filter-${which}`, onclick: () => hostApi.setFilter(which, !on) }, label);
  const canChange = !!list && !list.error;
  const refresh = h("button", { class: `${css.cmd} refresh`, type: "button", "data-testid": "sb-refresh", title: COPY.refresh, onclick: () => hostApi.refresh() }, COPY.refresh);
  const bar = h(
    "div",
    { class: "bar" },
    toggle("online", COPY.online, f.online),
    toggle("offline", COPY.offline, f.offline),
    h("input", { class: css.field, type: "search", name: "query", value: query, placeholder: COPY.search, "aria-label": COPY.search, "data-testid": "sb-search", autocomplete: "off" }),
    canChange ? h("button", { class: css.cmd, type: "button", "data-testid": "sb-add", onclick: () => hostApi.add() }, COPY.add) : null,
    refresh
  );
  const head = (label, n) => secHead(css, label, n);
  if (!list) return { bar, note: null, body: [h("p", { class: `${css.empty} awaiting`, "data-testid": "sb-empty" }, COPY.awaiting)], foot: null, targets };
  const note2 = list.cached ? h("p", { class: "note", "data-testid": "sb-cached" }, COPY.cached(agoOf(list.cached))) : null;
  if (list.error) return { bar, note: note2, body: [h("div", { class: "reason", "data-testid": "sb-empty", role: "status" }, h("span", { class: "lbl" }, COPY.noSignal), h("span", { class: "why", "data-testid": "sb-reason" }, list.error))], foot: null, targets };
  const body = [];
  if (list.pending.length) {
    body.push(head(COPY.pending, list.pending.length));
    for (const p of list.pending) {
      body.push(h(
        "div",
        { class: "pend", "data-testid": "sb-pending", "data-key": p.key },
        h("span", { class: "who" }, p.name),
        h("span", { class: "ask" }, COPY.wants),
        h("button", { class: `${css.cmd} primary`, type: "button", "data-testid": "sb-accept", onclick: () => hostApi.accept(p.key) }, COPY.accept)
      ));
    }
  }
  body.push(head(COPY.buddies, list.buddies.length));
  const shown = filterBuddies(list.buddies, { ...f, query });
  if (!list.buddies.length) body.push(h("p", { class: `${css.empty} awaiting`, "data-testid": "sb-empty" }, COPY.noBuddies));
  else if (!shown.length) body.push(h("p", { class: `${css.empty} awaiting`, "data-testid": "sb-empty" }, COPY.noMatch));
  for (const b of shown) {
    const row = cardRow(css, b, { testid: "sb-buddy", title: COPY.menu });
    row.setAttribute("aria-haspopup", "menu");
    row.addEventListener("click", () => hostApi.openMenu(row));
    targets.push(hostApi.target(row, b));
    body.push(row);
  }
  const you = list.self;
  const foot = h(
    "div",
    { class: "foot", "data-testid": "sb-foot" },
    h("div", { class: "l" }, h("span", { class: css.label }, COPY.you), h("span", { class: "you" }, you.name), h("span", { class: `${css.plate} ${you.public ? css.hot : css.dim}`, "data-testid": "sb-public" }, you.public ? COPY.isPublic : COPY.isPrivate)),
    you.blurb ? h("div", { class: "l" }, h("span", { class: "blurb", "data-testid": "sb-blurb" }, you.blurb)) : null,
    h(
      "div",
      { class: "acts" },
      h("button", { class: css.cmd, type: "button", "data-testid": "sb-edit-blurb", onclick: () => hostApi.editBlurb() }, COPY.editBlurb),
      h("button", { class: css.cmd, type: "button", "data-testid": "sb-public-toggle", onclick: () => hostApi.setPublic(!you.public) }, you.public ? COPY.goPrivate : COPY.goPublic),
      h("button", { class: css.cmd, type: "button", "data-testid": "sb-share-toggle", "aria-pressed": String(you.share_friends), onclick: () => hostApi.setShareFriends(!you.share_friends) }, you.share_friends ? COPY.hideFriends : COPY.shareFriends),
      h("button", { class: css.cmd, type: "button", "data-testid": "sb-search-profiles", onclick: () => hostApi.searchProfiles() }, COPY.searchProfiles)
    )
  );
  return { bar, note: note2, body, foot, targets };
}
function cardRow(css, b, o) {
  const dead = b.status === "deceased";
  const port = b.portrait && b.portrait !== "placeholder" ? h("div", { class: `port${dead ? " dead" : ""}` }, h("img", { src: b.portrait, alt: "", loading: "lazy" })) : h("div", { class: `port${dead ? " dead" : ""}`, "aria-hidden": "true" }, h("b", {}, initialsOf(b.name)), h("small", {}, COPY.portrait));
  const plate = b.status === "online" ? css.ok : b.status === "deceased" ? "alert" : css.dim;
  const l2 = h("div", { class: "l2" });
  const bits = [];
  if (b.role) bits.push(h("span", { class: "role", "data-testid": "sb-role" }, b.role));
  if (b.acquaintance) bits.push(h("span", { class: `acq${isHostile(b.acquaintance) ? " foe" : ""}` }, b.acquaintance));
  if (b.location) bits.push(h("span", { class: "loc" }, b.location));
  bits.forEach((el, i) => {
    if (i) l2.append(h("span", { class: "at", "aria-hidden": "true" }, "\xB7"));
    l2.append(el);
  });
  const l3 = o.note ? h("div", { class: "l3 none" }, o.note) : b.blurb ? h("div", { class: "l3" }, b.blurb) : h("div", { class: "l3 none" }, COPY.noBlurb);
  return h(
    "button",
    { class: "row", type: "button", "data-testid": o.testid, "data-key": b.key, "data-status": b.status, title: o.title ?? "", disabled: o.disabled ? true : void 0 },
    port,
    h(
      "div",
      { class: "meta" },
      h("div", { class: "l1" }, h("span", { class: "name" }, b.name), h("span", { class: `${css.plate} ${plate}`, "data-testid": "sb-status" }, COPY.status[b.status])),
      l2,
      l3
    )
  );
}
function cardRows(hostApi, cards, testid) {
  return cards.map((c) => {
    const row = cardRow(hostApi.css, c, { testid, title: c.viewable ? COPY.openProfile : COPY.privateProfile, disabled: !c.viewable, note: c.viewable ? void 0 : COPY.privateProfile });
    if (c.viewable) row.addEventListener("click", () => hostApi.openProfile({ key: c.key, name: c.name }));
    return row;
  });
}
function viewBar(hostApi, title) {
  return h(
    "div",
    { class: "bar" },
    h("button", { class: hostApi.css.cmd, type: "button", "data-testid": "sb-back", onclick: () => hostApi.back() }, COPY.back),
    h("span", { class: "vtitle", "data-testid": "sb-view-title" }, title)
  );
}
var secHead = (css, label, n) => h("div", { class: css.secHead, role: "heading", "aria-level": "3" }, n === void 0 ? label : `${label} (${n})`, h("span", { class: css.secClose, "aria-hidden": "true" }));
var note = (css, text, testid = "sb-empty") => h("p", { class: `${css.empty} awaiting`, "data-testid": testid }, text);
function renderProfile(hostApi, view) {
  const css = hostApi.css;
  const p = view.profile;
  if (!p) return { bar: viewBar(hostApi, view.name), body: [note(css, COPY.loading)] };
  if ("error" in p) return { bar: viewBar(hostApi, p.name || view.name), body: [note(css, p.error, "sb-error")] };
  const self = hostApi.list()?.self.name === p.name;
  const body = [cardRow(css, p, { testid: "sb-profile" })];
  body[0].classList.add("head");
  const acts = h("div", { class: "acts" });
  if (self) acts.append(h("span", { class: `${css.plate} ${css.hot}` }, COPY.isYou));
  else if (p.buddy) acts.append(h("span", { class: `${css.plate} ${css.ok}`, "data-testid": "sb-is-buddy" }, COPY.isBuddy), h("button", { class: css.cmd, type: "button", "data-testid": "sb-page", onclick: () => hostApi.page(p.name) }, COPY.page));
  else acts.append(h("button", { class: `${css.cmd} primary`, type: "button", "data-testid": "sb-add-buddy", onclick: () => hostApi.addBuddy(p.name) }, COPY.addBuddy));
  body.push(acts);
  const label = p.introducer ? COPY.introduces : COPY.friends;
  if (!p.friends_visible) {
    body.push(secHead(css, label), note(css, p.friends_hidden, "sb-friends-hidden"));
    return { bar: viewBar(hostApi, p.name), body };
  }
  body.push(secHead(css, label, p.friends.length));
  if (!p.friends.length) body.push(note(css, p.introducer ? COPY.noIntroductions : COPY.noFriends));
  body.push(...cardRows(hostApi, p.friends, "sb-friend"));
  return { bar: viewBar(hostApi, p.name), body };
}
function renderResults(hostApi, view) {
  const css = hostApi.css;
  const bar = viewBar(hostApi, COPY.searchHead(view.term));
  if (!view.results) return { bar, body: [note(css, COPY.loading)] };
  const body = [secHead(css, COPY.results, view.results.length)];
  if (!view.results.length) body.push(note(css, COPY.noResults));
  body.push(...cardRows(hostApi, view.results, "sb-result"));
  return { bar, body };
}
var index_default = defineExtension({
  activate(ctx) {
    const mu = ctx.mu;
    mu.ui.style(SPACEBOOK_CSS);
    const css = mu.ui.css;
    const declare = () => {
      ctx.subscriptions.push(mu.gmcp.supports(SUPPORTS));
    };
    declare();
    mu.settings.define({
      title: COPY.settingsTitle,
      items: [
        { key: SETTINGS.online, label: COPY.settingOnline, default: true, kind: "toggle", scope: "world" },
        { key: SETTINGS.offline, label: COPY.settingOffline, default: true, kind: "toggle", scope: "world", hint: COPY.settingOfflineHint }
      ]
    });
    const kinds = typeof mu.menus.kind === "function";
    const KIND = kinds ? BUDDY_KIND : "x-spacebook-buddy";
    if (kinds) ctx.subscriptions.push(mu.menus.kind({ id: BUDDY_KIND, title: COPY.buddyKind, schema: KIND_SCHEMA }));
    const buddyOf = (t) => t?.data?.buddy ?? null;
    ctx.subscriptions.push(
      mu.menus.context({
        id: "page",
        target: KIND,
        order: 100,
        title: COPY.page,
        when: (t) => !!buddyOf(t) && buddyOf(t).status !== "deceased",
        run: (t) => {
          const b = buddyOf(t);
          if (b) {
            mu.input.fill(COPY.cmdPage(b.name), { sid: t.sid ?? void 0 });
            mu.input.focus(t.sid ?? void 0);
          }
        }
      }),
      mu.menus.context({
        id: "profile",
        target: KIND,
        order: 10,
        title: COPY.viewProfile,
        when: (t) => !!buddyOf(t),
        run: (t) => {
          const b = buddyOf(t);
          if (b) api.openProfile({ key: b.key, name: b.name }, t.sid ?? void 0);
        }
      }),
      mu.menus.context({
        id: "remove",
        target: KIND,
        order: 900,
        title: COPY.remove,
        when: (t) => !!buddyOf(t),
        run: async (t) => {
          const b = buddyOf(t);
          if (!b || !t.sid) return;
          if (await mu.ui.confirm({ title: COPY.removeTitle(b.name), body: COPY.removeBody, confirm: COPY.removeConfirm, danger: true })) void mu.gmcp.send("Spacebook.Remove", { key: b.key }, t.sid);
        }
      })
    );
    const lists = /* @__PURE__ */ new Map();
    const redraws = /* @__PURE__ */ new Map();
    const redraw = (sid) => {
      for (const fn of redraws.get(sid) ?? []) fn();
    };
    const panelAnswers = /* @__PURE__ */ new Map();
    const worldOf = (sid) => mu.sessions.list().find((s) => s.id === sid)?.worldId ?? null;
    const seenStore = (sid) => mu.storage.world(worldOf(sid), { sync: true });
    const announce = (sid, list, replay) => {
      mu.panels.badge(ID, list.pending.length ? { count: list.pending.length } : null, sid);
      const store = seenStore(sid);
      const seen = new Set(store.get(SEEN_KEY, []));
      const fresh = list.pending.filter((p) => !seen.has(p.key));
      if (!fresh.length) return;
      store.set(SEEN_KEY, [...seen, ...fresh.map((p) => p.key)].slice(-500));
      if (replay || !mu.effects.owner(sid)) return;
      for (const p of fresh) void mu.notify.mention({ sid, title: COPY.requestTitle, body: COPY.requestBody(p.name), key: `spacebook:${p.key}` });
    };
    const send = (sid, pkg, data) => {
      void mu.gmcp.send(pkg, data, sid);
    };
    const waits = /* @__PURE__ */ new Map();
    let lastDeclare = 0, declared = 0;
    const redeclare = (w, minGap) => {
      const now = Date.now();
      if (declared >= DECLARE_MAX || now - lastDeclare < minGap || w && w.redeclared >= RETRY.redeclareMax) return false;
      if (w) w.redeclared++;
      declared++;
      lastDeclare = now;
      declare();
      return true;
    };
    const stopAsking = (sid) => {
      const w = waits.get(sid);
      if (w?.timer) {
        clearTimeout(w.timer);
        w.timer = null;
      }
    };
    const connected = (sid) => mu.sessions.list().find((s) => s.id === sid)?.state === "connected";
    const askLater = (sid) => {
      const w = waits.get(sid);
      if (!w || lists.has(sid) || !connected(sid)) {
        stopAsking(sid);
        return;
      }
      if (w.timer) clearTimeout(w.timer);
      w.timer = setTimeout(() => {
        w.timer = null;
        if (lists.has(sid) || !connected(sid)) return;
        if (!mu.gmcp.negotiated(sid)) {
          askLater(sid);
          return;
        }
        if (w.step >= RETRY.redeclareFrom) redeclare(w, RETRY.redeclareGap);
        send(sid, "Spacebook.Get", {});
        w.step++;
        askLater(sid);
      }, retryDelay(w.step));
    };
    const askFresh = (sid) => {
      const w = waits.get(sid);
      if (!w) return;
      stopAsking(sid);
      w.step = 0;
      w.redeclared = 0;
      askLater(sid);
    };
    const refreshNow = async (sid) => {
      redeclare(null, RETRY.refreshGap);
      return await mu.gmcp.send("Spacebook.Get", {}, sid) === true;
    };
    const mount = (hostEl, pc) => {
      const root = h("section", { class: "mu-spacebook", "aria-label": COPY.title, "data-focus-region": ID, tabindex: "-1", "data-testid": "spacebook" });
      hostEl.append(root);
      const sid = pc.sid;
      let query = "";
      let targets = [];
      const views = [];
      const push = (v) => {
        views.push(v);
        if (views.length > 20) views.shift();
        draw();
      };
      const answer = {
        profile: (p) => {
          const v = [...views].reverse().find((x) => x.kind === "profile" && (x.key ? x.key === p.key : !x.profile));
          if (!v) return;
          v.profile = p;
          v.key = p.key || v.key;
          if (p.name) v.name = p.name;
          if (views[views.length - 1] === v) draw();
        },
        results: (r) => {
          const v = [...views].reverse().find((x) => x.kind === "search" && x.term.toLowerCase() === r.term.toLowerCase());
          if (!v) return;
          v.results = r.results;
          if (views[views.length - 1] === v) draw();
        },
        open: (who) => api2.openProfile(who)
      };
      const api2 = {
        css,
        list: () => sid ? lists.get(sid) ?? null : null,
        filter: () => ({ online: mu.settings.get(SETTINGS.online, sid ? { sid } : void 0) !== false, offline: mu.settings.get(SETTINGS.offline, sid ? { sid } : void 0) !== false }),
        setFilter: (which, on) => {
          mu.settings.set(which === "online" ? SETTINGS.online : SETTINGS.offline, on, sid ? worldOf(sid) : void 0);
          draw();
        },
        accept: (key) => {
          if (sid) send(sid, "Spacebook.Accept", { key });
        },
        add: async () => {
          if (!sid) return;
          const name = await mu.ui.prompt({ title: COPY.addTitle, label: COPY.addLabel, placeholder: COPY.addPlaceholder });
          if (name?.trim()) send(sid, "Spacebook.Add", { name: name.trim() });
        },
        editBlurb: async () => {
          if (!sid) return;
          const cur = lists.get(sid)?.self.blurb ?? "";
          const v = await mu.ui.prompt({ title: COPY.blurbTitle, label: COPY.blurbLabel(BLURB_MAX), value: cur, validate: (s) => [...s.trim()].length > BLURB_MAX ? COPY.blurbTooLong(BLURB_MAX) : null });
          if (v !== null && clampBlurb(v) !== cur) send(sid, "Spacebook.SetBlurb", { blurb: clampBlurb(v) });
        },
        setPublic: (on) => {
          if (sid) send(sid, "Spacebook.SetPublic", { public: on });
        },
        searchProfiles: async () => {
          if (!sid) return;
          const term = await mu.ui.prompt({ title: COPY.searchTitle, label: COPY.searchLabel });
          if (term?.trim()) {
            push({ kind: "search", term: term.trim(), results: null });
            send(sid, "Spacebook.Search", { term: term.trim() });
          }
        },
        setShareFriends: (on) => {
          if (sid) send(sid, "Spacebook.SetShareFriends", { share: on });
        },
        refresh: () => {
          if (sid) void refreshNow(sid);
        },
        openProfile: (who) => {
          if (!sid || !who.key && !who.name) return;
          push({ kind: "profile", key: who.key ?? "", name: who.name ?? "", profile: null });
          send(sid, "Spacebook.GetProfile", who.key ? { key: who.key } : { name: who.name });
        },
        back: () => {
          views.pop();
          draw();
        },
        addBuddy: (name) => {
          if (sid) send(sid, "Spacebook.Add", { name });
        },
        page: (name) => {
          mu.input.fill(COPY.cmdPage(name), { sid: sid ?? void 0 });
          mu.input.focus(sid ?? void 0);
        },
        target: (el, buddy) => sid ? mu.menus.target(el, { kind: KIND, sid, data: { buddy } }) : () => {
        },
        openMenu: (el) => {
          const r = el.getBoundingClientRect();
          el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 12, clientY: r.top + 12 }));
        }
      };
      const draw = () => {
        for (const d of targets) d();
        targets = [];
        const view = views[views.length - 1];
        if (view) {
          const out2 = view.kind === "profile" ? renderProfile(api2, view) : renderResults(api2, view);
          root.replaceChildren(out2.bar, h("div", { class: "scroll" }, ...out2.body));
          return;
        }
        const top = root.querySelector(".scroll")?.scrollTop ?? 0;
        const out = renderPanel(api2, query);
        targets = out.targets;
        const input = out.bar.querySelector("input[name=query]");
        input?.addEventListener("input", () => {
          query = input.value;
          drawBody();
        });
        const scroll = h("div", { class: "scroll" }, ...out.body);
        root.replaceChildren(out.bar, ...out.note ? [out.note] : [], scroll, ...out.foot ? [out.foot] : []);
        scroll.scrollTop = top;
      };
      const drawBody = () => {
        if (views.length) return;
        for (const d of targets) d();
        const out = renderPanel(api2, query);
        targets = out.targets;
        const scroll = root.querySelector(".scroll");
        scroll?.replaceChildren(...out.body);
        const note2 = root.querySelector(".note");
        if (out.note) {
          if (note2) note2.replaceWith(out.note);
          else scroll?.before(out.note);
        } else note2?.remove();
        const foot = root.querySelector(".foot");
        if (out.foot) {
          if (foot) foot.replaceWith(out.foot);
          else root.append(out.foot);
        } else foot?.remove();
      };
      draw();
      const set = sid ? redraws.get(sid) ?? redraws.set(sid, /* @__PURE__ */ new Set()).get(sid) : null;
      set?.add(draw);
      const answers = sid ? panelAnswers.get(sid) ?? panelAnswers.set(sid, /* @__PURE__ */ new Set()).get(sid) : null;
      answers?.add(answer);
      return () => {
        set?.delete(draw);
        answers?.delete(answer);
        for (const d of targets) d();
        targets = [];
        root.remove();
      };
    };
    mu.panels.register({
      id: ID,
      title: COPY.title,
      singleton: true,
      defaultPosition: "right-bottom",
      order: 40,
      show: "auto",
      mount,
      // Hot reload: the search text survives a rebuild.
      snapshot: (el) => el.querySelector("input[name=query]")?.value || void 0,
      restore: (el, saved) => {
        const inp = el.querySelector("input[name=query]");
        if (inp && typeof saved === "string" && saved) {
          inp.value = saved;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    });
    ctx.subscriptions.push(mu.sessions.each((s) => {
      let touched = false;
      waits.set(s.id, { timer: null, step: 0, redeclared: 0 });
      const off = mu.gmcp.watch(PKG, (data, m) => {
        const list = listOf(data);
        if (!list) {
          if (data === void 0) {
            lists.delete(s.id);
            redraw(s.id);
            askFresh(s.id);
          }
          return;
        }
        lists.set(s.id, list);
        stopAsking(s.id);
        if (!touched) {
          touched = true;
          mu.panels.touch(ID, s.id);
        }
        announce(s.id, list, !!m.replay);
        redraw(s.id);
      }, { sid: s.id });
      const offS = mu.sessions.on("state", (ref) => {
        if (ref.state === "connected") askFresh(s.id);
        else stopAsking(s.id);
      }, { sid: s.id });
      askLater(s.id);
      const offP = mu.gmcp.on("Spacebook.Profile", (data, m) => {
        const p = profileOf(data);
        if (p && !m.replay) for (const a2 of panelAnswers.get(s.id) ?? []) a2.profile(p);
      }, { sid: s.id });
      const offR = mu.gmcp.on("Spacebook.Results", (data, m) => {
        const r = resultsOf(data);
        if (r && !m.replay) for (const a2 of panelAnswers.get(s.id) ?? []) a2.results(r);
      }, { sid: s.id });
      const a = mu.settings.watch(SETTINGS.online, () => redraw(s.id), { sid: s.id });
      const b = mu.settings.watch(SETTINGS.offline, () => redraw(s.id), { sid: s.id });
      return () => {
        stopAsking(s.id);
        waits.delete(s.id);
        off();
        offS();
        offP();
        offR();
        a();
        b();
        lists.delete(s.id);
        redraws.delete(s.id);
        panelAnswers.delete(s.id);
      };
    }));
    ctx.subscriptions.push(() => {
      for (const sid of [...waits.keys()]) stopAsking(sid);
      waits.clear();
    });
    const api = {
      list: (sid) => {
        const s = sid ?? mu.sessions.active()?.id;
        const l = s ? lists.get(s) : void 0;
        return l ? structuredClone(l) : null;
      },
      refresh: async (sid) => {
        const s = sid ?? mu.sessions.active()?.id;
        return s ? refreshNow(s) : false;
      },
      openProfile: (who, sid) => {
        const s = sid ?? mu.sessions.active()?.id;
        if (!s) return;
        const open = [...panelAnswers.get(s) ?? []];
        if (open.length) open[0].open(who);
        else {
          mu.panels.open(ID, void 0, { sid: s });
          queueMicrotask(() => [...panelAnswers.get(s) ?? []][0]?.open(who));
        }
      }
    };
    return api;
  }
});
export {
  BLURB_MAX,
  BUDDY_KIND,
  COPY,
  DECLARE_MAX,
  HOSTILE,
  KIND_SCHEMA,
  RETRY,
  SETTINGS,
  SPACEBOOK_CSS,
  SUPPORTS,
  agoOf,
  cardOf,
  cardRow,
  clampBlurb,
  index_default as default,
  filterBuddies,
  initialsOf,
  isHostile,
  listOf,
  profileOf,
  recordOf,
  renderPanel,
  renderProfile,
  renderResults,
  resultsOf,
  retryDelay,
  sortBuddies
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luZGV4LnRzIiwgInNyYy9jb3B5LnRzIiwgInNyYy90eXBlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBTcGFjZWJvb2sgKEBydW5tdS5zaC9leHQtc3BhY2Vib29rKTogdGhlIFNwYWNlYm9vayBwYW5lbCBmb3IgVG9yY2hzaGlwLiBUaGUgc2VydmVyIHNlbmRzIHRoZSB3aG9sZSBib29rIGFzIEdNQ1BcbiAqIGBTcGFjZWJvb2suTGlzdGAgKG9uIGxvZ2luLCBvbiBDb3JlLlN1cHBvcnRzLCBldmVyeSAzMCBzIHdoZW4gaXQgY2hhbmdlZCwgYW5kIGFmdGVyIGV2ZXJ5IG11dGF0aW9uKTsgdGhpc1xuICogZXh0ZW5zaW9uIGRyYXdzIGl0IHBlciBzZXNzaW9uIHRocm91Z2ggYG11LmdtY3Aud2F0Y2hgIGFuZCBzZW5kcyB0aGUgbXV0YXRpb25zIGJhY2sgKGBTcGFjZWJvb2suQWNjZXB0YCxcbiAqIGBBZGRgLCBgUmVtb3ZlYCwgYFNldEJsdXJiYCwgYFNldFB1YmxpY2ApLlxuICpcbiAqIFRoZSBwYW5lbCAoYSBkb3NzaWVyIGxpc3QpOiBhIGJhciB3aXRoIHRoZSBcdTI1QTAgT05MSU5FIC8gXHUyNUExIE9GRkxJTkUgZmlsdGVycywgYSBzZWFyY2ggZmllbGQgYW5kIFsgQUREIF07IFx1MjUyNFBFTkRJTkcgKG4pXHUyNTFDXG4gKiByb3dzIFwiXHUyNUI4IE5hbWUgXHUyMDE0IHdhbnRzIHRvIGJlIGJ1ZGRpZXMgWyBBQ0NFUFQgXVwiOyBcdTI1MjRCVURESUVTIChuKVx1MjUxQyByb3dzIHdpdGggYSA1NnB4IHBvcnRyYWl0IGJveCAoaW5pdGlhbHMgd2hpbGUgdGhlXG4gKiBwb3J0cmFpdCBpcyBcInBsYWNlaG9sZGVyXCIpLCBuYW1lICsgc3RhdHVzIHBsYXRlLCBcImFjcXVhaW50YW5jZSBcdTAwQjcgbG9jYXRpb25cIiwgYW5kIHRoZSBibHVyYjsgYSBmb290IHdpdGggWU9VIDxuYW1lPlxuICogW1BVQkxJQ10sIHlvdXIgYmx1cmIgYW5kIFsgRURJVCBCTFVSQiBdIFsgR08gUFJJVkFURSBdIFsgU0VBUkNIIFBST0ZJTEVTIF0uIEJlZm9yZSB0aGUgZmlyc3QgbGlzdCBpdCByZWFkc1xuICogV0FJVElORyBGT1IgU1BBQ0VCT09LIHdpdGggYSBbIFJFRlJFU0ggXSwgd2l0aCBubyBidWRkaWVzIE5PIEJVRERJRVMgWUVULiBBIGxpc3Qgd2l0aCBgZXJyb3JgIChubyB3cmlzdHBhZCwgbm9cbiAqIHNpZ25hbFx1MjAyNikgcmVhZHMgTk8gU0lHTkFMIG92ZXIgdGhlIHNlcnZlcidzIHJlYXNvbiBhbmQgaGlkZXMgZXZlcnkgbXV0YXRpb247IG9uZSB3aXRoIGBjYWNoZWRgICh0aGUgcGFkJ3MgbGFzdFxuICogc3luYywgc2hvd24gb2ZmLW5ldCkgY2FycmllcyBhIENBQ0hFRCBcdTAwQjcgPGFnbz4gbm90ZSB1bmRlciB0aGUgYmFyLiBSaWdodC1jbGljayBvciBcdTI1Qjggb24gYSBidWRkeSByb3cgb3BlbnMgdGhlXG4gKiBgc3BhY2Vib29rLmJ1ZGR5YCBjb250ZXh0IG1lbnUgKFBhZ2UsIFJlbW92ZSBidWRkeSkuXG4gKlxuICogQXNraW5nLCBub3Qgb25seSB3YWl0aW5nICgxLjIuMCk6IHdoaWxlIGEgY29ubmVjdGVkIHNlc3Npb24gaG9sZHMgbm8gbGlzdCB0aGUgZXh0ZW5zaW9uIHNlbmRzIGBTcGFjZWJvb2suR2V0IHt9YFxuICogb24gYSBib3VuZGVkIGJhY2tvZmYgKHtAbGluayBSRVRSWX06IDIgcywgNiBzLCAxNSBzLCA0MCBzLCB0aGVuIGV2ZXJ5IDkwIHMpIHVudGlsIGEgbGlzdCBhcnJpdmVzLCBhbmQgZnJvbSB0aGVcbiAqIHNlY29uZCBzdGVwIG9uIHJlLWRlY2xhcmVzIGBTcGFjZWJvb2sgMWAgd2l0aCBgbXUuZ21jcC5zdXBwb3J0c2AuIEFmdGVyIGEgV2ViU29ja2V0IHJlY29ubmVjdCB0aGUgYmFja2VuZCBjYW5cbiAqIGZvcmdldCB0aGlzIGNvbm5lY3Rpb24ncyBkZWNsYXJhdGlvbnMgKGl0IHRoZW4gc2VuZHMgYENvcmUuU3VwcG9ydHMuUmVtb3ZlYCBhbmQgdGhlIGdhbWUgZHJvcHMgZXZlcnkgcHVzaCk7IGFcbiAqIHJlcGVhdGVkIGBzdXBwb3J0c2AgaXMgYSBuby1vcCBhdCB0aGUgYmFja2VuZCB3aGVuIHRoZSBkZWNsYXJhdGlvbiBzdGFuZHMgYW5kIHJlLWFkZHMgaXQgd2hlbiBpdCB3YXMgbG9zdCwgYW5kXG4gKiB0aGUgZ2FtZSBhbnN3ZXJzIGBDb3JlLlN1cHBvcnRzLkFkZGAgd2l0aCBhIGZyZXNoIGxpc3QuIEV2ZXJ5IERpc3Bvc2UgaXQgcmV0dXJucyBnb2VzIGludG8gYGN0eC5zdWJzY3JpcHRpb25zYFxuICogYW5kIGlzIG5ldmVyIGNhbGxlZCBlYXJseTogZGlzcG9zaW5nIG9uZSB3b3VsZCBzZW5kIGByZW1vdmVgIGZvciB0aGUgc2FtZSAoY29ubmVjdGlvbiwgZXh0ZW5zaW9uKSBvd25lciBhbmRcbiAqIHdpdGhkcmF3IHRoZSBwYWNrYWdlLiBBIE1VRCByZWNvbm5lY3QgY2xlYXJzIHRoZSBHTUNQIHN0YXRlICh0aGUgd2F0Y2ggZGVsaXZlcnMgYHVuZGVmaW5lZGApLCB3aGljaCBkcm9wcyB0aGVcbiAqIGhlbGQgbGlzdCBhbmQgcmVzdGFydHMgdGhlIHNjaGVkdWxlOyBgc3RhdGU6IGNvbm5lY3RlZGAgcmVzdGFydHMgaXQgdG9vOyBsZWF2aW5nIGBjb25uZWN0ZWRgIHN0b3BzIGl0LlxuICpcbiAqIFNob3duICdhdXRvJzogdGhlIHBhbmVsIGpvaW5zIFZpZXdzIGFuZCBhZGRzIGl0c2VsZiB0aGUgZmlyc3QgdGltZSBhIHNlc3Npb24gcmVjZWl2ZXMgYSBsaXN0LiBBY3RpdmF0aW9uIGlzXG4gKiBgb25HbWNwOlNwYWNlYm9va2AsIHNvIG9uIGEgZ2FtZSB0aGF0IG5ldmVyIHNlbmRzIHRoZSBwYWNrYWdlIHRoZSBleHRlbnNpb24gc3RheXMgZG9ybWFudC5cbiAqL1xuaW1wb3J0IHsgZGVmaW5lRXh0ZW5zaW9uLCBoLCB0eXBlIERpc3Bvc2UsIHR5cGUgSnNvblNjaGVtYSwgdHlwZSBNdSwgdHlwZSBQYW5lbE1vdW50Q3R4IH0gZnJvbSAnQG11Y2xpZW50L3Nkayc7XG5pbXBvcnQgeyBDT1BZIH0gZnJvbSAnLi9jb3B5JztcbmltcG9ydCB7IEJMVVJCX01BWCwgQlVERFlfS0lORCwgU0VUVElOR1MsIHR5cGUgU3BhY2Vib29rQXBpLCB0eXBlIFNwYWNlYm9va0NhcmQsIHR5cGUgU3BhY2Vib29rTGlzdCwgdHlwZSBTcGFjZWJvb2tQcm9maWxlLCB0eXBlIFNwYWNlYm9va1Byb2ZpbGVFcnJvciwgdHlwZSBTcGFjZWJvb2tSZWNvcmQsIHR5cGUgU3BhY2Vib29rU3RhdHVzLCB0eXBlIFNwYWNlYm9va1ZpZXcgfSBmcm9tICcuL3R5cGVzJztcblxuZXhwb3J0IHR5cGUgeyBTcGFjZWJvb2tBcGksIFNwYWNlYm9va0J1ZGR5RGF0YSwgU3BhY2Vib29rQ2FyZCwgU3BhY2Vib29rTGlzdCwgU3BhY2Vib29rUHJvZmlsZSwgU3BhY2Vib29rUHJvZmlsZUVycm9yLCBTcGFjZWJvb2tSZWNvcmQsIFNwYWNlYm9va1Jlc3VsdHMsIFNwYWNlYm9va1NlbGYsIFNwYWNlYm9va1N0YXR1cywgU3BhY2Vib29rVmlldyB9IGZyb20gJy4vdHlwZXMnO1xuZXhwb3J0IHsgQkxVUkJfTUFYLCBCVUREWV9LSU5ELCBTRVRUSU5HUyB9IGZyb20gJy4vdHlwZXMnO1xuZXhwb3J0IHsgQ09QWSB9IGZyb20gJy4vY29weSc7XG5cbmNvbnN0IElEID0gJ3NwYWNlYm9vayc7XG5jb25zdCBQS0cgPSAnU3BhY2Vib29rLkxpc3QnO1xuLyoqIFdoYXQgYG11LmdtY3Auc3VwcG9ydHNgIGRlY2xhcmVzICh0aGUgbWFuaWZlc3QncyBwYWNrYWdlLCByZS1kZWNsYXJlZCBhdCBydW50aW1lIHRvIGhlYWwgYSBsb3N0IGRlY2xhcmF0aW9uKS4gKi9cbmV4cG9ydCBjb25zdCBTVVBQT1JUUyA9IFsnU3BhY2Vib29rIDEnXTtcbi8qKiBTeW5jZWQgcGVyIHdvcmxkOiBwZW5kaW5nIGtleXMgYWxyZWFkeSBhbm5vdW5jZWQgKHRoZSBsYXN0IDUwMCkuICovXG5jb25zdCBTRUVOX0tFWSA9ICdzZWVuLnBlbmRpbmcnO1xuXG4vKipcbiAqIFRoZSBgU3BhY2Vib29rLkdldGAgc2NoZWR1bGUgd2hpbGUgYSBjb25uZWN0ZWQgc2Vzc2lvbiBob2xkcyBubyBsaXN0LCBpbiBtczogdGhlIGZpcnN0IHdhaXQgZ2l2ZXMgdGhlIHNlcnZlcidzXG4gKiBvd24gbG9naW4gcHVzaCBhIGNoYW5jZSwgdGhlbiBpdCBiYWNrcyBvZmY7IHRoZSBsYXN0IHZhbHVlIHJlcGVhdHMgd2hpbGUgc3RpbGwgd2FpdGluZy4gQSByZS1kZWNsYXJhdGlvbiBvZlxuICoge0BsaW5rIFNVUFBPUlRTfSBnb2VzIHdpdGggZXZlcnkgc3RlcCBmcm9tIHRoZSBzZWNvbmQgb24gKGByZWRlY2xhcmVGcm9tYCksIHNvIGluIHRoZSBzdGVhZHkgc3RhdGUgaXQgaXMgb25lXG4gKiBwZXIgOTAgcywgYW5kIGF0IG1vc3QgYHJlZGVjbGFyZU1heGAgcGVyIHdhaXRpbmcgc3BlbGwgKGVhY2ggb25lIGlzIGEgbGl2ZSByZWdpc3RyYXRpb24ga2VwdCB1bnRpbCBkZWFjdGl2YXRpb24sXG4gKiBzbyB0aGUgY291bnQgc3RheXMgYm91bmRlZDsgdGhlIEdldCBrZWVwcyBnb2luZykuIE11dGFibGUsIHNvIGEgdGVzdCBjYW4gc2hvcnRlbiBpdCAoYFJFVFJZLmRlbGF5cyA9IFsuLi5dYCkuXG4gKi9cbmV4cG9ydCBjb25zdCBSRVRSWTogeyBkZWxheXM6IG51bWJlcltdOyByZWRlY2xhcmVGcm9tOiBudW1iZXI7IHJlZGVjbGFyZU1heDogbnVtYmVyOyByZWRlY2xhcmVHYXA6IG51bWJlcjsgcmVmcmVzaEdhcDogbnVtYmVyIH0gPVxuICB7IGRlbGF5czogWzJfMDAwLCA2XzAwMCwgMTVfMDAwLCA0MF8wMDAsIDkwXzAwMF0sIHJlZGVjbGFyZUZyb206IDEsIHJlZGVjbGFyZU1heDogMjQsIHJlZGVjbGFyZUdhcDogMzBfMDAwLCByZWZyZXNoR2FwOiA1XzAwMCB9O1xuZXhwb3J0IGNvbnN0IHJldHJ5RGVsYXkgPSAoc3RlcDogbnVtYmVyKSA9PiBSRVRSWS5kZWxheXNbTWF0aC5taW4oc3RlcCwgUkVUUlkuZGVsYXlzLmxlbmd0aCAtIDEpXSA/PyA5MF8wMDA7XG4vKiogUnVudGltZSByZS1kZWNsYXJhdGlvbnMgaW4gb25lIGFjdGl2YXRpb24sIGluIGFsbCAoZWFjaCBpcyBhIHJlZ2lzdHJhdGlvbiB0aGF0IGxpdmVzIHVudGlsIGRlYWN0aXZhdGlvbikuICovXG5leHBvcnQgY29uc3QgREVDTEFSRV9NQVggPSAxMDAwO1xuXG4vKiogQSByZWxhdGl2ZSB0aW1lIGZvciB0aGUgQ0FDSEVEIG5vdGU6IGB0aGVuYCBpbiB1bml4IHNlY29uZHMsIGBub3dgIGluIG1zLiBUZXJzZSwgbm8gbGlicmFyaWVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFnb09mKHRoZW46IG51bWJlciwgbm93ID0gRGF0ZS5ub3coKSk6IHN0cmluZyB7XG4gIGNvbnN0IHMgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKG5vdyAvIDEwMDAgLSB0aGVuKSk7XG4gIGlmIChzIDwgMTApIHJldHVybiBDT1BZLmFnby5ub3c7XG4gIGlmIChzIDwgNjApIHJldHVybiBDT1BZLmFnby5zKHMpO1xuICBjb25zdCBtID0gTWF0aC5yb3VuZChzIC8gNjApO1xuICBpZiAobSA8IDYwKSByZXR1cm4gQ09QWS5hZ28ubWluKG0pO1xuICBjb25zdCBoaCA9IE1hdGgucm91bmQobSAvIDYwKTtcbiAgaWYgKGhoIDwgNDgpIHJldHVybiBDT1BZLmFnby5oKGhoKTtcbiAgcmV0dXJuIENPUFkuYWdvLmQoTWF0aC5yb3VuZChoaCAvIDI0KSk7XG59XG5cbi8qKiBBY3F1YWludGFuY2Ugd29yZHMgZHJhd24gaW4gYC0tYWxlcnRgLiAqL1xuZXhwb3J0IGNvbnN0IEhPU1RJTEUgPSBuZXcgU2V0KFsncml2YWwnLCAnYWR2ZXJzYXJ5JywgJ2VuZW15JywgJ25lbWVzaXMnLCAnaGF0ZWQgZW5lbXknLCAnZGlzbGlrZWQnLCAnd2FyeSByaXZhbCcsICdmZWFyZWQnLCAnZHJlYWRlZCcsICd0ZXJyaWZ5aW5nJywgJ21lbmFjaW5nJywgJ2ludGltaWRhdGluZycsICd1bm5lcnZpbmcnXSk7XG5leHBvcnQgY29uc3QgaXNIb3N0aWxlID0gKGFjcTogc3RyaW5nKSA9PiBIT1NUSUxFLmhhcyhhY3EudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuXG4vKiogVGhlIGBkYXRhYCBzY2hlbWEgb2YgdGhlIGBzcGFjZWJvb2suYnVkZHlgIGtpbmQsIGNoZWNrZWQgYnkgdGhlIGhvc3Qgb24gZXZlcnkgYG11Lm1lbnVzLnRhcmdldGAgY2FsbC4gKi9cbmV4cG9ydCBjb25zdCBLSU5EX1NDSEVNQTogSnNvblNjaGVtYSA9IHtcbiAgdHlwZTogJ29iamVjdCcsIHJlcXVpcmVkOiBbJ2J1ZGR5J10sXG4gIHByb3BlcnRpZXM6IHsgYnVkZHk6IHsgdHlwZTogJ29iamVjdCcsIHJlcXVpcmVkOiBbJ2tleScsICduYW1lJ10sIHByb3BlcnRpZXM6IHsga2V5OiB7IHR5cGU6ICdzdHJpbmcnIH0sIG5hbWU6IHsgdHlwZTogJ3N0cmluZycgfSwgc3RhdHVzOiB7IHR5cGU6ICdzdHJpbmcnIH0sIGFjcXVhaW50YW5jZTogeyB0eXBlOiAnc3RyaW5nJyB9LCBsb2NhdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LCBibHVyYjogeyB0eXBlOiAnc3RyaW5nJyB9LCBwb3J0cmFpdDogeyB0eXBlOiAnc3RyaW5nJyB9IH0gfSB9LFxufTtcblxuY29uc3QgUiA9IGAuZXh0LXBhbmVsW2RhdGEtZXh0PVwiJHtJRH1cIl0gLm11LXNwYWNlYm9va2A7XG4vKiogVGhlbWUgdG9rZW5zIG9ubHksIGV2ZXJ5IHJ1bGUgdW5kZXIgdGhlIHBhbmVsIHJvb3QuIFJvdyBhbmQgc2VjdGlvbiB2YWx1ZXMgYXJlIHRoZSBhcHByb3ZlZCBhcnRib2FyZCdzLiAqL1xuZXhwb3J0IGNvbnN0IFNQQUNFQk9PS19DU1MgPSBgXG4ke1J9IHsgaGVpZ2h0OiAxMDAlOyBkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBiYWNrZ3JvdW5kOiB2YXIoLS1iZyk7IGNvbG9yOiB2YXIoLS1mZyk7IGZvbnQtZmFtaWx5OiB2YXIoLS1mb250LW1vbm8pOyBmb250LXNpemU6IC45cmVtOyBib3gtc2l6aW5nOiBib3JkZXItYm94OyB9XG4ke1J9ICosICR7Un0gKjo6YmVmb3JlLCAke1J9ICo6OmFmdGVyIHsgYm94LXNpemluZzogYm9yZGVyLWJveDsgfVxuJHtSfTpmb2N1cyB7IG91dGxpbmU6IG5vbmU7IH1cbiR7Un0gLmJhciB7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGZsZXgtd3JhcDogd3JhcDsgZ2FwOiA1cHg7IHBhZGRpbmc6IDRweCA4cHg7IGJhY2tncm91bmQ6IHZhcigtLWJnLWVsZXYpOyBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tYWNjZW50KTsgfVxuJHtSfSAuYmFyIC5zaC1maWVsZCB7IGZsZXg6IDE7IG1pbi13aWR0aDogNmNoOyB9XG4ke1J9IC5iYXIgLnJlZnJlc2ggeyBtYXJnaW4tbGVmdDogYXV0bzsgfVxuJHtSfSAubm90ZSB7IG1hcmdpbjogMDsgcGFkZGluZzogM3B4IDEwcHg7IGZvbnQtc2l6ZTogLjYycmVtOyBsZXR0ZXItc3BhY2luZzogLjE0ZW07IHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7IGNvbG9yOiB2YXIoLS1mZy1mYWludCk7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1ib3JkZXIpOyB9XG4ke1J9IC5zY3JvbGwgeyBmbGV4OiAxOyBvdmVyZmxvdy15OiBhdXRvOyBwYWRkaW5nOiAwIDEwcHggNnB4OyB9XG4ke1J9IC5yZWFzb24geyBtYXJnaW46IC45cmVtIDAgMDsgZGlzcGxheTogZmxleDsgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsgZ2FwOiA0cHg7IH1cbiR7Un0gLnJlYXNvbiAubGJsIHsgZm9udC1zdHlsZTogbm9ybWFsOyBmb250LXNpemU6IC42NHJlbTsgbGV0dGVyLXNwYWNpbmc6IC4xNGVtOyB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlOyBjb2xvcjogdmFyKC0tZmctZmFpbnQpOyB9XG4ke1J9IC5yZWFzb24gLndoeSB7IGZvbnQtc2l6ZTogLjgycmVtOyBjb2xvcjogdmFyKC0tZmctZGltKTsgfVxuJHtSfSAuc2VjLWhlYWQgeyBtYXJnaW46IC45cmVtIDAgLjRyZW07IH1cbiR7Un0gLnBlbmQgeyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7IHBhZGRpbmc6IDVweCAwIDVweCAyLjRjaDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHZhcigtLWJvcmRlcik7IGZvbnQtc2l6ZTogLjgycmVtOyBwb3NpdGlvbjogcmVsYXRpdmU7IH1cbiR7Un0gLnBlbmQ6OmJlZm9yZSB7IGNvbnRlbnQ6IFwiXHUyNUI4XCI7IHBvc2l0aW9uOiBhYnNvbHV0ZTsgbGVmdDogLjhjaDsgY29sb3I6IHZhcigtLWdvbGQpOyB9XG4ke1J9IC5wZW5kIC53aG8geyBmbGV4OiAxOyBtaW4td2lkdGg6IDA7IGNvbG9yOiB2YXIoLS1mZyk7IG92ZXJmbG93OiBoaWRkZW47IHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyB9XG4ke1J9IC5wZW5kIC5hc2sgeyBmb250LXNpemU6IC42NnJlbTsgY29sb3I6IHZhcigtLWZnLWZhaW50KTsgbGV0dGVyLXNwYWNpbmc6IC4wOGVtOyB3aGl0ZS1zcGFjZTogbm93cmFwOyB9XG4ke1J9IC5yb3cgeyBkaXNwbGF5OiBncmlkOyBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDU2cHggMWZyOyBnYXA6IDAgMTJweDsgd2lkdGg6IDEwMCU7IHBhZGRpbmc6IDhweCA2cHggOHB4IDIuNGNoOyBib3JkZXI6IDA7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1ib3JkZXIpOyBiYWNrZ3JvdW5kOiBub25lOyBjb2xvcjogaW5oZXJpdDsgdGV4dC1hbGlnbjogbGVmdDsgcG9zaXRpb246IHJlbGF0aXZlOyBmb250OiBpbmhlcml0OyB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kLWNvbG9yIC4xMnMgZWFzZTsgfVxuJHtSfSAucm93OjpiZWZvcmUgeyBjb250ZW50OiBcIlx1MjVCOFwiOyBwb3NpdGlvbjogYWJzb2x1dGU7IGxlZnQ6IC42Y2g7IHRvcDogOHB4OyBjb2xvcjogdHJhbnNwYXJlbnQ7IHRyYW5zaXRpb246IGNvbG9yIC4xMnMgZWFzZTsgfVxuJHtSfSAucm93OmhvdmVyLCAke1J9IC5yb3c6Zm9jdXMtdmlzaWJsZSwgJHtSfSAucm93W2FyaWEtZXhwYW5kZWQ9XCJ0cnVlXCJdIHsgYmFja2dyb3VuZDogdmFyKC0tdGludC1yb3cpOyB9XG4ke1J9IC5yb3c6aG92ZXI6OmJlZm9yZSwgJHtSfSAucm93OmZvY3VzLXZpc2libGU6OmJlZm9yZSwgJHtSfSAucm93W2FyaWEtZXhwYW5kZWQ9XCJ0cnVlXCJdOjpiZWZvcmUgeyBjb2xvcjogdmFyKC0tYWNjZW50LWJyaWdodCk7IH1cbiR7Un0gLnJvdzpmb2N1cy12aXNpYmxlIHsgb3V0bGluZTogMnB4IHNvbGlkIHZhcigtLWFjY2VudC1icmlnaHQpOyBvdXRsaW5lLW9mZnNldDogLTJweDsgfVxuJHtSfSAucG9ydCB7IHdpZHRoOiA1NnB4OyBoZWlnaHQ6IDU2cHg7IGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1icmlnaHQpOyBiYWNrZ3JvdW5kOiB2YXIoLS1iZy1kZWVwKTsgZGlzcGxheTogZ3JpZDsgcGxhY2UtaXRlbXM6IGNlbnRlcjsgZm9udC1zaXplOiAuNzhyZW07IGxldHRlci1zcGFjaW5nOiAuMDhlbTsgY29sb3I6IHZhcigtLWZnLWRpbSk7IHBvc2l0aW9uOiByZWxhdGl2ZTsgb3ZlcmZsb3c6IGhpZGRlbjsgfVxuJHtSfSAucG9ydCBiIHsgZm9udC13ZWlnaHQ6IDUwMDsgfVxuJHtSfSAucG9ydCBzbWFsbCB7IHBvc2l0aW9uOiBhYnNvbHV0ZTsgYm90dG9tOiAycHg7IGxlZnQ6IDA7IHJpZ2h0OiAwOyB0ZXh0LWFsaWduOiBjZW50ZXI7IGZvbnQtc2l6ZTogLjQ2cmVtOyBsZXR0ZXItc3BhY2luZzogLjE0ZW07IHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7IGNvbG9yOiB2YXIoLS1mZy1mYWludCk7IH1cbiR7Un0gLnBvcnQgaW1nIHsgd2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgb2JqZWN0LWZpdDogY292ZXI7IGRpc3BsYXk6IGJsb2NrOyB9XG4ke1J9IC5wb3J0LmRlYWQgeyBjb2xvcjogdmFyKC0tZmctZmFpbnQpOyBib3JkZXItY29sb3I6IHZhcigtLWJvcmRlcik7IH1cbiR7Un0gLnBvcnQuZGVhZCBiIHsgdGV4dC1kZWNvcmF0aW9uOiBsaW5lLXRocm91Z2g7IH1cbiR7Un0gLm1ldGEgeyBtaW4td2lkdGg6IDA7IGRpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGdhcDogMnB4OyB9XG4ke1J9IC5sMSB7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBiYXNlbGluZTsgZ2FwOiA4cHg7IG1pbi13aWR0aDogMDsgfVxuJHtSfSAubmFtZSB7IGZvbnQtc2l6ZTogLjg2cmVtOyBjb2xvcjogdmFyKC0tZmcpOyBmb250LXdlaWdodDogNTAwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpczsgd2hpdGUtc3BhY2U6IG5vd3JhcDsgfVxuJHtSfSAubDIgeyBmb250LXNpemU6IC43OHJlbTsgY29sb3I6IHZhcigtLWZnLWRpbSk7IGRpc3BsYXk6IGZsZXg7IGdhcDogMWNoOyBmbGV4LXdyYXA6IHdyYXA7IH1cbiR7Un0gLmwyIC5hY3EgeyBjb2xvcjogdmFyKC0tZ29sZCk7IH1cbiR7Un0gLmwyIC5hY3EuZm9lIHsgY29sb3I6IHZhcigtLWFsZXJ0KTsgfVxuJHtSfSAubDIgLmF0IHsgY29sb3I6IHZhcigtLWZnLWZhaW50KTsgfVxuJHtSfSAubDIgLmxvYyB7IGNvbG9yOiB2YXIoLS1mZyk7IHRleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lOyB0ZXh0LWRlY29yYXRpb24tY29sb3I6IHZhcigtLWJvcmRlci1icmlnaHQpOyB0ZXh0LXVuZGVybGluZS1vZmZzZXQ6IDNweDsgfVxuJHtSfSAubDMgeyBmb250LXNpemU6IC43NnJlbTsgY29sb3I6IHZhcigtLWZnLWRpbSk7IGZvbnQtc3R5bGU6IGl0YWxpYzsgd2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7IH1cbiR7Un0gLmwzLm5vbmUgeyBmb250LXN0eWxlOiBub3JtYWw7IGZvbnQtc2l6ZTogLjYycmVtOyBsZXR0ZXItc3BhY2luZzogLjE0ZW07IHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7IGNvbG9yOiB2YXIoLS1mZy1mYWludCk7IH1cbiR7Un0gLmF3YWl0aW5nIHsgbWFyZ2luOiAuOXJlbSAwIDA7IGNvbG9yOiB2YXIoLS1mZy1mYWludCk7IGZvbnQtc3R5bGU6IG5vcm1hbDsgZm9udC1zaXplOiAuNjRyZW07IGxldHRlci1zcGFjaW5nOiAuMTRlbTsgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTsgfVxuJHtSfSAuZm9vdCB7IGRpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGdhcDogM3B4OyBwYWRkaW5nOiA3cHggMTBweCA4cHg7IGJhY2tncm91bmQ6IHZhcigtLWJnLWVsZXYpOyBib3JkZXItdG9wOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLWJyaWdodCk7IH1cbiR7Un0gLmZvb3QgLmwgeyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7IG1pbi13aWR0aDogMDsgfVxuJHtSfSAuZm9vdCAueW91IHsgZm9udC1zaXplOiAuODJyZW07IGNvbG9yOiB2YXIoLS1mZyk7IG92ZXJmbG93OiBoaWRkZW47IHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyB9XG4ke1J9IC5mb290IC5ibHVyYiB7IGZsZXg6IDE7IG1pbi13aWR0aDogMDsgZm9udC1zaXplOiAuNzZyZW07IGNvbG9yOiB2YXIoLS1mZy1kaW0pOyBmb250LXN0eWxlOiBpdGFsaWM7IHdoaXRlLXNwYWNlOiBub3dyYXA7IG92ZXJmbG93OiBoaWRkZW47IHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzOyB9XG4ke1J9IC5mb290IC5hY3RzIHsgZGlzcGxheTogZmxleDsgZmxleC13cmFwOiB3cmFwOyBnYXA6IDRweDsgbWFyZ2luLWxlZnQ6IC0uNWNoOyB9XG4ke1J9IC5yb3c6ZGlzYWJsZWQgeyBjdXJzb3I6IGRlZmF1bHQ7IH1cbiR7Un0gLnJvdzpkaXNhYmxlZDpob3ZlciB7IGJhY2tncm91bmQ6IG5vbmU7IH1cbiR7Un0gLnJvdzpkaXNhYmxlZDpob3Zlcjo6YmVmb3JlIHsgY29sb3I6IHRyYW5zcGFyZW50OyB9XG4ke1J9IC5yb3cuaGVhZCB7IGJvcmRlci1ib3R0b206IDA7IGN1cnNvcjogZGVmYXVsdDsgfVxuJHtSfSAucm93LmhlYWQ6aG92ZXIgeyBiYWNrZ3JvdW5kOiBub25lOyB9XG4ke1J9IC5yb3cuaGVhZDo6YmVmb3JlIHsgZGlzcGxheTogbm9uZTsgfVxuJHtSfSAubDIgLnJvbGUgeyBjb2xvcjogdmFyKC0tYWNjZW50LWJyaWdodCk7IHRleHQtdHJhbnNmb3JtOiBsb3dlcmNhc2U7IH1cbiR7Un0gLnNjcm9sbCA+IC5hY3RzIHsgZGlzcGxheTogZmxleDsgZmxleC13cmFwOiB3cmFwOyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDZweDsgcGFkZGluZzogMCAwIDZweCAyLjRjaDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHZhcigtLWJvcmRlcik7IH1cbiR7Un0gLnZ0aXRsZSB7IGZsZXg6IDE7IG1pbi13aWR0aDogMDsgY29sb3I6IHZhcigtLWZnKTsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7IHdoaXRlLXNwYWNlOiBub3dyYXA7IH1cbmA7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCB0aGUgbGlzdCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY29uc3QgU1RBVFVTRVM6IHJlYWRvbmx5IFNwYWNlYm9va1N0YXR1c1tdID0gWydvbmxpbmUnLCAnb2ZmbGluZScsICdkZWNlYXNlZCcsICd1bmtub3duJ107XG5jb25zdCBzdHIgPSAodjogdW5rbm93bikgPT4gKHR5cGVvZiB2ID09PSAnc3RyaW5nJyA/IHYgOiB2ID09PSBudWxsIHx8IHYgPT09IHVuZGVmaW5lZCA/ICcnIDogU3RyaW5nKHYpKTtcblxuLyoqIEEgcmVjb3JkIGFzIHRoZSBzZXJ2ZXIgc2VuZHMgaXQgXHUyMTkyIGEgY29tcGxldGUgb25lLiBOdWxsIHdpdGhvdXQgYSBrZXkgYW5kIGEgbmFtZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWNvcmRPZih2OiB1bmtub3duKTogU3BhY2Vib29rUmVjb3JkIHwgbnVsbCB7XG4gIGlmICghdiB8fCB0eXBlb2YgdiAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2KSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGQgPSB2IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBrZXkgPSBzdHIoZC5rZXkpLCBuYW1lID0gc3RyKGQubmFtZSkudHJpbSgpO1xuICBpZiAoIWtleSB8fCAhbmFtZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHMgPSBzdHIoZC5zdGF0dXMpLnRvTG93ZXJDYXNlKCkgYXMgU3BhY2Vib29rU3RhdHVzO1xuICByZXR1cm4geyBrZXksIG5hbWUsIHN0YXR1czogU1RBVFVTRVMuaW5jbHVkZXMocykgPyBzIDogJ3Vua25vd24nLCBhY3F1YWludGFuY2U6IHN0cihkLmFjcXVhaW50YW5jZSkudHJpbSgpLCBsb2NhdGlvbjogc3RyKGQubG9jYXRpb24pLnRyaW0oKSwgYmx1cmI6IHN0cihkLmJsdXJiKS50cmltKCksIHBvcnRyYWl0OiBzdHIoZC5wb3J0cmFpdCkudHJpbSgpIHx8ICdwbGFjZWhvbGRlcicsIHJvbGU6IHN0cihkLnJvbGUpLnRyaW0oKSwgc2hhcmVzX2ZyaWVuZHM6IGQuc2hhcmVzX2ZyaWVuZHMgIT09IGZhbHNlIH07XG59XG5cbi8qKiBBIGNhcmQgYXMgdGhlIHNlcnZlciBzZW5kcyBpdCBcdTIxOTIgYSBjb21wbGV0ZSBvbmUuIE51bGwgd2l0aG91dCBhIGtleSBhbmQgYSBuYW1lLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhcmRPZih2OiB1bmtub3duKTogU3BhY2Vib29rQ2FyZCB8IG51bGwge1xuICBjb25zdCByID0gcmVjb3JkT2Yodik7XG4gIGlmICghcikgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGQgPSB2IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICByZXR1cm4geyBrZXk6IHIua2V5LCBuYW1lOiByLm5hbWUsIHJvbGU6IHIucm9sZSwgc3RhdHVzOiByLnN0YXR1cywgcG9ydHJhaXQ6IHIucG9ydHJhaXQsIGFjcXVhaW50YW5jZTogci5hY3F1YWludGFuY2UsIGJ1ZGR5OiBkLmJ1ZGR5ID09PSB0cnVlLCB2aWV3YWJsZTogZC52aWV3YWJsZSA9PT0gdHJ1ZSwgYmx1cmI6IHIuYmx1cmIsIGxvY2F0aW9uOiByLmxvY2F0aW9uIH07XG59XG5cbmNvbnN0IGNhcmRzT2YgPSAodjogdW5rbm93bikgPT4gKEFycmF5LmlzQXJyYXkodikgPyB2Lm1hcChjYXJkT2YpLmZpbHRlcigoYyk6IGMgaXMgU3BhY2Vib29rQ2FyZCA9PiAhIWMpIDogW10pO1xuXG4vKiogQSBgU3BhY2Vib29rLlByb2ZpbGVgIHBheWxvYWQgXHUyMTkyIGEgcHJvZmlsZSwgYW4gZXJyb3IgKGB7a2V5LCBuYW1lLCBlcnJvcn1gKSwgb3IgbnVsbCB3aGVuIGl0IGlzIG5laXRoZXIuIEV4cG9ydGVkIGZvciB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9maWxlT2YoZGF0YTogdW5rbm93bik6IFNwYWNlYm9va1Byb2ZpbGUgfCBTcGFjZWJvb2tQcm9maWxlRXJyb3IgfCBudWxsIHtcbiAgaWYgKCFkYXRhIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KGRhdGEpKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZCA9IGRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmICh0eXBlb2YgZC5lcnJvciA9PT0gJ3N0cmluZycgJiYgZC5lcnJvcikgcmV0dXJuIHsga2V5OiBzdHIoZC5rZXkpLCBuYW1lOiBzdHIoZC5uYW1lKS50cmltKCksIGVycm9yOiBkLmVycm9yIH07XG4gIGNvbnN0IGMgPSBjYXJkT2YoZCk7XG4gIGlmICghYykgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHZpc2libGUgPSBkLmZyaWVuZHNfdmlzaWJsZSA9PT0gdHJ1ZTtcbiAgcmV0dXJuIHsgLi4uYywgc2hhcmVzX2ZyaWVuZHM6IGQuc2hhcmVzX2ZyaWVuZHMgPT09IHRydWUsIGZyaWVuZHNfdmlzaWJsZTogdmlzaWJsZSwgZnJpZW5kc19oaWRkZW46IHZpc2libGUgPyAnJyA6IHN0cihkLmZyaWVuZHNfaGlkZGVuKS50cmltKCksIGZyaWVuZHM6IHZpc2libGUgPyBjYXJkc09mKGQuZnJpZW5kcykgOiBbXSwgaW50cm9kdWNlcjogZC5pbnRyb2R1Y2VyID09PSB0cnVlIH07XG59XG5cbi8qKiBBIGBTcGFjZWJvb2suUmVzdWx0c2AgcGF5bG9hZCBcdTIxOTIgdGhlIHRlcm0gYW5kIGl0cyBjYXJkcywgb3IgbnVsbC4gRXhwb3J0ZWQgZm9yIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc3VsdHNPZihkYXRhOiB1bmtub3duKTogeyB0ZXJtOiBzdHJpbmc7IHJlc3VsdHM6IFNwYWNlYm9va0NhcmRbXSB9IHwgbnVsbCB7XG4gIGlmICghZGF0YSB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShkYXRhKSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGQgPSBkYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICByZXR1cm4geyB0ZXJtOiBzdHIoZC50ZXJtKS50cmltKCksIHJlc3VsdHM6IGNhcmRzT2YoZC5yZXN1bHRzKSB9O1xufVxuXG4vKiogQSBgU3BhY2Vib29rLkxpc3RgIHBheWxvYWQgXHUyMTkyIGEgbm9ybWFsaXNlZCBsaXN0LCBvciBudWxsIHdoZW4gaXQgaXMgbm90IG9uZS4gRXhwb3J0ZWQgZm9yIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxpc3RPZihkYXRhOiB1bmtub3duKTogU3BhY2Vib29rTGlzdCB8IG51bGwge1xuICBpZiAoIWRhdGEgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkoZGF0YSkpIHJldHVybiBudWxsO1xuICBjb25zdCBkID0gZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3Qgc2VsZiA9IChkLnNlbGYgJiYgdHlwZW9mIGQuc2VsZiA9PT0gJ29iamVjdCcgPyBkLnNlbGYgOiB7fSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IHJlY3MgPSAodjogdW5rbm93bikgPT4gKEFycmF5LmlzQXJyYXkodikgPyB2Lm1hcChyZWNvcmRPZikuZmlsdGVyKChyKTogciBpcyBTcGFjZWJvb2tSZWNvcmQgPT4gISFyKSA6IFtdKTtcbiAgY29uc3Qgb3V0OiBTcGFjZWJvb2tMaXN0ID0ge1xuICAgIHNlbGY6IHsgbmFtZTogc3RyKHNlbGYubmFtZSkudHJpbSgpLCBibHVyYjogc3RyKHNlbGYuYmx1cmIpLnRyaW0oKSwgcHVibGljOiAhIXNlbGYucHVibGljLCBzaGFyZV9mcmllbmRzOiBzZWxmLnNoYXJlX2ZyaWVuZHMgIT09IGZhbHNlLCBwb3J0cmFpdDogc3RyKHNlbGYucG9ydHJhaXQpLnRyaW0oKSB8fCAncGxhY2Vob2xkZXInIH0sXG4gICAgcGVuZGluZzogcmVjcyhkLnBlbmRpbmcpLFxuICAgIGJ1ZGRpZXM6IHJlY3MoZC5idWRkaWVzKSxcbiAgfTtcbiAgY29uc3QgZXJyb3IgPSBzdHIoZC5lcnJvcikudHJpbSgpO1xuICBpZiAoZXJyb3IpIG91dC5lcnJvciA9IGVycm9yO1xuICBpZiAodHlwZW9mIGQuY2FjaGVkID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoZC5jYWNoZWQpICYmIGQuY2FjaGVkID4gMCkgb3V0LmNhY2hlZCA9IE1hdGguZmxvb3IoZC5jYWNoZWQpO1xuICByZXR1cm4gb3V0O1xufVxuXG4vKiogSW5pdGlhbHMgZm9yIGEgcGxhY2Vob2xkZXIgcG9ydHJhaXQ6IHRoZSBmaXJzdCBsZXR0ZXIgb2YgdGhlIGZpcnN0IHR3byB3b3JkcyAoXCJSYWRpY2FsIFJheVwiIFx1MjE5MiBSUiwgXCJPbCcgUmVkXCIgXHUyMTkyIE9SKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsc09mKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHdvcmRzID0gbmFtZS5zcGxpdCgvXFxzKy8pLm1hcCgodykgPT4gdy5yZXBsYWNlKC9eW15cXHB7TH1cXHB7Tn1dKy91LCAnJykpLmZpbHRlcihCb29sZWFuKTtcbiAgY29uc3QgbGV0dGVycyA9IHdvcmRzLnNsaWNlKDAsIDIpLm1hcCgodykgPT4gd1swXSEudG9VcHBlckNhc2UoKSk7XG4gIHJldHVybiBsZXR0ZXJzLmpvaW4oJycpIHx8IChuYW1lLnRyaW0oKVswXSA/PyAnPycpLnRvVXBwZXJDYXNlKCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmlsdGVyIHsgb25saW5lOiBib29sZWFuOyBvZmZsaW5lOiBib29sZWFuOyBxdWVyeTogc3RyaW5nIH1cbi8qKiBPbmxpbmUgZmlyc3QsIHRoZW4gYnkgbmFtZSAoY2FzZS1pbnNlbnNpdGl2ZSkuIEV4cG9ydGVkIGZvciB0ZXN0cy4gKi9cbmV4cG9ydCBjb25zdCBzb3J0QnVkZGllcyA9IChsaXN0OiBTcGFjZWJvb2tSZWNvcmRbXSk6IFNwYWNlYm9va1JlY29yZFtdID0+XG4gIFsuLi5saXN0XS5zb3J0KChhLCBiKSA9PiBOdW1iZXIoYi5zdGF0dXMgPT09ICdvbmxpbmUnKSAtIE51bWJlcihhLnN0YXR1cyA9PT0gJ29ubGluZScpIHx8IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSwgdW5kZWZpbmVkLCB7IHNlbnNpdGl2aXR5OiAnYmFzZScgfSkpO1xuLyoqIFRoZSBPTkxJTkUgLyBPRkZMSU5FIHRvZ2dsZXMgKGRlY2Vhc2VkIGFuZCB1bmtub3duIGNvdW50IGFzIG9mZmxpbmUpIGFuZCB0aGUgc2VhcmNoIG92ZXIgbmFtZSwgYmx1cmIsIGxvY2F0aW9uIGFuZCBhY3F1YWludGFuY2UuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyQnVkZGllcyhsaXN0OiBTcGFjZWJvb2tSZWNvcmRbXSwgZjogRmlsdGVyKTogU3BhY2Vib29rUmVjb3JkW10ge1xuICBjb25zdCBxID0gZi5xdWVyeS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgcmV0dXJuIHNvcnRCdWRkaWVzKGxpc3QpLmZpbHRlcigoYikgPT4ge1xuICAgIGlmIChiLnN0YXR1cyA9PT0gJ29ubGluZScgPyAhZi5vbmxpbmUgOiAhZi5vZmZsaW5lKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuICFxIHx8IFtiLm5hbWUsIGIuYmx1cmIsIGIubG9jYXRpb24sIGIuYWNxdWFpbnRhbmNlXS5zb21lKChzKSA9PiBzLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocSkpO1xuICB9KTtcbn1cblxuLyoqIEEgYmx1cmIgdGhlIHNlcnZlciBhY2NlcHRzOiB0cmltbWVkLCBhdCBtb3N0IHtAbGluayBCTFVSQl9NQVh9IGNoYXJhY3RlcnMuICovXG5leHBvcnQgY29uc3QgY2xhbXBCbHVyYiA9IChzOiBzdHJpbmcpID0+IFsuLi5zLnRyaW0oKV0uc2xpY2UoMCwgQkxVUkJfTUFYKS5qb2luKCcnKTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIHRoZSBwYW5lbCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqIFdoYXQgdGhlIHBhbmVsIG5lZWRzIGZyb20gdGhlIGV4dGVuc2lvbjsgYHJlbmRlclBhbmVsYCBkcmF3cywgdGhlIHJlc3QgYWN0LiAqL1xuZXhwb3J0IGludGVyZmFjZSBQYW5lbEhvc3Qge1xuICBjc3M6IE11Wyd1aSddWydjc3MnXTtcbiAgbGlzdCgpOiBTcGFjZWJvb2tMaXN0IHwgbnVsbDtcbiAgZmlsdGVyKCk6IHsgb25saW5lOiBib29sZWFuOyBvZmZsaW5lOiBib29sZWFuIH07XG4gIHNldEZpbHRlcih3aGljaDogJ29ubGluZScgfCAnb2ZmbGluZScsIG9uOiBib29sZWFuKTogdm9pZDtcbiAgYWNjZXB0KGtleTogc3RyaW5nKTogdm9pZDtcbiAgYWRkKCk6IHZvaWQ7XG4gIGVkaXRCbHVyYigpOiB2b2lkO1xuICBzZXRQdWJsaWMob246IGJvb2xlYW4pOiB2b2lkO1xuICBzZWFyY2hQcm9maWxlcygpOiB2b2lkO1xuICBzZXRTaGFyZUZyaWVuZHMob246IGJvb2xlYW4pOiB2b2lkO1xuICAvKiogWyBSRUZSRVNIIF06IHNlbmQgYFNwYWNlYm9vay5HZXRgIG5vdyBhbmQgcmUtZGVjbGFyZSB0aGUgcGFja2FnZS4gKi9cbiAgcmVmcmVzaCgpOiB2b2lkO1xuICAvKiogT3BlbiBzb21lb25lJ3MgcHJvZmlsZSAoYFNwYWNlYm9vay5HZXRQcm9maWxlYCkgb24gdG9wIG9mIHRoZSBjdXJyZW50IHZpZXcuICovXG4gIG9wZW5Qcm9maWxlKHdobzogeyBrZXk/OiBzdHJpbmc7IG5hbWU/OiBzdHJpbmcgfSk6IHZvaWQ7XG4gIC8qKiBCYWNrIHRvIHRoZSBwcmV2aW91cyB2aWV3LiAqL1xuICBiYWNrKCk6IHZvaWQ7XG4gIGFkZEJ1ZGR5KG5hbWU6IHN0cmluZyk6IHZvaWQ7XG4gIHBhZ2UobmFtZTogc3RyaW5nKTogdm9pZDtcbiAgLyoqIE1hcmsgYSBidWRkeSByb3cgYXMgYSBgc3BhY2Vib29rLmJ1ZGR5YCBjb250ZXh0IHRhcmdldDsgcmV0dXJucyB0aGUgZGlzcG9zZS4gKi9cbiAgdGFyZ2V0KGVsOiBIVE1MRWxlbWVudCwgYnVkZHk6IFNwYWNlYm9va1JlY29yZCk6IERpc3Bvc2U7XG4gIC8qKiBPcGVuIHRoZSByb3cncyBtZW51IGZyb20gaXRzIFx1MjVCOCAoYSBzeW50aGV0aWMgY29udGV4dG1lbnUgYXQgdGhlIHJvdykuICovXG4gIG9wZW5NZW51KGVsOiBIVE1MRWxlbWVudCk6IHZvaWQ7XG59XG5cbi8qKlxuICogVGhlIHBhbmVsJ3MgRE9NIGZvciBvbmUgc3RhdGUuIEV4cG9ydGVkIGZvciB0ZXN0cy4gYHF1ZXJ5YCBpcyB0aGUgbGl2ZSBzZWFyY2ggdGV4dC4gYG5vdGVgIGlzIHRoZSBDQUNIRUQgbGluZSB1bmRlclxuICogdGhlIGJhciAobnVsbCB3aGVuIHRoZSBsaXN0IGlzIGxpdmUpOyB3aXRob3V0IGEgbGlzdCBvciB3aXRoIGBlcnJvcmAgbm90aGluZyBjYW4gYmUgY2hhbmdlZCwgc28gQUREIGFuZCB0aGUgZm9vdCBnby5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclBhbmVsKGhvc3RBcGk6IFBhbmVsSG9zdCwgcXVlcnk6IHN0cmluZyk6IHsgYmFyOiBIVE1MRWxlbWVudDsgbm90ZTogSFRNTEVsZW1lbnQgfCBudWxsOyBib2R5OiBIVE1MRWxlbWVudFtdOyBmb290OiBIVE1MRWxlbWVudCB8IG51bGw7IHRhcmdldHM6IERpc3Bvc2VbXSB9IHtcbiAgY29uc3QgY3NzID0gaG9zdEFwaS5jc3M7XG4gIGNvbnN0IGxpc3QgPSBob3N0QXBpLmxpc3QoKTtcbiAgY29uc3QgZiA9IGhvc3RBcGkuZmlsdGVyKCk7XG4gIGNvbnN0IHRhcmdldHM6IERpc3Bvc2VbXSA9IFtdO1xuICBjb25zdCB0b2dnbGUgPSAod2hpY2g6ICdvbmxpbmUnIHwgJ29mZmxpbmUnLCBsYWJlbDogc3RyaW5nLCBvbjogYm9vbGVhbikgPT5cbiAgICBoKCdidXR0b24nLCB7IGNsYXNzOiBgJHtjc3MudG9nZ2xlfSR7b24gPyAnJyA6IGAgJHtjc3Mub2ZmfWB9YCwgdHlwZTogJ2J1dHRvbicsICdhcmlhLXByZXNzZWQnOiBTdHJpbmcob24pLCAnZGF0YS10ZXN0aWQnOiBgc2ItZmlsdGVyLSR7d2hpY2h9YCwgb25jbGljazogKCkgPT4gaG9zdEFwaS5zZXRGaWx0ZXIod2hpY2gsICFvbikgfSwgbGFiZWwpO1xuICBjb25zdCBjYW5DaGFuZ2UgPSAhIWxpc3QgJiYgIWxpc3QuZXJyb3I7XG4gIGNvbnN0IHJlZnJlc2ggPSBoKCdidXR0b24nLCB7IGNsYXNzOiBgJHtjc3MuY21kfSByZWZyZXNoYCwgdHlwZTogJ2J1dHRvbicsICdkYXRhLXRlc3RpZCc6ICdzYi1yZWZyZXNoJywgdGl0bGU6IENPUFkucmVmcmVzaCwgb25jbGljazogKCkgPT4gaG9zdEFwaS5yZWZyZXNoKCkgfSwgQ09QWS5yZWZyZXNoKTtcbiAgY29uc3QgYmFyID0gaCgnZGl2JywgeyBjbGFzczogJ2JhcicgfSxcbiAgICB0b2dnbGUoJ29ubGluZScsIENPUFkub25saW5lLCBmLm9ubGluZSksXG4gICAgdG9nZ2xlKCdvZmZsaW5lJywgQ09QWS5vZmZsaW5lLCBmLm9mZmxpbmUpLFxuICAgIGgoJ2lucHV0JywgeyBjbGFzczogY3NzLmZpZWxkLCB0eXBlOiAnc2VhcmNoJywgbmFtZTogJ3F1ZXJ5JywgdmFsdWU6IHF1ZXJ5LCBwbGFjZWhvbGRlcjogQ09QWS5zZWFyY2gsICdhcmlhLWxhYmVsJzogQ09QWS5zZWFyY2gsICdkYXRhLXRlc3RpZCc6ICdzYi1zZWFyY2gnLCBhdXRvY29tcGxldGU6ICdvZmYnIH0pLFxuICAgIGNhbkNoYW5nZSA/IGgoJ2J1dHRvbicsIHsgY2xhc3M6IGNzcy5jbWQsIHR5cGU6ICdidXR0b24nLCAnZGF0YS10ZXN0aWQnOiAnc2ItYWRkJywgb25jbGljazogKCkgPT4gaG9zdEFwaS5hZGQoKSB9LCBDT1BZLmFkZCkgOiBudWxsLFxuICAgIHJlZnJlc2gsXG4gICk7XG4gIGNvbnN0IGhlYWQgPSAobGFiZWw6IHN0cmluZywgbjogbnVtYmVyKSA9PiBzZWNIZWFkKGNzcywgbGFiZWwsIG4pO1xuICBpZiAoIWxpc3QpIHJldHVybiB7IGJhciwgbm90ZTogbnVsbCwgYm9keTogW2goJ3AnLCB7IGNsYXNzOiBgJHtjc3MuZW1wdHl9IGF3YWl0aW5nYCwgJ2RhdGEtdGVzdGlkJzogJ3NiLWVtcHR5JyB9LCBDT1BZLmF3YWl0aW5nKV0sIGZvb3Q6IG51bGwsIHRhcmdldHMgfTtcbiAgY29uc3Qgbm90ZSA9IGxpc3QuY2FjaGVkID8gaCgncCcsIHsgY2xhc3M6ICdub3RlJywgJ2RhdGEtdGVzdGlkJzogJ3NiLWNhY2hlZCcgfSwgQ09QWS5jYWNoZWQoYWdvT2YobGlzdC5jYWNoZWQpKSkgOiBudWxsO1xuICAvLyBUaGUgc2VydmVyJ3MgcmVhc29uIHRoZXJlIGlzIG5vIGJvb2s6IHRoZSBsYWJlbCBsaW5lLCB0aGVuIGl0cyB0ZXh0IHZlcmJhdGltLiBOb3RoaW5nIGVsc2UgdG8gZHJhdy5cbiAgaWYgKGxpc3QuZXJyb3IpIHJldHVybiB7IGJhciwgbm90ZSwgYm9keTogW2goJ2RpdicsIHsgY2xhc3M6ICdyZWFzb24nLCAnZGF0YS10ZXN0aWQnOiAnc2ItZW1wdHknLCByb2xlOiAnc3RhdHVzJyB9LCBoKCdzcGFuJywgeyBjbGFzczogJ2xibCcgfSwgQ09QWS5ub1NpZ25hbCksIGgoJ3NwYW4nLCB7IGNsYXNzOiAnd2h5JywgJ2RhdGEtdGVzdGlkJzogJ3NiLXJlYXNvbicgfSwgbGlzdC5lcnJvcikpXSwgZm9vdDogbnVsbCwgdGFyZ2V0cyB9O1xuXG4gIGNvbnN0IGJvZHk6IEhUTUxFbGVtZW50W10gPSBbXTtcbiAgaWYgKGxpc3QucGVuZGluZy5sZW5ndGgpIHtcbiAgICBib2R5LnB1c2goaGVhZChDT1BZLnBlbmRpbmcsIGxpc3QucGVuZGluZy5sZW5ndGgpKTtcbiAgICBmb3IgKGNvbnN0IHAgb2YgbGlzdC5wZW5kaW5nKSB7XG4gICAgICBib2R5LnB1c2goaCgnZGl2JywgeyBjbGFzczogJ3BlbmQnLCAnZGF0YS10ZXN0aWQnOiAnc2ItcGVuZGluZycsICdkYXRhLWtleSc6IHAua2V5IH0sXG4gICAgICAgIGgoJ3NwYW4nLCB7IGNsYXNzOiAnd2hvJyB9LCBwLm5hbWUpLFxuICAgICAgICBoKCdzcGFuJywgeyBjbGFzczogJ2FzaycgfSwgQ09QWS53YW50cyksXG4gICAgICAgIGgoJ2J1dHRvbicsIHsgY2xhc3M6IGAke2Nzcy5jbWR9IHByaW1hcnlgLCB0eXBlOiAnYnV0dG9uJywgJ2RhdGEtdGVzdGlkJzogJ3NiLWFjY2VwdCcsIG9uY2xpY2s6ICgpID0+IGhvc3RBcGkuYWNjZXB0KHAua2V5KSB9LCBDT1BZLmFjY2VwdCkpKTtcbiAgICB9XG4gIH1cbiAgYm9keS5wdXNoKGhlYWQoQ09QWS5idWRkaWVzLCBsaXN0LmJ1ZGRpZXMubGVuZ3RoKSk7XG4gIGNvbnN0IHNob3duID0gZmlsdGVyQnVkZGllcyhsaXN0LmJ1ZGRpZXMsIHsgLi4uZiwgcXVlcnkgfSk7XG4gIGlmICghbGlzdC5idWRkaWVzLmxlbmd0aCkgYm9keS5wdXNoKGgoJ3AnLCB7IGNsYXNzOiBgJHtjc3MuZW1wdHl9IGF3YWl0aW5nYCwgJ2RhdGEtdGVzdGlkJzogJ3NiLWVtcHR5JyB9LCBDT1BZLm5vQnVkZGllcykpO1xuICBlbHNlIGlmICghc2hvd24ubGVuZ3RoKSBib2R5LnB1c2goaCgncCcsIHsgY2xhc3M6IGAke2Nzcy5lbXB0eX0gYXdhaXRpbmdgLCAnZGF0YS10ZXN0aWQnOiAnc2ItZW1wdHknIH0sIENPUFkubm9NYXRjaCkpO1xuICBmb3IgKGNvbnN0IGIgb2Ygc2hvd24pIHtcbiAgICBjb25zdCByb3cgPSBjYXJkUm93KGNzcywgYiwgeyB0ZXN0aWQ6ICdzYi1idWRkeScsIHRpdGxlOiBDT1BZLm1lbnUgfSk7XG4gICAgcm93LnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICdtZW51Jyk7XG4gICAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gaG9zdEFwaS5vcGVuTWVudShyb3cpKTtcbiAgICB0YXJnZXRzLnB1c2goaG9zdEFwaS50YXJnZXQocm93LCBiKSk7XG4gICAgYm9keS5wdXNoKHJvdyk7XG4gIH1cblxuICBjb25zdCB5b3UgPSBsaXN0LnNlbGY7XG4gIGNvbnN0IGZvb3QgPSBoKCdkaXYnLCB7IGNsYXNzOiAnZm9vdCcsICdkYXRhLXRlc3RpZCc6ICdzYi1mb290JyB9LFxuICAgIGgoJ2RpdicsIHsgY2xhc3M6ICdsJyB9LCBoKCdzcGFuJywgeyBjbGFzczogY3NzLmxhYmVsIH0sIENPUFkueW91KSwgaCgnc3BhbicsIHsgY2xhc3M6ICd5b3UnIH0sIHlvdS5uYW1lKSwgaCgnc3BhbicsIHsgY2xhc3M6IGAke2Nzcy5wbGF0ZX0gJHt5b3UucHVibGljID8gY3NzLmhvdCA6IGNzcy5kaW19YCwgJ2RhdGEtdGVzdGlkJzogJ3NiLXB1YmxpYycgfSwgeW91LnB1YmxpYyA/IENPUFkuaXNQdWJsaWMgOiBDT1BZLmlzUHJpdmF0ZSkpLFxuICAgIHlvdS5ibHVyYiA/IGgoJ2RpdicsIHsgY2xhc3M6ICdsJyB9LCBoKCdzcGFuJywgeyBjbGFzczogJ2JsdXJiJywgJ2RhdGEtdGVzdGlkJzogJ3NiLWJsdXJiJyB9LCB5b3UuYmx1cmIpKSA6IG51bGwsXG4gICAgaCgnZGl2JywgeyBjbGFzczogJ2FjdHMnIH0sXG4gICAgICBoKCdidXR0b24nLCB7IGNsYXNzOiBjc3MuY21kLCB0eXBlOiAnYnV0dG9uJywgJ2RhdGEtdGVzdGlkJzogJ3NiLWVkaXQtYmx1cmInLCBvbmNsaWNrOiAoKSA9PiBob3N0QXBpLmVkaXRCbHVyYigpIH0sIENPUFkuZWRpdEJsdXJiKSxcbiAgICAgIGgoJ2J1dHRvbicsIHsgY2xhc3M6IGNzcy5jbWQsIHR5cGU6ICdidXR0b24nLCAnZGF0YS10ZXN0aWQnOiAnc2ItcHVibGljLXRvZ2dsZScsIG9uY2xpY2s6ICgpID0+IGhvc3RBcGkuc2V0UHVibGljKCF5b3UucHVibGljKSB9LCB5b3UucHVibGljID8gQ09QWS5nb1ByaXZhdGUgOiBDT1BZLmdvUHVibGljKSxcbiAgICAgIGgoJ2J1dHRvbicsIHsgY2xhc3M6IGNzcy5jbWQsIHR5cGU6ICdidXR0b24nLCAnZGF0YS10ZXN0aWQnOiAnc2Itc2hhcmUtdG9nZ2xlJywgJ2FyaWEtcHJlc3NlZCc6IFN0cmluZyh5b3Uuc2hhcmVfZnJpZW5kcyksIG9uY2xpY2s6ICgpID0+IGhvc3RBcGkuc2V0U2hhcmVGcmllbmRzKCF5b3Uuc2hhcmVfZnJpZW5kcykgfSwgeW91LnNoYXJlX2ZyaWVuZHMgPyBDT1BZLmhpZGVGcmllbmRzIDogQ09QWS5zaGFyZUZyaWVuZHMpLFxuICAgICAgaCgnYnV0dG9uJywgeyBjbGFzczogY3NzLmNtZCwgdHlwZTogJ2J1dHRvbicsICdkYXRhLXRlc3RpZCc6ICdzYi1zZWFyY2gtcHJvZmlsZXMnLCBvbmNsaWNrOiAoKSA9PiBob3N0QXBpLnNlYXJjaFByb2ZpbGVzKCkgfSwgQ09QWS5zZWFyY2hQcm9maWxlcykpKTtcbiAgcmV0dXJuIHsgYmFyLCBub3RlLCBib2R5LCBmb290LCB0YXJnZXRzIH07XG59XG5cbi8qKiBBIHBlcnNvbiBhcyBhIHJvdzogcG9ydHJhaXQsIG5hbWUgKyBzdGF0dXMgcGxhdGUgKCsgcm9sZSksIFwiYWNxdWFpbnRhbmNlIFx1MDBCNyBsb2NhdGlvblwiLCBibHVyYi4gQnVkZHkgcm93cywgZnJpZW5kcyBhbmQgcmVzdWx0cyBzaGFyZSBpdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYXJkUm93KGNzczogTXVbJ3VpJ11bJ2NzcyddLCBiOiBQaWNrPFNwYWNlYm9va0NhcmQsICdrZXknIHwgJ25hbWUnIHwgJ3N0YXR1cycgfCAncG9ydHJhaXQnIHwgJ2FjcXVhaW50YW5jZScgfCAnbG9jYXRpb24nIHwgJ2JsdXJiJz4gJiB7IHJvbGU/OiBzdHJpbmcgfSwgbzogeyB0ZXN0aWQ6IHN0cmluZzsgdGl0bGU/OiBzdHJpbmc7IGRpc2FibGVkPzogYm9vbGVhbjsgbm90ZT86IHN0cmluZyB9KTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBkZWFkID0gYi5zdGF0dXMgPT09ICdkZWNlYXNlZCc7XG4gIGNvbnN0IHBvcnQgPSBiLnBvcnRyYWl0ICYmIGIucG9ydHJhaXQgIT09ICdwbGFjZWhvbGRlcidcbiAgICA/IGgoJ2RpdicsIHsgY2xhc3M6IGBwb3J0JHtkZWFkID8gJyBkZWFkJyA6ICcnfWAgfSwgaCgnaW1nJywgeyBzcmM6IGIucG9ydHJhaXQsIGFsdDogJycsIGxvYWRpbmc6ICdsYXp5JyB9KSlcbiAgICA6IGgoJ2RpdicsIHsgY2xhc3M6IGBwb3J0JHtkZWFkID8gJyBkZWFkJyA6ICcnfWAsICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9LCBoKCdiJywge30sIGluaXRpYWxzT2YoYi5uYW1lKSksIGgoJ3NtYWxsJywge30sIENPUFkucG9ydHJhaXQpKTtcbiAgY29uc3QgcGxhdGUgPSBiLnN0YXR1cyA9PT0gJ29ubGluZScgPyBjc3Mub2sgOiBiLnN0YXR1cyA9PT0gJ2RlY2Vhc2VkJyA/ICdhbGVydCcgOiBjc3MuZGltO1xuICBjb25zdCBsMiA9IGgoJ2RpdicsIHsgY2xhc3M6ICdsMicgfSk7XG4gIGNvbnN0IGJpdHM6IEhUTUxFbGVtZW50W10gPSBbXTtcbiAgaWYgKGIucm9sZSkgYml0cy5wdXNoKGgoJ3NwYW4nLCB7IGNsYXNzOiAncm9sZScsICdkYXRhLXRlc3RpZCc6ICdzYi1yb2xlJyB9LCBiLnJvbGUpKTtcbiAgaWYgKGIuYWNxdWFpbnRhbmNlKSBiaXRzLnB1c2goaCgnc3BhbicsIHsgY2xhc3M6IGBhY3Eke2lzSG9zdGlsZShiLmFjcXVhaW50YW5jZSkgPyAnIGZvZScgOiAnJ31gIH0sIGIuYWNxdWFpbnRhbmNlKSk7XG4gIGlmIChiLmxvY2F0aW9uKSBiaXRzLnB1c2goaCgnc3BhbicsIHsgY2xhc3M6ICdsb2MnIH0sIGIubG9jYXRpb24pKTtcbiAgYml0cy5mb3JFYWNoKChlbCwgaSkgPT4geyBpZiAoaSkgbDIuYXBwZW5kKGgoJ3NwYW4nLCB7IGNsYXNzOiAnYXQnLCAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSwgJ1x1MDBCNycpKTsgbDIuYXBwZW5kKGVsKTsgfSk7XG4gIGNvbnN0IGwzID0gby5ub3RlID8gaCgnZGl2JywgeyBjbGFzczogJ2wzIG5vbmUnIH0sIG8ubm90ZSkgOiBiLmJsdXJiID8gaCgnZGl2JywgeyBjbGFzczogJ2wzJyB9LCBiLmJsdXJiKSA6IGgoJ2RpdicsIHsgY2xhc3M6ICdsMyBub25lJyB9LCBDT1BZLm5vQmx1cmIpO1xuICByZXR1cm4gaCgnYnV0dG9uJywgeyBjbGFzczogJ3JvdycsIHR5cGU6ICdidXR0b24nLCAnZGF0YS10ZXN0aWQnOiBvLnRlc3RpZCwgJ2RhdGEta2V5JzogYi5rZXksICdkYXRhLXN0YXR1cyc6IGIuc3RhdHVzLCB0aXRsZTogby50aXRsZSA/PyAnJywgZGlzYWJsZWQ6IG8uZGlzYWJsZWQgPyB0cnVlIDogdW5kZWZpbmVkIH0sXG4gICAgcG9ydCxcbiAgICBoKCdkaXYnLCB7IGNsYXNzOiAnbWV0YScgfSxcbiAgICAgIGgoJ2RpdicsIHsgY2xhc3M6ICdsMScgfSwgaCgnc3BhbicsIHsgY2xhc3M6ICduYW1lJyB9LCBiLm5hbWUpLCBoKCdzcGFuJywgeyBjbGFzczogYCR7Y3NzLnBsYXRlfSAke3BsYXRlfWAsICdkYXRhLXRlc3RpZCc6ICdzYi1zdGF0dXMnIH0sIENPUFkuc3RhdHVzW2Iuc3RhdHVzXSkpLFxuICAgICAgbDIsIGwzKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG59XG5cbi8qKiBQZW9wbGUgYXMgcm93czogdGhvc2Ugd2hvc2UgcHJvZmlsZSB0aGUgdmlld2VyIG1heSBvcGVuIGFyZSBidXR0b25zIHRoYXQgb3BlbiBpdCwgdGhlIHJlc3QgYXJlIGluZXJ0IGFuZCBzYXkgd2h5LiAqL1xuZnVuY3Rpb24gY2FyZFJvd3MoaG9zdEFwaTogUGFuZWxIb3N0LCBjYXJkczogU3BhY2Vib29rQ2FyZFtdLCB0ZXN0aWQ6IHN0cmluZyk6IEhUTUxFbGVtZW50W10ge1xuICByZXR1cm4gY2FyZHMubWFwKChjKSA9PiB7XG4gICAgY29uc3Qgcm93ID0gY2FyZFJvdyhob3N0QXBpLmNzcywgYywgeyB0ZXN0aWQsIHRpdGxlOiBjLnZpZXdhYmxlID8gQ09QWS5vcGVuUHJvZmlsZSA6IENPUFkucHJpdmF0ZVByb2ZpbGUsIGRpc2FibGVkOiAhYy52aWV3YWJsZSwgbm90ZTogYy52aWV3YWJsZSA/IHVuZGVmaW5lZCA6IENPUFkucHJpdmF0ZVByb2ZpbGUgfSk7XG4gICAgaWYgKGMudmlld2FibGUpIHJvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGhvc3RBcGkub3BlblByb2ZpbGUoeyBrZXk6IGMua2V5LCBuYW1lOiBjLm5hbWUgfSkpO1xuICAgIHJldHVybiByb3c7XG4gIH0pO1xufVxuXG4vKiogVGhlIGJhciBvZiBhIHByb2ZpbGUgb3Igc2VhcmNoIHZpZXc6IFsgQkFDSyBdIGFuZCB3aGF0IGl0IHNob3dzLiAqL1xuZnVuY3Rpb24gdmlld0Jhcihob3N0QXBpOiBQYW5lbEhvc3QsIHRpdGxlOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG4gIHJldHVybiBoKCdkaXYnLCB7IGNsYXNzOiAnYmFyJyB9LFxuICAgIGgoJ2J1dHRvbicsIHsgY2xhc3M6IGhvc3RBcGkuY3NzLmNtZCwgdHlwZTogJ2J1dHRvbicsICdkYXRhLXRlc3RpZCc6ICdzYi1iYWNrJywgb25jbGljazogKCkgPT4gaG9zdEFwaS5iYWNrKCkgfSwgQ09QWS5iYWNrKSxcbiAgICBoKCdzcGFuJywgeyBjbGFzczogJ3Z0aXRsZScsICdkYXRhLXRlc3RpZCc6ICdzYi12aWV3LXRpdGxlJyB9LCB0aXRsZSkpO1xufVxuXG5jb25zdCBzZWNIZWFkID0gKGNzczogTXVbJ3VpJ11bJ2NzcyddLCBsYWJlbDogc3RyaW5nLCBuPzogbnVtYmVyKSA9PiBoKCdkaXYnLCB7IGNsYXNzOiBjc3Muc2VjSGVhZCwgcm9sZTogJ2hlYWRpbmcnLCAnYXJpYS1sZXZlbCc6ICczJyB9LCBuID09PSB1bmRlZmluZWQgPyBsYWJlbCA6IGAke2xhYmVsfSAoJHtufSlgLCBoKCdzcGFuJywgeyBjbGFzczogY3NzLnNlY0Nsb3NlLCAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSkpO1xuY29uc3Qgbm90ZSA9IChjc3M6IE11Wyd1aSddWydjc3MnXSwgdGV4dDogc3RyaW5nLCB0ZXN0aWQgPSAnc2ItZW1wdHknKSA9PiBoKCdwJywgeyBjbGFzczogYCR7Y3NzLmVtcHR5fSBhd2FpdGluZ2AsICdkYXRhLXRlc3RpZCc6IHRlc3RpZCB9LCB0ZXh0KTtcblxuLyoqIFNvbWVvbmUncyBwcm9maWxlIChvciB3aHkgaXQgY2Fubm90IGJlIHNob3duKSwgdGhlbiB0aGVpciBmcmllbmRzIG9yIHRoZSByZWFzb24gdGhleSBhcmUgaGlkZGVuLiBFeHBvcnRlZCBmb3IgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyUHJvZmlsZShob3N0QXBpOiBQYW5lbEhvc3QsIHZpZXc6IEV4dHJhY3Q8U3BhY2Vib29rVmlldywgeyBraW5kOiAncHJvZmlsZScgfT4pOiB7IGJhcjogSFRNTEVsZW1lbnQ7IGJvZHk6IEhUTUxFbGVtZW50W10gfSB7XG4gIGNvbnN0IGNzcyA9IGhvc3RBcGkuY3NzO1xuICBjb25zdCBwID0gdmlldy5wcm9maWxlO1xuICBpZiAoIXApIHJldHVybiB7IGJhcjogdmlld0Jhcihob3N0QXBpLCB2aWV3Lm5hbWUpLCBib2R5OiBbbm90ZShjc3MsIENPUFkubG9hZGluZyldIH07XG4gIGlmICgnZXJyb3InIGluIHApIHJldHVybiB7IGJhcjogdmlld0Jhcihob3N0QXBpLCBwLm5hbWUgfHwgdmlldy5uYW1lKSwgYm9keTogW25vdGUoY3NzLCBwLmVycm9yLCAnc2ItZXJyb3InKV0gfTtcbiAgY29uc3Qgc2VsZiA9IGhvc3RBcGkubGlzdCgpPy5zZWxmLm5hbWUgPT09IHAubmFtZTtcbiAgY29uc3QgYm9keTogSFRNTEVsZW1lbnRbXSA9IFtjYXJkUm93KGNzcywgcCwgeyB0ZXN0aWQ6ICdzYi1wcm9maWxlJyB9KV07XG4gIGJvZHlbMF0hLmNsYXNzTGlzdC5hZGQoJ2hlYWQnKTtcbiAgY29uc3QgYWN0cyA9IGgoJ2RpdicsIHsgY2xhc3M6ICdhY3RzJyB9KTtcbiAgaWYgKHNlbGYpIGFjdHMuYXBwZW5kKGgoJ3NwYW4nLCB7IGNsYXNzOiBgJHtjc3MucGxhdGV9ICR7Y3NzLmhvdH1gIH0sIENPUFkuaXNZb3UpKTtcbiAgZWxzZSBpZiAocC5idWRkeSkgYWN0cy5hcHBlbmQoaCgnc3BhbicsIHsgY2xhc3M6IGAke2Nzcy5wbGF0ZX0gJHtjc3Mub2t9YCwgJ2RhdGEtdGVzdGlkJzogJ3NiLWlzLWJ1ZGR5JyB9LCBDT1BZLmlzQnVkZHkpLCBoKCdidXR0b24nLCB7IGNsYXNzOiBjc3MuY21kLCB0eXBlOiAnYnV0dG9uJywgJ2RhdGEtdGVzdGlkJzogJ3NiLXBhZ2UnLCBvbmNsaWNrOiAoKSA9PiBob3N0QXBpLnBhZ2UocC5uYW1lKSB9LCBDT1BZLnBhZ2UpKTtcbiAgZWxzZSBhY3RzLmFwcGVuZChoKCdidXR0b24nLCB7IGNsYXNzOiBgJHtjc3MuY21kfSBwcmltYXJ5YCwgdHlwZTogJ2J1dHRvbicsICdkYXRhLXRlc3RpZCc6ICdzYi1hZGQtYnVkZHknLCBvbmNsaWNrOiAoKSA9PiBob3N0QXBpLmFkZEJ1ZGR5KHAubmFtZSkgfSwgQ09QWS5hZGRCdWRkeSkpO1xuICBib2R5LnB1c2goYWN0cyk7XG4gIGNvbnN0IGxhYmVsID0gcC5pbnRyb2R1Y2VyID8gQ09QWS5pbnRyb2R1Y2VzIDogQ09QWS5mcmllbmRzO1xuICBpZiAoIXAuZnJpZW5kc192aXNpYmxlKSB7IGJvZHkucHVzaChzZWNIZWFkKGNzcywgbGFiZWwpLCBub3RlKGNzcywgcC5mcmllbmRzX2hpZGRlbiwgJ3NiLWZyaWVuZHMtaGlkZGVuJykpOyByZXR1cm4geyBiYXI6IHZpZXdCYXIoaG9zdEFwaSwgcC5uYW1lKSwgYm9keSB9OyB9XG4gIGJvZHkucHVzaChzZWNIZWFkKGNzcywgbGFiZWwsIHAuZnJpZW5kcy5sZW5ndGgpKTtcbiAgaWYgKCFwLmZyaWVuZHMubGVuZ3RoKSBib2R5LnB1c2gobm90ZShjc3MsIHAuaW50cm9kdWNlciA/IENPUFkubm9JbnRyb2R1Y3Rpb25zIDogQ09QWS5ub0ZyaWVuZHMpKTtcbiAgYm9keS5wdXNoKC4uLmNhcmRSb3dzKGhvc3RBcGksIHAuZnJpZW5kcywgJ3NiLWZyaWVuZCcpKTtcbiAgcmV0dXJuIHsgYmFyOiB2aWV3QmFyKGhvc3RBcGksIHAubmFtZSksIGJvZHkgfTtcbn1cblxuLyoqIFB1YmxpYyBwcm9maWxlcyBtYXRjaGluZyBhIHRlcm0uIEV4cG9ydGVkIGZvciB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJSZXN1bHRzKGhvc3RBcGk6IFBhbmVsSG9zdCwgdmlldzogRXh0cmFjdDxTcGFjZWJvb2tWaWV3LCB7IGtpbmQ6ICdzZWFyY2gnIH0+KTogeyBiYXI6IEhUTUxFbGVtZW50OyBib2R5OiBIVE1MRWxlbWVudFtdIH0ge1xuICBjb25zdCBjc3MgPSBob3N0QXBpLmNzcztcbiAgY29uc3QgYmFyID0gdmlld0Jhcihob3N0QXBpLCBDT1BZLnNlYXJjaEhlYWQodmlldy50ZXJtKSk7XG4gIGlmICghdmlldy5yZXN1bHRzKSByZXR1cm4geyBiYXIsIGJvZHk6IFtub3RlKGNzcywgQ09QWS5sb2FkaW5nKV0gfTtcbiAgY29uc3QgYm9keTogSFRNTEVsZW1lbnRbXSA9IFtzZWNIZWFkKGNzcywgQ09QWS5yZXN1bHRzLCB2aWV3LnJlc3VsdHMubGVuZ3RoKV07XG4gIGlmICghdmlldy5yZXN1bHRzLmxlbmd0aCkgYm9keS5wdXNoKG5vdGUoY3NzLCBDT1BZLm5vUmVzdWx0cykpO1xuICBib2R5LnB1c2goLi4uY2FyZFJvd3MoaG9zdEFwaSwgdmlldy5yZXN1bHRzLCAnc2ItcmVzdWx0JykpO1xuICByZXR1cm4geyBiYXIsIGJvZHkgfTtcbn1cblxuLyoqIEhvdyB0aGUgZXh0ZW5zaW9uIGhhbmRzIGEgc2Vzc2lvbidzIGFuc3dlcnMgdG8gb25lIG9wZW4gcGFuZWwuICovXG5pbnRlcmZhY2UgUGFuZWxBbnN3ZXIge1xuICBwcm9maWxlKHA6IFNwYWNlYm9va1Byb2ZpbGUgfCBTcGFjZWJvb2tQcm9maWxlRXJyb3IpOiB2b2lkO1xuICByZXN1bHRzKHI6IHsgdGVybTogc3RyaW5nOyByZXN1bHRzOiBTcGFjZWJvb2tDYXJkW10gfSk6IHZvaWQ7XG4gIG9wZW4od2hvOiB7IGtleT86IHN0cmluZzsgbmFtZT86IHN0cmluZyB9KTogdm9pZDtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIHRoZSBleHRlbnNpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUV4dGVuc2lvbih7XG4gIGFjdGl2YXRlKGN0eCkge1xuICAgIGNvbnN0IG11OiBNdSA9IGN0eC5tdTtcbiAgICBtdS51aS5zdHlsZShTUEFDRUJPT0tfQ1NTKTtcbiAgICBjb25zdCBjc3MgPSBtdS51aS5jc3M7XG5cbiAgICAvKipcbiAgICAgKiBEZWNsYXJlIGBTcGFjZWJvb2sgMWAgYXQgcnVudGltZSwgb24gdG9wIG9mIHRoZSBtYW5pZmVzdCdzIGRlY2xhcmF0aW9uLiBUaGUgYmFja2VuZCBrZWVwcyBvbmUgZGVjbGFyYXRpb24gcGVyXG4gICAgICogKGNvbm5lY3Rpb24sIGV4dGVuc2lvbiksIHNvIGEgcmVwZWF0IGlzIGEgbm8tb3Agd2hpbGUgaXQgc3RhbmRzIGFuZCByZS1hZGRzIHRoZSBwYWNrYWdlIGFmdGVyIGEgcmVjb25uZWN0XG4gICAgICogbG9zdCBpdCAodGhlIGdhbWUgdGhlbiBhbnN3ZXJzIGBDb3JlLlN1cHBvcnRzLkFkZGAgd2l0aCBhIGZyZXNoIGxpc3QpLiBFYWNoIERpc3Bvc2UgZ29lcyBpbnRvXG4gICAgICogYGN0eC5zdWJzY3JpcHRpb25zYCBhbmQgbm9uZSBpcyBjYWxsZWQgYmVmb3JlIGRlYWN0aXZhdGlvbjogZGlzcG9zaW5nIG9uZSBzZW5kcyBgcmVtb3ZlYCBmb3IgdGhlIHNhbWUgb3duZXJcbiAgICAgKiBhbmQgd291bGQgd2l0aGRyYXcgdGhlIHBhY2thZ2UgZnJvbSB0aGUgZ2FtZS5cbiAgICAgKi9cbiAgICBjb25zdCBkZWNsYXJlID0gKCkgPT4geyBjdHguc3Vic2NyaXB0aW9ucy5wdXNoKG11LmdtY3Auc3VwcG9ydHMoU1VQUE9SVFMpKTsgfTtcbiAgICBkZWNsYXJlKCk7XG5cbiAgICBtdS5zZXR0aW5ncy5kZWZpbmUoe1xuICAgICAgdGl0bGU6IENPUFkuc2V0dGluZ3NUaXRsZSxcbiAgICAgIGl0ZW1zOiBbXG4gICAgICAgIHsga2V5OiBTRVRUSU5HUy5vbmxpbmUsIGxhYmVsOiBDT1BZLnNldHRpbmdPbmxpbmUsIGRlZmF1bHQ6IHRydWUsIGtpbmQ6ICd0b2dnbGUnLCBzY29wZTogJ3dvcmxkJyB9LFxuICAgICAgICB7IGtleTogU0VUVElOR1Mub2ZmbGluZSwgbGFiZWw6IENPUFkuc2V0dGluZ09mZmxpbmUsIGRlZmF1bHQ6IHRydWUsIGtpbmQ6ICd0b2dnbGUnLCBzY29wZTogJ3dvcmxkJywgaGludDogQ09QWS5zZXR0aW5nT2ZmbGluZUhpbnQgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBTREsgMS4xNCByZWdpc3RlcmVkIGtpbmQ7IGEgMS4xMiBvciAxLjEzIGhvc3QgaGFzIG5vIGBtZW51cy5raW5kYCBhbmQgZ2V0cyBhbiBgeC1gIGtpbmQuXG4gICAgY29uc3Qga2luZHMgPSB0eXBlb2YgbXUubWVudXMua2luZCA9PT0gJ2Z1bmN0aW9uJztcbiAgICBjb25zdCBLSU5EID0ga2luZHMgPyBCVUREWV9LSU5EIDogJ3gtc3BhY2Vib29rLWJ1ZGR5JztcbiAgICBpZiAoa2luZHMpIGN0eC5zdWJzY3JpcHRpb25zLnB1c2gobXUubWVudXMua2luZCh7IGlkOiBCVUREWV9LSU5ELCB0aXRsZTogQ09QWS5idWRkeUtpbmQsIHNjaGVtYTogS0lORF9TQ0hFTUEgfSkpO1xuICAgIGNvbnN0IGJ1ZGR5T2YgPSAodDogdW5rbm93bik6IFNwYWNlYm9va1JlY29yZCB8IG51bGwgPT4gKCh0IGFzIHsgZGF0YT86IHsgYnVkZHk/OiBTcGFjZWJvb2tSZWNvcmQgfSB9KT8uZGF0YT8uYnVkZHkgPz8gbnVsbCk7XG4gICAgY3R4LnN1YnNjcmlwdGlvbnMucHVzaChcbiAgICAgIG11Lm1lbnVzLmNvbnRleHQoe1xuICAgICAgICBpZDogJ3BhZ2UnLCB0YXJnZXQ6IEtJTkQgYXMgJ3NwYWNlYm9vay5idWRkeScsIG9yZGVyOiAxMDAsIHRpdGxlOiBDT1BZLnBhZ2UsXG4gICAgICAgIHdoZW46ICh0KSA9PiAhIWJ1ZGR5T2YodCkgJiYgYnVkZHlPZih0KSEuc3RhdHVzICE9PSAnZGVjZWFzZWQnLFxuICAgICAgICBydW46ICh0KSA9PiB7IGNvbnN0IGIgPSBidWRkeU9mKHQpOyBpZiAoYikgeyBtdS5pbnB1dC5maWxsKENPUFkuY21kUGFnZShiLm5hbWUpLCB7IHNpZDogdC5zaWQgPz8gdW5kZWZpbmVkIH0pOyBtdS5pbnB1dC5mb2N1cyh0LnNpZCA/PyB1bmRlZmluZWQpOyB9IH0sXG4gICAgICB9KSxcbiAgICAgIG11Lm1lbnVzLmNvbnRleHQoe1xuICAgICAgICBpZDogJ3Byb2ZpbGUnLCB0YXJnZXQ6IEtJTkQgYXMgJ3NwYWNlYm9vay5idWRkeScsIG9yZGVyOiAxMCwgdGl0bGU6IENPUFkudmlld1Byb2ZpbGUsXG4gICAgICAgIHdoZW46ICh0KSA9PiAhIWJ1ZGR5T2YodCksXG4gICAgICAgIHJ1bjogKHQpID0+IHsgY29uc3QgYiA9IGJ1ZGR5T2YodCk7IGlmIChiKSBhcGkub3BlblByb2ZpbGUoeyBrZXk6IGIua2V5LCBuYW1lOiBiLm5hbWUgfSwgdC5zaWQgPz8gdW5kZWZpbmVkKTsgfSxcbiAgICAgIH0pLFxuICAgICAgbXUubWVudXMuY29udGV4dCh7XG4gICAgICAgIGlkOiAncmVtb3ZlJywgdGFyZ2V0OiBLSU5EIGFzICdzcGFjZWJvb2suYnVkZHknLCBvcmRlcjogOTAwLCB0aXRsZTogQ09QWS5yZW1vdmUsXG4gICAgICAgIHdoZW46ICh0KSA9PiAhIWJ1ZGR5T2YodCksXG4gICAgICAgIHJ1bjogYXN5bmMgKHQpID0+IHtcbiAgICAgICAgICBjb25zdCBiID0gYnVkZHlPZih0KTtcbiAgICAgICAgICBpZiAoIWIgfHwgIXQuc2lkKSByZXR1cm47XG4gICAgICAgICAgaWYgKGF3YWl0IG11LnVpLmNvbmZpcm0oeyB0aXRsZTogQ09QWS5yZW1vdmVUaXRsZShiLm5hbWUpLCBib2R5OiBDT1BZLnJlbW92ZUJvZHksIGNvbmZpcm06IENPUFkucmVtb3ZlQ29uZmlybSwgZGFuZ2VyOiB0cnVlIH0pKSB2b2lkIG11LmdtY3Auc2VuZCgnU3BhY2Vib29rLlJlbW92ZScsIHsga2V5OiBiLmtleSB9LCB0LnNpZCk7XG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gUGVyLXNlc3Npb24gc3RhdGU6IHRoZSBsYXN0IGxpc3QgYW5kIHRoZSBwYW5lbHMgZHJhd2luZyBpdC5cbiAgICBjb25zdCBsaXN0cyA9IG5ldyBNYXA8c3RyaW5nLCBTcGFjZWJvb2tMaXN0PigpO1xuICAgIGNvbnN0IHJlZHJhd3MgPSBuZXcgTWFwPHN0cmluZywgU2V0PCgpID0+IHZvaWQ+PigpO1xuICAgIGNvbnN0IHJlZHJhdyA9IChzaWQ6IHN0cmluZykgPT4geyBmb3IgKGNvbnN0IGZuIG9mIHJlZHJhd3MuZ2V0KHNpZCkgPz8gW10pIGZuKCk7IH07XG4gICAgLyoqIFRoZSBvcGVuIHBhbmVscyBvZiBhIHNlc3Npb24sIHRvIGhhbmQgcHJvZmlsZSBhbmQgc2VhcmNoIGFuc3dlcnMgdG8uICovXG4gICAgY29uc3QgcGFuZWxBbnN3ZXJzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxQYW5lbEFuc3dlcj4+KCk7XG4gICAgY29uc3Qgd29ybGRPZiA9IChzaWQ6IHN0cmluZykgPT4gbXUuc2Vzc2lvbnMubGlzdCgpLmZpbmQoKHMpID0+IHMuaWQgPT09IHNpZCk/LndvcmxkSWQgPz8gbnVsbDtcbiAgICBjb25zdCBzZWVuU3RvcmUgPSAoc2lkOiBzdHJpbmcpID0+IG11LnN0b3JhZ2Uud29ybGQod29ybGRPZihzaWQpLCB7IHN5bmM6IHRydWUgfSk7XG5cbiAgICAvKiogTmV3IHJlcXVlc3RzOiBhIGJhZGdlIHdpdGggdGhlIHBlbmRpbmcgY291bnQgb24gZXZlcnkgY2xpZW50LCBvbmUgbWVudGlvbiBwZXIgcmVxdWVzdCBvbiB0aGUgZWZmZWN0IG93bmVyLiAqL1xuICAgIGNvbnN0IGFubm91bmNlID0gKHNpZDogc3RyaW5nLCBsaXN0OiBTcGFjZWJvb2tMaXN0LCByZXBsYXk6IGJvb2xlYW4pID0+IHtcbiAgICAgIG11LnBhbmVscy5iYWRnZShJRCwgbGlzdC5wZW5kaW5nLmxlbmd0aCA/IHsgY291bnQ6IGxpc3QucGVuZGluZy5sZW5ndGggfSA6IG51bGwsIHNpZCk7XG4gICAgICBjb25zdCBzdG9yZSA9IHNlZW5TdG9yZShzaWQpO1xuICAgICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoc3RvcmUuZ2V0PHN0cmluZ1tdPihTRUVOX0tFWSwgW10pKTtcbiAgICAgIGNvbnN0IGZyZXNoID0gbGlzdC5wZW5kaW5nLmZpbHRlcigocCkgPT4gIXNlZW4uaGFzKHAua2V5KSk7XG4gICAgICBpZiAoIWZyZXNoLmxlbmd0aCkgcmV0dXJuO1xuICAgICAgc3RvcmUuc2V0KFNFRU5fS0VZLCBbLi4uc2VlbiwgLi4uZnJlc2gubWFwKChwKSA9PiBwLmtleSldLnNsaWNlKC01MDApKTtcbiAgICAgIGlmIChyZXBsYXkgfHwgIW11LmVmZmVjdHMub3duZXIoc2lkKSkgcmV0dXJuO1xuICAgICAgZm9yIChjb25zdCBwIG9mIGZyZXNoKSB2b2lkIG11Lm5vdGlmeS5tZW50aW9uKHsgc2lkLCB0aXRsZTogQ09QWS5yZXF1ZXN0VGl0bGUsIGJvZHk6IENPUFkucmVxdWVzdEJvZHkocC5uYW1lKSwga2V5OiBgc3BhY2Vib29rOiR7cC5rZXl9YCB9KTtcbiAgICB9O1xuXG4gICAgY29uc3Qgc2VuZCA9IChzaWQ6IHN0cmluZywgcGtnOiBzdHJpbmcsIGRhdGE6IHVua25vd24pID0+IHsgdm9pZCBtdS5nbWNwLnNlbmQocGtnLCBkYXRhLCBzaWQpOyB9O1xuXG4gICAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIGFza2luZyBmb3IgdGhlIGxpc3QgXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgLyoqIFBlciBzZXNzaW9uOiB0aGUgcmV0cnkgdGltZXIsIHdoZXJlIGl0IGlzIGluIHRoZSBzY2hlZHVsZSwgYW5kIGhvdyBvZnRlbiB0aGlzIHNwZWxsIHJlLWRlY2xhcmVkLiAqL1xuICAgIGNvbnN0IHdhaXRzID0gbmV3IE1hcDxzdHJpbmcsIHsgdGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbDsgc3RlcDogbnVtYmVyOyByZWRlY2xhcmVkOiBudW1iZXIgfT4oKTtcbiAgICBsZXQgbGFzdERlY2xhcmUgPSAwLCBkZWNsYXJlZCA9IDA7XG4gICAgLyoqXG4gICAgICogQSByZS1kZWNsYXJhdGlvbiAoZWFjaCBpcyBhIGxpdmUgcmVnaXN0cmF0aW9uIGtlcHQgdW50aWwgZGVhY3RpdmF0aW9uLCBzbyB0aGV5IGFyZSBjYXBwZWQpOiBhdCBtb3N0IG9uZSBwZXJcbiAgICAgKiBgbWluR2FwYCBtcyBhY3Jvc3Mgc2Vzc2lvbnMsIHtAbGluayBSRVRSWS5yZWRlY2xhcmVNYXh9IHBlciB3YWl0aW5nIHNwZWxsIGFuZCB7QGxpbmsgREVDTEFSRV9NQVh9IGluIGFsbC5cbiAgICAgKi9cbiAgICBjb25zdCByZWRlY2xhcmUgPSAodzogeyByZWRlY2xhcmVkOiBudW1iZXIgfSB8IG51bGwsIG1pbkdhcDogbnVtYmVyKSA9PiB7XG4gICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgaWYgKGRlY2xhcmVkID49IERFQ0xBUkVfTUFYIHx8IG5vdyAtIGxhc3REZWNsYXJlIDwgbWluR2FwIHx8ICh3ICYmIHcucmVkZWNsYXJlZCA+PSBSRVRSWS5yZWRlY2xhcmVNYXgpKSByZXR1cm4gZmFsc2U7XG4gICAgICBpZiAodykgdy5yZWRlY2xhcmVkKys7XG4gICAgICBkZWNsYXJlZCsrOyBsYXN0RGVjbGFyZSA9IG5vdzsgZGVjbGFyZSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbiAgICBjb25zdCBzdG9wQXNraW5nID0gKHNpZDogc3RyaW5nKSA9PiB7IGNvbnN0IHcgPSB3YWl0cy5nZXQoc2lkKTsgaWYgKHc/LnRpbWVyKSB7IGNsZWFyVGltZW91dCh3LnRpbWVyKTsgdy50aW1lciA9IG51bGw7IH0gfTtcbiAgICBjb25zdCBjb25uZWN0ZWQgPSAoc2lkOiBzdHJpbmcpID0+IG11LnNlc3Npb25zLmxpc3QoKS5maW5kKChzKSA9PiBzLmlkID09PSBzaWQpPy5zdGF0ZSA9PT0gJ2Nvbm5lY3RlZCc7XG4gICAgLyoqIEFybSB0aGUgbmV4dCBgU3BhY2Vib29rLkdldGAgZm9yIGEgY29ubmVjdGVkIHNlc3Npb24gd2l0aG91dCBhIGxpc3Q7IGEgbm8tb3Agb25jZSBhIGxpc3QgaXMgaGVsZCBvciB0aGUgbGluayBpcyBkb3duLiAqL1xuICAgIGNvbnN0IGFza0xhdGVyID0gKHNpZDogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCB3ID0gd2FpdHMuZ2V0KHNpZCk7XG4gICAgICBpZiAoIXcgfHwgbGlzdHMuaGFzKHNpZCkgfHwgIWNvbm5lY3RlZChzaWQpKSB7IHN0b3BBc2tpbmcoc2lkKTsgcmV0dXJuOyB9XG4gICAgICBpZiAody50aW1lcikgY2xlYXJUaW1lb3V0KHcudGltZXIpO1xuICAgICAgdy50aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB3LnRpbWVyID0gbnVsbDtcbiAgICAgICAgaWYgKGxpc3RzLmhhcyhzaWQpIHx8ICFjb25uZWN0ZWQoc2lkKSkgcmV0dXJuO1xuICAgICAgICAvLyBHTUNQIG5vdCB1cCB5ZXQ6IG5vdGhpbmcgdG8gc2VuZCwgY2hlY2sgYWdhaW4gYWZ0ZXIgdGhlIHNhbWUgd2FpdCB3aXRob3V0IHNwZW5kaW5nIGEgc3RlcC5cbiAgICAgICAgaWYgKCFtdS5nbWNwLm5lZ290aWF0ZWQoc2lkKSkgeyBhc2tMYXRlcihzaWQpOyByZXR1cm47IH1cbiAgICAgICAgaWYgKHcuc3RlcCA+PSBSRVRSWS5yZWRlY2xhcmVGcm9tKSByZWRlY2xhcmUodywgUkVUUlkucmVkZWNsYXJlR2FwKTtcbiAgICAgICAgc2VuZChzaWQsICdTcGFjZWJvb2suR2V0Jywge30pO1xuICAgICAgICB3LnN0ZXArKztcbiAgICAgICAgYXNrTGF0ZXIoc2lkKTtcbiAgICAgIH0sIHJldHJ5RGVsYXkody5zdGVwKSk7XG4gICAgfTtcbiAgICAvKiogU3RhcnQgdGhlIHNjaGVkdWxlIG92ZXI6IG9uIGBjb25uZWN0ZWRgLCBhbmQgd2hlbiB0aGUgaGVsZCBsaXN0IGlzIGNsZWFyZWQuICovXG4gICAgY29uc3QgYXNrRnJlc2ggPSAoc2lkOiBzdHJpbmcpID0+IHsgY29uc3QgdyA9IHdhaXRzLmdldChzaWQpOyBpZiAoIXcpIHJldHVybjsgc3RvcEFza2luZyhzaWQpOyB3LnN0ZXAgPSAwOyB3LnJlZGVjbGFyZWQgPSAwOyBhc2tMYXRlcihzaWQpOyB9O1xuICAgIC8qKiBbIFJFRlJFU0ggXSBhbmQgYGFwaS5yZWZyZXNoYDogYXNrIG5vdyBhbmQgcmUtZGVjbGFyZSAoYSBwbGF5ZXIncyBjbGljaywgc28gYSBzaG9ydCBnYXApLCB3aGF0ZXZlciB0aGUgc2NoZWR1bGUgc2F5cy4gKi9cbiAgICBjb25zdCByZWZyZXNoTm93ID0gYXN5bmMgKHNpZDogc3RyaW5nKSA9PiB7XG4gICAgICByZWRlY2xhcmUobnVsbCwgUkVUUlkucmVmcmVzaEdhcCk7XG4gICAgICByZXR1cm4gKGF3YWl0IG11LmdtY3Auc2VuZCgnU3BhY2Vib29rLkdldCcsIHt9LCBzaWQpKSA9PT0gdHJ1ZTtcbiAgICB9O1xuXG4gICAgY29uc3QgbW91bnQgPSAoaG9zdEVsOiBIVE1MRWxlbWVudCwgcGM6IFBhbmVsTW91bnRDdHgpOiBEaXNwb3NlID0+IHtcbiAgICAgIGNvbnN0IHJvb3QgPSBoKCdzZWN0aW9uJywgeyBjbGFzczogJ211LXNwYWNlYm9vaycsICdhcmlhLWxhYmVsJzogQ09QWS50aXRsZSwgJ2RhdGEtZm9jdXMtcmVnaW9uJzogSUQsIHRhYmluZGV4OiAnLTEnLCAnZGF0YS10ZXN0aWQnOiAnc3BhY2Vib29rJyB9KTtcbiAgICAgIGhvc3RFbC5hcHBlbmQocm9vdCk7XG4gICAgICBjb25zdCBzaWQgPSBwYy5zaWQ7XG4gICAgICBsZXQgcXVlcnkgPSAnJztcbiAgICAgIGxldCB0YXJnZXRzOiBEaXNwb3NlW10gPSBbXTtcbiAgICAgIC8qKiBUaGUgdmlld3Mgb3ZlciB0aGUgYm9vaywgbmV3ZXN0IGxhc3Q7IFsgQkFDSyBdIHBvcHMgb25lLiAqL1xuICAgICAgY29uc3Qgdmlld3M6IEV4Y2x1ZGU8U3BhY2Vib29rVmlldywgeyBraW5kOiAnYm9vaycgfT5bXSA9IFtdO1xuICAgICAgY29uc3QgcHVzaCA9ICh2OiBFeGNsdWRlPFNwYWNlYm9va1ZpZXcsIHsga2luZDogJ2Jvb2snIH0+KSA9PiB7IHZpZXdzLnB1c2godik7IGlmICh2aWV3cy5sZW5ndGggPiAyMCkgdmlld3Muc2hpZnQoKTsgZHJhdygpOyB9O1xuICAgICAgLyoqIEFuIGFuc3dlciBmcm9tIHRoZSBzZXJ2ZXIgZmlsbHMgdGhlIG5ld2VzdCB2aWV3IHN0aWxsIHdhaXRpbmcgZm9yIGl0LiAqL1xuICAgICAgY29uc3QgYW5zd2VyOiBQYW5lbEFuc3dlciA9IHtcbiAgICAgICAgcHJvZmlsZTogKHApID0+IHtcbiAgICAgICAgICBjb25zdCB2ID0gWy4uLnZpZXdzXS5yZXZlcnNlKCkuZmluZCgoeCk6IHggaXMgRXh0cmFjdDxTcGFjZWJvb2tWaWV3LCB7IGtpbmQ6ICdwcm9maWxlJyB9PiA9PiB4LmtpbmQgPT09ICdwcm9maWxlJyAmJiAoeC5rZXkgPyB4LmtleSA9PT0gcC5rZXkgOiAheC5wcm9maWxlKSk7XG4gICAgICAgICAgaWYgKCF2KSByZXR1cm47XG4gICAgICAgICAgdi5wcm9maWxlID0gcDsgdi5rZXkgPSBwLmtleSB8fCB2LmtleTsgaWYgKHAubmFtZSkgdi5uYW1lID0gcC5uYW1lO1xuICAgICAgICAgIGlmICh2aWV3c1t2aWV3cy5sZW5ndGggLSAxXSA9PT0gdikgZHJhdygpO1xuICAgICAgICB9LFxuICAgICAgICByZXN1bHRzOiAocikgPT4ge1xuICAgICAgICAgIGNvbnN0IHYgPSBbLi4udmlld3NdLnJldmVyc2UoKS5maW5kKCh4KTogeCBpcyBFeHRyYWN0PFNwYWNlYm9va1ZpZXcsIHsga2luZDogJ3NlYXJjaCcgfT4gPT4geC5raW5kID09PSAnc2VhcmNoJyAmJiB4LnRlcm0udG9Mb3dlckNhc2UoKSA9PT0gci50ZXJtLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICAgIGlmICghdikgcmV0dXJuO1xuICAgICAgICAgIHYucmVzdWx0cyA9IHIucmVzdWx0cztcbiAgICAgICAgICBpZiAodmlld3Nbdmlld3MubGVuZ3RoIC0gMV0gPT09IHYpIGRyYXcoKTtcbiAgICAgICAgfSxcbiAgICAgICAgb3BlbjogKHdobykgPT4gYXBpLm9wZW5Qcm9maWxlKHdobyksXG4gICAgICB9O1xuICAgICAgY29uc3QgYXBpOiBQYW5lbEhvc3QgPSB7XG4gICAgICAgIGNzcyxcbiAgICAgICAgbGlzdDogKCkgPT4gKHNpZCA/IGxpc3RzLmdldChzaWQpID8/IG51bGwgOiBudWxsKSxcbiAgICAgICAgZmlsdGVyOiAoKSA9PiAoeyBvbmxpbmU6IG11LnNldHRpbmdzLmdldDxib29sZWFuPihTRVRUSU5HUy5vbmxpbmUsIHNpZCA/IHsgc2lkIH0gOiB1bmRlZmluZWQpICE9PSBmYWxzZSwgb2ZmbGluZTogbXUuc2V0dGluZ3MuZ2V0PGJvb2xlYW4+KFNFVFRJTkdTLm9mZmxpbmUsIHNpZCA/IHsgc2lkIH0gOiB1bmRlZmluZWQpICE9PSBmYWxzZSB9KSxcbiAgICAgICAgc2V0RmlsdGVyOiAod2hpY2gsIG9uKSA9PiB7IG11LnNldHRpbmdzLnNldCh3aGljaCA9PT0gJ29ubGluZScgPyBTRVRUSU5HUy5vbmxpbmUgOiBTRVRUSU5HUy5vZmZsaW5lLCBvbiwgc2lkID8gd29ybGRPZihzaWQpIDogdW5kZWZpbmVkKTsgZHJhdygpOyB9LFxuICAgICAgICBhY2NlcHQ6IChrZXkpID0+IHsgaWYgKHNpZCkgc2VuZChzaWQsICdTcGFjZWJvb2suQWNjZXB0JywgeyBrZXkgfSk7IH0sXG4gICAgICAgIGFkZDogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGlmICghc2lkKSByZXR1cm47XG4gICAgICAgICAgY29uc3QgbmFtZSA9IGF3YWl0IG11LnVpLnByb21wdCh7IHRpdGxlOiBDT1BZLmFkZFRpdGxlLCBsYWJlbDogQ09QWS5hZGRMYWJlbCwgcGxhY2Vob2xkZXI6IENPUFkuYWRkUGxhY2Vob2xkZXIgfSk7XG4gICAgICAgICAgaWYgKG5hbWU/LnRyaW0oKSkgc2VuZChzaWQsICdTcGFjZWJvb2suQWRkJywgeyBuYW1lOiBuYW1lLnRyaW0oKSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgZWRpdEJsdXJiOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgaWYgKCFzaWQpIHJldHVybjtcbiAgICAgICAgICBjb25zdCBjdXIgPSBsaXN0cy5nZXQoc2lkKT8uc2VsZi5ibHVyYiA/PyAnJztcbiAgICAgICAgICBjb25zdCB2ID0gYXdhaXQgbXUudWkucHJvbXB0KHsgdGl0bGU6IENPUFkuYmx1cmJUaXRsZSwgbGFiZWw6IENPUFkuYmx1cmJMYWJlbChCTFVSQl9NQVgpLCB2YWx1ZTogY3VyLCB2YWxpZGF0ZTogKHMpID0+IChbLi4ucy50cmltKCldLmxlbmd0aCA+IEJMVVJCX01BWCA/IENPUFkuYmx1cmJUb29Mb25nKEJMVVJCX01BWCkgOiBudWxsKSB9KTtcbiAgICAgICAgICBpZiAodiAhPT0gbnVsbCAmJiBjbGFtcEJsdXJiKHYpICE9PSBjdXIpIHNlbmQoc2lkLCAnU3BhY2Vib29rLlNldEJsdXJiJywgeyBibHVyYjogY2xhbXBCbHVyYih2KSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0UHVibGljOiAob24pID0+IHsgaWYgKHNpZCkgc2VuZChzaWQsICdTcGFjZWJvb2suU2V0UHVibGljJywgeyBwdWJsaWM6IG9uIH0pOyB9LFxuICAgICAgICBzZWFyY2hQcm9maWxlczogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGlmICghc2lkKSByZXR1cm47XG4gICAgICAgICAgY29uc3QgdGVybSA9IGF3YWl0IG11LnVpLnByb21wdCh7IHRpdGxlOiBDT1BZLnNlYXJjaFRpdGxlLCBsYWJlbDogQ09QWS5zZWFyY2hMYWJlbCB9KTtcbiAgICAgICAgICBpZiAodGVybT8udHJpbSgpKSB7IHB1c2goeyBraW5kOiAnc2VhcmNoJywgdGVybTogdGVybS50cmltKCksIHJlc3VsdHM6IG51bGwgfSk7IHNlbmQoc2lkLCAnU3BhY2Vib29rLlNlYXJjaCcsIHsgdGVybTogdGVybS50cmltKCkgfSk7IH1cbiAgICAgICAgfSxcbiAgICAgICAgc2V0U2hhcmVGcmllbmRzOiAob24pID0+IHsgaWYgKHNpZCkgc2VuZChzaWQsICdTcGFjZWJvb2suU2V0U2hhcmVGcmllbmRzJywgeyBzaGFyZTogb24gfSk7IH0sXG4gICAgICAgIHJlZnJlc2g6ICgpID0+IHsgaWYgKHNpZCkgdm9pZCByZWZyZXNoTm93KHNpZCk7IH0sXG4gICAgICAgIG9wZW5Qcm9maWxlOiAod2hvKSA9PiB7XG4gICAgICAgICAgaWYgKCFzaWQgfHwgKCF3aG8ua2V5ICYmICF3aG8ubmFtZSkpIHJldHVybjtcbiAgICAgICAgICBwdXNoKHsga2luZDogJ3Byb2ZpbGUnLCBrZXk6IHdoby5rZXkgPz8gJycsIG5hbWU6IHdoby5uYW1lID8/ICcnLCBwcm9maWxlOiBudWxsIH0pO1xuICAgICAgICAgIHNlbmQoc2lkLCAnU3BhY2Vib29rLkdldFByb2ZpbGUnLCB3aG8ua2V5ID8geyBrZXk6IHdoby5rZXkgfSA6IHsgbmFtZTogd2hvLm5hbWUgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGJhY2s6ICgpID0+IHsgdmlld3MucG9wKCk7IGRyYXcoKTsgfSxcbiAgICAgICAgYWRkQnVkZHk6IChuYW1lKSA9PiB7IGlmIChzaWQpIHNlbmQoc2lkLCAnU3BhY2Vib29rLkFkZCcsIHsgbmFtZSB9KTsgfSxcbiAgICAgICAgcGFnZTogKG5hbWUpID0+IHsgbXUuaW5wdXQuZmlsbChDT1BZLmNtZFBhZ2UobmFtZSksIHsgc2lkOiBzaWQgPz8gdW5kZWZpbmVkIH0pOyBtdS5pbnB1dC5mb2N1cyhzaWQgPz8gdW5kZWZpbmVkKTsgfSxcbiAgICAgICAgdGFyZ2V0OiAoZWwsIGJ1ZGR5KSA9PiAoc2lkID8gbXUubWVudXMudGFyZ2V0KGVsLCB7IGtpbmQ6IEtJTkQsIHNpZCwgZGF0YTogeyBidWRkeSB9IH0gYXMgUGFyYW1ldGVyczxNdVsnbWVudXMnXVsndGFyZ2V0J10+WzFdKSA6ICgpID0+IHt9KSxcbiAgICAgICAgb3Blbk1lbnU6IChlbCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHIgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICBlbC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjb250ZXh0bWVudScsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSwgY2xpZW50WDogci5sZWZ0ICsgMTIsIGNsaWVudFk6IHIudG9wICsgMTIgfSkpO1xuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGNvbnN0IGRyYXcgPSAoKSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgZCBvZiB0YXJnZXRzKSBkKCk7XG4gICAgICAgIHRhcmdldHMgPSBbXTtcbiAgICAgICAgY29uc3QgdmlldyA9IHZpZXdzW3ZpZXdzLmxlbmd0aCAtIDFdO1xuICAgICAgICBpZiAodmlldykge1xuICAgICAgICAgIGNvbnN0IG91dCA9IHZpZXcua2luZCA9PT0gJ3Byb2ZpbGUnID8gcmVuZGVyUHJvZmlsZShhcGksIHZpZXcpIDogcmVuZGVyUmVzdWx0cyhhcGksIHZpZXcpO1xuICAgICAgICAgIHJvb3QucmVwbGFjZUNoaWxkcmVuKG91dC5iYXIsIGgoJ2RpdicsIHsgY2xhc3M6ICdzY3JvbGwnIH0sIC4uLm91dC5ib2R5KSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRvcCA9IHJvb3QucXVlcnlTZWxlY3RvcignLnNjcm9sbCcpPy5zY3JvbGxUb3AgPz8gMDtcbiAgICAgICAgY29uc3Qgb3V0ID0gcmVuZGVyUGFuZWwoYXBpLCBxdWVyeSk7XG4gICAgICAgIHRhcmdldHMgPSBvdXQudGFyZ2V0cztcbiAgICAgICAgY29uc3QgaW5wdXQgPSBvdXQuYmFyLnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oJ2lucHV0W25hbWU9cXVlcnldJyk7XG4gICAgICAgIGlucHV0Py5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHsgcXVlcnkgPSBpbnB1dC52YWx1ZTsgZHJhd0JvZHkoKTsgfSk7XG4gICAgICAgIGNvbnN0IHNjcm9sbCA9IGgoJ2RpdicsIHsgY2xhc3M6ICdzY3JvbGwnIH0sIC4uLm91dC5ib2R5KTtcbiAgICAgICAgcm9vdC5yZXBsYWNlQ2hpbGRyZW4ob3V0LmJhciwgLi4uKG91dC5ub3RlID8gW291dC5ub3RlXSA6IFtdKSwgc2Nyb2xsLCAuLi4ob3V0LmZvb3QgPyBbb3V0LmZvb3RdIDogW10pKTtcbiAgICAgICAgc2Nyb2xsLnNjcm9sbFRvcCA9IHRvcDtcbiAgICAgIH07XG4gICAgICAvKiogQSBrZXlzdHJva2UgaW4gdGhlIHNlYXJjaCByZWRyYXdzIHRoZSBsaXN0IG9ubHksIHNvIHRoZSBmaWVsZCBrZWVwcyBmb2N1cyBhbmQgaXRzIGNhcmV0LiAqL1xuICAgICAgY29uc3QgZHJhd0JvZHkgPSAoKSA9PiB7XG4gICAgICAgIGlmICh2aWV3cy5sZW5ndGgpIHJldHVybjtcbiAgICAgICAgZm9yIChjb25zdCBkIG9mIHRhcmdldHMpIGQoKTtcbiAgICAgICAgY29uc3Qgb3V0ID0gcmVuZGVyUGFuZWwoYXBpLCBxdWVyeSk7XG4gICAgICAgIHRhcmdldHMgPSBvdXQudGFyZ2V0cztcbiAgICAgICAgY29uc3Qgc2Nyb2xsID0gcm9vdC5xdWVyeVNlbGVjdG9yKCcuc2Nyb2xsJyk7XG4gICAgICAgIHNjcm9sbD8ucmVwbGFjZUNoaWxkcmVuKC4uLm91dC5ib2R5KTtcbiAgICAgICAgY29uc3Qgbm90ZSA9IHJvb3QucXVlcnlTZWxlY3RvcignLm5vdGUnKTtcbiAgICAgICAgaWYgKG91dC5ub3RlKSB7IGlmIChub3RlKSBub3RlLnJlcGxhY2VXaXRoKG91dC5ub3RlKTsgZWxzZSBzY3JvbGw/LmJlZm9yZShvdXQubm90ZSk7IH0gZWxzZSBub3RlPy5yZW1vdmUoKTtcbiAgICAgICAgY29uc3QgZm9vdCA9IHJvb3QucXVlcnlTZWxlY3RvcignLmZvb3QnKTtcbiAgICAgICAgaWYgKG91dC5mb290KSB7IGlmIChmb290KSBmb290LnJlcGxhY2VXaXRoKG91dC5mb290KTsgZWxzZSByb290LmFwcGVuZChvdXQuZm9vdCk7IH0gZWxzZSBmb290Py5yZW1vdmUoKTtcbiAgICAgIH07XG4gICAgICBkcmF3KCk7XG4gICAgICBjb25zdCBzZXQgPSBzaWQgPyAocmVkcmF3cy5nZXQoc2lkKSA/PyByZWRyYXdzLnNldChzaWQsIG5ldyBTZXQoKSkuZ2V0KHNpZCkhKSA6IG51bGw7XG4gICAgICBzZXQ/LmFkZChkcmF3KTtcbiAgICAgIGNvbnN0IGFuc3dlcnMgPSBzaWQgPyAocGFuZWxBbnN3ZXJzLmdldChzaWQpID8/IHBhbmVsQW5zd2Vycy5zZXQoc2lkLCBuZXcgU2V0KCkpLmdldChzaWQpISkgOiBudWxsO1xuICAgICAgYW5zd2Vycz8uYWRkKGFuc3dlcik7XG4gICAgICByZXR1cm4gKCkgPT4geyBzZXQ/LmRlbGV0ZShkcmF3KTsgYW5zd2Vycz8uZGVsZXRlKGFuc3dlcik7IGZvciAoY29uc3QgZCBvZiB0YXJnZXRzKSBkKCk7IHRhcmdldHMgPSBbXTsgcm9vdC5yZW1vdmUoKTsgfTtcbiAgICB9O1xuXG4gICAgbXUucGFuZWxzLnJlZ2lzdGVyKHtcbiAgICAgIGlkOiBJRCwgdGl0bGU6IENPUFkudGl0bGUsIHNpbmdsZXRvbjogdHJ1ZSwgZGVmYXVsdFBvc2l0aW9uOiAncmlnaHQtYm90dG9tJywgb3JkZXI6IDQwLCBzaG93OiAnYXV0bycsIG1vdW50LFxuICAgICAgLy8gSG90IHJlbG9hZDogdGhlIHNlYXJjaCB0ZXh0IHN1cnZpdmVzIGEgcmVidWlsZC5cbiAgICAgIHNuYXBzaG90OiAoZWwpID0+IGVsLnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oJ2lucHV0W25hbWU9cXVlcnldJyk/LnZhbHVlIHx8IHVuZGVmaW5lZCxcbiAgICAgIHJlc3RvcmU6IChlbCwgc2F2ZWQpID0+IHtcbiAgICAgICAgY29uc3QgaW5wID0gZWwucXVlcnlTZWxlY3RvcjxIVE1MSW5wdXRFbGVtZW50PignaW5wdXRbbmFtZT1xdWVyeV0nKTtcbiAgICAgICAgaWYgKGlucCAmJiB0eXBlb2Ygc2F2ZWQgPT09ICdzdHJpbmcnICYmIHNhdmVkKSB7IGlucC52YWx1ZSA9IHNhdmVkOyBpbnAuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTsgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFmdGVyIHRoZSBwYW5lbCBpcyByZWdpc3RlcmVkOiB3aXRoIG9uR21jcCBhY3RpdmF0aW9uIHRoZSBmaXJzdCBsaXN0IGlzIGFscmVhZHkgaW4gdGhlIHNlc3Npb24ncyBzdGF0ZSBhbmQgdGhlXG4gICAgLy8gd2F0Y2ggcmVwbGF5cyBpdCBhdCBvbmNlLCBiYWRnZSBhbmQgdG91Y2ggaW5jbHVkZWQuXG4gICAgY3R4LnN1YnNjcmlwdGlvbnMucHVzaChtdS5zZXNzaW9ucy5lYWNoKChzKSA9PiB7XG4gICAgICBsZXQgdG91Y2hlZCA9IGZhbHNlO1xuICAgICAgd2FpdHMuc2V0KHMuaWQsIHsgdGltZXI6IG51bGwsIHN0ZXA6IDAsIHJlZGVjbGFyZWQ6IDAgfSk7XG4gICAgICBjb25zdCBvZmYgPSBtdS5nbWNwLndhdGNoKFBLRywgKGRhdGEsIG0pID0+IHtcbiAgICAgICAgY29uc3QgbGlzdCA9IGxpc3RPZihkYXRhKTtcbiAgICAgICAgLy8gQSBNVUQgcmVjb25uZWN0IGNsZWFycyB0aGUgR01DUCBzdGF0ZTogdGhlIGxpc3QgZ29lcyBhbmQgdGhlIGFza2luZyBzdGFydHMgb3Zlci5cbiAgICAgICAgaWYgKCFsaXN0KSB7IGlmIChkYXRhID09PSB1bmRlZmluZWQpIHsgbGlzdHMuZGVsZXRlKHMuaWQpOyByZWRyYXcocy5pZCk7IGFza0ZyZXNoKHMuaWQpOyB9IHJldHVybjsgfVxuICAgICAgICBsaXN0cy5zZXQocy5pZCwgbGlzdCk7XG4gICAgICAgIHN0b3BBc2tpbmcocy5pZCk7XG4gICAgICAgIGlmICghdG91Y2hlZCkgeyB0b3VjaGVkID0gdHJ1ZTsgbXUucGFuZWxzLnRvdWNoKElELCBzLmlkKTsgfVxuICAgICAgICBhbm5vdW5jZShzLmlkLCBsaXN0LCAhIW0ucmVwbGF5KTtcbiAgICAgICAgcmVkcmF3KHMuaWQpO1xuICAgICAgfSwgeyBzaWQ6IHMuaWQgfSk7XG4gICAgICAvLyBUaGUgbGluazogYGNvbm5lY3RlZGAgc3RhcnRzIHRoZSBzY2hlZHVsZSBvdmVyIChhIGZyZXNoIGNvbm5lY3Rpb24gaGFzIG5vIGRlY2xhcmF0aW9ucyBhbmQgbm8gcHVzaCB5ZXQpOyBhbnl0aGluZyBlbHNlIHN0b3BzIGl0LlxuICAgICAgY29uc3Qgb2ZmUyA9IG11LnNlc3Npb25zLm9uKCdzdGF0ZScsIChyZWYpID0+IHsgaWYgKHJlZi5zdGF0ZSA9PT0gJ2Nvbm5lY3RlZCcpIGFza0ZyZXNoKHMuaWQpOyBlbHNlIHN0b3BBc2tpbmcocy5pZCk7IH0sIHsgc2lkOiBzLmlkIH0pO1xuICAgICAgLy8gQWxyZWFkeSBjb25uZWN0ZWQgd2l0aCBubyBsaXN0ICh0aGUgY29tbW9uIGNhc2UgcmlnaHQgYWZ0ZXIgYWN0aXZhdGlvbik6IHN0YXJ0IGFza2luZy5cbiAgICAgIGFza0xhdGVyKHMuaWQpO1xuICAgICAgLy8gQW5zd2Vycywgbm90IHN0YXRlOiBvbmx5IGZyZXNoIG9uZXMgKGEgcmVwbGF5ZWQgcHJvZmlsZSBiZWxvbmdzIHRvIGFuIGVhcmxpZXIgcGFuZWwpLlxuICAgICAgY29uc3Qgb2ZmUCA9IG11LmdtY3Aub24oJ1NwYWNlYm9vay5Qcm9maWxlJywgKGRhdGEsIG0pID0+IHsgY29uc3QgcCA9IHByb2ZpbGVPZihkYXRhKTsgaWYgKHAgJiYgIW0ucmVwbGF5KSBmb3IgKGNvbnN0IGEgb2YgcGFuZWxBbnN3ZXJzLmdldChzLmlkKSA/PyBbXSkgYS5wcm9maWxlKHApOyB9LCB7IHNpZDogcy5pZCB9KTtcbiAgICAgIGNvbnN0IG9mZlIgPSBtdS5nbWNwLm9uKCdTcGFjZWJvb2suUmVzdWx0cycsIChkYXRhLCBtKSA9PiB7IGNvbnN0IHIgPSByZXN1bHRzT2YoZGF0YSk7IGlmIChyICYmICFtLnJlcGxheSkgZm9yIChjb25zdCBhIG9mIHBhbmVsQW5zd2Vycy5nZXQocy5pZCkgPz8gW10pIGEucmVzdWx0cyhyKTsgfSwgeyBzaWQ6IHMuaWQgfSk7XG4gICAgICBjb25zdCBhID0gbXUuc2V0dGluZ3Mud2F0Y2goU0VUVElOR1Mub25saW5lLCAoKSA9PiByZWRyYXcocy5pZCksIHsgc2lkOiBzLmlkIH0pO1xuICAgICAgY29uc3QgYiA9IG11LnNldHRpbmdzLndhdGNoKFNFVFRJTkdTLm9mZmxpbmUsICgpID0+IHJlZHJhdyhzLmlkKSwgeyBzaWQ6IHMuaWQgfSk7XG4gICAgICByZXR1cm4gKCkgPT4geyBzdG9wQXNraW5nKHMuaWQpOyB3YWl0cy5kZWxldGUocy5pZCk7IG9mZigpOyBvZmZTKCk7IG9mZlAoKTsgb2ZmUigpOyBhKCk7IGIoKTsgbGlzdHMuZGVsZXRlKHMuaWQpOyByZWRyYXdzLmRlbGV0ZShzLmlkKTsgcGFuZWxBbnN3ZXJzLmRlbGV0ZShzLmlkKTsgfTtcbiAgICB9KSk7XG4gICAgLy8gRGVhY3RpdmF0aW9uOiB0aGUgYGVhY2hgIGRpc3Bvc2UgYWJvdmUgcnVucyBwZXIgc2Vzc2lvbiwgYW5kIHRoaXMgY2xlYXJzIGFueSB0aW1lciBsZWZ0IHNob3VsZCBpdCBub3QuXG4gICAgY3R4LnN1YnNjcmlwdGlvbnMucHVzaCgoKSA9PiB7IGZvciAoY29uc3Qgc2lkIG9mIFsuLi53YWl0cy5rZXlzKCldKSBzdG9wQXNraW5nKHNpZCk7IHdhaXRzLmNsZWFyKCk7IH0pO1xuXG4gICAgY29uc3QgYXBpOiBTcGFjZWJvb2tBcGkgPSB7XG4gICAgICBsaXN0OiAoc2lkKSA9PiB7IGNvbnN0IHMgPSBzaWQgPz8gbXUuc2Vzc2lvbnMuYWN0aXZlKCk/LmlkOyBjb25zdCBsID0gcyA/IGxpc3RzLmdldChzKSA6IHVuZGVmaW5lZDsgcmV0dXJuIGwgPyBzdHJ1Y3R1cmVkQ2xvbmUobCkgOiBudWxsOyB9LFxuICAgICAgcmVmcmVzaDogYXN5bmMgKHNpZCkgPT4geyBjb25zdCBzID0gc2lkID8/IG11LnNlc3Npb25zLmFjdGl2ZSgpPy5pZDsgcmV0dXJuIHMgPyByZWZyZXNoTm93KHMpIDogZmFsc2U7IH0sXG4gICAgICBvcGVuUHJvZmlsZTogKHdobywgc2lkKSA9PiB7XG4gICAgICAgIGNvbnN0IHMgPSBzaWQgPz8gbXUuc2Vzc2lvbnMuYWN0aXZlKCk/LmlkO1xuICAgICAgICBpZiAoIXMpIHJldHVybjtcbiAgICAgICAgY29uc3Qgb3BlbiA9IFsuLi4ocGFuZWxBbnN3ZXJzLmdldChzKSA/PyBbXSldO1xuICAgICAgICBpZiAob3Blbi5sZW5ndGgpIG9wZW5bMF0hLm9wZW4od2hvKTtcbiAgICAgICAgZWxzZSB7IG11LnBhbmVscy5vcGVuKElELCB1bmRlZmluZWQsIHsgc2lkOiBzIH0pOyBxdWV1ZU1pY3JvdGFzaygoKSA9PiBbLi4uKHBhbmVsQW5zd2Vycy5nZXQocykgPz8gW10pXVswXT8ub3Blbih3aG8pKTsgfVxuICAgICAgfSxcbiAgICB9O1xuICAgIHJldHVybiBhcGk7XG4gIH0sXG59KTtcbiIsICIvKiogRXZlcnkgdmlzaWJsZSBzdHJpbmcuIFNlbnRlbmNlIGNhc2UgaGVyZTsgdXBwZXJjYXNlIGNvbWVzIGZyb20gQ1NTIGB0ZXh0LXRyYW5zZm9ybWAuICovXG5leHBvcnQgY29uc3QgQ09QWSA9IHtcbiAgdGl0bGU6ICdTcGFjZWJvb2snLFxuICAvLyBiYXJcbiAgb25saW5lOiAnT25saW5lJyxcbiAgb2ZmbGluZTogJ09mZmxpbmUnLFxuICBzZWFyY2g6ICdTZWFyY2ggYnVkZGllcycsXG4gIGFkZDogJ0FkZCcsXG4gIC8vIHNlY3Rpb25zXG4gIHBlbmRpbmc6ICdQZW5kaW5nJyxcbiAgYnVkZGllczogJ0J1ZGRpZXMnLFxuICB3YW50czogJ3dhbnRzIHRvIGJlIGJ1ZGRpZXMnLFxuICBhY2NlcHQ6ICdBY2NlcHQnLFxuICAvLyByb3dcbiAgbm9CbHVyYjogJ05vIGJsdXJiJyxcbiAgcG9ydHJhaXQ6ICdQb3J0cmFpdCcsXG4gIHN0YXR1czogeyBvbmxpbmU6ICdvbmxpbmUnLCBvZmZsaW5lOiAnb2ZmbGluZScsIGRlY2Vhc2VkOiAnZGVjZWFzZWQnLCB1bmtub3duOiAndW5rbm93bicgfSBhcyBjb25zdCxcbiAgbWVudTogJ1JvdyBtZW51JyxcbiAgLy8gZW1wdHkgc3RhdGVzXG4gIGF3YWl0aW5nOiAnV2FpdGluZyBmb3IgU3BhY2Vib29rJyxcbiAgbm9CdWRkaWVzOiAnTm8gYnVkZGllcyB5ZXQnLFxuICBub01hdGNoOiAnTm8gYnVkZHkgbWF0Y2hlcycsXG4gIC8qKiBUaGUgbGFiZWwgbGluZSBvdmVyIHRoZSBzZXJ2ZXIncyBgZXJyb3JgIHRleHQgKGtlcHQgdmVyYmF0aW0gdW5kZXIgaXQpLiAqL1xuICBub1NpZ25hbDogJ05vIHNpZ25hbCcsXG4gIC8vIHRoZSBiYXJcbiAgcmVmcmVzaDogJ1JlZnJlc2gnLFxuICAvKiogVGhlIGRpbSBub3RlIHVuZGVyIHRoZSBiYXIgd2hlbiB0aGUgbGlzdCBpcyB0aGUgcGFkJ3MgbGFzdCBzeW5jOiBcIkNBQ0hFRCBcdTAwQjcgMTIgbWluIGFnb1wiLiAqL1xuICBjYWNoZWQ6IChhZ286IHN0cmluZykgPT4gYENhY2hlZCBcdTAwQjcgJHthZ299YCxcbiAgLyoqIEEgcmVsYXRpdmUgdGltZSwgdGVyc2U6IFwianVzdCBub3dcIiwgXCI0NSBzIGFnb1wiLCBcIjEyIG1pbiBhZ29cIiwgXCIzIGggYWdvXCIsIFwiMiBkIGFnb1wiLiAqL1xuICBhZ286IHsgbm93OiAnanVzdCBub3cnLCBzOiAobjogbnVtYmVyKSA9PiBgJHtufSBzIGFnb2AsIG1pbjogKG46IG51bWJlcikgPT4gYCR7bn0gbWluIGFnb2AsIGg6IChuOiBudW1iZXIpID0+IGAke259IGggYWdvYCwgZDogKG46IG51bWJlcikgPT4gYCR7bn0gZCBhZ29gIH0sXG4gIC8vIGZvb3RcbiAgeW91OiAnWW91JyxcbiAgaXNQdWJsaWM6ICdQdWJsaWMnLFxuICBpc1ByaXZhdGU6ICdQcml2YXRlJyxcbiAgZWRpdEJsdXJiOiAnRWRpdCBibHVyYicsXG4gIGdvUHJpdmF0ZTogJ0dvIHByaXZhdGUnLFxuICBnb1B1YmxpYzogJ0dvIHB1YmxpYycsXG4gIHNlYXJjaFByb2ZpbGVzOiAnU2VhcmNoIHByb2ZpbGVzJyxcbiAgZnJpZW5kc1NoYXJlZDogJ0ZyaWVuZHMgc2hhcmVkJyxcbiAgZnJpZW5kc0hpZGRlbjogJ0ZyaWVuZHMgaGlkZGVuJyxcbiAgaGlkZUZyaWVuZHM6ICdIaWRlIGZyaWVuZHMnLFxuICBzaGFyZUZyaWVuZHM6ICdTaGFyZSBmcmllbmRzJyxcbiAgLy8gcHJvZmlsZSBhbmQgc2VhcmNoIHZpZXdzXG4gIGJhY2s6ICdCYWNrJyxcbiAgb3BlblByb2ZpbGU6ICdPcGVuIHByb2ZpbGUnLFxuICBsb2FkaW5nOiAnTG9hZGluZycsXG4gIGZyaWVuZHM6ICdGcmllbmRzJyxcbiAgaW50cm9kdWNlczogJ0NhbiBpbnRyb2R1Y2UgeW91IHRvJyxcbiAgbm9GcmllbmRzOiAnTm8gZnJpZW5kcyB0byBzaG93JyxcbiAgbm9JbnRyb2R1Y3Rpb25zOiAnTm9ib2R5IHRoZXkgY291bGQgaW50cm9kdWNlIHlvdSB0bycsXG4gIHJlc3VsdHM6ICdSZXN1bHRzJyxcbiAgbm9SZXN1bHRzOiAnTm8gcHVibGljIHByb2ZpbGVzIG1hdGNoJyxcbiAgYWRkQnVkZHk6ICdBZGQgYnVkZHknLFxuICBpc0J1ZGR5OiAnQnVkZHknLFxuICBpc1lvdTogJ1lvdScsXG4gIHByaXZhdGVQcm9maWxlOiAnUHJpdmF0ZSBwcm9maWxlJyxcbiAgc2VhcmNoSGVhZDogKHRlcm06IHN0cmluZykgPT4gYFNlYXJjaDogJHt0ZXJtfWAsXG4gIC8vIHByb21wdHNcbiAgYWRkVGl0bGU6ICdBZGQgYSBidWRkeScsXG4gIGFkZExhYmVsOiAnVGhlaXIgbmFtZScsXG4gIGFkZFBsYWNlaG9sZGVyOiAnbmFtZScsXG4gIGJsdXJiVGl0bGU6ICdZb3VyIGJsdXJiJyxcbiAgYmx1cmJMYWJlbDogKG1heDogbnVtYmVyKSA9PiBgVXAgdG8gJHttYXh9IGNoYXJhY3RlcnNgLFxuICBibHVyYlRvb0xvbmc6IChtYXg6IG51bWJlcikgPT4gYGF0IG1vc3QgJHttYXh9IGNoYXJhY3RlcnNgLFxuICBzZWFyY2hUaXRsZTogJ1NlYXJjaCBwcm9maWxlcycsXG4gIHNlYXJjaExhYmVsOiAnQSB3b3JkIGZyb20gYSBuYW1lLCBsaW5lIG9mIHdvcmsgb3IgYmx1cmInLFxuICByZW1vdmVUaXRsZTogKG5hbWU6IHN0cmluZykgPT4gYFJlbW92ZSAke25hbWV9P2AsXG4gIHJlbW92ZUJvZHk6ICdUaGV5IGFyZSB0b2xkIG5vdGhpbmc7IHRoZXkgY2FuIGFzayBhZ2Fpbi4nLFxuICByZW1vdmVDb25maXJtOiAnUmVtb3ZlJyxcbiAgLy8gY29udGV4dCBtZW51XG4gIGJ1ZGR5S2luZDogJ0J1ZGR5JyxcbiAgcGFnZTogJ1BhZ2UnLFxuICB2aWV3UHJvZmlsZTogJ1ZpZXcgcHJvZmlsZScsXG4gIHJlbW92ZTogJ1JlbW92ZSBidWRkeScsXG4gIC8vIG5vdGlmaWNhdGlvbnNcbiAgcmVxdWVzdFRpdGxlOiAnU3BhY2Vib29rJyxcbiAgcmVxdWVzdEJvZHk6IChuYW1lOiBzdHJpbmcpID0+IGAke25hbWV9IHdhbnRzIHRvIGJlIGJ1ZGRpZXNgLFxuICAvLyBzZXR0aW5nc1xuICBzZXR0aW5nc1RpdGxlOiAnU3BhY2Vib29rJyxcbiAgc2V0dGluZ09ubGluZTogJ1Nob3cgYnVkZGllcyB3aG8gYXJlIG9ubGluZScsXG4gIHNldHRpbmdPZmZsaW5lOiAnU2hvdyBidWRkaWVzIHdobyBhcmUgb2ZmbGluZScsXG4gIHNldHRpbmdPZmZsaW5lSGludDogJ0RlY2Vhc2VkIGFuZCB1bmtub3duIGNvdW50IGFzIG9mZmxpbmUuJyxcbiAgLy8gY29tbWFuZHMgc2VudCBhcyB0ZXh0XG4gIGNtZFBhZ2U6IChuYW1lOiBzdHJpbmcpID0+IGBwYWdlICR7bmFtZX0gYCxcbn07XG4iLCAiLyoqXG4gKiBUaGUgU3BhY2Vib29rIGNvbnRyYWN0IChUb3JjaHNoaXAsIEdNQ1AgcGFja2FnZSBgU3BhY2Vib29rIDFgKSBhbmQgdGhlIGV4dGVuc2lvbidzIGV4cG9ydGVkIEFQSS5cbiAqIFRoZSBwYXlsb2FkIHNjaGVtYXMgaW4gYHNjaGVtYS9gIGFuZCB0aGUgUkVBRE1FJ3MgdGFibGUgZGVzY3JpYmUgdGhlIHNhbWUgc2hhcGVzOyBjaGFuZ2UgdGhlbSB0b2dldGhlci5cbiAqL1xuXG4vKiogQSBidWRkeSdzIG9yIGEgcmVxdWVzdGVyJ3MgcHJlc2VuY2UgYXMgdGhlIHNlcnZlciByZXBvcnRzIGl0LiBBbnl0aGluZyBlbHNlIGlzIHRyZWF0ZWQgYXMgYHVua25vd25gLiAqL1xuZXhwb3J0IHR5cGUgU3BhY2Vib29rU3RhdHVzID0gJ29ubGluZScgfCAnb2ZmbGluZScgfCAnZGVjZWFzZWQnIHwgJ3Vua25vd24nO1xuXG4vKiogT25lIGVudHJ5IG9mIGBwZW5kaW5nYCBvciBgYnVkZGllc2AgaW4gYFNwYWNlYm9vay5MaXN0YC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU3BhY2Vib29rUmVjb3JkIHtcbiAgLyoqIE9wYXF1ZSwgZS5nLiBgXCIyOTojMDAwRDU1LTlDQjZEMkY4ODE6TTM1QTVVMHU0U0Y2XCJgOyB3aGF0IGBBY2NlcHRgLCBgQWRkYCBhbmQgYFJlbW92ZWAgdGFrZS4gKi9cbiAga2V5OiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgc3RhdHVzOiBTcGFjZWJvb2tTdGF0dXM7XG4gIC8qKiBUaGUgYWNxdWFpbnRhbmNlIHdvcmQgKFwiZnJpZW5kXCIsIFwicml2YWxcIlx1MjAyNik7ICcnIHdoZW4gdGhlIHNlcnZlciBzZW5kcyBub25lLiAqL1xuICBhY3F1YWludGFuY2U6IHN0cmluZztcbiAgbG9jYXRpb246IHN0cmluZztcbiAgYmx1cmI6IHN0cmluZztcbiAgLyoqIGBcInBsYWNlaG9sZGVyXCJgIChpbml0aWFscyBhcmUgZHJhd24pIG9yIGFuIGltYWdlIFVSTC4gKi9cbiAgcG9ydHJhaXQ6IHN0cmluZztcbiAgLyoqIFRoZWlyIGxpbmUgb2Ygd29yayAoXCJmZW5jZVwiLCBcImxpYnJhcmlhblwiKTsgJycgZm9yIG1vc3QgcGxheWVycy4gKi9cbiAgcm9sZTogc3RyaW5nO1xuICAvKiogV2hldGhlciB0aGV5IGxldCB0aGVpciBidWRkaWVzIHNlZSB3aG8gdGhleSBhcmUgZnJpZW5kcyB3aXRoLiAqL1xuICBzaGFyZXNfZnJpZW5kczogYm9vbGVhbjtcbn1cblxuLyoqIGBzZWxmYCBpbiBgU3BhY2Vib29rLkxpc3RgLiAqL1xuZXhwb3J0IGludGVyZmFjZSBTcGFjZWJvb2tTZWxmIHtcbiAgbmFtZTogc3RyaW5nO1xuICBibHVyYjogc3RyaW5nO1xuICBwdWJsaWM6IGJvb2xlYW47XG4gIC8qKiBXaGV0aGVyIHlvdXIgYnVkZGllcyBjYW4gc2VlIHlvdXIgZnJpZW5kcyAob24gdW5sZXNzIHlvdSB0dXJuZWQgaXQgb2ZmKS4gKi9cbiAgc2hhcmVfZnJpZW5kczogYm9vbGVhbjtcbiAgcG9ydHJhaXQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBTb21lb25lIGFzIHRoZSBzZXJ2ZXIgbGV0cyB0aGUgdmlld2VyIHNlZSB0aGVtOiBhIGZyaWVuZCBpbiBhIHByb2ZpbGUsIGEgc2VhcmNoIHJlc3VsdCwgdGhlIGhlYWQgb2YgYSBwcm9maWxlLlxuICogYGJsdXJiYCBpcyAnJyB1bmxlc3MgYHZpZXdhYmxlYDsgYGxvY2F0aW9uYCBpcyAnJyB1bmxlc3MgYGJ1ZGR5YC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTcGFjZWJvb2tDYXJkIHtcbiAga2V5OiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgcm9sZTogc3RyaW5nO1xuICBzdGF0dXM6IFNwYWNlYm9va1N0YXR1cztcbiAgcG9ydHJhaXQ6IHN0cmluZztcbiAgYWNxdWFpbnRhbmNlOiBzdHJpbmc7XG4gIC8qKiBPbmUgb2YgdGhlIHZpZXdlcidzIGJ1ZGRpZXMuICovXG4gIGJ1ZGR5OiBib29sZWFuO1xuICAvKiogVGhlIHZpZXdlciBtYXkgb3BlbiB0aGVpciBwcm9maWxlIChgU3BhY2Vib29rLkdldFByb2ZpbGVgKTogcHVibGljLCBhIGJ1ZGR5LCBvciB0aGUgdmlld2VyLiAqL1xuICB2aWV3YWJsZTogYm9vbGVhbjtcbiAgYmx1cmI6IHN0cmluZztcbiAgbG9jYXRpb246IHN0cmluZztcbn1cblxuLyoqIGBTcGFjZWJvb2suUHJvZmlsZWAsIHRoZSBhbnN3ZXIgdG8gYFNwYWNlYm9vay5HZXRQcm9maWxlYC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU3BhY2Vib29rUHJvZmlsZSBleHRlbmRzIFNwYWNlYm9va0NhcmQge1xuICBzaGFyZXNfZnJpZW5kczogYm9vbGVhbjtcbiAgLyoqIFdoeSB0aGUgZnJpZW5kcyBhcmUgbm90IHNob3duICgnJyB3aGVuIHRoZXkgYXJlKTogbm90IGEgYnVkZHksIG9yIHRoZXkga2VlcCB0aGVtIHRvIHRoZW1zZWx2ZXMuICovXG4gIGZyaWVuZHNfaGlkZGVuOiBzdHJpbmc7XG4gIGZyaWVuZHNfdmlzaWJsZTogYm9vbGVhbjtcbiAgLyoqIFdobyB0aGV5IGFyZSBmcmllbmRzIHdpdGg7IGZvciBhbiBOUEMgKGBpbnRyb2R1Y2VyYCkgb25seSB0aGUgcGVvcGxlIGl0IGNvdWxkIGludHJvZHVjZSB0aGUgdmlld2VyIHRvLiAqL1xuICBmcmllbmRzOiBTcGFjZWJvb2tDYXJkW107XG4gIGludHJvZHVjZXI6IGJvb2xlYW47XG59XG5cbi8qKiBgU3BhY2Vib29rLlByb2ZpbGVgIHdoZW4gdGhlIHBlcnNvbiBjYW5ub3QgYmUgZm91bmQgb3IgdGhlaXIgcHJvZmlsZSBpcyBwcml2YXRlLiAqL1xuZXhwb3J0IGludGVyZmFjZSBTcGFjZWJvb2tQcm9maWxlRXJyb3IgeyBrZXk6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBlcnJvcjogc3RyaW5nIH1cblxuLyoqIGBTcGFjZWJvb2suUmVzdWx0c2AsIHRoZSBhbnN3ZXIgdG8gYFNwYWNlYm9vay5TZWFyY2hgOiBwdWJsaWMgcHJvZmlsZXMgbWF0Y2hpbmcgdGhlIHRlcm0uICovXG5leHBvcnQgaW50ZXJmYWNlIFNwYWNlYm9va1Jlc3VsdHMgeyB0ZXJtOiBzdHJpbmc7IHJlc3VsdHM6IFNwYWNlYm9va0NhcmRbXSB9XG5cbi8qKiBBIG5vcm1hbGlzZWQgYFNwYWNlYm9vay5MaXN0YC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU3BhY2Vib29rTGlzdCB7XG4gIHNlbGY6IFNwYWNlYm9va1NlbGY7XG4gIHBlbmRpbmc6IFNwYWNlYm9va1JlY29yZFtdO1xuICBidWRkaWVzOiBTcGFjZWJvb2tSZWNvcmRbXTtcbiAgLyoqXG4gICAqIFdoeSB0aGVyZSBpcyBubyBsaXZlIGJvb2sgKFwiWW91ciB3cmlzdHBhZCBoYXMgbm8gc2lnbmFsIGhlcmUuIFBEQXMgb25seSB3b3JrIGluIGNoYXJhY3Rlci5cIiwgXCJObyB3cmlzdHBhZC5cIiwgXHUyMDI2KS5cbiAgICogVGhlbiBgc2VsZmAgaXMgYSBwbGFjZWhvbGRlciBhbmQgYm90aCBsaXN0cyBhcmUgZW1wdHk7IG5vdGhpbmcgY2FuIGJlIGNoYW5nZWQgdW50aWwgaXQgY2xlYXJzLiBAc2luY2UgMS4yLjBcbiAgICovXG4gIGVycm9yPzogc3RyaW5nO1xuICAvKiogVW5peCBzZWNvbmRzIG9mIHRoZSBwYWQncyBsYXN0IHN5bmMgd2hlbiB0aGUgbGlzdCBpcyB0aGUgY2FjaGVkIGNvcHkgc2hvd24gb2ZmLW5ldC4gQHNpbmNlIDEuMi4wICovXG4gIGNhY2hlZD86IG51bWJlcjtcbn1cblxuLyoqIFdoYXQgdGhlIHBhbmVsIHNob3dzOiB5b3VyIGJvb2ssIHNvbWVvbmUncyBwcm9maWxlIChudWxsIHdoaWxlIGl0IGxvYWRzKSwgb3Igc2VhcmNoIHJlc3VsdHMgKG51bGwgd2hpbGUgdGhleSBsb2FkKS4gKi9cbmV4cG9ydCB0eXBlIFNwYWNlYm9va1ZpZXcgPVxuICB8IHsga2luZDogJ2Jvb2snIH1cbiAgfCB7IGtpbmQ6ICdwcm9maWxlJzsga2V5OiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgcHJvZmlsZTogU3BhY2Vib29rUHJvZmlsZSB8IFNwYWNlYm9va1Byb2ZpbGVFcnJvciB8IG51bGwgfVxuICB8IHsga2luZDogJ3NlYXJjaCc7IHRlcm06IHN0cmluZzsgcmVzdWx0czogU3BhY2Vib29rQ2FyZFtdIHwgbnVsbCB9O1xuXG4vKiogVGhlIGBkYXRhYCBvZiB0aGUgY29udGV4dCBraW5kIGBzcGFjZWJvb2suYnVkZHlgIChyaWdodC1jbGljayBvciBcdTI1Qjggb24gYSBidWRkeSByb3cpLiAqL1xuZXhwb3J0IGludGVyZmFjZSBTcGFjZWJvb2tCdWRkeURhdGEgeyBidWRkeTogU3BhY2Vib29rUmVjb3JkIH1cblxuZGVjbGFyZSBtb2R1bGUgJ0BtdWNsaWVudC9zZGsnIHtcbiAgaW50ZXJmYWNlIENvbnRleHRLaW5kcyB7ICdzcGFjZWJvb2suYnVkZHknOiBTcGFjZWJvb2tCdWRkeURhdGEgfVxufVxuXG4vKiogV2hhdCBgY3R4LmFwaSgnc3BhY2Vib29rJylgIHJldHVybnMuICovXG5leHBvcnQgaW50ZXJmYWNlIFNwYWNlYm9va0FwaSB7XG4gIC8qKiBUaGUgbGFzdCBgU3BhY2Vib29rLkxpc3RgIG9mIGEgc2Vzc2lvbiAoZGVmYXVsdCB0aGUgYWN0aXZlIG9uZSksIG9yIG51bGwgYmVmb3JlIHRoZSBmaXJzdC4gKi9cbiAgbGlzdChzaWQ/OiBzdHJpbmcpOiBTcGFjZWJvb2tMaXN0IHwgbnVsbDtcbiAgLyoqXG4gICAqIEFzayB0aGUgc2VydmVyIHRvIHNlbmQgdGhlIGxpc3QgYWdhaW4gKGBTcGFjZWJvb2suR2V0YCkgYW5kIHJlLWRlY2xhcmUgYFNwYWNlYm9vayAxYCAoc2luY2UgMS4yLjAsIHNvIGFcbiAgICogZGVjbGFyYXRpb24gbG9zdCB0byBhIHJlY29ubmVjdCBjb21lcyBiYWNrKS4gUmVzb2x2ZXMgd2hldGhlciB0aGUgc2VuZCB3ZW50IG91dC5cbiAgICovXG4gIHJlZnJlc2goc2lkPzogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPjtcbiAgLyoqIE9wZW4gc29tZW9uZSdzIHByb2ZpbGUgaW4gdGhlIHBhbmVsIChgU3BhY2Vib29rLkdldFByb2ZpbGVgIGJ5IGtleSwgb3IgYnkgbmFtZSkuIEBzaW5jZSAxLjEuMCAqL1xuICBvcGVuUHJvZmlsZSh3aG86IHsga2V5Pzogc3RyaW5nOyBuYW1lPzogc3RyaW5nIH0sIHNpZD86IHN0cmluZyk6IHZvaWQ7XG59XG5cbi8qKiBUaGUgT05MSU5FIC8gT0ZGTElORSBmaWx0ZXIgc2V0dGluZ3MgKGBleHQuc3BhY2Vib29rLjxrZXk+YCwgcGVyIHdvcmxkKS4gKi9cbmV4cG9ydCBjb25zdCBTRVRUSU5HUyA9IHsgb25saW5lOiAnZmlsdGVyLm9ubGluZScsIG9mZmxpbmU6ICdmaWx0ZXIub2ZmbGluZScgfSBhcyBjb25zdDtcbi8qKiBUaGUgY29udGV4dCBraW5kIG9mIGEgYnVkZHkgcm93LiAqL1xuZXhwb3J0IGNvbnN0IEJVRERZX0tJTkQgPSAnc3BhY2Vib29rLmJ1ZGR5Jztcbi8qKiBUaGUgc2VydmVyIHJlZnVzZXMgYSBibHVyYiBvZiA1MCBjaGFyYWN0ZXJzIG9yIG1vcmUuICovXG5leHBvcnQgY29uc3QgQkxVUkJfTUFYID0gNDk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBNEJBLFNBQVMsaUJBQWlCLFNBQXFFOzs7QUMzQnhGLElBQU0sT0FBTztBQUFBLEVBQ2xCLE9BQU87QUFBQTtBQUFBLEVBRVAsUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUFBLEVBQ1QsUUFBUTtBQUFBLEVBQ1IsS0FBSztBQUFBO0FBQUEsRUFFTCxTQUFTO0FBQUEsRUFDVCxTQUFTO0FBQUEsRUFDVCxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUE7QUFBQSxFQUVSLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxFQUNWLFFBQVEsRUFBRSxRQUFRLFVBQVUsU0FBUyxXQUFXLFVBQVUsWUFBWSxTQUFTLFVBQVU7QUFBQSxFQUN6RixNQUFNO0FBQUE7QUFBQSxFQUVOLFVBQVU7QUFBQSxFQUNWLFdBQVc7QUFBQSxFQUNYLFNBQVM7QUFBQTtBQUFBLEVBRVQsVUFBVTtBQUFBO0FBQUEsRUFFVixTQUFTO0FBQUE7QUFBQSxFQUVULFFBQVEsQ0FBQyxRQUFnQixlQUFZLEdBQUc7QUFBQTtBQUFBLEVBRXhDLEtBQUssRUFBRSxLQUFLLFlBQVksR0FBRyxDQUFDLE1BQWMsR0FBRyxDQUFDLFVBQVUsS0FBSyxDQUFDLE1BQWMsR0FBRyxDQUFDLFlBQVksR0FBRyxDQUFDLE1BQWMsR0FBRyxDQUFDLFVBQVUsR0FBRyxDQUFDLE1BQWMsR0FBRyxDQUFDLFNBQVM7QUFB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QSxNQUFPO0FBQUEsTUFDdkcsYUFBYSxDQUFDLEtBQUssUUFBUTtBQUN6QixjQUFNLElBQUksT0FBTyxHQUFHLFNBQVMsT0FBTyxHQUFHO0FBQ3ZDLFlBQUksQ0FBQyxFQUFHO0FBQ1IsY0FBTSxPQUFPLENBQUMsR0FBSSxhQUFhLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBRTtBQUM1QyxZQUFJLEtBQUssT0FBUSxNQUFLLENBQUMsRUFBRyxLQUFLLEdBQUc7QUFBQSxhQUM3QjtBQUFFLGFBQUcsT0FBTyxLQUFLLElBQUksUUFBVyxFQUFFLEtBQUssRUFBRSxDQUFDO0FBQUcseUJBQWUsTUFBTSxDQUFDLEdBQUksYUFBYSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUM7QUFBQSxRQUFHO0FBQUEsTUFDMUg7QUFBQSxJQUNGO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJub3RlIiwgImFwaSIsICJvdXQiLCAiYSJdCn0K
