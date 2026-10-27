/**
 * `npm test`: the extension in the headless μClient host (@runmu.sh/dev/test) with a happy-dom document for the
 * panel. The host's `mu.menus.kind/target/context`, `panels.touch/badge`, `notify.mention`, `input.fill` and
 * `ui.prompt/confirm` are replaced by recording fakes, as the real host checks and records them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function find() {
  if (process.env.MUCLIENT_DEV_TEST) return process.env.MUCLIENT_DEV_TEST;
  try { return createRequire(join(ROOT, 'package.json')).resolve('@runmu.sh/dev/test'); } catch { /* next */ }
  throw new Error('@runmu.sh/dev/test was not found. Run npm install (it is in the @runmu.sh/dev devDependency).');
}
const { createHost } = await import(pathToFileURL(find()).href);
const { validate } = await import('./schema.mjs');

const win = new Window();
globalThis.window = win;
globalThis.document = win.document;
globalThis.HTMLElement = win.HTMLElement;
globalThis.Node = win.Node;
globalThis.MouseEvent = win.MouseEvent;
globalThis.Event = win.Event;

const tick = () => new Promise((r) => setTimeout(r, 0));
const rec = (key, name, status, acquaintance = '', location = '', blurb = '') => ({ key, name, status, acquaintance, location, blurb, portrait: 'placeholder' });
const LIST = {
  self: { name: 'Nylys Gupta', blurb: "I make stuff and get it where it's needed.", public: true, portrait: 'placeholder' },
  pending: [rec('p1', 'Viktor Faust', 'online'), rec('p2', 'Annabelle Swagart', 'offline')],
  buddies: [
    rec('b1', 'Yulia Kozlov', 'offline', 'close friend', 'Cube 3148', "Night shift. Don't page before 1800."),
    rec('b2', 'Radical Ray', 'online', 'friend', "Radical Ray's"),
    rec('b3', 'Pol Castro', 'deceased', 'passing acquaintance'),
    rec('b4', "Ol' Red", 'online', 'rival', 'Triggered'),
    rec('b5', 'Aarya Yadav', 'online', 'trusted contact', 'Triage Hallway', 'Patch you up, no questions. Mostly.'),
    { key: 'b6', name: 'Mystery', status: 'wat', portrait: 'https://img.example/m.png' },
  ],
};

const card = (key, name, o = {}) => ({ key, name, role: '', status: 'offline', portrait: 'placeholder', acquaintance: 'unknown', buddy: false, viewable: false, blurb: '', location: '', ...o });
/** As the server sends them (shapes captured from Torchship's $spacebook_fo:profile and :search). */
const PROFILE = {
  ...card('b1', 'Yulia Kozlov', { status: 'online', acquaintance: 'close friend', buddy: true, viewable: true, blurb: 'Night shift.', location: 'Cube 3148' }),
  shares_friends: true, friends_hidden: '', friends_visible: true, introducer: false,
  friends: [card('f1', 'Kaori Nagao', { role: 'librarian', status: 'online', viewable: true, blurb: 'Quiet, please.' }), card('f2', 'Duke', { acquaintance: 'rival' })],
};
const NPC = { ...card('n1', 'Kaori Nagao', { role: 'librarian', status: 'online', viewable: true }), shares_friends: false, friends_hidden: 'Kaori Nagao keeps their friends to themselves.', friends_visible: false, friends: [], introducer: true };
const RESULTS = { term: 'gupta', results: [card('r1', 'Nylys Gupta', { viewable: true, blurb: "I make stuff and get it where it's needed." })] };

function fake(host, { legacy = false, owner = true } = {}) {
  const kinds = new Map(), targets = [], touches = [], badges = [], mentions = [], contexts = [], fills = [], prompts = [];
  if (legacy) host.mu.menus.kind = undefined;
  else host.mu.menus.kind = (spec) => { kinds.set(spec.id, spec); return () => kinds.delete(spec.id); };
  host.mu.menus.target = (el, t) => {
    if (!legacy && !t.kind.startsWith('x-') && !kinds.has(t.kind)) throw new Error(`menus.target(${t.kind}): not a registered kind`);
    const r = { el, t, live: true }; targets.push(r); return () => { r.live = false; };
  };
  host.mu.menus.context = (spec) => { contexts.push(spec); return () => { const i = contexts.indexOf(spec); if (i >= 0) contexts.splice(i, 1); }; };
  host.mu.input.fill = (text, o) => fills.push([text, o?.sid]);
  host.mu.input.focus = () => {};
  host.mu.panels.touch = (id, sid) => touches.push([id, sid]);
  // As the real host: a badge or touch on a panel this extension has not registered yet throws.
  host.mu.panels.badge = (id, b, sid) => { if (!host.panels.has(id)) throw new Error(`panel "${id}" is not registered by this extension`); badges.push([id, b, sid]); };
  host.mu.notify.mention = async (m) => { mentions.push(m); };
  host.mu.effects.owner = () => owner;
  // The real host's class names (the stub maps each key to its own name).
  host.mu.ui.css = { ...host.mu.ui.css, cmd: 'sh-cmd', toggle: 'sh-toggle', plate: 'sh-plate', count: 'sh-count', field: 'sh-field', label: 'sh-label', secHead: 'sec-head', secClose: 'sec-close', empty: 'empty', glow: 'glow-text' };
  host.mu.ui.prompt = async (spec) => { prompts.push(spec); return host.promptAnswer ?? null; };
  host.mu.ui.confirm = async (spec) => { prompts.push(spec); return host.confirmAnswer ?? false; };
  return { kinds, targets, touches, badges, mentions, contexts, fills, prompts };
}

