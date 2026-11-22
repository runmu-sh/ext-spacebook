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
 * WAITING FOR SPACEBOOK with a [ REFRESH ], with no buddies NO BUDDIES YET. A list with `error` (no wristpad, no
 * signal…) reads NO SIGNAL over the server's reason and hides every mutation; one with `cached` (the pad's last
 * sync, shown off-net) carries a CACHED · <ago> note under the bar. Right-click or ▸ on a buddy row opens the
 * `spacebook.buddy` context menu (Page, Remove buddy).
 *
 * Asking, not only waiting (1.2.0): while a connected session holds no list the extension sends `Spacebook.Get {}`
 * on a bounded backoff ({@link RETRY}: 2 s, 6 s, 15 s, 40 s, then every 90 s) until a list arrives, and from the
 * second step on re-declares `Spacebook 1` with `mu.gmcp.supports`. After a WebSocket reconnect the backend can
 * forget this connection's declarations (it then sends `Core.Supports.Remove` and the game drops every push); a
 * repeated `supports` is a no-op at the backend when the declaration stands and re-adds it when it was lost, and
 * the game answers `Core.Supports.Add` with a fresh list. Every Dispose it returns goes into `ctx.subscriptions`
 * and is never called early: disposing one would send `remove` for the same (connection, extension) owner and
 * withdraw the package. A MUD reconnect clears the GMCP state (the watch delivers `undefined`), which drops the
 * held list and restarts the schedule; `state: connected` restarts it too; leaving `connected` stops it.
 *
 * Contacts and notes (1.3.0): a BUDDIES | CONTACTS tab row over the bar. CONTACTS sends `Spacebook.GetContacts {}`
 * (on opening it and on its REFRESH) and lists `Spacebook.Contacts` (everyone you know by name on Spacebook, buddies
 * first) through the same filters and search. A contact (or **Notes** on a buddy's menu) opens a contact view: the
 * head, [ VIEW PROFILE ] when viewable, ┤WHAT YOU KNOW├ (learned likes and loves, with where they came from) and
 * ┤YOUR NOTES├ with [ ADD NOTE ], and per note EDIT (inline) and DELETE (confirmed): `Spacebook.AddNote`, `EditNote`,
 * `DeleteNote`. `Spacebook.Contact` replaces one contact by key, live, in the list, the view and open profiles. A
 * buddy's profile shows the same two blocks. Every note button is hidden under `error` or `cached`.
 *
 * Lately (1.4.0): a contact's view and anyone else's profile open with ┤LATELY├ when the payload's `lately` has rows:
 * what most recently changed how they feel about you, in the game's words (cause, "<name> <effect>.", when), never a number.
 *
 * Shown 'auto': the panel joins Views and adds itself the first time a session receives a list. Activation is
 * `onGmcp:Spacebook`, so on a game that never sends the package the extension stays dormant.
 */
import { defineExtension, h, type Dispose, type JsonSchema, type Mu, type PanelMountCtx } from '@muclient/sdk';
import { COPY } from './copy';
import { BLURB_MAX, BUDDY_KIND, NOTE_MAX, SETTINGS, type SpacebookApi, type SpacebookCard, type SpacebookContact, type SpacebookContacts, type SpacebookLately, type SpacebookLearned, type SpacebookList, type SpacebookNote, type SpacebookProfile, type SpacebookProfileError, type SpacebookRecord, type SpacebookStatus, type SpacebookView } from './types';

export type { SpacebookApi, SpacebookBuddyData, SpacebookCard, SpacebookContact, SpacebookContacts, SpacebookLately, SpacebookLearned, SpacebookLearnSource, SpacebookList, SpacebookNote, SpacebookProfile, SpacebookProfileError, SpacebookRecord, SpacebookResults, SpacebookSelf, SpacebookStatus, SpacebookView } from './types';
export { BLURB_MAX, BUDDY_KIND, NOTE_MAX, SETTINGS } from './types';
export { COPY } from './copy';

const ID = 'spacebook';
const PKG = 'Spacebook.List';
/** What `mu.gmcp.supports` declares (the manifest's package, re-declared at runtime to heal a lost declaration). */
export const SUPPORTS = ['Spacebook 1'];
/** Synced per world: pending keys already announced (the last 500). */
const SEEN_KEY = 'seen.pending';

/**
 * The `Spacebook.Get` schedule while a connected session holds no list, in ms: the first wait gives the server's
 * own login push a chance, then it backs off; the last value repeats while still waiting. A re-declaration of
 * {@link SUPPORTS} goes with every step from the second on (`redeclareFrom`), so in the steady state it is one
 * per 90 s, and at most `redeclareMax` per waiting spell (each one is a live registration kept until deactivation,
 * so the count stays bounded; the Get keeps going). Mutable, so a test can shorten it (`RETRY.delays = [...]`).
 */
export const RETRY: { delays: number[]; redeclareFrom: number; redeclareMax: number; redeclareGap: number; refreshGap: number } =
  { delays: [2_000, 6_000, 15_000, 40_000, 90_000], redeclareFrom: 1, redeclareMax: 24, redeclareGap: 30_000, refreshGap: 5_000 };
export const retryDelay = (step: number) => RETRY.delays[Math.min(step, RETRY.delays.length - 1)] ?? 90_000;
/** Runtime re-declarations in one activation, in all (each is a registration that lives until deactivation). */
export const DECLARE_MAX = 1000;

/** A relative time for the CACHED note: `then` in unix seconds, `now` in ms. Terse, no libraries. */
export function agoOf(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round(now / 1000 - then));
  if (s < 10) return COPY.ago.now;
  if (s < 60) return COPY.ago.s(s);
  const m = Math.round(s / 60);
  if (m < 60) return COPY.ago.min(m);
  const hh = Math.round(m / 60);
  if (hh < 48) return COPY.ago.h(hh);
  return COPY.ago.d(Math.round(hh / 24));
}

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
${R} .bar .refresh { margin-left: auto; }
${R} .note { margin: 0; padding: 3px 10px; font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-faint); border-bottom: 1px solid var(--border); }
${R} .scroll { flex: 1; overflow-y: auto; padding: 0 10px 6px; }
${R} .reason { margin: .9rem 0 0; display: flex; flex-direction: column; gap: 4px; }
${R} .reason .lbl { font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-faint); }
${R} .reason .why { font-size: .82rem; color: var(--fg-dim); }
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
${R} .modes { display: flex; background: var(--bg-elev); border-bottom: 1px solid var(--border); }
${R} .mode { position: relative; display: inline-flex; align-items: center; gap: 7px; min-height: 28px; padding: 0 13px; background: none; border: 0; border-right: 1px solid var(--border); color: var(--fg-dim); font: inherit; font-size: .68rem; letter-spacing: .15em; text-transform: uppercase; cursor: pointer; transition: color .12s ease, background-color .12s ease; }
${R} .mode:hover { background: var(--tint-hover); }
${R} .mode[aria-selected="true"] { color: var(--accent-bright); background: var(--bg); }
${R} .mode[aria-selected="true"]::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 2px; background: var(--accent); }
${R} .mode:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: -2px; }
${R} .tally { margin-left: auto; font-size: .6rem; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-faint); white-space: nowrap; }
${R} .know { display: grid; grid-template-columns: max-content 1fr; gap: 3px 1.5ch; padding: 2px 0 6px 2.4ch; font-size: .8rem; }
${R} .know .fl { font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-faint); padding-top: .15em; }
${R} .know .vals { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
${R} .know .val { color: var(--fg); overflow-wrap: anywhere; }
${R} .know .src { margin-left: 1ch; font-size: .7rem; color: var(--fg-faint); }
${R} .lately { display: flex; flex-direction: column; gap: 4px; padding: 2px 0 6px 2.4ch; font-size: .8rem; }
${R} .lately .lt { min-width: 0; }
${R} .lately .cause { color: var(--fg); overflow-wrap: anywhere; }
${R} .lately .eff { color: var(--accent, var(--fg)); overflow-wrap: anywhere; }
${R} .lately .when { margin-left: 1ch; font-size: .7rem; color: var(--fg-faint); }
${R} .nacts { display: flex; gap: 6px; padding: 0 0 4px 2.4ch; }
${R} .nt { display: flex; flex-direction: column; gap: 3px; padding: 6px 0 6px 2.4ch; border-bottom: 1px solid var(--border); }
${R} .nt .tx { font-size: .8rem; color: var(--fg); white-space: pre-wrap; overflow-wrap: anywhere; }
${R} .nt .mt { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; color: var(--fg-faint); }
${R} .nt .mt .when { flex: 1; min-width: 0; }
${R} .ed { display: flex; flex-direction: column; gap: 4px; padding: 6px 0 6px 2.4ch; border-bottom: 1px solid var(--border); }
${R} .ed textarea { width: 100%; min-height: 4.5em; resize: vertical; font-family: var(--font-mono); }
${R} .ed .ln { display: flex; align-items: center; gap: 6px; }
${R} .ed .len { flex: 1; font-size: .62rem; letter-spacing: .1em; color: var(--fg-faint); }
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
const intOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0);
const SOURCES = ['told', 'gift', 'delivery'] as const;

