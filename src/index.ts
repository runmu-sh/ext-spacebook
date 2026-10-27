/**
 * Spacebook (@runmu.sh/ext-spacebook): the Spacebook panel for Torchship. The server sends the whole book as GMCP
 * `Spacebook.List` (on login, on Core.Supports, every 30 s when it changed, and after every mutation); this
 * extension draws it per session through `mu.gmcp.watch` and sends the mutations back (`Spacebook.Accept`,
 * `Add`, `Remove`, `SetBlurb`, `SetPublic`).
 *
 * The panel (a dossier list): a bar with the ■ ONLINE / □ OFFLINE filters, a search field and [ ADD ]; ┤PENDING (n)├
 * rows "▸ Name — wants to be buddies [ ACCEPT ]"; ┤BUDDIES (n)├ rows with a 56px portrait box (initials while the
 * portrait is "placeholder"), name + status plate, "acquaintance · location", and the blurb; a foot with YOU <name>
 * [PUBLIC], your blurb and [ EDIT BLURB ] [ GO PRIVATE ] [ SEARCH PROFILES ]. Before the first list it reads
 * WAITING FOR SPACEBOOK, with no buddies NO BUDDIES YET. Right-click or ▸ on a buddy row opens the `spacebook.buddy`
 * context menu (Page, Remove buddy).
 *
 * Shown 'auto': the panel joins Views and adds itself the first time a session receives a list. Activation is
 * `onGmcp:Spacebook`, so on a game that never sends the package the extension stays dormant.
 */
import { defineExtension, h, type Dispose, type JsonSchema, type Mu, type PanelMountCtx } from '@muclient/sdk';
import { COPY } from './copy';
import { BLURB_MAX, BUDDY_KIND, SETTINGS, type SpacebookApi, type SpacebookCard, type SpacebookList, type SpacebookProfile, type SpacebookProfileError, type SpacebookRecord, type SpacebookStatus, type SpacebookView } from './types';

export type { SpacebookApi, SpacebookBuddyData, SpacebookCard, SpacebookList, SpacebookProfile, SpacebookProfileError, SpacebookRecord, SpacebookResults, SpacebookSelf, SpacebookStatus, SpacebookView } from './types';
export { BLURB_MAX, BUDDY_KIND, SETTINGS } from './types';
export { COPY } from './copy';

const ID = 'spacebook';
const PKG = 'Spacebook.List';
/** Synced per world: pending keys already announced (the last 500). */
const SEEN_KEY = 'seen.pending';

/** Acquaintance words drawn in `--alert`. */
export const HOSTILE = new Set(['rival', 'adversary', 'enemy', 'nemesis', 'hated enemy', 'disliked', 'wary rival', 'feared', 'dreaded', 'terrifying', 'menacing', 'intimidating', 'unnerving']);
export const isHostile = (acq: string) => HOSTILE.has(acq.trim().toLowerCase());

/** The `data` schema of the `spacebook.buddy` kind, checked by the host on every `mu.menus.target` call. */
export const KIND_SCHEMA: JsonSchema = {
  type: 'object', required: ['buddy'],
  properties: { buddy: { type: 'object', required: ['key', 'name'], properties: { key: { type: 'string' }, name: { type: 'string' }, status: { type: 'string' }, acquaintance: { type: 'string' }, location: { type: 'string' }, blurb: { type: 'string' }, portrait: { type: 'string' } } } },
};

