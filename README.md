# Spacebook (`@runmu.sh/ext-spacebook`, id `spacebook`)

The Spacebook panel of [μClient](https://runmu.sh) for [Torchship](https://torchship.org): your buddies, who is online and where, their blurbs, the requests waiting for you, and your own profile.

First-party, on the [marketplace](https://runmu.sh/marketplace/x/spacebook). Install it from **☰ → Extensions → Discover**; once installed it wakes when a game sends the `Spacebook` GMCP package and adds itself (right bottom) the first time a session receives its list. Turn it off per world in **Extensions → Installed**.

## The panel
```
■ ONLINE  □ OFFLINE  [ search buddies        ]  [ ADD ]
┤PENDING (1)├
▸ Viktor Faust   wants to be buddies            [ ACCEPT ]
┤BUDDIES (5)├
┌────┐ Aarya Yadav  [ONLINE]
│ AY │ trusted contact · Triage Hallway
└────┘ Patch you up, no questions. Mostly.
┌────┐ Ol' Red  [ONLINE]
│ OR │ rival · Triggered
└────┘ NO BLURB
…
──────────────────────────────────────────────
YOU Nylys Gupta [PUBLIC]
I make stuff and get it where it's needed.
[ EDIT BLURB ] [ GO PRIVATE ] [ SEARCH PROFILES ]
```

- **Rows.** A 56 px portrait box (initials while the server sends `"placeholder"`, the picture once it sends a URL), the name and a status plate (`ONLINE` bright, `OFFLINE`/`UNKNOWN` dim, `DECEASED` alert, the portrait struck through), then *acquaintance · location* (the acquaintance in gold, or alert for a hostile word: rival, adversary, enemy, nemesis, hated enemy, disliked, wary rival, feared, dreaded, terrifying, menacing, intimidating, unnerving), then the blurb. Online buddies first, then by name. Pending requests stay in the server's order.
- **Filters.** `■ ONLINE` and `□ OFFLINE` show or hide each group; deceased and unknown count as offline. They are settings per world (both on by default), so they survive a reload and follow you across devices. The search matches name, blurb, location and acquaintance, case-insensitively, and is kept across a hot reload.
- **Actions.** `[ ADD ]` asks for a name and sends the request. `[ ACCEPT ]` accepts one. `[ EDIT BLURB ]` opens your blurb (at most 49 characters: the game refuses longer). `[ GO PRIVATE ]` / `[ GO PUBLIC ]` toggles whether others can find you. `[ SEARCH PROFILES ]` asks for a word and sends the game's `sbsearch <word>` command, as there is no GMCP search; the game answers in text.
- **Row menu.** Right-click a buddy row, or click its ▸: **Page** fills `page <name> ` in the input (not for the dead); **Remove buddy** asks first, then removes.
- **Requests.** The tab carries the number of pending requests. A new request toasts once (a mention, on the device playing effects); the keys already announced are kept per world in synced storage, so a second device or a reload does not repeat them.
- **Empty states.** `WAITING FOR SPACEBOOK` before the first list, `NO BUDDIES YET` with an empty book, `NO BUDDY MATCHES` when the filters or the search leave nothing.

## The server contract
Torchship sends the whole book, and resends it after every change (on login, every 30 s when something changed, after each command below). The extension draws the last list; nothing is kept between sessions.

| Direction | Message | Payload |
|---|---|---|
| in | `Spacebook.List` | `{ self: { name, blurb, public, portrait }, pending: [record], buddies: [record] }`, a record being `{ key, name, status, acquaintance, location, blurb, portrait }` with `status` one of `online`, `offline`, `deceased`, `unknown` and `key` an opaque string |
| out | `Spacebook.Get` | `{}` — asks for the list again |
| out | `Spacebook.Accept` | `{ key }` |
| out | `Spacebook.Add` | `{ name }` (or `{ key }`) |
| out | `Spacebook.Remove` | `{ key }` |
| out | `Spacebook.SetBlurb` | `{ blurb }`, at most 49 characters |
| out | `Spacebook.SetPublic` | `{ public: true | false }` |

The manifest declares `Spacebook 1` (`contributes.gmcp`), so the client lists it in `Core.Supports` while the extension is enabled, and the host checks each inbound list against `schema/list.json`. Errors from the game arrive as ordinary text.

## Settings
| Key | Scope | Default | What |
|---|---|---|---|
| `filter.online` | world | on | Show buddies who are online |
| `filter.offline` | world | on | Show buddies who are offline (deceased and unknown too) |

Synced world storage: `seen.pending` (the pending keys already announced, the last 500).

## For other extensions
`await ctx.api('spacebook')` gives `{ list(sid?), refresh(sid?) }`: the last list of a session (a copy, or `null`), and a `Spacebook.Get`. Context menus can target the registered kind `spacebook.buddy` (`{ buddy: record }`): `mu.menus.context({ target: 'spacebook.buddy', … })` adds an entry to every buddy row.

## Developing
```
npm install
npm run dev        # serves src/ on :5199 for ?ext-dev=http://localhost:5199/
npm run build      # dist/index.js + manifest check
npm test           # the headless host: list, filters, actions, menu, requests, sessions, style
```

Made with `npm create @runmu.sh/extension`.
