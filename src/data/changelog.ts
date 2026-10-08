export const APP_VERSION = '2.6.2'

export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

// Append new entries to the TOP of this array as the app evolves.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.6.2',
    date: '2026-10-08',
    changes: [
      'Fixed: on the Index entry page, the "Person(s)" category pill could touch the Rename button and crowd "Change type" onto two lines. The pill is now a touch smaller, the Rename / Change type / Delete buttons never wrap mid-label, and the whole button row drops below the pill instead if space ever runs out.',
      'Fixed: backing out of an open Index entry (the in-app arrow or the system gesture) jumped straight past the Index list to wherever the Index was opened from. Back from an entry now returns to the Index list first, and back from the list returns to that opener (the Table of Contents or the Scene Page) — matching how opening a card already works. Links and "Appears In" jumps that go straight to a specific entry are unchanged.',
    ],
  },
  {
    version: '2.6.1',
    date: '2026-10-08',
    changes: [
      'The Index entry category (Person(s) / Place / Thing) now shows as a larger, outlined pill, clearly set apart from the Rename / Change type / Delete buttons beside it instead of blending in as another button — on both the full Index entry page and the quick-peek popup.',
    ],
  },
  {
    version: '2.6.0',
    date: '2026-10-08',
    changes: [
      'Fixed: renaming an Index entry only updated new links going forward — every card, Connection note, and the editor itself kept showing the OLD name in existing links (though "Appears In" and navigation were always correct). A link now always shows the entry\'s current name, looked up live wherever it renders, and a one-time migration refreshes every already-stored link label on load so existing links read correctly immediately with no re-typing. Export/import carry the refreshed labels, and importing an older export still displays current names via the same live lookup.',
      'Fixed: a "##" heading line split into green/gold at a hyphen with no space around it, breaking hyphenated words like "quasi-sentient" into two colors. A dash or other separator now only splits the line when it\'s followed by a space and more text — a hyphen inside a word never splits.',
      'The scene title line under a card\'s name header (e.g. "4 — Vexed") is now sized close to the header itself, instead of noticeably smaller.',
      'Added "Change type" to an Index entry\'s own page, next to Rename and Delete — lets you move a Person(s)/Place/Thing entry to a different category without changing its id, so every existing link keeps resolving.',
      'Relabeled the "Person" category to "Person(s)" everywhere it\'s shown (Index headers, the type picker, the peek popup) — label only, no effect on existing data or links.',
      'Added a short, optional description to Index entries, editable in place on the entry\'s own page or right inside its new quick-peek popup (see below) — no separate edit screen, with an inviting empty state and truncate/expand for longer text.',
      'Tapping a resolved [[link]] — in any card, a Connection note, or inside another peek\'s own description — now opens a quick peek popup for that entry (current name, type, the description, Also Known As, and a jump to the full entry) instead of opening the card\'s full editor. Each card now has its own explicit "Edit" button in its header to open the full editor; tapping the card body elsewhere no longer does. Built-in and custom cards behave identically.',
    ],
  },
  {
    version: '2.5.1',
    date: '2026-10-03',
    changes: [
      'Restoring something from Recently Deleted now checks for a collision first — a live scene, chapter, Index entry, or card-content slot that already exists where it would go (most likely after a merge-import revives something under the same id) — and, if there is one, shows both versions side by side with a choice: restore and move the current item into Recently Deleted instead, keep the current item and permanently discard the deleted one, or cancel and change nothing. It never silently overwrites, never silently refuses, and never creates two live items sharing one id or a duplicate Index entry name.',
    ],
  },
  {
    version: '2.5.0',
    date: '2026-10-03',
    changes: [
      'Added "###" subheadings — a second heading level under "##", shown smaller and in gold with automatic sentence-case capitalization, for breaking a heading into sub-sections like "##Time of day" / "###Early evening."',
      'Back navigation (the in-app arrow and the system back gesture) now always goes up exactly one level of the Bookshelf > Table of Contents > Scene Page > Card hierarchy, no matter how many cards, scenes, or Index entries were visited in between — jumping to another scene via a Connection or an Index entry, or opening the Index from a Scene Page, no longer stacks extra steps that "Done" or back then has to unwind one at a time.',
      'Fixed: a Connection\'s saved note could show its raw [[@id|Name]] storage syntax on the Connections card instead of a resolved link — it now renders through the same shared renderer as every other card, live, without needing to reopen the note editor.',
      'Added "Recently Deleted" to Settings — a 30-day safety net for a deleted scene, chapter, Index entry, or cleared card content, with Restore per item and an Empty Now to clear it immediately. This is in addition to, not instead of, the delete confirmation you already see.',
      '"Preview rendered links" moved next to the card editor itself, away from "Done," so a mistaken tap while checking the preview can no longer exit editing.',
      'Version History in Settings now shows only the latest release by default, with "Show more" still available for the full history.',
      'Repository remote updated to match GitHub\'s corrected casing (Grimoire-).',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-09-28',
    changes: [
      'Fixed: plain line breaks and blank-line paragraph spacing were being collapsed into one run-on paragraph in every card view unless the card also had a "##" heading — a single shared renderer now preserves line and paragraph breaks everywhere a card\'s text is shown (collapsed, expanded, Full Card View preview, the peek popup, and Index snippets), and through export/import.',
      'Fixed: a bracket link inside a "##" heading line showed its raw stored syntax instead of a resolved link — headings now resolve links through the exact same path as normal text.',
      'Fixed: "[[" bracket-linking autocomplete was missing from the Connection note field (it only worked in the original card fields) — every free-text field in the app, including Connection notes, now shares one bracket-linking component so this can\'t happen again.',
      '"+ New Entry" is now pinned at the top of the "[[" suggestion panel, always visible above the scrolling matches and updating live with what you\'ve typed.',
      'Fixed: tapping "Done" in Full Card View left an extra entry in the navigation history, so a subsequent back tap reopened the same card instead of reaching the Table of Contents — "Done" now behaves exactly like backing out.',
      'Fixed: the New Entry dialog\'s Title field pre-filled with the label name as real, editable text that had to be deleted first — it\'s now grayed placeholder text, and a title left blank defaults sensibly to the label name.',
      'Added a "Tips" section to Settings (collapsed by default, each tip expands on tap) covering linking, "##" headings, line breaks, custom cards, chapters, the position picker, planned scenes, unwritten-scene connections, aliases/See Also, and backups — plus a "Show bracket-linking hint again" button.',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-09-23',
    changes: [
      'Added Chapters — a real grouping level between a project and its Scenes, with its own auto-numbering, an optional name (addable/editable/removable any time), and manual reordering. Scene numbers stay global and continuous across chapters, exactly as before.',
      '+ New Chapter on the Table of Contents; new scenes land in the most recent chapter by default',
      "Scenes can be moved between chapters with the exact same ▲/▼ controls already used to reorder them — moving past a chapter's first or last scene now crosses into the neighboring chapter",
      "Deleting a chapter is blocked while it still has scenes, so a chapter can never silently take its scenes with it — move them to another chapter first",
      'Existing projects were automatically wrapped into a single "Chapter 1" on upgrade, preserving every scene\'s order and number exactly as it was — Prologue, Epilogue, and Matter-type entries are entirely unaffected by this change',
      'Export/Import now carries full chapter structure — names, order, and each scene\'s chapter — with the same conflict-by-conflict review as everything else',
      'Version History now shows the most recent versions by default, with a "Show earlier versions" toggle instead of one long unbroken list',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-08-27',
    changes: [
      'Customizable cards, per project: turn any built-in card on/off in a project\'s new "Cards" settings screen, or create fully custom cards (compact or full-width) with the exact same editing, bracket-linking, and heading support as a built-in card. Hiding a card never deletes its content — it comes right back if you turn the card back on.',
      'New Easter Eggs / Foreshadowing card for tracking deliberate hidden references and planted details, distinct from a plot Connection',
      'Connections and Easter Eggs / Foreshadowing now anchor to the bottom of the Scene Page as full-width cards, Connections first — the compact grid above (Actions, Characters, Lore, Setting, Summary, Time) is unaffected',
      'Connections can now target an "Unwritten Scene" — describe a scene you haven\'t written yet instead of picking an existing one — and later be edited to link to the real scene once it exists, with no need to delete and recreate the connection',
      'Export now offers a native save-location picker where the browser supports it, instead of always silently downloading to the default folder',
      'Export now says plainly when nothing has changed since your last export, with an "Export anyway" option, instead of showing an unexplained date with no file',
    ],
  },
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