async function setup({ legacy = false, owner = true, ...hostOpts } = {}) {
  const host = createHost({ root: ROOT, sessions: [{ id: 's1', worldId: 'w1' }], ...hostOpts });
  const f = fake(host, { legacy, owner });
  const ext = await host.load('src/index.ts');
  const mount = (sid = 's1') => {
    const el = document.createElement('div');
    document.body.append(el);
    const off = host.panels.get('spacebook').mount(el, { sid, worldId: 'w1', params: {} });
    const q = (s) => el.querySelector(s);
    const all = (s) => [...el.querySelectorAll(s)];
    return { el, off, q, all, root: () => q('[data-testid=spacebook]') };
  };
  return { host, ext, mount, ...f };
}
const names = (p) => p.all('[data-testid=sb-buddy] .name').map((n) => n.textContent);

test('registration: panel right-bottom, order 40, singleton, show auto; the manifest declares Spacebook 1 with its messages, onGmcp activation, send-commands; settings; all disposed', async () => {
  const { host } = await setup();
  const { id, title, defaultPosition, order, singleton, show } = host.panels.get('spacebook');
  assert.deepEqual({ id, title, defaultPosition, order, singleton, show }, { id: 'spacebook', title: 'Spacebook', defaultPosition: 'right-bottom', order: 40, singleton: true, show: 'auto' });
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.muclient.contributes.panels, [{ id: 'spacebook', title: 'Spacebook', order: 40, defaultPosition: 'right-bottom', singleton: true }]);
  assert.equal(pkg.muclient.contributes.gmcp[0].package, 'Spacebook 1');
  assert.deepEqual(Object.keys(pkg.muclient.contributes.gmcp[0].messages), ['Spacebook.List', 'Spacebook.Get', 'Spacebook.Accept', 'Spacebook.Add', 'Spacebook.Remove', 'Spacebook.SetBlurb', 'Spacebook.SetPublic', 'Spacebook.GetProfile', 'Spacebook.Profile', 'Spacebook.Search', 'Spacebook.Results', 'Spacebook.SetShareFriends']);
  assert.deepEqual(pkg.muclient.activation, ['onGmcp:Spacebook']);
  assert.deepEqual(pkg.muclient.capabilities, ['send-commands']);
  assert.deepEqual(host.settingsSchema.items.map((i) => [i.key, i.default, i.scope, i.kind]), [['filter.online', true, 'world', 'toggle'], ['filter.offline', true, 'world', 'toggle']]);
  assert.equal(host.errors.length, 0);
  const n = host.live().length;
  assert.ok(n >= 5, `registrations: ${n}`);
  await host.unload();
  assert.deepEqual(host.live(), [], 'everything registered through mu is disposed');
});

test('payload schemas: schema/list.json accepts the server list and refuses a non-object or a record without a key; the out schemas match what is sent', async () => {
  const schema = (f) => JSON.parse(readFileSync(join(ROOT, 'schema', f), 'utf8'));
  const list = schema('list.json');
  assert.equal(validate(list, LIST), null);
  assert.match(validate(list, 'nope'), /expected object/);
  assert.match(validate(list, { self: { name: 'x' }, pending: [], buddies: [{ name: 'no key' }] }), /key/);
  assert.equal(validate(schema('key.json'), { key: 'p1' }), null);
  assert.equal(validate(schema('add.json'), { name: 'Ray' }), null);
  assert.equal(validate(schema('add.json'), { key: 'k' }), null);
  assert.equal(validate(schema('blurb.json'), { blurb: 'hi' }), null);
  assert.equal(validate(schema('public.json'), { public: false }), null);
  assert.equal(validate(schema('empty.json'), {}), null);
  assert.equal(validate(schema('getprofile.json'), { key: 'k' }), null);
  assert.equal(validate(schema('getprofile.json'), { name: 'me' }), null);
  assert.equal(validate(schema('search.json'), { term: 'medic' }), null);
  assert.equal(validate(schema('share.json'), { share: true }), null);
  assert.match(validate(schema('share.json'), {}), /share/);
  assert.equal(validate(schema('profile.json'), PROFILE), null);
  assert.equal(validate(schema('profile.json'), NPC), null);
  assert.equal(validate(schema('profile.json'), { key: 'garbage', name: '', error: "That person isn't on Spacebook." }), null);
  assert.equal(validate(schema('results.json'), RESULTS), null);
  assert.match(validate(schema('results.json'), { term: 'x', results: [{ name: 'no key' }] }), /key/);
});

