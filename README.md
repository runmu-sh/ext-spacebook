# Spacebook (`@runmu.sh/ext-spacebook`, id `spacebook`)

The Spacebook panel of [μClient](https://runmu.sh) for [Torchship](https://torchship.org): your buddies, who is online and where, their blurbs, the requests waiting for you, and your own profile.

First-party, on the [marketplace](https://runmu.sh/marketplace/x/spacebook). Install it from **☰ → Extensions → Discover**; once installed it wakes when a game sends the `Spacebook` GMCP package and adds itself (right bottom) the first time a session receives its list. Turn it off per world in **Extensions → Installed**.

## The panel
```
■ ONLINE  □ OFFLINE  [ search buddies        ]  [ ADD ]  [ REFRESH ]
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
[ EDIT BLURB ] [ GO PRIVATE ] [ HIDE FRIENDS ] [ SEARCH PROFILES ]
```

A profile (from a buddy's menu, a friend, or a search result):
```
[ BACK ] Kaori Nagao
┌────┐ Kaori Nagao  [ONLINE]
│ KN │ librarian · acquaintance · Library Lobby
└────┘ NO BLURB
[BUDDY] [ PAGE ]
┤CAN INTRODUCE YOU TO (1)├
┌────┐ Yulia Kozlov  [ONLINE]
│ YK │ fence · unknown
└────┘ PRIVATE PROFILE
```

- **Rows.** A 56 px portrait box (initials while the server sends `"placeholder"`, the picture once it sends a URL), the name and a status plate (`ONLINE` bright, `OFFLINE`/`UNKNOWN` dim, `DECEASED` alert, the portrait struck through), then *acquaintance · location* (the acquaintance in gold, or alert for a hostile word: rival, adversary, enemy, nemesis, hated enemy, disliked, wary rival, feared, dreaded, terrifying, menacing, intimidating, unnerving), then the blurb. Online buddies first, then by name. Pending requests stay in the server's order.
- **Filters.** `■ ONLINE` and `□ OFFLINE` show or hide each group; deceased and unknown count as offline. They are settings per world (both on by default), so they survive a reload and follow you across devices. The search matches name, blurb, location and acquaintance, case-insensitively, and is kept across a hot reload.
- **Actions.** `[ ADD ]` asks for a name and sends the request. `[ ACCEPT ]` accepts one. `[ EDIT BLURB ]` opens your blurb (at most 49 characters: the game refuses longer). `[ GO PRIVATE ]` / `[ GO PUBLIC ]` toggles whether others can find you. `[ HIDE FRIENDS ]` / `[ SHARE FRIENDS ]` toggles whether your buddies can see who you are friends with (shared by default). `[ SEARCH PROFILES ]` asks for a word and shows the public profiles whose name, line of work or blurb contain it.
- **Profiles.** A profile shows the person's card, BUDDY + PAGE or ADD BUDDY, then their friends: for a player their buddies, for a denizen (`introducer`) only the people it could introduce you to (┤CAN INTRODUCE YOU TO├). The server decides what you may see; when the friends are hidden the panel shows the server's reason ("Only X's buddies can see who they know.", "X keeps their friends to themselves."). A friend or result whose profile you may open (`viewable`) opens it; a private one is inert and reads PRIVATE PROFILE. `[ BACK ]` returns one view at a time; a new list does not throw the view away.
- **Row menu.** Right-click a buddy row, or click its ▸: **View profile**, **Page** fills `page <name> ` in the input (not for the dead); **Remove buddy** asks first, then removes.
- **Requests.** The tab carries the number of pending requests. A new request toasts once (a mention, on the device playing effects); the keys already announced are kept per world in synced storage, so a second device or a reload does not repeat them.
- **Empty states.** `WAITING FOR SPACEBOOK` (with `[ REFRESH ]`) before the first list, `NO BUDDIES YET` with an empty book, `NO BUDDY MATCHES` when the filters or the search leave nothing. When the server says there is no live book (`error`), the body reads `NO SIGNAL` over the server's sentence, kept verbatim ("Your wristpad has no signal here. PDAs only work in character.", "No wristpad.", …), and every mutation is hidden: no `[ ADD ]`, no foot. When the list is the pad's last sync (`cached`), a dim `CACHED · 12 min ago` note sits under the bar; the buttons stay, and the game tells you in text when a NetSat carrier is missing.
- **Refresh.** `[ REFRESH ]` at the right of the bar sends `Spacebook.Get` at once and re-declares the `Spacebook` package (see below).

## Asking for the list, and healing the declaration
Torchship pushes the book on login, on `Core.Supports.Set/Add`, after each mutation and every 30 s when something changed, and `Spacebook.Get {}` always answers with a `Spacebook.List` (live, cached, or with `error`). The extension does not only wait for the push:

- **Schedule.** While a session is `connected` and holds no list, it sends `Spacebook.Get` **2 s** after connecting (the server's own push gets a chance first), then after **6 s**, **15 s**, **40 s**, then **every 90 s** while still waiting. It stops as soon as a list arrives, the link leaves `connected`, or the session ends. It starts over on every `connected` and when a MUD reconnect clears the GMCP state (the held list goes too, and the panel returns to `WAITING FOR SPACEBOOK`). Nothing is sent before GMCP is negotiated (it keeps polling cheaply) and nothing on replay. `RETRY` (`{ delays, redeclareFrom, redeclareMax, redeclareGap, refreshGap }`) is exported, so a test can shorten it.
- **Self-heal.** After a WebSocket reconnect the backend may forget this connection's GMCP declarations and send `Core.Supports.Remove ["Spacebook"]` to the game, which then drops every `Spacebook.List`. So `Spacebook 1` is declared with `mu.gmcp.supports` at activation and again on each retry step from the second on (at most one per 30 s, so one per 90 s in the steady state; `[ REFRESH ]` and `api.refresh` re-declare too, at most once per 5 s). The backend treats a repeat as a no-op while the declaration stands and re-adds the package when it was lost; the game answers `Core.Supports.Add` with a fresh list. Every `Dispose` these calls return is kept in `ctx.subscriptions` until deactivation: disposing one early would send `remove` for the same (connection, extension) owner and withdraw the package. Every timer is cleared when the session leaves scope and on deactivation.

## The server contract
Torchship sends the whole book, and resends it after every change (on login, on `Core.Supports`, every 30 s when something changed, after each command below, and in answer to `Spacebook.Get`). The extension draws the last list; nothing is kept between sessions.

| Direction | Message | Payload |
|---|---|---|
| in | `Spacebook.List` | `{ self: { name, blurb, public, share_friends, portrait }, pending: [record], buddies: [record], error?, cached? }`, a record being `{ key, name, status, acquaintance, location, blurb, portrait, role, shares_friends }` with `status` one of `online`, `offline`, `deceased`, `unknown` and `key` an opaque string. `error` (a string) is why there is no live book — then `self` is `{ name, blurb: "", public: false, share_friends: false, portrait: "" }` and both lists are empty. `cached` (unix seconds) marks the pad's last sync, shown off-net |
| out | `Spacebook.Get` | `{}` — asks for the list again; always answered with a `Spacebook.List` (live, cached, or with `error`). Every other out message needs a NetSat carrier; the game refuses in text |
| out | `Spacebook.Accept` | `{ key }` |
| out | `Spacebook.Add` | `{ name }` (or `{ key }`) |
| out | `Spacebook.Remove` | `{ key }` |
| out | `Spacebook.SetBlurb` | `{ blurb }`, at most 49 characters |
| out | `Spacebook.SetPublic` | `{ public: true | false }` |
| out | `Spacebook.SetShareFriends` | `{ share: true | false }` |
| out | `Spacebook.GetProfile` | `{ key }` or `{ name }` (`"me"`, a buddy, a buddy's friend, or a public profile) |
| in | `Spacebook.Profile` | a card plus `{ shares_friends, friends_visible, friends_hidden, friends: [card], introducer }`, or `{ key, name, error }`. A card is `{ key, name, role, status, portrait, acquaintance, buddy, viewable, blurb, location }`; `blurb` is empty unless `viewable`, `location` unless `buddy` |
| out | `Spacebook.Search` | `{ term }` |
| in | `Spacebook.Results` | `{ term, results: [card] }`: public profiles only |

The manifest declares `Spacebook 1` (`contributes.gmcp`), so the client lists it in `Core.Supports` while the extension is enabled (and the extension re-declares it at runtime, see above), and the host checks each inbound list against `schema/list.json`. Errors from the game arrive as ordinary text.

## Settings
| Key | Scope | Default | What |
|---|---|---|---|
| `filter.online` | world | on | Show buddies who are online |
| `filter.offline` | world | on | Show buddies who are offline (deceased and unknown too) |

Synced world storage: `seen.pending` (the pending keys already announced, the last 500).

## For other extensions
`await ctx.api('spacebook')` gives `{ list(sid?), refresh(sid?), openProfile({ key? , name? }, sid?) }`: the last list of a session (a copy, or `null`; it carries `error` / `cached` when the server sent them), a `Spacebook.Get` plus a re-declaration of the package, and opening someone's profile in the panel. Context menus can target the registered kind `spacebook.buddy` (`{ buddy: record }`): `mu.menus.context({ target: 'spacebook.buddy', … })` adds an entry to every buddy row.

## Developing
```
npm install
npm run dev        # serves src/ on :5199 for ?ext-dev=http://localhost:5199/
npm run build      # dist/index.js + manifest check
npm test           # the headless host: list, filters, actions, menu, requests, sessions, style
```

Made with `npm create @runmu.sh/extension`.
