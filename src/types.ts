/**
 * The Spacebook contract (Torchship, GMCP package `Spacebook 1`) and the extension's exported API.
 * The payload schemas in `schema/` and the README's table describe the same shapes; change them together.
 */

/** A buddy's or a requester's presence as the server reports it. Anything else is treated as `unknown`. */
export type SpacebookStatus = 'online' | 'offline' | 'deceased' | 'unknown';

/** One entry of `pending` or `buddies` in `Spacebook.List`. */
export interface SpacebookRecord {
  /** Opaque, e.g. `"29:#000D55-9CB6D2F881:M35A5U0u4SF6"`; what `Accept`, `Add` and `Remove` take. */
  key: string;
  name: string;
  status: SpacebookStatus;
  /** The acquaintance word ("friend", "rival"…); '' when the server sends none. */
  acquaintance: string;
  location: string;
  blurb: string;
  /** `"placeholder"` (initials are drawn) or an image URL. */
  portrait: string;
  /** Their line of work ("fence", "librarian"); '' for most players. */
  role: string;
  /** Whether they let their buddies see who they are friends with. */
  shares_friends: boolean;
}

/** `self` in `Spacebook.List`. */
export interface SpacebookSelf {
  name: string;
  blurb: string;
  public: boolean;
  /** Whether your buddies can see your friends (on unless you turned it off). */
  share_friends: boolean;
  portrait: string;
}

/**
 * Someone as the server lets the viewer see them: a friend in a profile, a search result, the head of a profile.
 * `blurb` is '' unless `viewable`; `location` is '' unless `buddy`.
 */
export interface SpacebookCard {
  key: string;
  name: string;
  role: string;
  status: SpacebookStatus;
  portrait: string;
  acquaintance: string;
  /** One of the viewer's buddies. */
  buddy: boolean;
  /** The viewer may open their profile (`Spacebook.GetProfile`): public, a buddy, or the viewer. */
  viewable: boolean;
  blurb: string;
  location: string;
}

/** Where a learned detail came from: the NPC said so, a plain gift, or a hand-over in a gig. @since 1.3.0 */
export type SpacebookLearnSource = 'told' | 'gift' | 'delivery';

/** One detail the viewer learned about someone (today: what an NPC likes or loves). @since 1.3.0 */
export interface SpacebookLearned {
  /** `"loves"` or `"likes"` (the server's `.learn_fields` ids). */
  field: string;
  /** The field's display label ("Loves", "Likes"). */
  label: string;
  /** The preference id. */
  id: string;
  /** What it is ("real-grain whisky", "a cold beer"). */
  value: string;
  /** `told`, `gift` or `delivery`; '' for anything else. */
  source: SpacebookLearnSource | '';
  /** Unix seconds when it was learned (or last confirmed). */
  time: number;
}

/** One of the viewer's private notes on someone. @since 1.3.0 */
export interface SpacebookNote {
  /** Unique per viewer, never reused: what `EditNote` and `DeleteNote` take. */
  id: number;
  text: string;
  /** Unix seconds when written. */
  time: number;
  /** Unix seconds of the last edit; 0 = never. */
  edited: number;
}

/**
 * Someone the viewer knows: a buddy, or anyone they know by name who is on Spacebook. `name` is what the viewer
 * knows them as (a buddy's legal name). One entry of `Spacebook.Contacts`, and the whole of `Spacebook.Contact`.
 * @since 1.3.0
 */
export interface SpacebookContact extends SpacebookCard {
  known_as: string;
  learned: SpacebookLearned[];
  notes: SpacebookNote[];
}

/** A normalised `Spacebook.Contacts`, the answer to `Spacebook.GetContacts`. `error` / `cached` as in the list. @since 1.3.0 */
export interface SpacebookContacts {
  contacts: SpacebookContact[];
  error?: string;
  cached?: number;
}