test('empty: WAITING FOR SPACEBOOK before a list, no foot, no touch; a panel without a session too', async () => {
  const { host, mount, touches } = await setup();
  const a = mount('s1');
  assert.equal(a.q('[data-testid=sb-empty]').textContent, 'Waiting for Spacebook');
  assert.equal(a.q('[data-testid=sb-empty]').className, 'empty awaiting');
  assert.equal(a.q('[data-testid=sb-foot]'), null);
  assert.equal(a.q('[data-testid=sb-search]').getAttribute('placeholder'), 'Search buddies');
  const b = mount(null);
  assert.equal(b.q('[data-testid=sb-empty]').textContent, 'Waiting for Spacebook');
  assert.deepEqual(touches, []);
  a.off(); b.off();
  assert.equal(a.root(), null);
  await host.unload();
});

test('a list: ┤PENDING (2)├ rows with ACCEPT, ┤BUDDIES (6)├ online first then by name, plates, acquaintance colours, blurbs, initials, img portrait, foot; touch once', async () => {
  const { host, mount, touches, badges } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  assert.deepEqual(touches, [['spacebook', 's1']]);
  assert.deepEqual(badges.at(-1), ['spacebook', { count: 2 }, 's1']);
  assert.deepEqual(p.all('.sec-head').map((x) => x.textContent), ['Pending (2)', 'Buddies (6)']);
  assert.ok(p.all('.sec-head').every((x) => x.lastElementChild.className === 'sec-close'), 'the ├ close span');
  assert.deepEqual(p.all('[data-testid=sb-pending] .who').map((x) => x.textContent), ['Viktor Faust', 'Annabelle Swagart'], 'pending in server order');
  assert.equal(p.q('[data-testid=sb-pending] .ask').textContent, 'wants to be buddies');
  assert.equal(p.q('[data-testid=sb-accept]').className, 'sh-cmd primary');
  assert.deepEqual(names(p), ['Aarya Yadav', "Ol' Red", 'Radical Ray', 'Mystery', 'Pol Castro', 'Yulia Kozlov']);
  const rows = p.all('[data-testid=sb-buddy]');
  assert.deepEqual(rows.map((r) => r.querySelector('[data-testid=sb-status]').textContent), ['online', 'online', 'online', 'unknown', 'deceased', 'offline']);
  assert.deepEqual(rows.map((r) => r.querySelector('[data-testid=sb-status]').className), ['sh-plate ok', 'sh-plate ok', 'sh-plate ok', 'sh-plate dim', 'sh-plate alert', 'sh-plate dim']);
  assert.deepEqual(rows.map((r) => r.querySelector('.port b')?.textContent ?? null), ['AY', 'OR', 'RR', null, 'PC', 'YK']);
  assert.equal(rows[3].querySelector('.port img').getAttribute('src'), 'https://img.example/m.png');
  assert.equal(rows[4].querySelector('.port').className, 'port dead');
  assert.deepEqual(rows.map((r) => r.querySelector('.acq')?.className ?? null), ['acq', 'acq foe', 'acq', null, 'acq', 'acq']);
  assert.equal(rows[0].querySelector('.l2').textContent, 'trusted contact·Triage Hallway');
  assert.equal(rows[4].querySelector('.l2').textContent, 'passing acquaintance', 'no · without a location');
  assert.equal(rows[0].querySelector('.l3').textContent, 'Patch you up, no questions. Mostly.');
  assert.equal(rows[1].querySelector('.l3').textContent, 'No blurb');
  assert.equal(rows[1].querySelector('.l3').className, 'l3 none');
  assert.deepEqual(rows.map((r) => r.tagName), Array(6).fill('BUTTON'));
  assert.equal(p.q('[data-testid=sb-foot] .you').textContent, 'Nylys Gupta');
  assert.equal(p.q('[data-testid=sb-public]').textContent, 'Public');
  assert.equal(p.q('[data-testid=sb-public]').className, 'sh-plate hot');
  assert.equal(p.q('[data-testid=sb-blurb]').textContent, "I make stuff and get it where it's needed.");
  assert.equal(p.q('[data-testid=sb-public-toggle]').textContent, 'Go private');
  host.gmcp('s1', 'Spacebook.List', LIST);
  assert.equal(touches.length, 1, 'touched once per session');
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('no buddies: NO BUDDIES YET under ┤BUDDIES (0)├, no ┤PENDING├ head when none; a private self reads PRIVATE / GO PUBLIC; the badge clears', async () => {
  const { host, mount, badges } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', { self: { name: 'Nyx', blurb: '', public: false, portrait: 'placeholder' }, pending: [], buddies: [] });
  assert.deepEqual(p.all('.sec-head').map((x) => x.textContent), ['Buddies (0)']);
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'No buddies yet');
  assert.equal(p.q('[data-testid=sb-public]').textContent, 'Private');
  assert.equal(p.q('[data-testid=sb-public]').className, 'sh-plate dim');
  assert.equal(p.q('[data-testid=sb-public-toggle]').textContent, 'Go public');
  assert.equal(p.q('[data-testid=sb-blurb]'), null);
  assert.deepEqual(badges.at(-1), ['spacebook', null, 's1']);
  p.off();
  await host.unload();
});

test('filters: OFFLINE off hides offline, deceased and unknown; ONLINE off hides online; persisted as settings; NO BUDDY MATCHES when nothing is left', async () => {
  const { host, mount } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  assert.equal(p.q('[data-testid=sb-filter-online]').getAttribute('aria-pressed'), 'true');
  assert.equal(p.q('[data-testid=sb-filter-offline]').className, 'sh-toggle');
  p.q('[data-testid=sb-filter-offline]').click();
  assert.equal(host.setting('filter.offline'), false);
  assert.deepEqual(names(p), ['Aarya Yadav', "Ol' Red", 'Radical Ray']);
  assert.equal(p.q('[data-testid=sb-filter-offline]').className, 'sh-toggle off');
  assert.equal(p.q('[data-testid=sb-filter-offline]').getAttribute('aria-pressed'), 'false');
  p.q('[data-testid=sb-filter-online]').click();
  assert.deepEqual(names(p), []);
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'No buddy matches');
  p.q('[data-testid=sb-filter-offline]').click();
  assert.deepEqual(names(p), ['Mystery', 'Pol Castro', 'Yulia Kozlov']);
  // A setting change from elsewhere (Settings, another device) redraws too.
  host.mu.settings.set('filter.online', true);
  assert.equal(names(p).length, 6);
  // A new panel starts from the stored values.
  host.mu.settings.set('filter.offline', false);
  const q = mount();
  assert.deepEqual(names(q), ['Aarya Yadav', "Ol' Red", 'Radical Ray']);
  p.off(); q.off();
  await host.unload();
});

