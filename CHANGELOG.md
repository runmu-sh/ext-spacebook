# Changelog

## 1.4.0

- **Lately.** A contact's view, and the profile of anyone but you, open with ┤LATELY├ when the game sends any: the last few things that changed how that person feels about you, newest first. Each row is the cause in generic words (*A job you did: Parcel Run*, *A gift you gave them: a fresh bottle of beer*, *They heard that you killed someone*), then the change in the game's own report wording under their name (*Hansen likes you a lot more.*), then roughly when (*just now*, *yesterday*). Never a number. The block and its head are left out when there is nothing. A live `Spacebook.Contact` refreshes it in the open view and any open profile of that key.
- `Spacebook.Contacts` / `Spacebook.Contact` / `Spacebook.Profile` carry `lately: [{ cause, effect, when, time }]`; the three schemas know it (a row needs `cause` and `effect`). A 1.3-shaped payload reads as none.
- Type `SpacebookLately`; `SpacebookContact.lately`, `SpacebookProfile.lately`; exports `latelyOf`, `renderLately`; `COPY.lately`, `COPY.latelyEffect(name, effect)`.

## 1.3.0

- **Contacts.** `BUDDIES │ CONTACTS` tabs over the bar. CONTACTS sends `Spacebook.GetContacts {}` when opened and on its `[ REFRESH ]`, and lists `Spacebook.Contacts`: your buddies, then everyone you know by name who is on Spacebook, each under the name you know them by, with a `2 NOTES · 3 KNOWN` tally. The ONLINE / OFFLINE filters and the search are shared. `error` reads `NO SIGNAL` over the reason, `cached` shows `CACHED · <ago>`.
- **A contact's view.** Click a contact (or **Notes**, new on a buddy's row menu): the head, `[ VIEW PROFILE ]` only when viewable, ┤WHAT YOU KNOW├ (learned likes and loves grouped by field, each with *they told you* / *from a gift* / *from a delivery*), and ┤YOUR NOTES├ with `[ ADD NOTE ]` and, per note, `[ EDIT ]` (inline editor, Ctrl+Enter / Esc) and `[ DELETE ]` (confirmed): `Spacebook.AddNote {key, text}`, `EditNote {key, id, text}`, `DeleteNote {key, id}`. Notes are clamped at 200 characters; empty or unchanged ones are not sent. Every note button is hidden under `error` or `cached`.
- **Live.** `Spacebook.Contact` replaces one contact by key in the held contacts, the open view and any open profile of that key (an open editor keeps its text and focus).
- **Profiles** of others show the same two blocks from `Spacebook.Profile`'s new `learned` and `notes`.
- New schemas `contacts.json`, `contact.json`, `addnote.json`, `editnote.json`, `deletenote.json`; `profile.json` knows `learned` and `notes`. Types `SpacebookContact`, `SpacebookContacts`, `SpacebookLearned`, `SpacebookNote`, `NOTE_MAX`; exports `contactOf`, `contactsOf`, `learnedOf`, `noteOf`, `groupLearned`, `filterContacts`, `clampNote`, `renderIntel`, `renderContact`; `api.contacts(sid?)` and `api.openContact({key, name?}, sid?)`.

## 1.2.0

- **Asks, not only waits.** While a connected session holds no list the extension sends `Spacebook.Get {}` on a bounded backoff: ~2 s after connecting (the server's own login push gets a chance), then 6 s, 15 s, 40 s, then every 90 s while still waiting. It stops the moment a list arrives, the link leaves `connected` or the session ends; it restarts on every `connected` and when a MUD reconnect clears the GMCP state (which also drops the held list). Nothing is sent before GMCP is negotiated. `WAITING FOR SPACEBOOK` is no longer forever.
- **Self-heals the declaration.** `Spacebook 1` is declared with `mu.gmcp.supports` at activation and again on each retry step from the second on (at most one per 30 s). After a WebSocket reconnect the backend can forget this connection's declarations and withdraw the package from the game, which then drops every push; the repeat is a no-op while the declaration stands and re-adds it when it was lost, and the game answers `Core.Supports.Add` with a fresh list. The declarations live until deactivation (disposing one early would withdraw the package).
- **The server's reasons.** `Spacebook.List` may carry `error` (no wristpad, no signal, no account, never synced) and `cached` (unix seconds of the pad's last sync). With `error` the body reads `NO SIGNAL` over the server's text verbatim and every mutation is hidden (ADD and the foot); with `cached` a dim `CACHED · 12 min ago` note sits under the bar and the buttons stay.
- `[ REFRESH ]` at the right of the bar (and in the waiting state): sends `Spacebook.Get` at once and re-declares the package. `api.refresh` does the same.
- Exports: `RETRY` (the schedule), `SUPPORTS`, `agoOf`; `SpacebookList.error` / `.cached`; `schema/list.json` knows both keys.

## 1.1.0

- Profiles: **View profile** on a buddy's menu (and `api.openProfile`) opens their profile over the book with `Spacebook.GetProfile`, showing their friends when they share them, or the server's reason when not. A denizen's friends are the people it could introduce you to (┤CAN INTRODUCE YOU TO├). Friends and results with a viewable profile open it; `[ BACK ]` steps back.
- SEARCH PROFILES now sends `Spacebook.Search` and shows the results in the panel, instead of the `sbsearch` text command. `COPY.cmdSearch` is gone.
- `[ HIDE FRIENDS ]` / `[ SHARE FRIENDS ]` in the foot (`Spacebook.SetShareFriends`).
- Records carry `role` (line of work, shown first on the row) and `shares_friends`; `self` carries `share_friends`.

## 1.0.0

- First version: the Spacebook panel for Torchship. Pending requests with ACCEPT, buddies with portrait, status, acquaintance, location and blurb, your own profile with EDIT BLURB, GO PRIVATE/PUBLIC and SEARCH PROFILES (`sbsearch`), ONLINE/OFFLINE filters as per-world settings, a search field, a pending-count badge and a mention per new request, and the `spacebook.buddy` row menu (Page, Remove buddy).
