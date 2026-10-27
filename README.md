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
- **Empty states.** `WAITING FOR SPACEBOOK` before the first list, `NO BUDDIES YET` with an empty book, `NO BUDDY MATCHES` when the filters or the search leave nothing.

## The server contract
Torchship sends the whole book, and resends it after every change (on login, every 30 s when something changed, after each command below). The extension draws the last list; nothing is kept between sessions.

| Direction | Message | Payload |
|---|---|---|
| in | `Spacebook.List` | `{ self: { name, blurb, public, share_friends, portrait }, pending: [record], buddies: [record] }`, a record being `{ key, name, status, acquaintance, location, blurb, portrait, role, shares_friends }` with `status` one of `online`, `offline`, `deceased`, `unknown` and `key` an opaque string |
| out | `Spacebook.Get` | `{}` — asks for the list again |
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

The manifest declares `Spacebook 1` (`contributes.gmcp`), so the client lists it in `Core.Supports` while the extension is enabled, and the host checks each inbound list against `schema/list.json`. Errors from the game arrive as ordinary text.

## Settings
| Key | Scope | Default | What |
|---|---|---|---|
| `filter.online` | world | on | Show buddies who are online |
| `filter.offline` | world | on | Show buddies who are offline (deceased and unknown too) |

Synced world storage: `seen.pending` (the pending keys already announced, the last 500).

## For other extensions
`await ctx.api('spacebook')` gives `{ list(sid?), refresh(sid?), openProfile({ key? , name? }, sid?) }`: the last list of a session (a copy, or `null`), a `Spacebook.Get`, and opening someone's profile in the panel. Context menus can target the registered kind `spacebook.buddy` (`{ buddy: record }`): `mu.menus.context({ target: 'spacebook.buddy', … })` adds an entry to every buddy row.

## Developing
```
npm install
npm run dev        # serves src/ on :5199 for ?ext-dev=http://localhost:5199/
npm run build      # dist/index.js + manifest check
npm test           # the headless host: list, filters, actions, menu, requests, sessions, style
```

Made with `npm create @runmu.sh/extension`.