/** A learned detail as the server sends it → a complete one. Null without a value. Exported for tests. @since 1.3.0 */
export function learnedOf(v: unknown): SpacebookLearned | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const value = str(d.value).trim(), field = str(d.field).trim();
  if (!value) return null;
  const src = str(d.source).trim().toLowerCase();
  const label = str(d.label).trim() || (field ? field[0]!.toUpperCase() + field.slice(1) : '');
  return { field, label, id: str(d.id), value, source: (SOURCES as readonly string[]).includes(src) ? src as SpacebookLearned['source'] : '', time: intOf(d.time) };
}

/** A note as the server sends it → a complete one. Null without an integer id. Exported for tests. @since 1.3.0 */
export function noteOf(v: unknown): SpacebookNote | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (typeof d.id !== 'number' || !Number.isInteger(d.id)) return null;
  return { id: d.id, text: str(d.text), time: intOf(d.time), edited: intOf(d.edited) };
}

/** One lately change as the server sends it → a complete one. Null without a cause and an effect. Exported for tests. @since 1.4.0 */
export function latelyOf(v: unknown): SpacebookLately | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const cause = str(d.cause).trim(), effect = str(d.effect).trim();
  if (!cause || !effect) return null;
  return { cause, effect, when: str(d.when).trim(), time: intOf(d.time) };
}

