# Changelog

## 1.1.0

- Profiles: **View profile** on a buddy's menu (and `api.openProfile`) opens their profile over the book with `Spacebook.GetProfile`, showing their friends when they share them, or the server's reason when not. A denizen's friends are the people it could introduce you to (┤CAN INTRODUCE YOU TO├). Friends and results with a viewable profile open it; `[ BACK ]` steps back.
- SEARCH PROFILES now sends `Spacebook.Search` and shows the results in the panel, instead of the `sbsearch` text command. `COPY.cmdSearch` is gone.
- `[ HIDE FRIENDS ]` / `[ SHARE FRIENDS ]` in the foot (`Spacebook.SetShareFriends`).
- Records carry `role` (line of work, shown first on the row) and `shares_friends`; `self` carries `share_friends`.

## 1.0.0

- First version: the Spacebook panel for Torchship. Pending requests with ACCEPT, buddies with portrait, status, acquaintance, location and blurb, your own profile with EDIT BLURB, GO PRIVATE/PUBLIC and SEARCH PROFILES (`sbsearch`), ONLINE/OFFLINE filters as per-world settings, a search field, a pending-count badge and a mention per new request, and the `spacebook.buddy` row menu (Page, Remove buddy).
