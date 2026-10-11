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
  // foot
  you: 'You',
  isPublic: 'Public',
  isPrivate: 'Private',
  editBlurb: 'Edit blurb',
  goPrivate: 'Go private',
  goPublic: 'Go public',
  searchProfiles: 'Search profiles',
  // prompts
  addTitle: 'Add a buddy',
  addLabel: 'Their name',
  addPlaceholder: 'name',
  blurbTitle: 'Your blurb',
  blurbLabel: (max: number) => `Up to ${max} characters`,
  blurbTooLong: (max: number) => `at most ${max} characters`,
  searchTitle: 'Search profiles',
  searchLabel: 'A word from a name, blurb or location',
  removeTitle: (name: string) => `Remove ${name}?`,
  removeBody: 'They are told nothing; they can ask again.',
  removeConfirm: 'Remove',
  // context menu
  buddyKind: 'Buddy',
  page: 'Page',
  remove: 'Remove buddy',
  // notifications
  requestTitle: 'Spacebook',
  requestBody: (name: string) => `${name} wants to be buddies`,
  // settings
  settingsTitle: 'Spacebook',
  settingOnline: 'Show buddies who are online',
  settingOffline: 'Show buddies who are offline',
  settingOfflineHint: 'Deceased and unknown count as offline.',
  // commands sent as text (the server has no GMCP search)
  cmdSearch: (term: string) => `sbsearch ${term}`,
  cmdPage: (name: string) => `page ${name} `,
};