const latelyListOf = (v: unknown) => (Array.isArray(v) ? v.map(latelyOf).filter((x): x is SpacebookLately => !!x) : []);
const learnedListOf = (v: unknown) => (Array.isArray(v) ? v.map(learnedOf).filter((x): x is SpacebookLearned => !!x) : []);
const notesOf = (v: unknown) => (Array.isArray(v) ? v.map(noteOf).filter((x): x is SpacebookNote => !!x) : []);

/** A contact (one of `Spacebook.Contacts`, or `Spacebook.Contact`) → a complete one. Null without a key and a name. @since 1.3.0 */
export function contactOf(v: unknown): SpacebookContact | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const known = str(d.known_as).trim();
  const c = cardOf(str(d.name).trim() ? d : { ...d, name: known });
  if (!c) return null;
  return { ...c, known_as: known || c.name, learned: learnedListOf(d.learned), notes: notesOf(d.notes), lately: latelyListOf(d.lately) };
}

/** A `Spacebook.Contacts` payload → the contacts (with `error` / `cached` as in the list), or null. Exported for tests. @since 1.3.0 */
export function contactsOf(data: unknown): SpacebookContacts | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const out: SpacebookContacts = { contacts: Array.isArray(d.contacts) ? d.contacts.map(contactOf).filter((c): c is SpacebookContact => !!c) : [] };
  const error = str(d.error).trim();
  if (error) out.error = error;
  if (typeof d.cached === 'number' && Number.isFinite(d.cached) && d.cached > 0) out.cached = Math.floor(d.cached);
  return out;
}

/** Learned details grouped by their field label, in the server's order ("Loves" before "Likes"). Exported for tests. @since 1.3.0 */
export function groupLearned(list: SpacebookLearned[]): { label: string; items: SpacebookLearned[] }[] {
  const out: { label: string; items: SpacebookLearned[] }[] = [];
  for (const l of list) {
    const g = out.find((x) => x.label === l.label);
    if (g) g.items.push(l); else out.push({ label: l.label, items: [l] });
  }
  return out;
}

/** A note the server accepts: trimmed, at most {@link NOTE_MAX} characters. @since 1.3.0 */
export const clampNote = (s: string) => [...s.trim()].slice(0, NOTE_MAX).join('');

/** A `Spacebook.Profile` payload → a profile, an error (`{key, name, error}`), or null when it is neither. Exported for tests. */
export function profileOf(data: unknown): SpacebookProfile | SpacebookProfileError | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.error === 'string' && d.error) return { key: str(d.key), name: str(d.name).trim(), error: d.error };
  const c = cardOf(d);
  if (!c) return null;
  const visible = d.friends_visible === true;
  return { ...c, shares_friends: d.shares_friends === true, friends_visible: visible, friends_hidden: visible ? '' : str(d.friends_hidden).trim(), friends: visible ? cardsOf(d.friends) : [], introducer: d.introducer === true, learned: learnedListOf(d.learned), notes: notesOf(d.notes), lately: latelyListOf(d.lately) };
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
  const out: SpacebookList = {
    self: { name: str(self.name).trim(), blurb: str(self.blurb).trim(), public: !!self.public, share_friends: self.share_friends !== false, portrait: str(self.portrait).trim() || 'placeholder' },
    pending: recs(d.pending),
    buddies: recs(d.buddies),
  };
  const error = str(d.error).trim();
  if (error) out.error = error;
  if (typeof d.cached === 'number' && Number.isFinite(d.cached) && d.cached > 0) out.cached = Math.floor(d.cached);
  return out;
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
/** Contacts through the same toggles and search (also over the name you know them by and their role), in the server's order (buddies first). @since 1.3.0 */
export function filterContacts(list: SpacebookContact[], f: Filter): SpacebookContact[] {
  const q = f.query.trim().toLowerCase();
  return list.filter((c) => {
    if (c.status === 'online' ? !f.online : !f.offline) return false;
    return !q || [c.name, c.known_as, c.role, c.blurb, c.location, c.acquaintance].some((s) => s.toLowerCase().includes(q));
  });
}
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
  /** [ REFRESH ]: send `Spacebook.Get` now and re-declare the package. */
  refresh(): void;
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
  /** Which list the panel shows (1.3.0): your buddies, or your contacts. */
  mode(): 'buddies' | 'contacts';
  /** Switch lists; CONTACTS asks for them (`Spacebook.GetContacts`). */
  setMode(m: 'buddies' | 'contacts'): void;
  /** The session's last `Spacebook.Contacts`, with live `Spacebook.Contact` updates; null before the first. */
  contacts(): SpacebookContacts | null;
  /** Open a contact's view. */
  openContact(who: { key: string; name: string }): void;
  /** The note being written or edited, if any (one at a time per panel). */
  editing(): NoteEdit | null;
  /** Open the inline editor: a new note (`id` null) or note `id`, prefilled with `text`. */
  editNote(key: string, id: number | null, text: string): void;
  /** The editor's text changed (no redraw). */
  typed(text: string): void;
  /** Close the editor without sending. */
  cancelEdit(): void;
  /** Send the editor's note (`AddNote` / `EditNote`), unless empty or unchanged; closes the editor. */
  saveEdit(): void;
  /** Ask, then send `Spacebook.DeleteNote`. */
  deleteNote(key: string, note: SpacebookNote): void;
}

/** The inline note editor's state: whose note, which (null = a new one), the text so far and what it was. */
export interface NoteEdit { key: string; id: number | null; text: string; was: string }