/** `Spacebook.Profile`, the answer to `Spacebook.GetProfile`. */
export interface SpacebookProfile extends SpacebookCard {
  shares_friends: boolean;
  /** Why the friends are not shown ('' when they are): not a buddy, or they keep them to themselves. */
  friends_hidden: string;
  friends_visible: boolean;
  /** Who they are friends with; for an NPC (`introducer`) only the people it could introduce the viewer to. */
  friends: SpacebookCard[];
  introducer: boolean;
  /** What the viewer learned about them; empty for yourself. @since 1.3.0 */
  learned: SpacebookLearned[];
  /** The viewer's own notes on them; empty for yourself. @since 1.3.0 */
  notes: SpacebookNote[];
}

/** `Spacebook.Profile` when the person cannot be found or their profile is private. */
export interface SpacebookProfileError { key: string; name: string; error: string }

/** `Spacebook.Results`, the answer to `Spacebook.Search`: public profiles matching the term. */
export interface SpacebookResults { term: string; results: SpacebookCard[] }

/** A normalised `Spacebook.List`. */
export interface SpacebookList {
  self: SpacebookSelf;
  pending: SpacebookRecord[];
  buddies: SpacebookRecord[];
  /**
   * Why there is no live book ("Your wristpad has no signal here. PDAs only work in character.", "No wristpad.", …).
   * Then `self` is a placeholder and both lists are empty; nothing can be changed until it clears. @since 1.2.0
   */
  error?: string;
  /** Unix seconds of the pad's last sync when the list is the cached copy shown off-net. @since 1.2.0 */
  cached?: number;
}

/**
 * What the panel shows: your book, someone's profile (null while it loads), search results (null while they load),
 * or a contact by key (drawn from the held contacts, so `Spacebook.Contact` updates it live; @since 1.3.0).
 */
export type SpacebookView =
  | { kind: 'book' }
  | { kind: 'contact'; key: string; name: string }
  | { kind: 'profile'; key: string; name: string; profile: SpacebookProfile | SpacebookProfileError | null }
  | { kind: 'search'; term: string; results: SpacebookCard[] | null };

/** The `data` of the context kind `spacebook.buddy` (right-click or ▸ on a buddy row). */
export interface SpacebookBuddyData { buddy: SpacebookRecord }

declare module '@muclient/sdk' {
  interface ContextKinds { 'spacebook.buddy': SpacebookBuddyData }
}

/** What `ctx.api('spacebook')` returns. */
export interface SpacebookApi {
  /** The last `Spacebook.List` of a session (default the active one), or null before the first. */
  list(sid?: string): SpacebookList | null;
  /**
   * Ask the server to send the list again (`Spacebook.Get`) and re-declare `Spacebook 1` (since 1.2.0, so a
   * declaration lost to a reconnect comes back). Resolves whether the send went out.
   */
  refresh(sid?: string): Promise<boolean>;
  /** Open someone's profile in the panel (`Spacebook.GetProfile` by key, or by name). @since 1.1.0 */
  openProfile(who: { key?: string; name?: string }, sid?: string): void;
  /** The last `Spacebook.Contacts` of a session (a copy, with live `Spacebook.Contact` updates), or null. @since 1.3.0 */
  contacts(sid?: string): SpacebookContacts | null;
  /** Open a contact's view (what you know, your notes) in the panel; asks for the contacts when none are held. @since 1.3.0 */
  openContact(who: { key: string; name?: string }, sid?: string): void;
}

/** The ONLINE / OFFLINE filter settings (`ext.spacebook.<key>`, per world). */
export const SETTINGS = { online: 'filter.online', offline: 'filter.offline' } as const;
/** The context kind of a buddy row. */
export const BUDDY_KIND = 'spacebook.buddy';
/** The server refuses a blurb of 50 characters or more. */
export const BLURB_MAX = 49;
/** The server refuses a note longer than 200 characters (`$spacebook_fo.note_len`). @since 1.3.0 */
export const NOTE_MAX = 200;
