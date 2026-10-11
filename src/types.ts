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
}

/** `self` in `Spacebook.List`. */
export interface SpacebookSelf {
  name: string;
  blurb: string;
  public: boolean;
  portrait: string;
}

/** A normalised `Spacebook.List`. */
export interface SpacebookList {
  self: SpacebookSelf;
  pending: SpacebookRecord[];
  buddies: SpacebookRecord[];
}

/** The `data` of the context kind `spacebook.buddy` (right-click or ▸ on a buddy row). */
export interface SpacebookBuddyData { buddy: SpacebookRecord }

declare module '@muclient/sdk' {
  interface ContextKinds { 'spacebook.buddy': SpacebookBuddyData }
}

/** What `ctx.api('spacebook')` returns. */
export interface SpacebookApi {
  /** The last `Spacebook.List` of a session (default the active one), or null before the first. */
  list(sid?: string): SpacebookList | null;
  /** Ask the server to send the list again (`Spacebook.Get`). */
  refresh(sid?: string): Promise<boolean>;
}

/** The ONLINE / OFFLINE filter settings (`ext.spacebook.<key>`, per world). */
export const SETTINGS = { online: 'filter.online', offline: 'filter.offline' } as const;
/** The context kind of a buddy row. */
export const BUDDY_KIND = 'spacebook.buddy';
/** The server refuses a blurb of 50 characters or more. */
export const BLURB_MAX = 49;