/**
 * The panel's DOM for one state. Exported for tests. `query` is the live search text. `note` is the CACHED line under
 * the bar (null when the list is live); without a list or with `error` nothing can be changed, so ADD and the foot go.
 */
export function renderPanel(hostApi: PanelHost, query: string): { modes: HTMLElement; bar: HTMLElement; note: HTMLElement | null; body: HTMLElement[]; foot: HTMLElement | null; targets: Dispose[] } {
  const css = hostApi.css;
  const list = hostApi.list();
  const f = hostApi.filter();
  const mode = hostApi.mode();
  const targets: Dispose[] = [];
  const toggle = (which: 'online' | 'offline', label: string, on: boolean) =>
    h('button', { class: `${css.toggle}${on ? '' : ` ${css.off}`}`, type: 'button', 'aria-pressed': String(on), 'data-testid': `sb-filter-${which}`, onclick: () => hostApi.setFilter(which, !on) }, label);
  const canChange = mode === 'buddies' && !!list && !list.error;
  const refresh = h('button', { class: `${css.cmd} refresh`, type: 'button', 'data-testid': 'sb-refresh', title: COPY.refresh, onclick: () => hostApi.refresh() }, COPY.refresh);
  const placeholder = mode === 'contacts' ? COPY.searchContacts : COPY.search;
  const bar = h('div', { class: 'bar' },
    toggle('online', COPY.online, f.online),
    toggle('offline', COPY.offline, f.offline),
    h('input', { class: css.field, type: 'search', name: 'query', value: query, placeholder, 'aria-label': placeholder, 'data-testid': 'sb-search', autocomplete: 'off' }),
    canChange ? h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-add', onclick: () => hostApi.add() }, COPY.add) : null,
    refresh,
  );
  const tab = (m: 'buddies' | 'contacts', label: string) =>
    h('button', { class: 'mode', type: 'button', role: 'tab', 'aria-selected': String(mode === m), 'data-testid': `sb-mode-${m}`, onclick: () => { if (mode !== m) hostApi.setMode(m); } }, label);
  const modes = h('div', { class: 'modes', role: 'tablist', 'aria-label': COPY.title }, tab('buddies', COPY.modeBuddies), tab('contacts', COPY.modeContacts));
  const head = (label: string, n: number) => secHead(css, label, n);
  const reason = (why: string) => h('div', { class: 'reason', 'data-testid': 'sb-empty', role: 'status' }, h('span', { class: 'lbl' }, COPY.noSignal), h('span', { class: 'why', 'data-testid': 'sb-reason' }, why));
  const cachedNote = (t?: number) => (t ? h('p', { class: 'note', 'data-testid': 'sb-cached' }, COPY.cached(agoOf(t))) : null);

  if (mode === 'contacts') {
    const cs = hostApi.contacts();
    if (!cs) return { modes, bar, note: null, body: [note(css, COPY.loading)], foot: null, targets };
    if (cs.error) return { modes, bar, note: cachedNote(cs.cached), body: [reason(cs.error)], foot: null, targets };
    const body: HTMLElement[] = [head(COPY.contacts, cs.contacts.length)];
    const shown = filterContacts(cs.contacts, { ...f, query });
    if (!cs.contacts.length) body.push(note(css, COPY.noContacts));
    else if (!shown.length) body.push(note(css, COPY.noContactMatch));
    for (const c of shown) {
      const row = cardRow(css, { ...c, name: c.known_as || c.name }, { testid: 'sb-contact', title: COPY.openContact });
      const t = COPY.tally(c.notes.length, c.learned.length);
      if (t) row.querySelector('.l1')!.append(h('span', { class: 'tally', 'data-testid': 'sb-tally' }, t));
      row.addEventListener('click', () => hostApi.openContact({ key: c.key, name: c.known_as || c.name }));
      body.push(row);
    }
    return { modes, bar, note: cachedNote(cs.cached), body, foot: null, targets };
  }

  if (!list) return { modes, bar, note: null, body: [h('p', { class: `${css.empty} awaiting`, 'data-testid': 'sb-empty' }, COPY.awaiting)], foot: null, targets };
  const cnote = cachedNote(list.cached);
  // The server's reason there is no book: the label line, then its text verbatim. Nothing else to draw.
  if (list.error) return { modes, bar, note: cnote, body: [reason(list.error)], foot: null, targets };

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
  return { modes, bar, note: cnote, body, foot, targets };
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
  // What you know and your notes (1.3.0), for anyone but yourself; changes only while the book is live.
  if (!self) { const l = hostApi.list(); body.push(...renderLately(hostApi, p.lately, p.name), ...renderIntel(hostApi, p.key, p.learned, p.notes, !!l && !l.error && !l.cached)); }
  const label = p.introducer ? COPY.introduces : COPY.friends;
  if (!p.friends_visible) { body.push(secHead(css, label), note(css, p.friends_hidden, 'sb-friends-hidden')); return { bar: viewBar(hostApi, p.name), body }; }
  body.push(secHead(css, label, p.friends.length));
  if (!p.friends.length) body.push(note(css, p.introducer ? COPY.noIntroductions : COPY.noFriends));
  body.push(...cardRows(hostApi, p.friends, 'sb-friend'));
  return { bar: viewBar(hostApi, p.name), body };
}

