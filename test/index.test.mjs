/**
 * `npm test`: the extension in the headless μClient host (@runmu.sh/dev/test) with a happy-dom document for the
 * panel. The host's `mu.menus.kind/target/context`, `panels.touch/badge`, `notify.mention`, `input.fill` and
 * `ui.prompt/confirm` are replaced by recording fakes, as the real host checks and records them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  assert.deepEqual(Object.keys(pkg.muclient.contributes.gmcp[0].messages), ['Spacebook.List', 'Spacebook.Get', 'Spacebook.Accept', 'Spacebook.Add', 'Spacebook.Remove', 'Spacebook.SetBlurb', 'Spacebook.SetPublic', 'Spacebook.GetProfile', 'Spacebook.Profile', 'Spacebook.Search', 'Spacebook.Results', 'Spacebook.SetShareFriends', 'Spacebook.GetContacts', 'Spacebook.Contacts', 'Spacebook.Contact', 'Spacebook.AddNote', 'Spacebook.EditNote', 'Spacebook.DeleteNote']);
  for (const [name, d] of Object.entries(pkg.muclient.contributes.gmcp[0].messages)) assert.ok(existsSync(join(ROOT, d.schema)), `${name}: ${d.schema}`);
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
  assert.deepEqual(contexts.map((c) => [c.id, c.target, c.title, c.order]), [['page', 'spacebook.buddy', 'Page', 100], ['profile', 'spacebook.buddy', 'View profile', 10], ['notes', 'spacebook.buddy', 'Notes', 20], ['remove', 'spacebook.buddy', 'Remove buddy', 900]]);
  const ray = live().find((t) => t.t.data.buddy.name === 'Radical Ray').t;
  const pol = live().find((t) => t.t.data.buddy.name === 'Pol Castro').t;
  const [page, , , remove] = contexts;
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

/**
 * The source module bundled against the SDK package (its `h` draws on happy-dom), for the pure exports. The same text
 * is the same module instance (a data URL); `fresh` makes a new one, so a test that shortens `RETRY` touches only its own.
 */
