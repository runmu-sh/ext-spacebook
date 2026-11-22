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
  // contacts and notes (1.3.0)
  modeBuddies: 'Buddies',
  modeContacts: 'Contacts',
  searchContacts: 'Search contacts',
  contacts: 'Contacts',
  noContacts: 'No contacts yet',
  noContactMatch: 'No contact matches',
  /** The small count on a contact row: "2 notes · 1 known". Empty when there is neither. */
  tally: (notes: number, known: number) => [notes ? `${notes} note${notes === 1 ? '' : 's'}` : '', known ? `${known} known` : ''].filter(Boolean).join(' · '),
  openContact: 'Open contact',
  notContact: 'Not one of your contacts',
  whatYouKnow: 'What you know',
  // lately (1.4.0)
  lately: 'Lately',
  /** The change line under a cause: the server's words (third person singular) after the name, as the live report reads. */
  latelyEffect: (name: string, effect: string) => `${name} ${effect}.`,
  knowNothing: 'Nothing learned yet',
  /** The dim source after a learned value. */
  source: { told: 'they told you', gift: 'from a gift', delivery: 'from a delivery' } as Record<string, string>,
  yourNotes: 'Your notes',
  noNotes: 'No notes yet',
  addNote: 'Add note',
  editNote: 'Edit',
  deleteNote: 'Delete',
  saveNote: 'Save',
  cancelNote: 'Cancel',
  notePlaceholder: 'a note only you can see',
  noteLabel: 'Note',
  /** The editor's length line: "12/200". */
  noteLen: (n: number, max: number) => `${n}/${max}`,
  /** When a note was written, and edited if it was. */
  noteWhen: (written: string, edited: string) => (edited ? `${written} · edited ${edited}` : written),
  deleteTitle: 'Delete this note?',
  deleteConfirm: 'Delete',
  notes: 'Notes',
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