/**
 * ┤WHAT YOU KNOW├ (learned details grouped by field: "LOVES  real-grain whisky  they told you") and ┤YOUR NOTES (n)├
 * with [ ADD NOTE ], each note's text, when, and [ EDIT ] [ DELETE ], or the inline editor. `canChange` false (no
 * signal, or the pad's cached copy) leaves the notes readable and drops every button. Exported for tests. @since 1.3.0
 */
export function renderIntel(hostApi: PanelHost, key: string, learned: SpacebookLearned[], notes: SpacebookNote[], canChange: boolean): HTMLElement[] {
  const css = hostApi.css;
  const out: HTMLElement[] = [secHead(css, COPY.whatYouKnow)];
  if (!learned.length) out.push(note(css, COPY.knowNothing, 'sb-know-empty'));
  else {
    const grid = h('div', { class: 'know', 'data-testid': 'sb-know' });
    for (const g of groupLearned(learned)) {
      grid.append(h('span', { class: 'fl', 'data-testid': 'sb-know-field' }, g.label),
        h('div', { class: 'vals' }, ...g.items.map((l) => h('div', { class: 'val', 'data-testid': 'sb-know-value' }, l.value,
          l.source ? h('span', { class: 'src', 'data-testid': 'sb-know-source' }, COPY.source[l.source] ?? '') : null))));
    }
    out.push(grid);
  }
  out.push(secHead(css, COPY.yourNotes, notes.length));
  const ed = canChange ? hostApi.editing() : null;
  const mine = ed && ed.key === key ? ed : null;
  const editor = (e: NoteEdit) => {
    const ta = h('textarea', { class: css.field, name: 'note', rows: '3', maxlength: String(NOTE_MAX), placeholder: COPY.notePlaceholder, 'aria-label': COPY.noteLabel, 'data-testid': 'sb-note-text' }) as HTMLTextAreaElement;
    ta.value = e.text;
    const len = h('span', { class: 'len', 'data-testid': 'sb-note-len' }, COPY.noteLen([...e.text].length, NOTE_MAX));
    ta.addEventListener('input', () => { hostApi.typed(ta.value); len.textContent = COPY.noteLen([...ta.value].length, NOTE_MAX); });
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); hostApi.cancelEdit(); }
      else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); hostApi.saveEdit(); }
    });
    return h('div', { class: 'ed', 'data-testid': 'sb-note-editor', 'data-id': e.id === null ? '' : String(e.id) }, ta,
      h('div', { class: 'ln' }, len,
        h('button', { class: `${css.cmd} primary`, type: 'button', 'data-testid': 'sb-note-save', onclick: () => hostApi.saveEdit() }, COPY.saveNote),
        h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-note-cancel', onclick: () => hostApi.cancelEdit() }, COPY.cancelNote)));
  };
  if (canChange) {
    if (mine && mine.id === null) out.push(editor(mine));
    else out.push(h('div', { class: 'nacts' }, h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-note-add', onclick: () => hostApi.editNote(key, null, '') }, COPY.addNote)));
  }
  if (!notes.length && !(mine && mine.id === null)) out.push(note(css, COPY.noNotes, 'sb-notes-empty'));
  for (const n of notes) {
    if (mine && mine.id === n.id) { out.push(editor(mine)); continue; }
    out.push(h('div', { class: 'nt', 'data-testid': 'sb-note', 'data-id': String(n.id) },
      h('div', { class: 'tx' }, n.text),
      h('div', { class: 'mt' }, h('span', { class: 'when' }, COPY.noteWhen(n.time ? agoOf(n.time) : '', n.edited ? agoOf(n.edited) : '')),
        canChange ? h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-note-edit', onclick: () => hostApi.editNote(key, n.id, n.text) }, COPY.editNote) : null,
        canChange ? h('button', { class: `${css.cmd} danger`, type: 'button', 'data-testid': 'sb-note-delete', onclick: () => hostApi.deleteNote(key, n) }, COPY.deleteNote) : null)));
  }
  return out;
}

/**
 * ┤LATELY├: what most recently changed how they feel about you, newest first — the cause, then the change in
 * words ("Hansen likes you a lot more."), then roughly when. Nothing at all when nothing has (a player, or an NPC you
 * have not moved). Exported for tests. @since 1.4.0
 */
export function renderLately(hostApi: PanelHost, lately: SpacebookLately[], name: string): HTMLElement[] {
  if (!lately.length) return [];
  const css = hostApi.css;
  return [secHead(css, COPY.lately), h('div', { class: 'lately', 'data-testid': 'sb-lately' },
    ...lately.map((e) => h('div', { class: 'lt', 'data-testid': 'sb-lately-row' },
      h('div', { class: 'cause', 'data-testid': 'sb-lately-cause' }, e.cause),
      h('div', null, h('span', { class: 'eff', 'data-testid': 'sb-lately-effect' }, COPY.latelyEffect(name, e.effect)),
        e.when ? h('span', { class: 'when', 'data-testid': 'sb-lately-when' }, e.when) : null))))];
}

/** A contact's view: the head, [ VIEW PROFILE ] when viewable, then what you know and your notes. Exported for tests. @since 1.3.0 */
export function renderContact(hostApi: PanelHost, view: Extract<SpacebookView, { kind: 'contact' }>): { bar: HTMLElement; note: HTMLElement | null; body: HTMLElement[] } {
  const css = hostApi.css;
  const cs = hostApi.contacts();
  if (!cs) return { bar: viewBar(hostApi, view.name), note: null, body: [note(css, COPY.loading)] };
  const cnote = cs.cached ? h('p', { class: 'note', 'data-testid': 'sb-cached' }, COPY.cached(agoOf(cs.cached))) : null;
  if (cs.error) return { bar: viewBar(hostApi, view.name), note: cnote, body: [h('div', { class: 'reason', 'data-testid': 'sb-empty', role: 'status' }, h('span', { class: 'lbl' }, COPY.noSignal), h('span', { class: 'why', 'data-testid': 'sb-reason' }, cs.error))] };
  const c = cs.contacts.find((x) => x.key === view.key);
  if (!c) return { bar: viewBar(hostApi, view.name), note: cnote, body: [note(css, COPY.notContact, 'sb-error')] };
  const name = c.known_as || c.name;
  const head = cardRow(css, { ...c, name }, { testid: 'sb-contact-head' });
  head.classList.add('head');
  const body: HTMLElement[] = [head];
  if (c.viewable) body.push(h('div', { class: 'acts' }, h('button', { class: css.cmd, type: 'button', 'data-testid': 'sb-view-profile', onclick: () => hostApi.openProfile({ key: c.key, name: c.name }) }, COPY.viewProfile)));
  body.push(...renderLately(hostApi, c.lately, name), ...renderIntel(hostApi, c.key, c.learned, c.notes, !cs.cached));
  return { bar: viewBar(hostApi, name), note: cnote, body };
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
  /** A `Spacebook.Contact`: refresh the learned details and notes of open profiles of that key. */
  contact(c: SpacebookContact): void;
  openContact(who: { key: string; name?: string }): void;
  results(r: { term: string; results: SpacebookCard[] }): void;
  open(who: { key?: string; name?: string }): void;
}

// ─── the extension ────────────────────────────────────────────────────────────────────────────────────────────

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    mu.ui.style(SPACEBOOK_CSS);
    const css = mu.ui.css;

    /**
     * Declare `Spacebook 1` at runtime, on top of the manifest's declaration. The backend keeps one declaration per
     * (connection, extension), so a repeat is a no-op while it stands and re-adds the package after a reconnect
     * lost it (the game then answers `Core.Supports.Add` with a fresh list). Each Dispose goes into
     * `ctx.subscriptions` and none is called before deactivation: disposing one sends `remove` for the same owner
     * and would withdraw the package from the game.
     */
    const declare = () => { ctx.subscriptions.push(mu.gmcp.supports(SUPPORTS)); };
    declare();

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
        id: 'notes', target: KIND as 'spacebook.buddy', order: 20, title: COPY.notes,
        when: (t) => !!buddyOf(t),
        run: (t) => { const b = buddyOf(t); if (b) api.openContact({ key: b.key, name: b.name }, t.sid ?? undefined); },
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

    // Per-session state: the last list, the last contacts (with live Spacebook.Contact updates), and the panels drawing them.
    const lists = new Map<string, SpacebookList>();
    const contactsBy = new Map<string, SpacebookContacts>();
    /** A `Spacebook.Contact`: replace that contact in the held contacts by key (or add it when new), and hand it to open profiles. */
    const upsertContact = (sid: string, c: SpacebookContact) => {
      const cs = contactsBy.get(sid);
      if (cs) { const i = cs.contacts.findIndex((x) => x.key === c.key); if (i >= 0) cs.contacts[i] = c; else cs.contacts.push(c); }
      for (const a of panelAnswers.get(sid) ?? []) a.contact(c);
      redraw(sid);
    };
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

    // ─── asking for the list ───
    /** Per session: the retry timer, where it is in the schedule, and how often this spell re-declared. */
    const waits = new Map<string, { timer: ReturnType<typeof setTimeout> | null; step: number; redeclared: number }>();
    let lastDeclare = 0, declared = 0;
    /**
     * A re-declaration (each is a live registration kept until deactivation, so they are capped): at most one per
     * `minGap` ms across sessions, {@link RETRY.redeclareMax} per waiting spell and {@link DECLARE_MAX} in all.
     */
    const redeclare = (w: { redeclared: number } | null, minGap: number) => {
      const now = Date.now();
      if (declared >= DECLARE_MAX || now - lastDeclare < minGap || (w && w.redeclared >= RETRY.redeclareMax)) return false;
      if (w) w.redeclared++;
      declared++; lastDeclare = now; declare();
      return true;
    };
    const stopAsking = (sid: string) => { const w = waits.get(sid); if (w?.timer) { clearTimeout(w.timer); w.timer = null; } };
    const connected = (sid: string) => mu.sessions.list().find((s) => s.id === sid)?.state === 'connected';
    /** Arm the next `Spacebook.Get` for a connected session without a list; a no-op once a list is held or the link is down. */
    const askLater = (sid: string) => {
      const w = waits.get(sid);
      if (!w || lists.has(sid) || !connected(sid)) { stopAsking(sid); return; }
      if (w.timer) clearTimeout(w.timer);
      w.timer = setTimeout(() => {
        w.timer = null;
        if (lists.has(sid) || !connected(sid)) return;
        // GMCP not up yet: nothing to send, check again after the same wait without spending a step.
        if (!mu.gmcp.negotiated(sid)) { askLater(sid); return; }
        if (w.step >= RETRY.redeclareFrom) redeclare(w, RETRY.redeclareGap);
        send(sid, 'Spacebook.Get', {});
        w.step++;
        askLater(sid);
      }, retryDelay(w.step));
    };
    /** Start the schedule over: on `connected`, and when the held list is cleared. */
    const askFresh = (sid: string) => { const w = waits.get(sid); if (!w) return; stopAsking(sid); w.step = 0; w.redeclared = 0; askLater(sid); };
    /** [ REFRESH ] and `api.refresh`: ask now and re-declare (a player's click, so a short gap), whatever the schedule says. */
    const refreshNow = async (sid: string) => {
      redeclare(null, RETRY.refreshGap);
      return (await mu.gmcp.send('Spacebook.Get', {}, sid)) === true;
    };
    /** Ask for the contacts (1.3.0): on opening CONTACTS, on its REFRESH, and when a contact view finds none held. */
    const askContacts = async (sid: string) => (await mu.gmcp.send('Spacebook.GetContacts', {}, sid)) === true;

    const mount = (hostEl: HTMLElement, pc: PanelMountCtx): Dispose => {
      const root = h('section', { class: 'mu-spacebook', 'aria-label': COPY.title, 'data-focus-region': ID, tabindex: '-1', 'data-testid': 'spacebook' });
      hostEl.append(root);
      const sid = pc.sid;
      let query = '';
      let targets: Dispose[] = [];
      let mode: 'buddies' | 'contacts' = 'buddies';
      /** The inline note editor (one at a time); closed by BACK, by switching views, and on save or cancel. */
      let edit: NoteEdit | null = null;
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
        contact: (c) => {
          for (const v of views) if (v.kind === 'profile' && v.profile && !('error' in v.profile) && v.profile.key === c.key) v.profile = { ...v.profile, learned: c.learned, notes: c.notes, lately: c.lately };
          // The panel's own redraw follows (upsertContact redraws the session).
        },
        openContact: (who) => api.openContact({ key: who.key, name: who.name ?? '' }),
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
        refresh: () => { if (!sid) return; if (mode === 'contacts') { redeclare(null, RETRY.refreshGap); void askContacts(sid); } else void refreshNow(sid); },
        openProfile: (who) => {
          if (!sid || (!who.key && !who.name)) return;
          edit = null;
          push({ kind: 'profile', key: who.key ?? '', name: who.name ?? '', profile: null });
          send(sid, 'Spacebook.GetProfile', who.key ? { key: who.key } : { name: who.name });
        },
        back: () => { views.pop(); edit = null; draw(); },
        addBuddy: (name) => { if (sid) send(sid, 'Spacebook.Add', { name }); },
        page: (name) => { mu.input.fill(COPY.cmdPage(name), { sid: sid ?? undefined }); mu.input.focus(sid ?? undefined); },
        target: (el, buddy) => (sid ? mu.menus.target(el, { kind: KIND, sid, data: { buddy } } as Parameters<Mu['menus']['target']>[1]) : () => {}),
        openMenu: (el) => {
          const r = el.getBoundingClientRect();
          el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 12, clientY: r.top + 12 }));
        },
        mode: () => mode,
        setMode: (m) => { mode = m; if (m === 'contacts' && sid) void askContacts(sid); draw(); },
        contacts: () => (sid ? contactsBy.get(sid) ?? null : null),
        openContact: (who) => {
          if (!sid || !who.key) return;
          edit = null;
          const held = contactsBy.get(sid);
          if (!held || held.error || !held.contacts.some((c) => c.key === who.key)) void askContacts(sid);
          push({ kind: 'contact', key: who.key, name: who.name || who.key });
        },
        editing: () => edit,
        editNote: (key, id, text) => { edit = { key, id, text, was: text }; draw(); root.querySelector<HTMLTextAreaElement>('textarea[name=note]')?.focus(); },
        typed: (text) => { if (edit) edit.text = text; },
        cancelEdit: () => { edit = null; draw(); },
        saveEdit: () => {
          if (!edit || !sid) return;
          const text = clampNote(edit.text);
          if (!text) return;
          const e = edit;
          edit = null;
          if (e.id === null) send(sid, 'Spacebook.AddNote', { key: e.key, text });
          else if (text !== e.was) send(sid, 'Spacebook.EditNote', { key: e.key, id: e.id, text });
          draw();
        },
        deleteNote: async (key, n) => {
          if (!sid) return;
          if (await mu.ui.confirm({ title: COPY.deleteTitle, body: n.text, confirm: COPY.deleteConfirm, danger: true })) send(sid, 'Spacebook.DeleteNote', { key, id: n.id });
        },
      };
      const draw = () => {
        for (const d of targets) d();
        targets = [];
        const view = views[views.length - 1];
        const top = root.querySelector('.scroll')?.scrollTop ?? 0;
        if (view) {
          // A redraw under the note editor (a live update) keeps its focus and caret.
          const ta = root.querySelector<HTMLTextAreaElement>('textarea[name=note]');
          const focused = !!ta && ta.ownerDocument.activeElement === ta;
          const caret = ta?.selectionStart ?? null;
          const out = view.kind === 'profile' ? { ...renderProfile(api, view), note: null } : view.kind === 'contact' ? renderContact(api, view) : { ...renderResults(api, view), note: null };
          const scroll = h('div', { class: 'scroll' }, ...out.body);
          root.replaceChildren(out.bar, ...(out.note ? [out.note] : []), scroll);
          scroll.scrollTop = top;
          const nta = root.querySelector<HTMLTextAreaElement>('textarea[name=note]');
          if (nta && focused) { nta.focus(); if (caret !== null) nta.setSelectionRange(caret, caret); }
          return;
        }
        const out = renderPanel(api, query);
        targets = out.targets;
        const input = out.bar.querySelector<HTMLInputElement>('input[name=query]');
        input?.addEventListener('input', () => { query = input.value; drawBody(); });
        const scroll = h('div', { class: 'scroll' }, ...out.body);
        root.replaceChildren(out.modes, out.bar, ...(out.note ? [out.note] : []), scroll, ...(out.foot ? [out.foot] : []));
        scroll.scrollTop = top;
      };
      /** A keystroke in the search redraws the list only, so the field keeps focus and its caret. */
      const drawBody = () => {
        if (views.length) return;
        for (const d of targets) d();
        const out = renderPanel(api, query);
        targets = out.targets;
        const scroll = root.querySelector('.scroll');
        scroll?.replaceChildren(...out.body);
        const note = root.querySelector('.note');
        if (out.note) { if (note) note.replaceWith(out.note); else scroll?.before(out.note); } else note?.remove();
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
      waits.set(s.id, { timer: null, step: 0, redeclared: 0 });
      const off = mu.gmcp.watch(PKG, (data, m) => {
        const list = listOf(data);
        // A MUD reconnect clears the GMCP state: the list goes and the asking starts over.
        if (!list) { if (data === undefined) { lists.delete(s.id); contactsBy.delete(s.id); redraw(s.id); askFresh(s.id); } return; }
        lists.set(s.id, list);
        stopAsking(s.id);
        if (!touched) { touched = true; mu.panels.touch(ID, s.id); }
        announce(s.id, list, !!m.replay);
        redraw(s.id);
      }, { sid: s.id });
      // The link: `connected` starts the schedule over (a fresh connection has no declarations and no push yet); anything else stops it.
      const offS = mu.sessions.on('state', (ref) => { if (ref.state === 'connected') askFresh(s.id); else stopAsking(s.id); }, { sid: s.id });
      // Already connected with no list (the common case right after activation): start asking.
      askLater(s.id);
      // Answers, not state: only fresh ones (a replayed profile belongs to an earlier panel).
      const offP = mu.gmcp.on('Spacebook.Profile', (data, m) => { const p = profileOf(data); if (p && !m.replay) for (const a of panelAnswers.get(s.id) ?? []) a.profile(p); }, { sid: s.id });
      const offR = mu.gmcp.on('Spacebook.Results', (data, m) => { const r = resultsOf(data); if (r && !m.replay) for (const a of panelAnswers.get(s.id) ?? []) a.results(r); }, { sid: s.id });
      // Contacts (1.3.0): the whole set in answer to GetContacts, then one contact at a time (a note changed, a detail learned).
      const offC = mu.gmcp.on('Spacebook.Contacts', (data) => { const cs = contactsOf(data); if (cs) { contactsBy.set(s.id, cs); redraw(s.id); } }, { sid: s.id });
      const offC1 = mu.gmcp.on('Spacebook.Contact', (data, m) => { const c = contactOf(data); if (c && !m.replay) upsertContact(s.id, c); }, { sid: s.id });
      const a = mu.settings.watch(SETTINGS.online, () => redraw(s.id), { sid: s.id });
      const b = mu.settings.watch(SETTINGS.offline, () => redraw(s.id), { sid: s.id });
      return () => { stopAsking(s.id); waits.delete(s.id); off(); offS(); offP(); offR(); offC(); offC1(); a(); b(); lists.delete(s.id); contactsBy.delete(s.id); redraws.delete(s.id); panelAnswers.delete(s.id); };
    }));
    // Deactivation: the `each` dispose above runs per session, and this clears any timer left should it not.
    ctx.subscriptions.push(() => { for (const sid of [...waits.keys()]) stopAsking(sid); waits.clear(); });

    const api: SpacebookApi = {
      list: (sid) => { const s = sid ?? mu.sessions.active()?.id; const l = s ? lists.get(s) : undefined; return l ? structuredClone(l) : null; },
      refresh: async (sid) => { const s = sid ?? mu.sessions.active()?.id; return s ? refreshNow(s) : false; },
      openProfile: (who, sid) => {
        const s = sid ?? mu.sessions.active()?.id;
        if (!s) return;
        const open = [...(panelAnswers.get(s) ?? [])];
        if (open.length) open[0]!.open(who);
        else { mu.panels.open(ID, undefined, { sid: s }); queueMicrotask(() => [...(panelAnswers.get(s) ?? [])][0]?.open(who)); }
      },
      contacts: (sid) => { const s = sid ?? mu.sessions.active()?.id; const c = s ? contactsBy.get(s) : undefined; return c ? structuredClone(c) : null; },
      openContact: (who, sid) => {
        const s = sid ?? mu.sessions.active()?.id;
        if (!s || !who?.key) return;
        const open = [...(panelAnswers.get(s) ?? [])];
        if (open.length) open[0]!.openContact(who);
        else { mu.panels.open(ID, undefined, { sid: s }); queueMicrotask(() => [...(panelAnswers.get(s) ?? [])][0]?.openContact(who)); }
      },
    };
    return api;
  },
});