test('search: name, blurb, location and acquaintance, case-insensitive; the field is kept; snapshot/restore carry the text', async () => {
  const { host, mount } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  const type = (s) => { const i = p.q('[data-testid=sb-search]'); i.value = s; i.dispatchEvent(new win.Event('input', { bubbles: true })); return i; };
  const input = type('TRIAGE');
  assert.deepEqual(names(p), ['Aarya Yadav'], 'location');
  assert.equal(p.q('[data-testid=sb-search]'), input, 'the bar is not redrawn on a keystroke');
  type('night shift');
  assert.deepEqual(names(p), ['Yulia Kozlov'], 'blurb');
  type('rival');
  assert.deepEqual(names(p), ["Ol' Red"], 'acquaintance');
  type('tri');
  assert.deepEqual(names(p), ['Aarya Yadav', "Ol' Red"], 'two locations, online first then by name');
  type('zzz');
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'No buddy matches');
  const spec = host.panels.get('spacebook');
  assert.equal(spec.snapshot(p.el, { sid: 's1' }), 'zzz');
  host.gmcp('s1', 'Spacebook.List', { ...LIST, buddies: [...LIST.buddies, rec('b7', 'Zzz Top', 'online')] });
  assert.deepEqual(names(p), ['Zzz Top'], 'a later list keeps the query');
  assert.equal(p.q('[data-testid=sb-search]').value, 'zzz');
  const q = mount();
  spec.restore(q.el, 'ray', { sid: 's1' });
  assert.deepEqual(names(q), ['Radical Ray']);
  const r = mount();
  assert.equal(spec.snapshot(r.el, { sid: 's1' }), undefined, 'empty search: nothing to keep');
  p.off(); q.off(); r.off();
  await host.unload();
});

