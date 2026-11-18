/** Every visible string. Sentence case here; uppercase comes from CSS `text-transform`. */
export const COPY = {
  title: 'Spacebook',
  // bar
  online: 'Online',
  offline: 'Offline',
  search: 'Search buddies',
  add: 'Add',
  // sections
  pending: 'Pending',
  buddies: 'Buddies',
  wants: 'wants to be buddies',
  accept: 'Accept',
  // row
  noBlurb: 'No blurb',
  portrait: 'Portrait',
  status: { online: 'online', offline: 'offline', deceased: 'deceased', unknown: 'unknown' } as const,
  menu: 'Row menu',
  // empty states
  awaiting: 'Waiting for Spacebook',
  noBuddies: 'No buddies yet',
  noMatch: 'No buddy matches',
  /** The label line over the server's `error` text (kept verbatim under it). */
  noSignal: 'No signal',
  // the bar
  refresh: 'Refresh',
  /** The dim note under the bar when the list is the pad's last sync: "CACHED · 12 min ago". */
  cached: (ago: string) => `Cached · ${ago}`,
  /** A relative time, terse: "just now", "45 s ago", "12 min ago", "3 h ago", "2 d ago". */
  ago: { now: 'just now', s: (n: number) => `${n} s ago`, min: (n: number) => `${n} min ago`, h: (n: number) => `${n} h ago`, d: (n: number) => `${n} d ago` },
  // foot
  you: 'You',
  isPublic: 'Public',
  isPrivate: 'Private',
  editBlurb: 'Edit blurb',
  goPrivate: 'Go private',
  goPublic: 'Go public',
  searchProfiles: 'Search profiles',
  friendsShared: 'Friends shared',
  friendsHidden: 'Friends hidden',
  hideFriends: 'Hide friends',
  shareFriends: 'Share friends',
  // profile and search views
  back: 'Back',
  openProfile: 'Open profile',
  loading: 'Loading',
  friends: 'Friends',
  introduces: 'Can introduce you to',
  noFriends: 'No friends to show',
  noIntroductions: 'Nobody they could introduce you to',
  results: 'Results',
  noResults: 'No public profiles match',
  addBuddy: 'Add buddy',
  isBuddy: 'Buddy',
  isYou: 'You',
  privateProfile: 'Private profile',
  searchHead: (term: string) => `Search: ${term}`,
  // prompts
  addTitle: 'Add a buddy',
  addLabel: 'Their name',
  addPlaceholder: 'name',
  blurbTitle: 'Your blurb',
  blurbLabel: (max: number) => `Up to ${max} characters`,
  blurbTooLong: (max: number) => `at most ${max} characters`,
  searchTitle: 'Search profiles',
  searchLabel: 'A word from a name, line of work or blurb',
  removeTitle: (name: string) => `Remove ${name}?`,
  removeBody: 'They are told nothing; they can ask again.',
  removeConfirm: 'Remove',
  // context menu
  buddyKind: 'Buddy',
  page: 'Page',
  viewProfile: 'View profile',
  remove: 'Remove buddy',
  // notifications
  requestTitle: 'Spacebook',
  requestBody: (name: string) => `${name} wants to be buddies`,
  // settings
  settingsTitle: 'Spacebook',
  settingOnline: 'Show buddies who are online',
  settingOffline: 'Show buddies who are offline',
  settingOfflineHint: 'Deceased and unknown count as offline.',
  // commands sent as text
  cmdPage: (name: string) => `page ${name} `,
};