let freshN = 0;
async function loadSource({ fresh = false } = {}) {
  const req = createRequire(join(ROOT, 'package.json'));
  const esbuild = await import(pathToFileURL(req.resolve('esbuild')).href);
  const r = await esbuild.build({
    entryPoints: [join(ROOT, 'src/index.ts')], bundle: true, format: 'esm', write: false, platform: 'neutral', logLevel: 'silent',
    plugins: [{ name: 'sdk', setup(b) { b.onResolve({ filter: /^@muclient\/sdk$/ }, () => ({ path: req.resolve('@muclient/sdk') })); } }],
    mainFields: ['module', 'main'], conditions: ['import', 'default'],
  });
  const text = fresh ? `${r.outputFiles[0].text}\n// fresh ${++freshN}\n` : r.outputFiles[0].text;
  const url = 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
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
  assert.match(p.all('.sec-head').at(-1).textContent, /^Friends \(2\)/);
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
  assert.match(p.all('.sec-head').at(-1).textContent, /^Can introduce you to$/);
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
  assert.match(p.all('.sec-head').at(-1).textContent, /^Can introduce you to \(1\)/);
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

// ─── 1.2.0: asking for the list, self-healing the declaration, error and cached ───

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
/** The extension from a fresh source bundle (its own module instance, so `RETRY` can be shortened), loaded into a fresh host. */
async function setupFast({ delays = [20, 30, 40], redeclareGap = 0, refreshGap = 0, sessions, ...rest } = {}) {
  const src = await loadSource({ fresh: true });
  Object.assign(src.RETRY, { delays, redeclareGap, refreshGap });
  const host = createHost({ root: ROOT, sessions: sessions ?? [{ id: 's1', worldId: 'w1' }], ...rest });
  const f = fake(host);
  const ext = await host.load(src.default);
  const gets = (sid = 's1') => host.sends('gmcp', sid).filter((s) => s.pkg === 'Spacebook.Get');
  const supports = () => host.calls.filter((c) => c.path === 'gmcp.supports').map((c) => c.args[0]);
  const mount = (sid = 's1') => {
    const el = document.createElement('div');
    document.body.append(el);
    const off = host.panels.get('spacebook').mount(el, { sid, worldId: 'w1', params: {} });
    return { el, off, q: (s) => el.querySelector(s), all: (s) => [...el.querySelectorAll(s)] };
  };
  return { src, host, ext, mount, gets, supports, ...f };
}

test('asking: a connected session with no list sends Spacebook.Get after the first delay, backs off along RETRY, and stops when a list arrives; supports at activation and again from the second step; no timers after unload', async () => {
  const before = timers();
  const { src, host, gets, supports } = await setupFast({ delays: [20, 30, 40] });
  assert.deepEqual(src.RETRY.delays, [20, 30, 40]);
  assert.deepEqual(supports(), [['Spacebook 1']], 'declared once at activation');
  assert.deepEqual(gets(), [], 'not before the first delay (the server gets a chance to push)');
  await sleep(28);
  assert.equal(gets().length, 1, 'the first Get after ~20 ms');
  assert.deepEqual(gets()[0], { kind: 'gmcp', sid: 's1', pkg: 'Spacebook.Get', data: {} });
  assert.equal(supports().length, 1, 'the first step does not re-declare');
  await sleep(35);
  assert.equal(gets().length, 2, 'the second after a further ~30 ms');
  assert.equal(supports().length, 2, 'the second step re-declares Spacebook 1');
  assert.deepEqual(supports()[1], ['Spacebook 1']);
  host.gmcp('s1', 'Spacebook.List', LIST);
  const n = gets().length;
  await sleep(100);
  assert.equal(gets().length, n, 'a list stops the asking');
  assert.equal(host.errors.length, 0);
  assert.ok(host.live().filter((k) => k === 'gmcp.supports').length >= 2, 'every supports Dispose stays live until deactivation');
  await host.unload();
  assert.deepEqual(host.live(), []);
  await sleep(0);
  assert.equal(timers(), before, 'no timer outlives the extension');
});

test('asking: the schedule repeats its last delay while still waiting; nothing is sent while GMCP is not negotiated; leaving connected stops it and connected restarts it from the first delay', async () => {
  const { host, gets, supports } = await setupFast({ delays: [20, 20] });
  await sleep(110);
  const n = gets().length;
  assert.ok(n >= 3 && n <= 6, `keeps asking every 20 ms: ${n}`);
  assert.ok(supports().length >= 2 && supports().length <= n, `re-declares at most once per step: ${supports().length}`);
  host.setState('s1', 'idle');
  await sleep(60);
  assert.equal(gets().length, n, 'idle: no more asking');
  host.mu.gmcp.negotiated = () => false;
  host.setState('s1', 'connected');
  await sleep(60);
  assert.equal(gets().length, n, 'connected but GMCP not negotiated: polls without sending');
  host.mu.gmcp.negotiated = () => true;
  await sleep(50);
  assert.ok(gets().length > n, 'negotiated: the asking goes on');
  assert.equal(host.errors.length, 0);
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('asking: a cleared GMCP state (the watch delivers undefined on a MUD reconnect) drops the held list, redraws WAITING FOR SPACEBOOK and restarts the schedule; a closed session clears its timer', async () => {
  const { host, ext, mount, gets } = await setupFast({ delays: [20, 20] });
  host.gmcp('s1', 'Spacebook.List', LIST);
  const p = mount();
  assert.equal(p.all('[data-testid=sb-buddy]').length, 6);
  await sleep(50);
  assert.equal(gets().length, 0, 'a list from the start: nothing asked');
  host.gmcp('s1', 'Spacebook.List', undefined);
  assert.equal(ext.api.list('s1'), null);
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'Waiting for Spacebook');
  assert.equal(p.q('[data-testid=sb-add]'), null, 'nothing to add to without a book');
  assert.ok(p.q('[data-testid=sb-refresh]'), 'REFRESH in the waiting state');
  await sleep(30);
  assert.equal(gets().length, 1, 'asking again after the first delay');
  host.open({ id: 's2', worldId: 'w2' });
  await sleep(30);
  assert.ok(gets('s2').length >= 1, 'a new session asks too');
  const before = timers();
  host.close('s2');
  assert.ok(timers() < before, 'closing a session clears its timer');
  p.off();
  assert.equal(host.errors.length, 0);
  await host.unload();
});

test('error: NO SIGNAL over the server text verbatim, no sections, no ADD, no foot; the badge clears; a later live list brings everything back', async () => {
  const { host, mount, badges } = await setupFast();
  const p = mount();
  const why = 'Your wristpad has no signal here. PDAs only work in character.';
  host.gmcp('s1', 'Spacebook.List', { error: why, self: { name: 'Nyx', blurb: '', public: false, share_friends: false, portrait: '' }, pending: [], buddies: [] });
  assert.equal(p.q('[data-testid=sb-empty] .lbl').textContent, 'No signal');
  assert.equal(p.q('[data-testid=sb-reason]').textContent, why);
  assert.equal(p.q('[data-testid=sb-empty]').className, 'reason');
  assert.deepEqual(p.all('.sec-head'), [], 'no PENDING or BUDDIES heads');
  assert.equal(p.q('[data-testid=sb-foot]'), null, 'no mutation buttons');
  assert.equal(p.q('[data-testid=sb-add]'), null);
  assert.equal(p.q('[data-testid=sb-edit-blurb]'), null);
  assert.ok(p.q('[data-testid=sb-refresh]'));
  assert.equal(p.q('[data-testid=sb-cached]'), null);
  assert.deepEqual(badges.at(-1), ['spacebook', null, 's1']);
  host.gmcp('s1', 'Spacebook.List', LIST);
  assert.equal(p.q('[data-testid=sb-reason]'), null);
  assert.ok(p.q('[data-testid=sb-add]'));
  assert.ok(p.q('[data-testid=sb-foot]'));
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('cached: a CACHED · <ago> note under the bar, the list and its mutation buttons stay; a live list removes the note; a keystroke keeps it', async () => {
  const { host, mount } = await setupFast();
  const p = mount();
  const then = Math.floor(Date.now() / 1000) - 12 * 60;
  host.gmcp('s1', 'Spacebook.List', { ...LIST, cached: then });
  const note = p.q('[data-testid=sb-cached]');
  assert.equal(note.textContent, 'Cached · 12 min ago');
  assert.equal(note.className, 'note');
  assert.equal(note.previousElementSibling.className, 'bar', 'right under the bar');
  assert.equal(note.nextElementSibling.className, 'scroll');
  assert.equal(names(p).length, 6);
  assert.ok(p.q('[data-testid=sb-add]'));
  assert.ok(p.q('[data-testid=sb-edit-blurb]'), 'mutations stay: the server says when there is no carrier');
  const i = p.q('[data-testid=sb-search]');
  i.value = 'ray'; i.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(p.q('[data-testid=sb-cached]').textContent, 'Cached · 12 min ago');
  host.gmcp('s1', 'Spacebook.List', LIST);
  assert.equal(p.q('[data-testid=sb-cached]'), null);
  p.off();
  await host.unload();
});

test('REFRESH: sends Spacebook.Get at once and re-declares Spacebook 1, in the waiting state and in the book; api.refresh does the same', async () => {
  const { host, ext, mount, gets, supports } = await setupFast({ delays: [5000] });
  const p = mount();
  assert.equal(supports().length, 1);
  p.q('[data-testid=sb-refresh]').click();
  await tick();
  assert.equal(gets().length, 1);
  assert.equal(supports().length, 2, 're-declared');
  host.gmcp('s1', 'Spacebook.List', LIST);
  assert.equal(p.q('.bar [data-testid=sb-refresh]').className, 'sh-cmd refresh', 'in the bar, right-aligned by .refresh');
  p.q('[data-testid=sb-refresh]').click();
  await tick();
  assert.equal(gets().length, 2);
  assert.equal(await ext.api.refresh('s1'), true);
  assert.equal(gets().length, 3);
  assert.equal(supports().length, 4);
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('exports: listOf keeps error (trimmed) and cached (a positive integer), agoOf, RETRY defaults, SUPPORTS', async () => {
  const { listOf, agoOf, RETRY, retryDelay, SUPPORTS, COPY } = await loadSource();
  assert.deepEqual(SUPPORTS, ['Spacebook 1']);
  assert.deepEqual(RETRY.delays, [2000, 6000, 15000, 40000, 90000]);
  assert.equal(RETRY.redeclareFrom, 1);
  assert.equal(retryDelay(0), 2000);
  assert.equal(retryDelay(4), 90000);
  assert.equal(retryDelay(99), 90000, 'the last delay repeats');
  const plain = listOf({ self: { name: 'N' }, pending: [], buddies: [] });
  assert.equal('error' in plain, false);
  assert.equal('cached' in plain, false);
  const e = listOf({ error: ' No wristpad. ', self: { name: 'N' }, pending: [], buddies: [] });
  assert.equal(e.error, 'No wristpad.');
  assert.equal(listOf({ error: '', self: {}, pending: [], buddies: [] }).error, undefined);
  assert.equal(listOf({ cached: 1700000000.7, self: {}, pending: [], buddies: [] }).cached, 1700000000);
  assert.equal(listOf({ cached: 'x', self: {}, pending: [], buddies: [] }).cached, undefined);
  assert.equal(listOf({ cached: 0, self: {}, pending: [], buddies: [] }).cached, undefined);
  const now = 1_800_000_000_000;
  assert.equal(agoOf(now / 1000 - 3, now), 'just now');
  assert.equal(agoOf(now / 1000 - 45, now), '45 s ago');
  assert.equal(agoOf(now / 1000 - 12 * 60, now), '12 min ago');
  assert.equal(agoOf(now / 1000 - 3 * 3600, now), '3 h ago');
  assert.equal(agoOf(now / 1000 - 5 * 86400, now), '5 d ago');
  assert.equal(agoOf(now / 1000 + 100, now), 'just now', 'a clock ahead of the server is not negative');
  assert.equal(COPY.cached('12 min ago'), 'Cached · 12 min ago');
  assert.equal(COPY.noSignal, 'No signal');
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

// ─── 1.3.0: contacts, what you know, your notes ───

const T0 = Math.floor(Date.now() / 1000);
const learned = (field, value, source, o = {}) => ({ field, label: field === 'loves' ? 'Loves' : 'Likes', id: value.replace(/\W+/g, '_'), value, source, time: T0 - 3600, ...o });
const noteRec = (id, text, o = {}) => ({ id, text, time: T0 - 600, edited: 0, ...o });
const contact = (key, name, o = {}) => ({ ...card(key, name), known_as: name, learned: [], notes: [], ...o });
/** As the contract has them (CONTRACT.md "GMCP"): buddies first, then people known by name. */
const ROY = contact('29:#BR:roy', 'Royston Bigge', {
  known_as: 'Big Roy', role: 'bartender', status: 'online', acquaintance: 'regular', viewable: false,
  learned: [learned('loves', 'real-grain whisky', 'told'), learned('likes', 'a decent cup of coffee', 'gift'), learned('likes', 'a deck of holo-cards', 'delivery')],
  notes: [noteRec(3, 'Owes me 40 cats.'), noteRec(7, 'Ask about the back room.', { edited: T0 - 60 })],
});
const CONTACTS = {
  contacts: [
    contact('b1', 'Yulia Kozlov', { status: 'offline', acquaintance: 'close friend', buddy: true, viewable: true, blurb: 'Night shift.', location: 'Cube 3148' }),
    ROY,
    contact('29:#KN:k', 'Kaori Nagao', { known_as: 'the librarian', role: 'librarian', status: 'online', notes: [noteRec(9, 'Quiet.')] }),
  ],
};
const gmOf = (host) => () => host.sends('gmcp').map((s) => [s.pkg, s.data, s.sid]);
const typeNote = (p, text) => { const t = p.q('[data-testid=sb-note-text]'); t.value = text; t.dispatchEvent(new win.Event('input', { bubbles: true })); return t; };

test('1.3.0 schemas: contacts.json, contact.json and the note out schemas accept the contract shapes and refuse bad ids; profile.json takes learned and notes', async () => {
  const schema = (f) => JSON.parse(readFileSync(join(ROOT, 'schema', f), 'utf8'));
  assert.equal(validate(schema('contacts.json'), CONTACTS), null);
  assert.equal(validate(schema('contacts.json'), { contacts: [], cached: T0 }), null);
  assert.equal(validate(schema('contacts.json'), { contacts: [], error: 'No wristpad.' }), null);
  assert.match(validate(schema('contacts.json'), {}), /contacts: required/);
  assert.match(validate(schema('contacts.json'), { contacts: [{ name: 'no key' }] }), /key/);
  assert.match(validate(schema('contacts.json'), { contacts: [{ ...ROY, notes: [{ id: '3', text: 'x' }] }] }), /id: expected integer/);
  assert.equal(validate(schema('contact.json'), ROY), null);
  assert.match(validate(schema('contact.json'), { ...ROY, learned: [{ field: 'likes' }] }), /value: required/);
  assert.equal(validate(schema('addnote.json'), { key: 'k', text: 'hi' }), null);
  assert.match(validate(schema('addnote.json'), { key: 'k' }), /text/);
  assert.equal(validate(schema('editnote.json'), { key: 'k', id: 3, text: 'hi' }), null);
  assert.match(validate(schema('editnote.json'), { key: 'k', id: 3.5, text: 'hi' }), /integer/);
  assert.equal(validate(schema('deletenote.json'), { key: 'k', id: 3 }), null);
  assert.match(validate(schema('deletenote.json'), { key: 'k' }), /id: required/);
  assert.equal(validate(schema('profile.json'), { ...PROFILE, learned: ROY.learned, notes: ROY.notes }), null);
  assert.match(validate(schema('profile.json'), { ...PROFILE, notes: [{ id: 1 }] }), /text: required/);
});

test('contacts: BUDDIES | CONTACTS tabs; CONTACTS sends GetContacts and reads LOADING, then ┤CONTACTS (3)├ rows by known_as in server order with a tally; filters and search shared; REFRESH asks again; no ADD, no foot; BUDDIES comes back', async () => {
  const { host, mount } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  const gm = gmOf(host);
  assert.equal(p.q('[data-testid=sb-mode-buddies]').getAttribute('aria-selected'), 'true');
  assert.equal(p.q('[data-testid=sb-mode-contacts]').getAttribute('aria-selected'), 'false');
  assert.equal(p.q('.modes').nextElementSibling.className, 'bar', 'the tabs sit over the bar');
  p.q('[data-testid=sb-mode-contacts]').click();
  assert.deepEqual(gm().at(-1), ['Spacebook.GetContacts', {}, 's1']);
  assert.equal(p.q('[data-testid=sb-mode-contacts]').getAttribute('aria-selected'), 'true');
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'Loading');
  assert.equal(p.q('[data-testid=sb-add]'), null);
  assert.equal(p.q('[data-testid=sb-foot]'), null);
  assert.equal(p.q('[data-testid=sb-search]').getAttribute('placeholder'), 'Search contacts');
  host.gmcp('s1', 'Spacebook.Contacts', CONTACTS);
  assert.match(p.all('.sec-head')[0].textContent, /^Contacts \(3\)/);
  const rows = () => p.all('[data-testid=sb-contact]');
  assert.deepEqual(rows().map((r) => r.querySelector('.name').textContent), ['Yulia Kozlov', 'Big Roy', 'the librarian'], 'known_as, buddies first (server order)');
  assert.deepEqual(rows().map((r) => r.querySelector('[data-testid=sb-tally]')?.textContent ?? null), [null, '2 notes · 3 known', '1 note']);
  assert.equal(rows()[1].querySelector('[data-testid=sb-role]').textContent, 'bartender');
  p.q('[data-testid=sb-filter-offline]').click();
  assert.deepEqual(rows().map((r) => r.querySelector('.name').textContent), ['Big Roy', 'the librarian'], 'the same ONLINE / OFFLINE settings');
  p.q('[data-testid=sb-filter-offline]').click();
  const i = p.q('[data-testid=sb-search]');
  i.value = 'LIBRAR'; i.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.deepEqual(rows().map((r) => r.querySelector('.name').textContent), ['the librarian']);
  assert.equal(p.q('[data-testid=sb-search]'), i, 'a keystroke keeps the field');
  i.value = 'roysTON'; i.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.deepEqual(rows().map((r) => r.querySelector('.name').textContent), ['Big Roy'], 'the legal name matches too');
  i.value = 'zzz'; i.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'No contact matches');
  const n = gm().length;
  p.q('[data-testid=sb-refresh]').click();
  assert.deepEqual(gm().slice(n), [['Spacebook.GetContacts', {}, 's1']], 'REFRESH on CONTACTS asks for the contacts, not the list');
  p.q('[data-testid=sb-mode-contacts]').click();
  assert.equal(gm().length, n + 1, 'clicking the open tab asks nothing');
  p.q('[data-testid=sb-mode-buddies]').click();
  assert.equal(p.q('[data-testid=sb-search]').value, 'zzz', 'the search is shared');
  i.value = ''; p.q('[data-testid=sb-search]').value = ''; p.q('[data-testid=sb-search]').dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(p.all('[data-testid=sb-buddy]').length, 6);
  assert.ok(p.q('[data-testid=sb-foot]'));
  host.gmcp('s1', 'Spacebook.Contacts', { contacts: [] });
  p.q('[data-testid=sb-mode-contacts]').click();
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'No contacts yet');
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('contacts: error reads NO SIGNAL over the reason; cached shows CACHED · <ago> and the contact view hides every note button (reads stay)', async () => {
  const { host, mount } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  p.q('[data-testid=sb-mode-contacts]').click();
  host.gmcp('s1', 'Spacebook.Contacts', { contacts: [], error: 'No wristpad.' });
  assert.equal(p.q('[data-testid=sb-empty] .lbl').textContent, 'No signal');
  assert.equal(p.q('[data-testid=sb-reason]').textContent, 'No wristpad.');
  assert.deepEqual(p.all('[data-testid=sb-contact]'), []);
  host.gmcp('s1', 'Spacebook.Contacts', { ...CONTACTS, cached: T0 - 12 * 60 });
  assert.equal(p.q('[data-testid=sb-cached]').textContent, 'Cached · 12 min ago');
  assert.equal(p.all('[data-testid=sb-contact]').length, 3);
  p.all('[data-testid=sb-contact]')[1].click();
  assert.equal(p.q('[data-testid=sb-cached]').textContent, 'Cached · 12 min ago', 'the view carries the note too');
  assert.equal(p.all('[data-testid=sb-note]').length, 2, 'notes readable off-net');
  assert.equal(p.all('[data-testid=sb-know-value]').length, 3);
  assert.equal(p.q('[data-testid=sb-note-add]'), null);
  assert.equal(p.q('[data-testid=sb-note-edit]'), null);
  assert.equal(p.q('[data-testid=sb-note-delete]'), null);
  host.gmcp('s1', 'Spacebook.Contacts', { contacts: [], error: 'Your wristpad has never synced.' });
  assert.equal(p.q('[data-testid=sb-reason]').textContent, 'Your wristpad has never synced.', 'an open view reads the reason too');
  assert.equal(p.q('[data-testid=sb-note-add]'), null);
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('contact view: head by known_as, no VIEW PROFILE unless viewable; ┤WHAT YOU KNOW├ grouped by label with the source; ┤YOUR NOTES (2)├ with when / edited; VIEW PROFILE on a viewable one opens it; BACK returns to the contacts', async () => {
  const { host, mount } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  p.q('[data-testid=sb-mode-contacts]').click();
  host.gmcp('s1', 'Spacebook.Contacts', CONTACTS);
  const gm = gmOf(host);
  const n = gm().length;
  p.all('[data-testid=sb-contact]')[1].click();
  assert.equal(gm().length, n, 'a held contact: nothing asked');
  assert.equal(p.q('[data-testid=sb-view-title]').textContent, 'Big Roy');
  assert.equal(p.q('[data-testid=sb-contact-head] .name').textContent, 'Big Roy');
  assert.equal(p.q('[data-testid=sb-contact-head] .l2').textContent, 'bartender·regular');
  assert.ok(p.q('[data-testid=sb-contact-head]').classList.contains('head'));
  assert.equal(p.q('[data-testid=sb-view-profile]'), null, 'not viewable: no VIEW PROFILE');
  assert.equal(p.q('.modes'), null, 'the tabs belong to the lists');
  assert.deepEqual(p.all('.sec-head').map((x) => x.textContent), ['What you know', 'Your notes (2)']);
  assert.deepEqual(p.all('[data-testid=sb-know-field]').map((x) => x.textContent), ['Loves', 'Likes']);
  const vals = p.all('[data-testid=sb-know] .vals').map((v) => [...v.querySelectorAll('[data-testid=sb-know-value]')].map((x) => x.firstChild.textContent));
  assert.deepEqual(vals, [['real-grain whisky'], ['a decent cup of coffee', 'a deck of holo-cards']]);
  assert.deepEqual(p.all('[data-testid=sb-know-source]').map((x) => x.textContent), ['they told you', 'from a gift', 'from a delivery']);
  const notes = p.all('[data-testid=sb-note]');
  assert.deepEqual(notes.map((x) => [x.getAttribute('data-id'), x.querySelector('.tx').textContent]), [['3', 'Owes me 40 cats.'], ['7', 'Ask about the back room.']]);
  assert.equal(notes[0].querySelector('.when').textContent, '10 min ago');
  assert.equal(notes[1].querySelector('.when').textContent, '10 min ago · edited 1 min ago');
  assert.equal(p.q('[data-testid=sb-note-delete]').className, 'sh-cmd danger');
  p.q('[data-testid=sb-back]').click();
  assert.equal(p.all('[data-testid=sb-contact]').length, 3, 'back to CONTACTS');
  p.all('[data-testid=sb-contact]')[0].click();
  assert.equal(p.q('[data-testid=sb-know-empty]').textContent, 'Nothing learned yet');
  assert.equal(p.q('[data-testid=sb-notes-empty]').textContent, 'No notes yet');
  p.q('[data-testid=sb-view-profile]').click();
  assert.deepEqual(gm().at(-1), ['Spacebook.GetProfile', { key: 'b1' }, 's1']);
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'Loading');
  p.q('[data-testid=sb-back]').click();
  assert.equal(p.q('[data-testid=sb-view-title]').textContent, 'Yulia Kozlov');
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('notes: ADD NOTE opens the inline editor (one at a time); SAVE sends AddNote trimmed and clamped at 200; empty is not sent; CANCEL / Esc close; EDIT prefills, unchanged is not sent, changed sends EditNote {key,id,text}; Ctrl+Enter saves; DELETE confirms, then sends DeleteNote', async () => {
  const { host, mount, prompts } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  p.q('[data-testid=sb-mode-contacts]').click();
  host.gmcp('s1', 'Spacebook.Contacts', CONTACTS);
  p.all('[data-testid=sb-contact]')[1].click();
  const gm = gmOf(host);
  const n0 = gm().length;
  p.q('[data-testid=sb-note-add]').click();
  assert.ok(p.q('[data-testid=sb-note-editor]'));
  assert.equal(p.q('[data-testid=sb-note-add]'), null, 'the editor replaces ADD NOTE');
  assert.equal(p.q('[data-testid=sb-note-text]').getAttribute('maxlength'), '200');
  assert.equal(p.q('[data-testid=sb-note-text]').className, 'sh-field');
  assert.equal(document.activeElement, p.q('[data-testid=sb-note-text]'), 'focused');
  typeNote(p, '   ');
  p.q('[data-testid=sb-note-save]').click();
  assert.equal(gm().length, n0, 'empty: nothing sent, the editor stays');
  assert.ok(p.q('[data-testid=sb-note-editor]'));
  typeNote(p, '  ' + 'é'.repeat(230) + '  ');
  assert.equal(p.q('[data-testid=sb-note-len]').textContent, '234/200');
  p.q('[data-testid=sb-note-save]').click();
  assert.deepEqual(gm().at(-1), ['Spacebook.AddNote', { key: '29:#BR:roy', text: 'é'.repeat(200) }, 's1']);
  assert.equal(p.q('[data-testid=sb-note-editor]'), null, 'closed on save');
  p.q('[data-testid=sb-note-add]').click();
  p.q('[data-testid=sb-note-cancel]').click();
  assert.equal(p.q('[data-testid=sb-note-editor]'), null);
  p.q('[data-testid=sb-note-add]').click();
  p.q('[data-testid=sb-note-text]').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(p.q('[data-testid=sb-note-editor]'), null, 'Esc closes');
  const n1 = gm().length;
  p.all('[data-testid=sb-note-edit]')[1].click();
  const ed = p.q('[data-testid=sb-note-editor]');
  assert.equal(ed.getAttribute('data-id'), '7');
  assert.equal(p.q('[data-testid=sb-note-text]').value, 'Ask about the back room.');
  assert.deepEqual(p.all('[data-testid=sb-note]').map((x) => x.getAttribute('data-id')), ['3'], 'inline: the edited note gives way to the editor');
  assert.ok(p.q('[data-testid=sb-note-add]'), 'ADD NOTE stays while editing another');
  p.q('[data-testid=sb-note-save]').click();
  assert.equal(gm().length, n1, 'unchanged: nothing sent');
  p.all('[data-testid=sb-note-edit]')[0].click();
  typeNote(p, ' Owes me 60 cats now. ');
  p.q('[data-testid=sb-note-text]').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  assert.deepEqual(gm().at(-1), ['Spacebook.EditNote', { key: '29:#BR:roy', id: 3, text: 'Owes me 60 cats now.' }, 's1']);
  host.confirmAnswer = false;
  p.all('[data-testid=sb-note-delete]')[1].click();
  await tick();
  assert.deepEqual(prompts.at(-1), { title: 'Delete this note?', body: 'Ask about the back room.', confirm: 'Delete', danger: true });
  assert.equal(gm().filter(([k]) => k === 'Spacebook.DeleteNote').length, 0, 'declined: nothing sent');
  host.confirmAnswer = true;
  p.all('[data-testid=sb-note-delete]')[1].click();
  await tick();
  assert.deepEqual(gm().at(-1), ['Spacebook.DeleteNote', { key: '29:#BR:roy', id: 7 }, 's1']);
  assert.deepEqual(host.sends('command'), [], 'no text commands');
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('live: Spacebook.Contact replaces the contact by key in the list and the open view (an open editor survives), adds a new key, refreshes an open profile of that key; a replayed one is ignored; api.contacts is a copy', async () => {
  const { host, mount, ext } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  p.q('[data-testid=sb-mode-contacts]').click();
  host.gmcp('s1', 'Spacebook.Contacts', CONTACTS);
  p.all('[data-testid=sb-contact]')[1].click();
  p.q('[data-testid=sb-note-add]').click();
  typeNote(p, 'half a thought');
  host.gmcp('s1', 'Spacebook.Contact', { ...ROY, notes: [...ROY.notes, noteRec(11, 'Hates the cold.')], learned: [...ROY.learned, learned('likes', 'a cold beer', 'gift')] });
  assert.match(p.all('.sec-head').at(-1).textContent, /^Your notes \(3\)/);
  assert.deepEqual(p.all('[data-testid=sb-note] .tx').map((x) => x.textContent), ['Owes me 40 cats.', 'Ask about the back room.', 'Hates the cold.']);
  assert.equal(p.all('[data-testid=sb-know-value]').length, 4);
  assert.equal(p.q('[data-testid=sb-note-text]').value, 'half a thought', 'the editor and its text survive a live update');
  assert.equal(document.activeElement, p.q('[data-testid=sb-note-text]'), 'and keep focus');
  assert.equal(ext.api.contacts('s1').contacts[1].notes.length, 3, 'the held contacts are updated');
  const copy = ext.api.contacts('s1'); copy.contacts.length = 0;
  assert.equal(ext.api.contacts('s1').contacts.length, 3, 'a copy');
  host.gmcp('s1', 'Spacebook.Contact', contact('29:#NEW:n', 'Newcomer', { learned: [learned('likes', 'tea', 'told')] }));
  p.q('[data-testid=sb-note-cancel]').click();
  p.q('[data-testid=sb-back]').click();
  assert.deepEqual(p.all('[data-testid=sb-contact] .name').map((x) => x.textContent), ['Yulia Kozlov', 'Big Roy', 'the librarian', 'Newcomer'], 'a new key is added');
  assert.equal(p.all('[data-testid=sb-contact]')[3].querySelector('[data-testid=sb-tally]').textContent, '1 known');
  // An open profile of that key takes the new learned details and notes.
  p.q('[data-testid=sb-mode-buddies]').click();
  ext.api.openProfile({ key: 'b1', name: 'Yulia Kozlov' }, 's1');
  host.gmcp('s1', 'Spacebook.Profile', { ...PROFILE, learned: [], notes: [] });
  assert.equal(p.q('[data-testid=sb-notes-empty]').textContent, 'No notes yet');
  host.gmcp('s1', 'Spacebook.Contact', { ...CONTACTS.contacts[0], notes: [noteRec(12, 'Call after 1800.')] });
  assert.deepEqual(p.all('[data-testid=sb-note] .tx').map((x) => x.textContent), ['Call after 1800.']);
  // Replay (the state of an earlier event) is not a change.
  const late = createHost({ root: ROOT, sessions: [{ id: 's1', worldId: 'w1' }] });
  fake(late);
  late.gmcp('s1', 'Spacebook.Contact', ROY);
  const lext = await late.load('src/index.ts');
  assert.equal(lext.api.contacts('s1'), null, 'a replayed Contact adds nothing');
  await late.unload();
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('buddy menu "Notes" opens the contact view: asks GetContacts when none are held (LOADING, then the contact), a key not among them reads NOT ONE OF YOUR CONTACTS; api.openContact does the same', async () => {
  const { host, mount, contexts, targets, ext } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  const gm = gmOf(host);
  const notes = contexts.find((c) => c.id === 'notes');
  const yul = targets.find((t) => t.live && t.t.data.buddy.name === 'Yulia Kozlov').t;
  assert.equal(notes.when(yul), true);
  notes.run(yul);
  assert.deepEqual(gm().at(-1), ['Spacebook.GetContacts', {}, 's1']);
  assert.equal(p.q('[data-testid=sb-view-title]').textContent, 'Yulia Kozlov');
  assert.equal(p.q('[data-testid=sb-empty]').textContent, 'Loading');
  host.gmcp('s1', 'Spacebook.Contacts', CONTACTS);
  assert.equal(p.q('[data-testid=sb-contact-head] .name').textContent, 'Yulia Kozlov');
  assert.ok(p.q('[data-testid=sb-view-profile]'), 'a buddy is viewable');
  p.q('[data-testid=sb-back]').click();
  const n = gm().length;
  ext.api.openContact({ key: '29:#BR:roy' }, 's1');
  assert.equal(gm().length, n, 'held: nothing asked');
  assert.equal(p.q('[data-testid=sb-view-title]').textContent, 'Big Roy', 'the title comes from the contact');
  p.q('[data-testid=sb-back]').click();
  ext.api.openContact({ key: 'zz', name: 'Stranger' }, 's1');
  assert.deepEqual(gm().at(-1), ['Spacebook.GetContacts', {}, 's1'], 'a key not held: ask again');
  assert.equal(p.q('[data-testid=sb-error]').textContent, 'Not one of your contacts');
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('profile: a buddy\'s profile carries ┤WHAT YOU KNOW├ and ┤YOUR NOTES├ with the note buttons (AddNote by the profile key); not on your own profile; buttons hidden while the book is cached', async () => {
  const { host, mount, ext } = await setup();
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  ext.api.openProfile({ key: 'b1' }, 's1');
  host.gmcp('s1', 'Spacebook.Profile', { ...PROFILE, learned: [learned('likes', 'night markets', 'told')], notes: [noteRec(1, 'Met at the docks.')] });
  assert.deepEqual(p.all('.sec-head').map((x) => x.textContent), ['What you know', 'Your notes (1)', 'Friends (2)']);
  assert.equal(p.q('[data-testid=sb-know-source]').textContent, 'they told you');
  p.q('[data-testid=sb-note-add]').click();
  typeNote(p, 'Likes the night shift.');
  p.q('[data-testid=sb-note-save]').click();
  assert.deepEqual(host.sends('gmcp').at(-1).data, { key: 'b1', text: 'Likes the night shift.' });
  assert.equal(host.sends('gmcp').at(-1).pkg, 'Spacebook.AddNote');
  host.gmcp('s1', 'Spacebook.List', { ...LIST, cached: T0 - 60 });
  assert.equal(p.q('[data-testid=sb-note-add]'), null, 'cached: no note buttons on the profile');
  assert.equal(p.q('[data-testid=sb-note-edit]'), null);
  assert.equal(p.all('[data-testid=sb-note]').length, 1);
  ext.api.openProfile({ name: 'me' }, 's1');
  host.gmcp('s1', 'Spacebook.Profile', { ...card('me', 'Nylys Gupta', { viewable: true }), shares_friends: true, friends_visible: true, friends_hidden: '', friends: [], introducer: false, learned: [], notes: [] });
  assert.equal(p.q('[data-testid=sb-know-empty]'), null, 'not on your own profile');
  assert.equal(p.q('[data-testid=sb-note-add]'), null);
  // A 1.2-shaped profile (no learned/notes) still draws, with empty blocks.
  ext.api.openProfile({ key: 'b2' }, 's1');
  host.gmcp('s1', 'Spacebook.Profile', { ...PROFILE, key: 'b2', name: 'Radical Ray' });
  assert.equal(p.q('[data-testid=sb-know-empty]').textContent, 'Nothing learned yet');
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
});

test('timers: the contacts and notes paths leave no timer behind and dispose everything', async () => {
  const before = timers();
  const { host, mount } = await setupFast({ delays: [5000] });
  const p = mount();
  host.gmcp('s1', 'Spacebook.List', LIST);
  p.q('[data-testid=sb-mode-contacts]').click();
  host.gmcp('s1', 'Spacebook.Contacts', CONTACTS);
  p.all('[data-testid=sb-contact]')[1].click();
  p.q('[data-testid=sb-note-add]').click();
  typeNote(p, 'x');
  p.q('[data-testid=sb-note-save]').click();
  host.gmcp('s1', 'Spacebook.Contact', ROY);
  host.confirmAnswer = true;
  p.q('[data-testid=sb-note-delete]').click();
  await tick();
  p.off();
  await host.unload();
  assert.deepEqual(host.live(), []);
  await sleep(0);
  assert.equal(timers(), before, 'no timer outlives the extension');
});

test('exports 1.3.0: contactOf, contactsOf, learnedOf, noteOf, groupLearned, filterContacts, clampNote, NOTE_MAX, COPY.tally / source', async () => {
  const { contactOf, contactsOf, learnedOf, noteOf, groupLearned, filterContacts, clampNote, NOTE_MAX, COPY, profileOf } = await loadSource();
  assert.equal(NOTE_MAX, 200);
  assert.equal(contactOf({ name: 'x' }), null);
  assert.deepEqual(contactOf({ key: 'k', known_as: ' Big Roy ' }), { key: 'k', name: 'Big Roy', role: '', status: 'unknown', portrait: 'placeholder', acquaintance: '', buddy: false, viewable: false, blurb: '', location: '', known_as: 'Big Roy', learned: [], notes: [] }, 'no name: the known_as stands in');
  assert.equal(contactOf({ key: 'k', name: 'Legal' }).known_as, 'Legal', 'no known_as: the name');
  assert.deepEqual(learnedOf({ field: 'likes', value: ' tea ', source: 'GIFT', time: 5.5 }), { field: 'likes', label: 'Likes', id: '', value: 'tea', source: 'gift', time: 5 });
  assert.equal(learnedOf({ field: 'likes' }), null);
  assert.equal(learnedOf({ value: 'x', source: 'rumour' }).source, '');
  assert.deepEqual(noteOf({ id: 3, text: 'hi' }), { id: 3, text: 'hi', time: 0, edited: 0 });
  assert.equal(noteOf({ id: '3', text: 'hi' }), null);
  const c = contactsOf({ contacts: [ROY, { name: 'no key' }], cached: T0, error: ' ' });
  assert.equal(c.contacts.length, 1);
  assert.equal(c.cached, T0);
  assert.equal('error' in c, false);
  assert.equal(contactsOf('x'), null);
  assert.deepEqual(contactsOf({}).contacts, []);
  assert.deepEqual(groupLearned(contactOf(ROY).learned).map((g) => [g.label, g.items.length]), [['Loves', 1], ['Likes', 2]]);
  const cs = CONTACTS.contacts.map(contactOf);
  assert.deepEqual(filterContacts(cs, { online: true, offline: true, query: 'bartender' }).map((x) => x.key), ['29:#BR:roy']);
  assert.deepEqual(filterContacts(cs, { online: false, offline: true, query: '' }).map((x) => x.key), ['b1']);
  assert.equal(clampNote('  ' + 'a'.repeat(300)), 'a'.repeat(200));
  assert.equal(COPY.tally(0, 0), '');
  assert.equal(COPY.tally(1, 2), '1 note · 2 known');
  assert.deepEqual(COPY.source, { told: 'they told you', gift: 'from a gift', delivery: 'from a delivery' });
  const p = profileOf({ ...PROFILE, learned: [{ value: 'x' }, 'junk'], notes: [{ id: 1, text: 't' }, { text: 'no id' }] });
  assert.equal(p.learned.length, 1);
  assert.deepEqual(p.notes.map((n) => n.id), [1]);
});