test('actions: ACCEPT, ADD, EDIT BLURB (prefilled, validated and clamped at 49, unchanged or cancelled not sent), GO PRIVATE, HIDE FRIENDS, SEARCH PROFILES as Spacebook.Search', async () => {
  const { host, mount, prompts } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  const gm = () => host.sends('gmcp').map((s) => [s.pkg, s.data]);
  p.all('[data-testid=sb-accept]')[1].click();
  assert.deepEqual(gm(), [['Spacebook.Accept', { key: 'p2' }]]);
  host.promptAnswer = '  Big Roy ';
  p.q('[data-testid=sb-add]').click();
  await tick();
  assert.deepEqual(gm().at(-1), ['Spacebook.Add', { name: 'Big Roy' }]);
  assert.equal(prompts.at(-1).title, 'Add a buddy');
  host.promptAnswer = 'x'.repeat(60);
  p.q('[data-testid=sb-edit-blurb]').click();
  await tick();
  assert.deepEqual(gm().at(-1), ['Spacebook.SetBlurb', { blurb: 'x'.repeat(49) }]);
  const bp = prompts.at(-1);
  assert.equal(bp.value, "I make stuff and get it where it's needed.", 'prefilled with the current blurb');
  assert.equal(bp.validate('x'.repeat(50)), 'at most 49 characters');
  assert.equal(bp.validate('x'.repeat(49)), null);
  const n = gm().length;
  host.promptAnswer = "I make stuff and get it where it's needed.";
  p.q('[data-testid=sb-edit-blurb]').click();
  await tick();
  host.promptAnswer = null;
  p.q('[data-testid=sb-edit-blurb]').click();
  p.q('[data-testid=sb-add]').click();
  p.q('[data-testid=sb-search-profiles]').click();
  await tick();
  assert.equal(gm().length, n, 'unchanged or cancelled: nothing sent');
  assert.deepEqual(host.sends('command'), []);
  p.q('[data-testid=sb-public-toggle]').click();
  assert.deepEqual(gm().at(-1), ['Spacebook.SetPublic', { public: false }]);
  assert.equal(p.q('[data-testid=sb-share-toggle]').textContent, 'Hide friends', 'sharing is on unless the list says otherwise');
  p.q('[data-testid=sb-share-toggle]').click();
  assert.deepEqual(gm().at(-1), ['Spacebook.SetShareFriends', { share: false }]);
  host.promptAnswer = ' medic ';
  p.q('[data-testid=sb-search-profiles]').click();
  await tick();
  assert.deepEqual(gm().at(-1), ['Spacebook.Search', { term: 'medic' }]);
  assert.deepEqual(host.sends('command'), [], 'no text commands');
  assert.ok(host.sends('gmcp').every((s) => s.sid === 's1'));
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('context menu: the kind spacebook.buddy with a schema the rows pass; Page fills "page <name> " (not for the dead); Remove asks, then sends Remove; ▸ click opens it; targets released', async () => {
  const { host, mount, kinds, targets, contexts, fills, prompts } = await setup();
  assert.deepEqual([...kinds.values()].map(({ id, title }) => ({ id, title })), [{ id: 'spacebook.buddy', title: 'Buddy' }]);
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  const live = () => targets.filter((t) => t.live);
  assert.equal(live().length, 6);
  for (const { el, t } of live()) {
    assert.equal(el.getAttribute('data-testid'), 'sb-buddy');
    assert.equal(t.kind, 'spacebook.buddy');
    assert.equal(t.sid, 's1');
    assert.equal(validate(kinds.get(t.kind).schema, t.data), null);
  }
  assert.match(validate(kinds.get('spacebook.buddy').schema, { buddy: { name: 'x' } }), /key/);
  assert.deepEqual(contexts.map((c) => [c.id, c.target, c.title]), [['page', 'spacebook.buddy', 'Page'], ['profile', 'spacebook.buddy', 'View profile'], ['remove', 'spacebook.buddy', 'Remove buddy']]);
  const ray = live().find((t) => t.t.data.buddy.name === 'Radical Ray').t;
  const pol = live().find((t) => t.t.data.buddy.name === 'Pol Castro').t;
  const [page, , remove] = contexts;
  assert.equal(page.when(ray), true);
  assert.equal(page.when(pol), false, 'no paging the dead');
  assert.equal(remove.when(pol), true);
  page.run(ray);
  assert.deepEqual(fills, [['page Radical Ray ', 's1']]);
  host.confirmAnswer = false;
  await remove.run(ray);
  assert.deepEqual(host.sends('gmcp'), [], 'declined: nothing sent');
  host.confirmAnswer = true;
  await remove.run(ray);
  assert.deepEqual(prompts.at(-1), { title: 'Remove Radical Ray?', body: 'They are told nothing; they can ask again.', confirm: 'Remove', danger: true });
  assert.deepEqual(host.sends('gmcp').map((s) => [s.pkg, s.data, s.sid]), [['Spacebook.Remove', { key: 'b2' }, 's1']]);
  // ▸ (a click on the row) opens the row's menu: a contextmenu event at the row, which the host's target listener takes.
  let opened = 0;
  const row = p.q('[data-testid=sb-buddy]');
  row.addEventListener('contextmenu', () => { opened++; });
  row.click();
  assert.equal(opened, 1);
  host.gmcp('s1', 'Spacebook.List', { ...LIST, buddies: LIST.buddies.slice(0, 2) });
  assert.equal(live().length, 2, 'old targets go with the old rows');
  p.off();
  assert.equal(live().length, 0);
  await host.unload();
  assert.equal(kinds.size, 0);
  assert.equal(contexts.length, 0);
});

test('an older host (no menus.kind): the x-spacebook-buddy kind, no errors', async () => {
  const { host, mount, targets } = await setup({ legacy: true });
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  assert.deepEqual([...new Set(targets.map((t) => t.t.kind))], ['x-spacebook-buddy']);
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('requests: one mention per new pending key on the effect owner, none on replay or for keys already seen (synced per world); the badge is the pending count', async () => {
  const { host, mentions, badges } = await setup();
  host.gmcp('s1', 'Spacebook.List', LIST);
  assert.deepEqual(mentions.map((m) => [m.title, m.body, m.key, m.sid]), [['Spacebook', 'Viktor Faust wants to be buddies', 'spacebook:p1', 's1'], ['Spacebook', 'Annabelle Swagart wants to be buddies', 'spacebook:p2', 's1']]);
  assert.deepEqual(host.mu.storage.world('w1', { sync: true }).get('seen.pending'), ['p1', 'p2']);
  host.gmcp('s1', 'Spacebook.List', { ...LIST, pending: [LIST.pending[0], rec('p3', 'Big Roy', 'online')] });
  assert.equal(mentions.length, 3);
  assert.equal(mentions[2].body, 'Big Roy wants to be buddies');
  assert.deepEqual(badges.map((b) => b[1]), [{ count: 2 }, { count: 2 }]);
  host.gmcp('s1', 'Spacebook.List', { ...LIST, pending: [] });
  assert.deepEqual(badges.at(-1), ['spacebook', null, 's1']);
  assert.equal(mentions.length, 3);
  await host.unload();
  // Not the effect owner: the badge yes, the mention no; the keys are still marked seen.
  const other = await setup({ owner: false });
  other.host.gmcp('s1', 'Spacebook.List', LIST);
  assert.deepEqual(other.mentions, []);
  assert.deepEqual(other.badges.at(-1), ['spacebook', { count: 2 }, 's1']);
  assert.deepEqual(other.host.mu.storage.world('w1', { sync: true }).get('seen.pending'), ['p1', 'p2']);
  await other.host.unload();
  // A list already in the session's state when the extension activates (replay): seen marks, no mention.
  const late = createHost({ root: ROOT, sessions: [{ id: 's1', worldId: 'w1' }] });
  const f = fake(late);
  late.gmcp('s1', 'Spacebook.List', LIST);
  await late.load('src/index.ts');
  assert.deepEqual(f.mentions, [], 'replayed: no mention');
  assert.deepEqual(f.badges.at(-1), ['spacebook', { count: 2 }, 's1']);
  assert.deepEqual(late.mu.storage.world('w1', { sync: true }).get('seen.pending'), ['p1', 'p2']);
  assert.equal(late.errors.length, 0);
  await late.unload();
});

test('sessions: a list per session; a second session gets its own panel content; closing a session drops its state; the API returns copies and refreshes', async () => {
  const { host, ext, mount } = await setup();
  host.open({ id: 's2', worldId: 'w2' });
  host.gmcp('s1', 'Spacebook.List', LIST);
  host.gmcp('s2', 'Spacebook.List', { self: { name: 'Other' }, pending: [], buddies: [rec('x', 'Solo', 'online')] });
  const a = mount('s1'), b = mount('s2');
  assert.equal(names(a).length, 6);
  assert.deepEqual(names(b), ['Solo']);
  assert.equal(b.q('[data-testid=sb-foot] .you').textContent, 'Other');
  const l = ext.api.list('s2');
  assert.equal(l.buddies[0].name, 'Solo');
  l.buddies[0].name = 'Changed';
  assert.equal(ext.api.list('s2').buddies[0].name, 'Solo', 'a copy');
  assert.equal(ext.api.list().buddies.length, 6, 'the active session by default');
  assert.equal(await ext.api.refresh('s2'), true);
  assert.deepEqual(host.sends('gmcp').at(-1), { kind: 'gmcp', sid: 's2', pkg: 'Spacebook.Get', data: {} });
  host.close('s2');
  assert.equal(ext.api.list('s2'), null);
  a.off(); b.off();
  assert.equal(host.errors.length, 0);
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('exports: listOf normalises, initialsOf, sortBuddies, filterBuddies, clampBlurb, isHostile, COPY', async () => {
  const { listOf, initialsOf, sortBuddies, filterBuddies, clampBlurb, isHostile, BLURB_MAX, COPY, SETTINGS, BUDDY_KIND } = await loadSource();
  assert.equal(BLURB_MAX, 49);
  assert.equal(BUDDY_KIND, 'spacebook.buddy');
  assert.deepEqual(SETTINGS, { online: 'filter.online', offline: 'filter.offline' });
  assert.equal(listOf('x'), null);
  assert.equal(listOf([1]), null);
  const l = listOf({ self: { name: ' N ' }, pending: 'nope', buddies: [{ key: 1, name: 'A', status: 'ONLINE' }, { name: 'no key' }, { key: 'k', name: '' }] });
  assert.deepEqual(l.self, { name: 'N', blurb: '', public: false, share_friends: true, portrait: 'placeholder' });
  assert.deepEqual(l.pending, []);
  assert.deepEqual(l.buddies, [{ key: '1', name: 'A', status: 'online', acquaintance: '', location: '', blurb: '', portrait: 'placeholder', role: '', shares_friends: true }]);
  assert.deepEqual(['Radical Ray', "Ol' Red", 'Cher', '  x  y z', '', '-'].map(initialsOf), ['RR', 'OR', 'C', 'XY', '?', '-']);
  const b = (n, s) => ({ key: n, name: n, status: s, acquaintance: '', location: '', blurb: '', portrait: 'placeholder' });
  assert.deepEqual(sortBuddies([b('b', 'offline'), b('c', 'online'), b('A', 'online'), b('a2', 'deceased')]).map((x) => x.name), ['A', 'c', 'a2', 'b']);
  assert.deepEqual(filterBuddies([b('b', 'offline'), b('c', 'online'), b('d', 'unknown')], { online: true, offline: false, query: '' }).map((x) => x.name), ['c']);
  assert.deepEqual(filterBuddies([b('b', 'offline'), b('c', 'online')], { online: true, offline: true, query: ' B ' }).map((x) => x.name), ['b']);
  assert.equal(clampBlurb('  ' + 'é'.repeat(60)), 'é'.repeat(49));
  assert.equal(isHostile(' Hated Enemy '), true);
  assert.equal(isHostile('friend'), false);
  assert.equal(COPY.cmdPage('Ray'), 'page Ray ');
});

test('style: every rule is scoped under .ext-panel[data-ext="spacebook"] .mu-spacebook, theme tokens only, no radius, .12s transitions, one font', async () => {
  const { SPACEBOOK_CSS } = await loadSource();
  const rules = SPACEBOOK_CSS.split('\n').filter((l) => l.trim());
  assert.ok(rules.length > 20);
  for (const r of rules) assert.ok(r.startsWith('.ext-panel[data-ext="spacebook"] .mu-spacebook'), r);
  assert.doesNotMatch(SPACEBOOK_CSS, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, 'no literal colours');
  assert.doesNotMatch(SPACEBOOK_CSS, /border-radius/);
  assert.doesNotMatch(SPACEBOOK_CSS, /transition:(?![^;]*\.12s)/, 'transitions are .12s');
  assert.doesNotMatch(SPACEBOOK_CSS, /font-family:(?![^;]*--font-mono)/, 'one font');
});

/** The source module bundled against the SDK package (its `h` draws on happy-dom), for the pure exports. */
async function loadSource() {
  const req = createRequire(join(ROOT, 'package.json'));
  const esbuild = await import(pathToFileURL(req.resolve('esbuild')).href);
  const r = await esbuild.build({
    entryPoints: [join(ROOT, 'src/index.ts')], bundle: true, format: 'esm', write: false, platform: 'neutral', logLevel: 'silent',
    plugins: [{ name: 'sdk', setup(b) { b.onResolve({ filter: /^@muclient\/sdk$/ }, () => ({ path: req.resolve('@muclient/sdk') })); } }],
    mainFields: ['module', 'main'], conditions: ['import', 'default'],
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64');
  return import(url);
}

test('profile: View profile (menu) sends GetProfile by key; LOADING, then the head card, BUDDY + PAGE, ┤FRIENDS (2)├ with roles; a viewable friend opens its own profile, a private one is inert; BACK returns', async () => {
  const { host, mount, contexts, targets, fills } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  const gm = () => host.sends('gmcp').map((s) => [s.pkg, s.data, s.sid]);
  const yul = targets.find((t) => t.live && t.t.data.buddy.name === 'Yulia Kozlov').t;
  contexts.find((c) => c.id === 'profile').run(yul);
  assert.deepEqual(gm().at(-1), ['Spacebook.GetProfile', { key: 'b1' }, 's1']);
  assert.equal(p.q('[data-testid=sb-view-title]').textContent, 'Yulia Kozlov');
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'Loading');
  assert.equal(p.q('[data-testid=sb-foot]'), null, 'the foot belongs to your book');
  host.gmcp('s1', 'Spacebook.Profile', PROFILE);
  assert.equal(p.q('[data-testid=sb-profile] .name').textContent, 'Yulia Kozlov');
  assert.ok(p.q('[data-testid=sb-is-buddy]'));
  p.q('[data-testid=sb-page]').click();
  assert.deepEqual(fills.at(-1), ['page Yulia Kozlov ', 's1']);
  assert.match(p.q('.sec-head').textContent, /^Friends \(2\)/);
  const rows = p.all('[data-testid=sb-friend]');
  assert.deepEqual(rows.map((r) => r.querySelector('.name').textContent), ['Kaori Nagao', 'Duke']);
  assert.equal(rows[0].querySelector('[data-testid=sb-role]').textContent, 'librarian');
  assert.equal(rows[1].disabled, true, 'not viewable: inert');
  assert.equal(rows[1].querySelector('.l3').textContent, 'Private profile');
  rows[1].click();
  assert.equal(gm().filter(([k]) => k === 'Spacebook.GetProfile').length, 1);
  rows[0].click();
  assert.deepEqual(gm().at(-1), ['Spacebook.GetProfile', { key: 'f1' }, 's1']);
  host.gmcp('s1', 'Spacebook.Profile', { ...NPC, key: 'f1' });
  assert.equal(p.q('[data-testid=sb-view-title]').textContent, 'Kaori Nagao');
  assert.match(p.q('.sec-head').textContent, /^Can introduce you to$/);
  assert.equal(p.q('[data-testid=sb-friends-hidden]').textContent, 'Kaori Nagao keeps their friends to themselves.');
  p.q('[data-testid=sb-add-buddy]').click();
  assert.deepEqual(gm().at(-1), ['Spacebook.Add', { name: 'Kaori Nagao' }, 's1']);
  p.q('[data-testid=sb-back]').click();
  assert.equal(p.q('[data-testid=sb-view-title]').textContent, 'Yulia Kozlov', 'back one view');
  host.gmcp('s1', 'Spacebook.List', LIST);
  assert.equal(p.q('[data-testid=sb-view-title]').textContent, 'Yulia Kozlov', 'a new list does not throw the view away');
  p.q('[data-testid=sb-back]').click();
  assert.equal(p.all('[data-testid=sb-buddy]').length, 6);
  assert.ok(p.q('[data-testid=sb-foot]'));
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('profile: an error answer reads the reason; an NPC that shares lists ┤CAN INTRODUCE YOU TO (n)├ or NOBODY…; a replayed answer is ignored; the API opens a profile by name', async () => {
  const { host, mount, ext } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  const open = (who) => ext.api.openProfile(who, 's1');
  open({ name: 'nobody' });
  assert.deepEqual(host.sends('gmcp').at(-1).data, { name: 'nobody' });
  host.gmcp('s1', 'Spacebook.Profile', { key: '', name: '', error: 'I see nothing named "nobody" here.' });
  assert.equal(p.q('[data-testid=sb-error]').textContent, 'I see nothing named "nobody" here.');
  p.q('[data-testid=sb-back]').click();
  open({ key: 'n1', name: 'Kaori Nagao' });
  host.gmcp('s1', 'Spacebook.Profile', { ...NPC, shares_friends: true, friends_visible: true, friends_hidden: '', friends: [card('y', 'Yulia Kozlov', { role: 'fence', buddy: true, viewable: true })] });
  assert.match(p.q('.sec-head').textContent, /^Can introduce you to \(1\)/);
  assert.equal(p.q('[data-testid=sb-friend] [data-testid=sb-role]').textContent, 'fence');
  open({ key: 'n1' });
  host.gmcp('s1', 'Spacebook.Profile', { ...NPC, shares_friends: true, friends_visible: true, friends_hidden: '', friends: [] });
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'Nobody they could introduce you to');
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('search: SEARCH PROFILES shows LOADING under "Search: <term>", then ┤RESULTS (n)├; a result opens its profile; none reads NO PUBLIC PROFILES MATCH; an answer for another term is ignored', async () => {
  const { host, mount } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  host.promptAnswer = 'Gupta';
  p.q('[data-testid=sb-search-profiles]').click();
  await tick();
  assert.equal(p.q('[data-testid=sb-view-title]').textContent, 'Search: Gupta');
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'Loading');
  host.gmcp('s1', 'Spacebook.Results', { term: 'other', results: [] });
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'Loading', 'another term: not ours');
  host.gmcp('s1', 'Spacebook.Results', RESULTS);
  assert.match(p.q('.sec-head').textContent, /^Results \(1\)/);
  p.q('[data-testid=sb-result]').click();
  assert.deepEqual(host.sends('gmcp').at(-1).data, { key: 'r1' });
  p.q('[data-testid=sb-back]').click();
  assert.ok(p.q('[data-testid=sb-result]'), 'back to the results, without asking again');
  host.promptAnswer = 'zzz';
  p.q('[data-testid=sb-back]').click();
  p.q('[data-testid=sb-search-profiles]').click();
  await tick();
  host.gmcp('s1', 'Spacebook.Results', { term: 'zzz', results: [] });
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'No public profiles match');
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('share toggle: SHARE FRIENDS when the list says share_friends false, sends share: true', async () => {
  const { host, mount } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', { ...LIST, self: { ...LIST.self, share_friends: false } });
  const b = p.q('[data-testid=sb-share-toggle]');
  assert.equal(b.textContent, 'Share friends');
  assert.equal(b.getAttribute('aria-pressed'), 'false');
  b.click();
  assert.deepEqual(host.sends('gmcp').at(-1).data, { share: true });
  p.off();
  await host.unload();
});

test('exports: cardOf, profileOf, resultsOf normalise; hidden friends are dropped', async () => {
  const { cardOf, profileOf, resultsOf } = await loadSource();
  assert.equal(cardOf({ name: 'no key' }), null);
  assert.deepEqual(cardOf({ key: 'k', name: ' A ', status: 'ONLINE', viewable: 1 }), { key: 'k', name: 'A', role: '', status: 'online', portrait: 'placeholder', acquaintance: '', buddy: false, viewable: false, blurb: '', location: '' });
  assert.deepEqual(profileOf({ key: 'x', name: 'n', error: 'nope' }), { key: 'x', name: 'n', error: 'nope' });
  assert.equal(profileOf('x'), null);
  const p = profileOf({ ...NPC, friends: [card('a', 'A')] });
  assert.deepEqual(p.friends, [], 'friends_visible false: none, whatever was sent');
  assert.equal(p.introducer, true);
  assert.deepEqual(resultsOf({ term: ' t ', results: [{ key: 'a', name: 'A' }, { name: 'x' }] }).results.map((c) => c.key), ['a']);
});
