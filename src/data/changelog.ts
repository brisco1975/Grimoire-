export const APP_VERSION = '2.1.3'

export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

// Append new entries to the TOP of this array as the app evolves.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.1.3',
    date: '2026-08-26',
    changes: [
      'A "##Label- value" heading line (e.g. "##Day- Zero.", "##Time of day- Early evening.") now splits into two colors right on the same line: the label and its dash in malachite green, the value after it in gold — instead of the whole line being one flat color. Plain body lines with no "##" also render gold, matching a heading\'s value color.',
    ],
  },
  {
    version: '2.1.2',
    date: '2026-08-26',
    changes: [
      '"##" headings now render in malachite green (the same color as resolved bracket-links) instead of gold, which was nearly identical to the body text color and made headings hard to spot at a glance',
    ],
  },
  {
    version: '2.1.1',
    date: '2026-08-26',
    changes: [
      'Fixed: the Table of Contents "peek popup" (the quick preview shown when tapping a scene, before Continue) was rendering the Summary field as raw text — showing literal "[[@id|Name]]" bracket-link syntax instead of the resolved, colored name. It now renders through the same component every other card preview uses.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-08-26',
    changes: [
      'CRITICAL FIX: a race condition could silently save a just-created bracket-link as plain unresolved text instead of a real link, if the app was closed/backgrounded right after creating it — this is what was making some names fail to resolve, including after export/import',
      'Export/Import now shows every conflicting item individually — by name, with the actual local-vs-imported content side by side — instead of just a count; resolve items individually or use "Apply to all" as a starting point',
      'Export is now guarded against double-taps and shows a visible "Exported…" confirmation, so a rapid double-tap can no longer misfire or feel like nothing happened',
      'Connections can now carry a short note explaining why two scenes are linked — add one when connecting, edit it anytime after',
      'The [[ suggestion panel no longer hides behind the keyboard — the text field shrinks while it\'s open so the panel stays visible, then returns to normal size when it closes',
      'The Index now has a search bar — matches names and aliases, live-filters as you type',
      'Added narrow support for "##" headings in card text fields (e.g. "##Day one.") — renders in the app\'s gothic heading style, each on its own line; bracket-linking re-verified working alongside it',
    ],
  },
  {
    version: '2.0.3',
    date: '2026-08-19',
    changes: [
      'Scene cards now have a "Show more / Show less" toggle — expand a card right on the scene page to read the full text (still colored, brackets still hidden) instead of always being clipped to 2 lines',
      'Bigger, easier-to-read type throughout: card text on the scene page is larger, and the full-card text editor is noticeably bigger (up two sizes) for both typing and the new Preview view',
    ],
  },
  {
    version: '2.0.2',
    date: '2026-08-19',
    changes: [
      'Added a "Preview rendered links" toggle to the full card editor — see the WHOLE field with resolved links in malachite green and brackets hidden, not just the 2-line snippet on the scene card',
      '(The editing textarea itself still shows plain [[Name]] bracket syntax while typing — that\'s intentional, since resolved links only get their color once a field is no longer actively being edited)',
    ],
  },
  {
    version: '2.0.1',
    date: '2026-08-19',
    changes: [
      'Fixed: on a real touchscreen, tapping "+ New Entry" in the [[ dropdown could silently do nothing — the field lost focus before the tap registered, closing the dropdown out from under it',
      'Backspacing through a linked word\'s closing brackets now re-opens the [[ dropdown cleanly, with no stray "]" character showing in the search',
      'Renaming an Index entry now also keeps its previous name resolvable everywhere it was already typed (auto-added as an alias)',
      'Scene card previews now actually render resolved links in malachite green with brackets hidden, matching the design — this had been built but never wired in',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-08-19',
    changes: [
      'Phase 2 release: bracket-linking — type [[ in any text field to link a person, place, or thing',
      'Auto-populated per-project Index (People / Places / Things), reachable from the new floating ✦ button on every screen',
      'Renaming an Index entry updates every place it’s linked instantly; deleting one gracefully degrades its links to plain text instead of breaking',
      'Duplicate-name detection when linking — mark a match as the "same thing" (adds an alias) or a genuinely "different thing" (requires a distinguishing qualifier)',
      'Manual "See Also" links between related-but-distinct Index entries',
      '"+ Plan Next Scene" for non-linear plotting — sparse, position-flexible Planned entries with a "Mark as Written" action that carries all entered content forward untouched',
      'Two-page spread layout on tablet/desktop (Table of Contents + selected scene side by side); phone keeps the single-page, page-turn experience',
      'One-time dismissible hint introducing the [[ linking syntax',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-08-19',
    changes: [
      'Fixed home screen install — Grimoire now launches standalone (no browser address bar) instead of opening as a Chrome bookmark shortcut',
      'If your icon was installed before this update, remove it from your home screen and reinstall from the site once — existing icons won’t upgrade automatically',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-08-19',
    changes: [
      'Final app icon installed — the grimoire artwork now appears on the home screen, browser tab, and app switcher',
      'Removed the App Icon placeholder section from Settings, since the icon is now final',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-08-19',
    changes: [
      '"Edit Entry" on the Scene Page now reopens the same type/label picker used to create entries, so existing scenes can be reclassified (e.g. a regular Scene retitled "Prologue" can now actually become a Prologue-type entry with PR numbering)',
      'Reclassifying an entry never deletes card content — cards just hide/show based on the new type',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-19',
    changes: [
      'Entry behavior types: Scene-type (full cards) and Matter-type (light cards — Summary always, Lore available)',
      'Preset labels for new entries: Scene, Prologue, Epilogue, Interlude, plus Dedication, Foreword, Acknowledgments, Author’s Note, Bibliography, Glossary/Appendix, Editor’s Notes — or custom text',
      'Auto-generated position numbering (1, 2, 3…) for regular scenes, live-computed and never stored or tied to title text',
      'Separate PR#/EP# numbering for Prologue and Epilogue entries, always sorted before/after the regular sequence',
      'Matter-type entries sit at a fixed point (start or end of the book) with no position marker',
      'Insert a new Scene at a specific point in the Table of Contents, not just appended at the end',
      'Manual reordering via Move Up/Down, scoped to each entry’s own group',
      'Card order is now fixed and alphabetical on every Scene Page: Actions, Characters, Connections, Lore, Setting, Summary, Time',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-19',
    changes: [
      'Phase 1 release: Bookshelf, Table of Contents, Scene Pages, and Full Card View',
      'Full CRUD for projects and scenes',
      'Manual scene-to-scene connections, including cross-project links',
      'Scene peek popup with Continue/Cancel',
      'Whole-dataset export and import with schema versioning and conflict resolution',
      'Grimoire visual theme: dark parchment palette, gothic display type, legible body type',
    ],
  },
]