const R = `.ext-panel[data-ext="${ID}"] .mu-spacebook`;
/** Theme tokens only, every rule under the panel root. Row and section values are the approved artboard's. */
export const SPACEBOOK_CSS = `
${R} { height: 100%; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font-family: var(--font-mono); font-size: .9rem; box-sizing: border-box; }
${R} *, ${R} *::before, ${R} *::after { box-sizing: border-box; }
${R}:focus { outline: none; }
${R} .bar { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; padding: 4px 8px; background: var(--bg-elev); border-bottom: 1px solid var(--accent); }
${R} .bar .sh-field { flex: 1; min-width: 6ch; }
${R} .scroll { flex: 1; overflow-y: auto; padding: 0 10px 6px; }
${R} .sec-head { margin: .9rem 0 .4rem; }
${R} .pend { display: flex; align-items: center; gap: 10px; padding: 5px 0 5px 2.4ch; border-bottom: 1px solid var(--border); font-size: .82rem; position: relative; }
${R} .pend::before { content: "▸"; position: absolute; left: .8ch; color: var(--gold); }
${R} .pend .who { flex: 1; min-width: 0; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${R} .pend .ask { font-size: .66rem; color: var(--fg-faint); letter-spacing: .08em; white-space: nowrap; }
${R} .row { display: grid; grid-template-columns: 56px 1fr; gap: 0 12px; width: 100%; padding: 8px 6px 8px 2.4ch; border: 0; border-bottom: 1px solid var(--border); background: none; color: inherit; text-align: left; position: relative; font: inherit; transition: background-color .12s ease; }
${R} .row::before { content: "▸"; position: absolute; left: .6ch; top: 8px; color: transparent; transition: color .12s ease; }
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

// ─── the list ─────────────────────────────────────────────────────────────────────────────────────────────────

const STATUSES: readonly SpacebookStatus[] = ['online', 'offline', 'deceased', 'unknown'];
const str = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** A record as the server sends it → a complete one. Null without a key and a name. */
export function recordOf(v: unknown): SpacebookRecord | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const key = str(d.key), name = str(d.name).trim();
  if (!key || !name) return null;
  const s = str(d.status).toLowerCase() as SpacebookStatus;
  return { key, name, status: STATUSES.includes(s) ? s : 'unknown', acquaintance: str(d.acquaintance).trim(), location: str(d.location).trim(), blurb: str(d.blurb).trim(), portrait: str(d.portrait).trim() || 'placeholder', role: str(d.role).trim(), shares_friends: d.shares_friends !== false };
}

/** A card as the server sends it → a complete one. Null without a key and a name. */
export function cardOf(v: unknown): SpacebookCard | null {
  const r = recordOf(v);
  if (!r) return null;
  const d = v as Record<string, unknown>;
  return { key: r.key, name: r.name, role: r.role, status: r.status, portrait: r.portrait, acquaintance: r.acquaintance, buddy: d.buddy === true, viewable: d.viewable === true, blurb: r.blurb, location: r.location };
}

const cardsOf = (v: unknown) => (Array.isArray(v) ? v.map(cardOf).filter((c): c is SpacebookCard => !!c) : []);

/** A `Spacebook.Profile` payload → a profile, an error (`{key, name, error}`), or null when it is neither. Exported for tests. */
export function profileOf(data: unknown): SpacebookProfile | SpacebookProfileError | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.error === 'string' && d.error) return { key: str(d.key), name: str(d.name).trim(), error: d.error };
  const c = cardOf(d);
  if (!c) return null;
  const visible = d.friends_visible === true;
  return { ...c, shares_friends: d.shares_friends === true, friends_visible: visible, friends_hidden: visible ? '' : str(d.friends_hidden).trim(), friends: visible ? cardsOf(d.friends) : [], introducer: d.introducer === true };
}

/** A `Spacebook.Results` payload → the term and its cards, or null. Exported for tests. */
export function resultsOf(data: unknown): { term: string; results: SpacebookCard[] } | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  return { term: str(d.term).trim(), results: cardsOf(d.results) };
}

/** A `Spacebook.List` payload → a normalised list, or null when it is not one. Exported for tests. */
export function listOf(data: unknown): SpacebookList | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const self = (d.self && typeof d.self === 'object' ? d.self : {}) as Record<string, unknown>;
  const recs = (v: unknown) => (Array.isArray(v) ? v.map(recordOf).filter((r): r is SpacebookRecord => !!r) : []);
  return {
    self: { name: str(self.name).trim(), blurb: str(self.blurb).trim(), public: !!self.public, share_friends: self.share_friends !== false, portrait: str(self.portrait).trim() || 'placeholder' },
    pending: recs(d.pending),
    buddies: recs(d.buddies),
  };
}

/** Initials for a placeholder portrait: the first letter of the first two words ("Radical Ray" → RR, "Ol' Red" → OR). */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+/u, '')).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return letters.join('') || (name.trim()[0] ?? '?').toUpperCase();
}

export interface Filter { online: boolean; offline: boolean; query: string }
/** Online first, then by name (case-insensitive). Exported for tests. */
export const sortBuddies = (list: SpacebookRecord[]): SpacebookRecord[] =>
  [...list].sort((a, b) => Number(b.status === 'online') - Number(a.status === 'online') || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
/** The ONLINE / OFFLINE toggles (deceased and unknown count as offline) and the search over name, blurb, location and acquaintance. */
export function filterBuddies(list: SpacebookRecord[], f: Filter): SpacebookRecord[] {
  const q = f.query.trim().toLowerCase();
  return sortBuddies(list).filter((b) => {
    if (b.status === 'online' ? !f.online : !f.offline) return false;
    return !q || [b.name, b.blurb, b.location, b.acquaintance].some((s) => s.toLowerCase().includes(q));
  });
}

/** A blurb the server accepts: trimmed, at most {@link BLURB_MAX} characters. */
export const clampBlurb = (s: string) => [...s.trim()].slice(0, BLURB_MAX).join('');

// ─── the panel ────────────────────────────────────────────────────────────────────────────────────────────────

/** What the panel needs from the extension; `renderPanel` draws, the rest act. */
export interface PanelHost {
  css: Mu['ui']['css'];
  list(): SpacebookList | null;
  filter(): { online: boolean; offline: boolean };
  setFilter(which: 'online' | 'offline', on: boolean): void;
  accept(key: string): void;
  add(): void;
  editBlurb(): void;
  setPublic(on: boolean): void;
  searchProfiles(): void;
  setShareFriends(on: boolean): void;
  /** Open someone's profile (`Spacebook.GetProfile`) on top of the current view. */
  openProfile(who: { key?: string; name?: string }): void;
  /** Back to the previous view. */
  back(): void;
  addBuddy(name: string): void;
  page(name: string): void;
  /** Mark a buddy row as a `spacebook.buddy` context target; returns the dispose. */
  target(el: HTMLElement, buddy: SpacebookRecord): Dispose;
  /** Open the row's menu from its ▸ (a synthetic contextmenu at the row). */
  openMenu(el: HTMLElement): void;
}

/** The panel's DOM for one state. Exported for tests. `query` is the live search text. */
export function renderPanel(hostApi: PanelHost, query: string): { bar: HTMLElement; body: HTMLElement[]; foot: HTMLElement | null; targets: Dispose[] } {
  const css = hostApi.css;
  const list = hostApi.list();
  const f = hostApi.filter();
  const targets: Dispose[] = [];
  const toggle = (which: 'online' | 'offline', label: string, on: boolean) =>
    h('button', { class: `${css.toggle}${on ? '' : ` ${css.off}`}`, type: 'button', 'aria-pressed': String(on), 'data-testid': `sb-filter-${which}`, onclick: () => hostApi.setFilter(which, !on) }, label);
  const bar = h('div', { class: 'bar' },
    toggle('online', COPY.online, f.online),
    toggle('offline', COPY.offline, f.offline),
    h('input', { class: css.field, type: 'search', name: 'query', value: query, placeholder: COPY.search, 'aria-label': COPY.search, 'data-testid': 'sb-search', autocomplete: 'off' }),
    h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-add', onclick: () => hostApi.add() }, COPY.add),
  );
  const head = (label: string, n: number) => secHead(css, label, n);
  if (!list) return { bar, body: [h('p', { class: `${css.empty} awaiting`, 'data-testid': 'sb-empty' }, COPY.awaiting)], foot: null, targets };

  const body: HTMLElement[] = [];
  if (list.pending.length) {
    body.push(head(COPY.pending, list.pending.length));
    for (const p of list.pending) {
      body.push(h('div', { class: 'pend', 'data-testid': 'sb-pending', 'data-key': p.key },
        h('span', { class: 'who' }, p.name),
        h('span', { class: 'ask' }, COPY.wants),
        h('button', { class: `${css.cmd} primary`, type: 'button', 'data-testid': 'sb-accept', onclick: () => hostApi.accept(p.key) }, COPY.accept)));
    }
  }
  body.push(head(COPY.buddies, list.buddies.length));
  const shown = filterBuddies(list.buddies, { ...f, query });
  if (!list.buddies.length) body.push(h('p', { class: `${css.empty} awaiting`, 'data-testid': 'sb-empty' }, COPY.noBuddies));
  else if (!shown.length) body.push(h('p', { class: `${css.empty} awaiting`, 'data-testid': 'sb-empty' }, COPY.noMatch));
  for (const b of shown) {
    const row = cardRow(css, b, { testid: 'sb-buddy', title: COPY.menu });
    row.setAttribute('aria-haspopup', 'menu');
    row.addEventListener('click', () => hostApi.openMenu(row));
    targets.push(hostApi.target(row, b));
    body.push(row);
  }

  const you = list.self;
  const foot = h('div', { class: 'foot', 'data-testid': 'sb-foot' },
    h('div', { class: 'l' }, h('span', { class: css.label }, COPY.you), h('span', { class: 'you' }, you.name), h('span', { class: `${css.plate} ${you.public ? css.hot : css.dim}`, 'data-testid': 'sb-public' }, you.public ? COPY.isPublic : COPY.isPrivate)),
    you.blurb ? h('div', { class: 'l' }, h('span', { class: 'blurb', 'data-testid': 'sb-blurb' }, you.blurb)) : null,
    h('div', { class: 'acts' },
      h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-edit-blurb', onclick: () => hostApi.editBlurb() }, COPY.editBlurb),
      h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-public-toggle', onclick: () => hostApi.setPublic(!you.public) }, you.public ? COPY.goPrivate : COPY.goPublic),
      h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-share-toggle', 'aria-pressed': String(you.share_friends), onclick: () => hostApi.setShareFriends(!you.share_friends) }, you.share_friends ? COPY.hideFriends : COPY.shareFriends),
      h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-search-profiles', onclick: () => hostApi.searchProfiles() }, COPY.searchProfiles)));
  return { bar, body, foot, targets };
}

/** A person as a row: portrait, name + status plate (+ role), "acquaintance · location", blurb. Buddy rows, friends and results share it. */
export function cardRow(css: Mu['ui']['css'], b: Pick<SpacebookCard, 'key' | 'name' | 'status' | 'portrait' | 'acquaintance' | 'location' | 'blurb'> & { role?: string }, o: { testid: string; title?: string; disabled?: boolean; note?: string }): HTMLButtonElement {
  const dead = b.status === 'deceased';
  const port = b.portrait && b.portrait !== 'placeholder'
    ? h('div', { class: `port${dead ? ' dead' : ''}` }, h('img', { src: b.portrait, alt: '', loading: 'lazy' }))
    : h('div', { class: `port${dead ? ' dead' : ''}`, 'aria-hidden': 'true' }, h('b', {}, initialsOf(b.name)), h('small', {}, COPY.portrait));
  const plate = b.status === 'online' ? css.ok : b.status === 'deceased' ? 'alert' : css.dim;
  const l2 = h('div', { class: 'l2' });
  const bits: HTMLElement[] = [];
  if (b.role) bits.push(h('span', { class: 'role', 'data-testid': 'sb-role' }, b.role));
  if (b.acquaintance) bits.push(h('span', { class: `acq${isHostile(b.acquaintance) ? ' foe' : ''}` }, b.acquaintance));
  if (b.location) bits.push(h('span', { class: 'loc' }, b.location));
  bits.forEach((el, i) => { if (i) l2.append(h('span', { class: 'at', 'aria-hidden': 'true' }, '·')); l2.append(el); });
  const l3 = o.note ? h('div', { class: 'l3 none' }, o.note) : b.blurb ? h('div', { class: 'l3' }, b.blurb) : h('div', { class: 'l3 none' }, COPY.noBlurb);
  return h('button', { class: 'row', type: 'button', 'data-testid': o.testid, 'data-key': b.key, 'data-status': b.status, title: o.title ?? '', disabled: o.disabled ? true : undefined },
    port,
    h('div', { class: 'meta' },
      h('div', { class: 'l1' }, h('span', { class: 'name' }, b.name), h('span', { class: `${css.plate} ${plate}`, 'data-testid': 'sb-status' }, COPY.status[b.status])),
      l2, l3)) as HTMLButtonElement;
}

/** People as rows: those whose profile the viewer may open are buttons that open it, the rest are inert and say why. */
function cardRows(hostApi: PanelHost, cards: SpacebookCard[], testid: string): HTMLElement[] {
  return cards.map((c) => {
    const row = cardRow(hostApi.css, c, { testid, title: c.viewable ? COPY.openProfile : COPY.privateProfile, disabled: !c.viewable, note: c.viewable ? undefined : COPY.privateProfile });
    if (c.viewable) row.addEventListener('click', () => hostApi.openProfile({ key: c.key, name: c.name }));
    return row;
  });
}

/** The bar of a profile or search view: [ BACK ] and what it shows. */
function viewBar(hostApi: PanelHost, title: string): HTMLElement {
  return h('div', { class: 'bar' },
    h('button', { class: hostApi.css.cmd, type: 'button', 'data-testid': 'sb-back', onclick: () => hostApi.back() }, COPY.back),
    h('span', { class: 'vtitle', 'data-testid': 'sb-view-title' }, title));
}

const secHead = (css: Mu['ui']['css'], label: string, n?: number) => h('div', { class: css.secHead, role: 'heading', 'aria-level': '3' }, n === undefined ? label : `${label} (${n})`, h('span', { class: css.secClose, 'aria-hidden': 'true' }));
const note = (css: Mu['ui']['css'], text: string, testid = 'sb-empty') => h('p', { class: `${css.empty} awaiting`, 'data-testid': testid }, text);

/** Someone's profile (or why it cannot be shown), then their friends or the reason they are hidden. Exported for tests. */
export function renderProfile(hostApi: PanelHost, view: Extract<SpacebookView, { kind: 'profile' }>): { bar: HTMLElement; body: HTMLElement[] } {
  const css = hostApi.css;
  const p = view.profile;
  if (!p) return { bar: viewBar(hostApi, view.name), body: [note(css, COPY.loading)] };
  if ('error' in p) return { bar: viewBar(hostApi, p.name || view.name), body: [note(css, p.error, 'sb-error')] };
  const self = hostApi.list()?.self.name === p.name;
  const body: HTMLElement[] = [cardRow(css, p, { testid: 'sb-profile' })];
  body[0]!.classList.add('head');
  const acts = h('div', { class: 'acts' });
  if (self) acts.append(h('span', { class: `${css.plate} ${css.hot}` }, COPY.isYou));
  else if (p.buddy) acts.append(h('span', { class: `${css.plate} ${css.ok}`, 'data-testid': 'sb-is-buddy' }, COPY.isBuddy), h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-page', onclick: () => hostApi.page(p.name) }, COPY.page));
  else acts.append(h('button', { class: `${css.cmd} primary`, type: 'button', 'data-testid': 'sb-add-buddy', onclick: () => hostApi.addBuddy(p.name) }, COPY.addBuddy));
  body.push(acts);
  const label = p.introducer ? COPY.introduces : COPY.friends;
  if (!p.friends_visible) { body.push(secHead(css, label), note(css, p.friends_hidden, 'sb-friends-hidden')); return { bar: viewBar(hostApi, p.name), body }; }
  body.push(secHead(css, label, p.friends.length));
  if (!p.friends.length) body.push(note(css, p.introducer ? COPY.noIntroductions : COPY.noFriends));
  body.push(...cardRows(hostApi, p.friends, 'sb-friend'));
  return { bar: viewBar(hostApi, p.name), body };
}

/** Public profiles matching a term. Exported for tests. */
export function renderResults(hostApi: PanelHost, view: Extract<SpacebookView, { kind: 'search' }>): { bar: HTMLElement; body: HTMLElement[] } {
  const css = hostApi.css;
  const bar = viewBar(hostApi, COPY.searchHead(view.term));
  if (!view.results) return { bar, body: [note(css, COPY.loading)] };
  const body: HTMLElement[] = [secHead(css, COPY.results, view.results.length)];
  if (!view.results.length) body.push(note(css, COPY.noResults));
  body.push(...cardRows(hostApi, view.results, 'sb-result'));
  return { bar, body };
}

/** How the extension hands a session's answers to one open panel. */
interface PanelAnswer {
  profile(p: SpacebookProfile | SpacebookProfileError): void;
  results(r: { term: string; results: SpacebookCard[] }): void;
  open(who: { key?: string; name?: string }): void;
}

// ─── the extension ────────────────────────────────────────────────────────────────────────────────────────────

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    mu.ui.style(SPACEBOOK_CSS);
    const css = mu.ui.css;

    mu.settings.define({
      title: COPY.settingsTitle,
      items: [
        { key: SETTINGS.online, label: COPY.settingOnline, default: true, kind: 'toggle', scope: 'world' },
        { key: SETTINGS.offline, label: COPY.settingOffline, default: true, kind: 'toggle', scope: 'world', hint: COPY.settingOfflineHint },
      ],
    });

    // SDK 1.14 registered kind; a 1.12 or 1.13 host has no `menus.kind` and gets an `x-` kind.
    const kinds = typeof mu.menus.kind === 'function';
    const KIND = kinds ? BUDDY_KIND : 'x-spacebook-buddy';
    if (kinds) ctx.subscriptions.push(mu.menus.kind({ id: BUDDY_KIND, title: COPY.buddyKind, schema: KIND_SCHEMA }));
    const buddyOf = (t: unknown): SpacebookRecord | null => ((t as { data?: { buddy?: SpacebookRecord } })?.data?.buddy ?? null);
    ctx.subscriptions.push(
      mu.menus.context({
        id: 'page', target: KIND as 'spacebook.buddy', order: 100, title: COPY.page,
        when: (t) => !!buddyOf(t) && buddyOf(t)!.status !== 'deceased',
        run: (t) => { const b = buddyOf(t); if (b) { mu.input.fill(COPY.cmdPage(b.name), { sid: t.sid ?? undefined }); mu.input.focus(t.sid ?? undefined); } },
      }),
      mu.menus.context({
        id: 'profile', target: KIND as 'spacebook.buddy', order: 10, title: COPY.viewProfile,
        when: (t) => !!buddyOf(t),
        run: (t) => { const b = buddyOf(t); if (b) api.openProfile({ key: b.key, name: b.name }, t.sid ?? undefined); },
      }),
      mu.menus.context({
        id: 'remove', target: KIND as 'spacebook.buddy', order: 900, title: COPY.remove,
        when: (t) => !!buddyOf(t),
        run: async (t) => {
          const b = buddyOf(t);
          if (!b || !t.sid) return;
          if (await mu.ui.confirm({ title: COPY.removeTitle(b.name), body: COPY.removeBody, confirm: COPY.removeConfirm, danger: true })) void mu.gmcp.send('Spacebook.Remove', { key: b.key }, t.sid);
        },
      }),
    );

    // Per-session state: the last list and the panels drawing it.
    const lists = new Map<string, SpacebookList>();
    const redraws = new Map<string, Set<() => void>>();
    const redraw = (sid: string) => { for (const fn of redraws.get(sid) ?? []) fn(); };
    /** The open panels of a session, to hand profile and search answers to. */
    const panelAnswers = new Map<string, Set<PanelAnswer>>();
    const worldOf = (sid: string) => mu.sessions.list().find((s) => s.id === sid)?.worldId ?? null;
    const seenStore = (sid: string) => mu.storage.world(worldOf(sid), { sync: true });

    /** New requests: a badge with the pending count on every client, one mention per request on the effect owner. */
    const announce = (sid: string, list: SpacebookList, replay: boolean) => {
      mu.panels.badge(ID, list.pending.length ? { count: list.pending.length } : null, sid);
      const store = seenStore(sid);
      const seen = new Set(store.get<string[]>(SEEN_KEY, []));
      const fresh = list.pending.filter((p) => !seen.has(p.key));
      if (!fresh.length) return;
      store.set(SEEN_KEY, [...seen, ...fresh.map((p) => p.key)].slice(-500));
      if (replay || !mu.effects.owner(sid)) return;
      for (const p of fresh) void mu.notify.mention({ sid, title: COPY.requestTitle, body: COPY.requestBody(p.name), key: `spacebook:${p.key}` });
    };

    const send = (sid: string, pkg: string, data: unknown) => { void mu.gmcp.send(pkg, data, sid); };
    const mount = (hostEl: HTMLElement, pc: PanelMountCtx): Dispose => {
      const root = h('section', { class: 'mu-spacebook', 'aria-label': COPY.title, 'data-focus-region': ID, tabindex: '-1', 'data-testid': 'spacebook' });
      hostEl.append(root);
      const sid = pc.sid;
      let query = '';
      let targets: Dispose[] = [];
      /** The views over the book, newest last; [ BACK ] pops one. */
      const views: Exclude<SpacebookView, { kind: 'book' }>[] = [];
      const push = (v: Exclude<SpacebookView, { kind: 'book' }>) => { views.push(v); if (views.length > 20) views.shift(); draw(); };
      /** An answer from the server fills the newest view still waiting for it. */
      const answer: PanelAnswer = {
        profile: (p) => {
          const v = [...views].reverse().find((x): x is Extract<SpacebookView, { kind: 'profile' }> => x.kind === 'profile' && (x.key ? x.key === p.key : !x.profile));
          if (!v) return;
          v.profile = p; v.key = p.key || v.key; if (p.name) v.name = p.name;
          if (views[views.length - 1] === v) draw();
        },
        results: (r) => {
          const v = [...views].reverse().find((x): x is Extract<SpacebookView, { kind: 'search' }> => x.kind === 'search' && x.term.toLowerCase() === r.term.toLowerCase());
          if (!v) return;
          v.results = r.results;
          if (views[views.length - 1] === v) draw();
        },
        open: (who) => api.openProfile(who),
      };
      const api: PanelHost = {
        css,
        list: () => (sid ? lists.get(sid) ?? null : null),
        filter: () => ({ online: mu.settings.get<boolean>(SETTINGS.online, sid ? { sid } : undefined) !== false, offline: mu.settings.get<boolean>(SETTINGS.offline, sid ? { sid } : undefined) !== false }),
        setFilter: (which, on) => { mu.settings.set(which === 'online' ? SETTINGS.online : SETTINGS.offline, on, sid ? worldOf(sid) : undefined); draw(); },
        accept: (key) => { if (sid) send(sid, 'Spacebook.Accept', { key }); },
        add: async () => {
          if (!sid) return;
          const name = await mu.ui.prompt({ title: COPY.addTitle, label: COPY.addLabel, placeholder: COPY.addPlaceholder });
          if (name?.trim()) send(sid, 'Spacebook.Add', { name: name.trim() });
        },
        editBlurb: async () => {
          if (!sid) return;
          const cur = lists.get(sid)?.self.blurb ?? '';
          const v = await mu.ui.prompt({ title: COPY.blurbTitle, label: COPY.blurbLabel(BLURB_MAX), value: cur, validate: (s) => ([...s.trim()].length > BLURB_MAX ? COPY.blurbTooLong(BLURB_MAX) : null) });
          if (v !== null && clampBlurb(v) !== cur) send(sid, 'Spacebook.SetBlurb', { blurb: clampBlurb(v) });
        },
        setPublic: (on) => { if (sid) send(sid, 'Spacebook.SetPublic', { public: on }); },
        searchProfiles: async () => {
          if (!sid) return;
          const term = await mu.ui.prompt({ title: COPY.searchTitle, label: COPY.searchLabel });
          if (term?.trim()) { push({ kind: 'search', term: term.trim(), results: null }); send(sid, 'Spacebook.Search', { term: term.trim() }); }
        },
        setShareFriends: (on) => { if (sid) send(sid, 'Spacebook.SetShareFriends', { share: on }); },
        openProfile: (who) => {
          if (!sid || (!who.key && !who.name)) return;
          push({ kind: 'profile', key: who.key ?? '', name: who.name ?? '', profile: null });
          send(sid, 'Spacebook.GetProfile', who.key ? { key: who.key } : { name: who.name });
        },
        back: () => { views.pop(); draw(); },
        addBuddy: (name) => { if (sid) send(sid, 'Spacebook.Add', { name }); },
        page: (name) => { mu.input.fill(COPY.cmdPage(name), { sid: sid ?? undefined }); mu.input.focus(sid ?? undefined); },
        target: (el, buddy) => (sid ? mu.menus.target(el, { kind: KIND, sid, data: { buddy } } as Parameters<Mu['menus']['target']>[1]) : () => {}),
        openMenu: (el) => {
          const r = el.getBoundingClientRect();
          el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 12, clientY: r.top + 12 }));
        },
      };
      const draw = () => {
        for (const d of targets) d();
        targets = [];
        const view = views[views.length - 1];
        if (view) {
          const out = view.kind === 'profile' ? renderProfile(api, view) : renderResults(api, view);
          root.replaceChildren(out.bar, h('div', { class: 'scroll' }, ...out.body));
          return;
        }
        const top = root.querySelector('.scroll')?.scrollTop ?? 0;
        const out = renderPanel(api, query);
        targets = out.targets;
        const input = out.bar.querySelector<HTMLInputElement>('input[name=query]');
        input?.addEventListener('input', () => { query = input.value; drawBody(); });
        const scroll = h('div', { class: 'scroll' }, ...out.body);
        root.replaceChildren(out.bar, scroll, ...(out.foot ? [out.foot] : []));
        scroll.scrollTop = top;
      };
      /** A keystroke in the search redraws the list only, so the field keeps focus and its caret. */
      const drawBody = () => {
        if (views.length) return;
        for (const d of targets) d();
        const out = renderPanel(api, query);
        targets = out.targets;
        root.querySelector('.scroll')?.replaceChildren(...out.body);
        const foot = root.querySelector('.foot');
        if (out.foot) { if (foot) foot.replaceWith(out.foot); else root.append(out.foot); } else foot?.remove();
      };
      draw();
      const set = sid ? (redraws.get(sid) ?? redraws.set(sid, new Set()).get(sid)!) : null;
      set?.add(draw);
      const answers = sid ? (panelAnswers.get(sid) ?? panelAnswers.set(sid, new Set()).get(sid)!) : null;
      answers?.add(answer);
      return () => { set?.delete(draw); answers?.delete(answer); for (const d of targets) d(); targets = []; root.remove(); };
    };

    mu.panels.register({
      id: ID, title: COPY.title, singleton: true, defaultPosition: 'right-bottom', order: 40, show: 'auto', mount,
      // Hot reload: the search text survives a rebuild.
      snapshot: (el) => el.querySelector<HTMLInputElement>('input[name=query]')?.value || undefined,
      restore: (el, saved) => {
        const inp = el.querySelector<HTMLInputElement>('input[name=query]');
        if (inp && typeof saved === 'string' && saved) { inp.value = saved; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      },
    });

    // After the panel is registered: with onGmcp activation the first list is already in the session's state and the
    // watch replays it at once, badge and touch included.
    ctx.subscriptions.push(mu.sessions.each((s) => {
      let touched = false;
      const off = mu.gmcp.watch(PKG, (data, m) => {
        const list = listOf(data);
        if (!list) { if (data === undefined) { lists.delete(s.id); redraw(s.id); } return; }
        lists.set(s.id, list);
        if (!touched) { touched = true; mu.panels.touch(ID, s.id); }
        announce(s.id, list, !!m.replay);
        redraw(s.id);
      }, { sid: s.id });
      // Answers, not state: only fresh ones (a replayed profile belongs to an earlier panel).
      const offP = mu.gmcp.on('Spacebook.Profile', (data, m) => { const p = profileOf(data); if (p && !m.replay) for (const a of panelAnswers.get(s.id) ?? []) a.profile(p); }, { sid: s.id });
      const offR = mu.gmcp.on('Spacebook.Results', (data, m) => { const r = resultsOf(data); if (r && !m.replay) for (const a of panelAnswers.get(s.id) ?? []) a.results(r); }, { sid: s.id });
      const a = mu.settings.watch(SETTINGS.online, () => redraw(s.id), { sid: s.id });
      const b = mu.settings.watch(SETTINGS.offline, () => redraw(s.id), { sid: s.id });
      return () => { off(); offP(); offR(); a(); b(); lists.delete(s.id); redraws.delete(s.id); panelAnswers.delete(s.id); };
    }));

    const api: SpacebookApi = {
      list: (sid) => { const s = sid ?? mu.sessions.active()?.id; const l = s ? lists.get(s) : undefined; return l ? structuredClone(l) : null; },
      refresh: async (sid) => { const s = sid ?? mu.sessions.active()?.id; return s ? (await mu.gmcp.send('Spacebook.Get', {}, s)) === true : false; },
      openProfile: (who, sid) => {
        const s = sid ?? mu.sessions.active()?.id;
        if (!s) return;
        const open = [...(panelAnswers.get(s) ?? [])];
        if (open.length) open[0]!.open(who);
        else { mu.panels.open(ID, undefined, { sid: s }); queueMicrotask(() => [...(panelAnswers.get(s) ?? [])][0]?.open(who)); }
      },
    };
    return api;
  },
});
