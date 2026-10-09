import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp, type ConflictResolutions, type ItemResolution } from '../store/AppContext'
import {
  SCHEMA_VERSION,
  type Chapter,
  type DeletedItem,
  type DeletedItemKind,
  type GrimoireDataset,
  type IndexEntry,
  type Project,
  type Scene,
} from '../types'
import AppHeader from '../components/AppHeader'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import RestoreCollisionDialog, { type CollisionSidePreview } from '../components/RestoreCollisionDialog'
import { APP_VERSION, CHANGELOG } from '../data/changelog'
import { ENTRY_TYPE_LABELS } from '../data/indexEntryTypes'
import { nowIso } from '../utils/id'
import { toPlainDisplayText } from '../utils/links'
import { hashString } from '../utils/hash'
import { RECENTLY_DELETED_RETENTION_DAYS } from '../store/db'
import { findRestoreCollision, type RestoreCollision } from '../utils/recentlyDeleted'
import { sceneHeading } from '../utils/tocOrdering'

function kindLabelFor(kind: DeletedItemKind): string {
  if (kind === 'scene') return 'Scene'
  if (kind === 'chapter') return 'Chapter'
  if (kind === 'indexEntry') return 'Index entry'
  return 'Card content'
}

/** What the deleted side of the restore-collision dialog should show for a given Recently Deleted record. */
function describeDeletedSide(item: DeletedItem): CollisionSidePreview {
  if (item.kind === 'scene' && item.scene) {
    return {
      title: item.label,
      subtitle: 'Scene',
      preview: toPlainDisplayText(item.scene.summary || item.scene.actions || '').slice(0, 180),
    }
  }
  if (item.kind === 'chapter') {
    return { title: item.label, subtitle: 'Chapter', preview: '' }
  }
  if (item.kind === 'indexEntry' && item.indexEntry) {
    return {
      title: item.label,
      subtitle: ENTRY_TYPE_LABELS[item.indexEntry.type],
      preview: item.indexEntry.aliases.length ? `Also known as: ${item.indexEntry.aliases.join(', ')}` : '',
    }
  }
  if (item.kind === 'cardContent' && item.cardContent) {
    return {
      title: item.cardContent.cardLabel,
      subtitle: 'Card content',
      preview: toPlainDisplayText(item.cardContent.value).slice(0, 180),
    }
  }
  return { title: item.label, subtitle: '', preview: '' }
}

/** What the live side of the restore-collision dialog should show for whatever findRestoreCollision() found. */
function describeLiveSide(dataset: GrimoireDataset, collision: RestoreCollision): CollisionSidePreview {
  if (collision.kind === 'scene') {
    const s = collision.live
    return {
      title: sceneHeading(dataset.scenes, s),
      subtitle: 'Scene',
      preview: toPlainDisplayText(s.summary || s.actions || '').slice(0, 180),
      idLabel: s.id,
    }
  }
  if (collision.kind === 'chapter') {
    const c = collision.live
    return { title: c.name || 'Unnamed chapter', subtitle: 'Chapter', preview: '', idLabel: c.id }
  }
  if (collision.kind === 'indexEntry') {
    const e = collision.live
    return {
      title: e.name,
      subtitle: ENTRY_TYPE_LABELS[e.type],
      preview: e.aliases.length ? `Also known as: ${e.aliases.join(', ')}` : '',
      idLabel: e.id,
    }
  }
  const c = collision.live
  return {
    title: c.cardLabel,
    subtitle: 'Card content',
    preview: toPlainDisplayText(c.value).slice(0, 180),
    idLabel: `${c.sceneId.slice(0, 8)}…`,
  }
}

/**
 * Minimal local shape for the File System Access API's save-file flow —
 * deliberately not a global ambient declaration (extending the real Window
 * type risks colliding with whatever this TS/DOM lib version already
 * declares), since this app only ever touches the API behind a feature-
 * detect (`'showSaveFilePicker' in window`) and casts through this shape.
 */
interface SaveFilePickerAccess {
  showSaveFilePicker(options: {
    suggestedName?: string
    types?: { description?: string; accept: Record<string, string[]> }[]
  }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  }>
}

function hasSaveFilePicker(): boolean {
  // Automated browser control (Playwright, Selenium, etc.) sets
  // navigator.webdriver — skip the native picker there since it opens a
  // real OS-level dialog with nothing to drive it, and fall back to the
  // plain download instead of hanging. Real users never have this set.
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Conflict detection + human-readable diffing for the import review screen.
// A "conflict" is an item whose id exists both locally and in the imported
// file, with different content — never counted, always individually listed
// (see the Import Data modal below).
// ─────────────────────────────────────────────────────────────────────────

type ConflictKind = 'project' | 'chapter' | 'scene' | 'indexEntry'
interface ConflictItem {
  kind: ConflictKind
  id: string
  local: Project | Chapter | Scene | IndexEntry
  incoming: Project | Chapter | Scene | IndexEntry
}

const SCENE_TEXT_FIELDS = new Set(['characters', 'actions', 'setting', 'time', 'lore', 'summary', 'easterEggs'])

const TIPS: { id: string; title: string; body: string }[] = [
  {
    id: 'linking',
    title: 'Linking with [[ ]]',
    body: 'Type [[ in any text field to link a person, place, or thing. Choose an existing match or "+ New Entry." Linked names show in green. Backspacing into a link reveals the brackets so you can edit it.',
  },
  {
    id: 'headings',
    title: 'Headings with ##',
    body: 'Start a line with ## to make it a heading. It shows in green, bold capitals so a section stands out, like "Time of day" or "Mentioned." Put the ## right at the start of the line. A dash or similar separator followed by a space turns the rest of that line gold, like "##Day- three"; a hyphen inside a word, like "quasi-sentient," does not.',
  },
  {
    id: 'subheadings',
    title: 'Subheadings with ###',
    body: 'Start a line with ### to make a subheading under a heading, in a style clearly smaller than the main heading. The words right after ### show in small lime capitals, automatically capitalized. Add a dash or similar separator followed by a space to continue the line in gold, exactly as you typed it — for example, ###Description- tall and lean. Use ### alone when you just want a subheading label. Use ## for the main heading.',
  },
  {
    id: 'line-breaks',
    title: 'Line breaks',
    body: 'Press Enter for a new line, or leave a blank line between entries for paragraph spacing. No special syntax needed.',
  },
  {
    id: 'custom-cards',
    title: 'Custom cards',
    body: 'Tap "Cards" at the top of a project\'s Table of Contents (beside Rename and Delete Project) to turn cards on or off or create your own. Settings are per project, and hiding a card never deletes its content.',
  },
  {
    id: 'chapters',
    title: 'Chapters',
    body: '"+ New Chapter" groups scenes. Scene numbers stay continuous across chapters, and the up/down arrows move scenes between chapters.',
  },
  {
    id: 'position-picker',
    title: 'Position picker',
    body: '"At the end" lands in the newest chapter. "After: [scene]" keeps the new entry in that scene\'s chapter. The list is searchable by title or number.',
  },
  {
    id: 'planned-scenes',
    title: 'Planned scenes',
    body: '"+ Plan Next Scene" holds a scene you haven\'t written yet. "Mark as Written" converts it and keeps everything you entered.',
  },
  {
    id: 'unwritten-connections',
    title: 'Unwritten Scene connections',
    body: 'Pick "Unwritten Scene" in the connection picker for a scene that doesn\'t exist yet. Edit the connection later to point at the real scene.',
  },
  {
    id: 'aliases-see-also',
    title: 'Aliases and See Also',
    body: 'Open an Index entry to add alternate names ("Also Known As") or link related entries without merging them.',
  },
  {
    id: 'backups',
    title: 'Backups',
    body: 'Export regularly. A web app can\'t warn you before its data is cleared, so "Last exported" in Settings is your safety net.',
  },
  {
    id: 'link-peek',
    title: 'Peeking at a linked name',
    body: 'Tapping a linked name opens a quick peek you can edit right there — name, type, and a short description. Each card has its own "Edit" button to open its full editor.',
  },
]

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  status: 'Status',
  characters: 'Characters',
  actions: 'Actions',
  setting: 'Setting',
  time: 'Time',
  lore: 'Lore',
  summary: 'Summary',
  easterEggs: 'Easter Eggs / Foreshadowing',
  name: 'Name',
  type: 'Type',
  aliases: 'Also known as',
  seeAlso: 'See also (count)',
}

function fieldToText(key: string, value: unknown): string {
  if (value == null) return '(empty)'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(none)'
  if (typeof value === 'string') {
    const text = SCENE_TEXT_FIELDS.has(key) ? toPlainDisplayText(value) : value
    return text.trim() ? text : '(empty)'
  }
  return String(value)
}

function truncate(text: string, max = 220): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Fields that actually differ between the two versions of one conflicting item, as plain readable text. */
function diffFields(
  kind: ConflictKind,
  local: Project | Chapter | Scene | IndexEntry,
  incoming: Project | Chapter | Scene | IndexEntry,
): { label: string; local: string; incoming: string }[] {
  const keys: string[] =
    kind === 'project'
      ? ['title']
      : kind === 'chapter'
        ? ['name']
        : kind === 'scene'
          ? ['title', 'status', 'characters', 'actions', 'setting', 'time', 'lore', 'summary', 'easterEggs']
          : ['name', 'type', 'aliases', 'seeAlso']

  const diffs: { label: string; local: string; incoming: string }[] = []
  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lv = fieldToText(key, (local as any)[key])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iv = fieldToText(key, (incoming as any)[key])
    if (lv !== iv) diffs.push({ label: FIELD_LABELS[key] ?? key, local: truncate(lv), incoming: truncate(iv) })
  }
  return diffs
}

function labelFor(kind: ConflictKind, item: Project | Chapter | Scene | IndexEntry): string {
  if (kind === 'project') return (item as Project).title || 'Untitled project'
  if (kind === 'chapter') return (item as Chapter).name || 'Unnamed chapter'
  if (kind === 'scene') return (item as Scene).title || 'Untitled scene'
  return (item as IndexEntry).name || 'Untitled entry'
}

function kindLabel(kind: ConflictKind): string {
  if (kind === 'project') return 'Project'
  if (kind === 'chapter') return 'Chapter'
  if (kind === 'scene') return 'Scene'
  return 'Index entry'
}

export default function Settings() {
  const navigate = useNavigate()
  const { dataset, dispatch, importDataset } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Re-entrancy guard — a tap that fires twice in quick succession (a known
  // rough edge on some mobile browsers) would otherwise generate/download
  // two export files back to back with nothing on screen to show the first
  // one actually worked, which is exactly what reads as "unreliable."
  const exporting = useRef(false)

  const [pendingImport, setPendingImport] = useState<{
    data: GrimoireDataset
    conflicts: ConflictItem[]
    newProjects: number
    newChapters: number
    newScenes: number
    newIndexEntries: number
    hasLocalData: boolean
  } | null>(null)
  const [conflictChoices, setConflictChoices] = useState<ConflictResolutions>({})
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState<string | null>(null)
  const [noChangesSince, setNoChangesSince] = useState<string | null>(null)

  function currentExportHash(): string {
    // Only the actual content — never lastExportedAt/lastExportedHash
    // themselves, or the hash would depend on its own previous value.
    return hashString(JSON.stringify({ projects: dataset.projects, scenes: dataset.scenes, indexEntries: dataset.indexEntries }))
  }

  async function writeExportFile(json: string, filename: string): Promise<boolean> {
    if (hasSaveFilePicker()) {
      try {
        const handle = await (window as unknown as SaveFilePickerAccess).showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Grimoire export', accept: { 'application/json': ['.json'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        return true
      } catch (err) {
        // AbortError = user cancelled the save dialog — not a failure, just don't export.
        if (err instanceof DOMException && err.name === 'AbortError') return false
        // Any other failure (permission, unsupported in this context, etc.) falls back below.
      }
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking on the same tick races the browser's own (async) read of
    // the blob on some mobile/standalone-PWA browsers — the download can
    // silently abort with zero visible error, which is exactly what
    // reads as "nothing happened, guess I'll tap it again."
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return true
  }

  async function handleExport(force = false) {
    if (exporting.current) return
    exporting.current = true
    setImportError(null)
    setExportSuccess(null)
    setNoChangesSince(null)
    try {
      const hash = currentExportHash()
      if (!force && dataset.meta.lastExportedHash && hash === dataset.meta.lastExportedHash) {
        setNoChangesSince(dataset.meta.lastExportedAt)
        return
      }

      const payload: GrimoireDataset = {
        ...dataset,
        schemaVersion: SCHEMA_VERSION,
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const filename = `grimoire-export-${stamp}.json`
      const wrote = await writeExportFile(JSON.stringify(payload, null, 2), filename)
      if (!wrote) return

      dispatch({ type: 'SET_LAST_EXPORTED', timestamp: nowIso(), hash })
      setExportSuccess(`Exported ${filename}`)
    } finally {
      // Small delay before releasing the guard — absorbs a rapid
      // double-tap on the same physical touch gesture without blocking a
      // deliberate second export a moment later.
      setTimeout(() => {
        exporting.current = false
      }, 800)
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError(null)
    setImportSuccess(null)
    setExportSuccess(null)

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!parsed || typeof parsed !== 'object') throw new Error('not an object')

        const hasLocalData =
          dataset.projects.length > 0 || dataset.scenes.length > 0 || dataset.indexEntries.length > 0

        const localProjects = new Map(dataset.projects.map((p) => [p.id, p]))
        const localChapters = new Map(dataset.chapters.map((c) => [c.id, c]))
        const localScenes = new Map(dataset.scenes.map((s) => [s.id, s]))
        const localIndexEntries = new Map(dataset.indexEntries.map((e) => [e.id, e]))

        const incomingProjects: Project[] = Array.isArray(parsed.projects) ? parsed.projects : []
        const incomingChapters: Chapter[] = Array.isArray(parsed.chapters) ? parsed.chapters : []
        const incomingScenes: Scene[] = Array.isArray(parsed.scenes) ? parsed.scenes : []
        const incomingIndexEntries: IndexEntry[] = Array.isArray(parsed.indexEntries) ? parsed.indexEntries : []

        const conflicts: ConflictItem[] = []
        let newProjects = 0
        let newChapters = 0
        let newScenes = 0
        let newIndexEntries = 0

        for (const p of incomingProjects) {
          const existing = localProjects.get(p.id)
          if (!existing) newProjects++
          else if (JSON.stringify(existing) !== JSON.stringify(p)) conflicts.push({ kind: 'project', id: p.id, local: existing, incoming: p })
        }
        for (const c of incomingChapters) {
          const existing = localChapters.get(c.id)
          if (!existing) newChapters++
          else if (JSON.stringify(existing) !== JSON.stringify(c)) conflicts.push({ kind: 'chapter', id: c.id, local: existing, incoming: c })
        }
        for (const s of incomingScenes) {
          const existing = localScenes.get(s.id)
          if (!existing) newScenes++
          else if (JSON.stringify(existing) !== JSON.stringify(s)) conflicts.push({ kind: 'scene', id: s.id, local: existing, incoming: s })
        }
        for (const en of incomingIndexEntries) {
          const existing = localIndexEntries.get(en.id)
          if (!existing) newIndexEntries++
          else if (JSON.stringify(existing) !== JSON.stringify(en))
            conflicts.push({ kind: 'indexEntry', id: en.id, local: existing, incoming: en })
        }

        // Safe default for every conflict up front — nothing is silently
        // overwritten just because the user taps "Import" without reviewing
        // every single item.
        const defaults: ConflictResolutions = {}
        for (const c of conflicts) defaults[c.id] = 'keep-local'
        setConflictChoices(defaults)

        setPendingImport({
          data: parsed as GrimoireDataset,
          conflicts,
          newProjects,
          newChapters,
          newScenes,
          newIndexEntries,
          hasLocalData,
        })
      } catch {
        setImportError('That file could not be read as a Grimoire export. Please choose a valid export JSON file.')
      }
    }
    reader.readAsText(file)
  }

  function confirmImport() {
    if (!pendingImport) return
    importDataset(pendingImport.data, 'merge', conflictChoices)
    setImportSuccess(
      `Import complete — ${pendingImport.newProjects} new project(s), ${pendingImport.newChapters} new chapter(s), ` +
        `${pendingImport.newScenes} new scene(s), ` +
        `${pendingImport.newIndexEntries} new Index entr${pendingImport.newIndexEntries === 1 ? 'y' : 'ies'}` +
        `${pendingImport.conflicts.length ? `, ${pendingImport.conflicts.length} conflict(s) resolved` : ''}.`,
    )
    setPendingImport(null)
    setConflictChoices({})
  }

  function confirmRestore() {
    if (!pendingImport) return
    importDataset(pendingImport.data, 'replace')
    setImportSuccess(
      `Import complete — restored ${pendingImport.newProjects} project(s), ${pendingImport.newChapters} chapter(s), ` +
        `and ${pendingImport.newScenes} scene(s).`,
    )
    setPendingImport(null)
    setConflictChoices({})
  }

  function setChoice(id: string, choice: ItemResolution) {
    setConflictChoices((prev) => ({ ...prev, [id]: choice }))
  }

  function applyToAll(choice: ItemResolution) {
    if (!pendingImport) return
    const next: ConflictResolutions = {}
    for (const c of pendingImport.conflicts) next[c.id] = choice
    setConflictChoices(next)
  }

  const lastExported = useMemo(() => formatTimestamp(dataset.meta.lastExportedAt), [dataset.meta.lastExportedAt])

  const RECENT_VERSIONS_SHOWN = 1
  const [showAllVersions, setShowAllVersions] = useState(false)
  const visibleChangelog = showAllVersions ? CHANGELOG : CHANGELOG.slice(0, RECENT_VERSIONS_SHOWN)
  const hiddenVersionCount = CHANGELOG.length - RECENT_VERSIONS_SHOWN

  const [tipsOpen, setTipsOpen] = useState(false)
  const [expandedTip, setExpandedTip] = useState<string | null>(null)
  const [hintReset, setHintReset] = useState(false)

  const [deletedOpen, setDeletedOpen] = useState(false)
  const [confirmEmptyDeleted, setConfirmEmptyDeleted] = useState(false)
  const [restoreCollision, setRestoreCollision] = useState<{ item: DeletedItem; collision: RestoreCollision } | null>(
    null,
  )

  function handleRestoreClick(item: DeletedItem) {
    const collision = findRestoreCollision(dataset, item)
    if (!collision) {
      dispatch({ type: 'RESTORE_DELETED_ITEM', id: item.id })
      return
    }
    setRestoreCollision({ item, collision })
  }

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader title="Settings" onBack={() => navigate(-1)} showSettings={false} />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6 max-w-2xl mx-auto w-full">
        {/* Export / Import */}
        <section className="rounded-lg border border-inset bg-surface p-4">
          <h2 className="font-heading text-gold text-lg m-0 mb-1">Data Backup</h2>
          <p className="text-parchment-muted text-sm mb-4">
            Last exported: <span className="text-parchment">{lastExported}</span>. The Grimoire lives only on this
            device — export regularly, especially before uninstalling.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleExport()}
              className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
            >
              Export Data
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded border border-inset text-parchment hover:border-gold-dim transition-colors"
            >
              Import Data
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleFileSelected}
            />
          </div>
          {importError && <p className="text-accent-bright text-sm mt-3">{importError}</p>}
          {importSuccess && <p className="text-link text-sm mt-3">{importSuccess}</p>}
          {exportSuccess && <p className="text-link text-sm mt-3">{exportSuccess}</p>}
          {noChangesSince !== null && (
            <p className="text-parchment-muted text-sm mt-3">
              No changes since your last export on <span className="text-parchment">{formatTimestamp(noChangesSince)}</span> —
              nothing new to save.{' '}
              <button
                type="button"
                onClick={() => handleExport(true)}
                className="text-link hover:underline underline-offset-2 transition-colors"
              >
                Export anyway
              </button>
            </p>
          )}
        </section>

        {/* Recently Deleted */}
        <section className="rounded-lg border border-inset bg-surface p-4">
          <button
            type="button"
            onClick={() => setDeletedOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <h2 className="font-heading text-gold text-lg m-0">
              Recently Deleted{dataset.recentlyDeleted.length > 0 ? ` (${dataset.recentlyDeleted.length})` : ''}
            </h2>
            <span className="text-gold-dim text-sm">{deletedOpen ? '▲' : '▼'}</span>
          </button>
          {deletedOpen && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-parchment-muted text-sm m-0">
                A deleted scene, chapter, Index entry, or cleared card content stays here for{' '}
                {RECENTLY_DELETED_RETENTION_DAYS} days before being purged automatically — this is in addition to,
                not instead of, the confirmation you already saw when you deleted it.
              </p>
              {dataset.recentlyDeleted.length === 0 ? (
                <p className="text-parchment-muted text-sm italic m-0">Nothing here.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {dataset.recentlyDeleted.map((item) => (
                      <div
                        key={item.id}
                        className="rounded border border-inset bg-canvas px-3 py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-gold-dim text-xs uppercase tracking-wide">{kindLabelFor(item.kind)}</div>
                          <div className="text-parchment text-sm truncate">{item.label}</div>
                          <div className="text-parchment-muted text-xs">{formatTimestamp(item.deletedAt)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRestoreClick(item)}
                          className="shrink-0 px-3 py-1.5 rounded border border-inset text-parchment hover:border-gold-dim transition-colors text-sm"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmEmptyDeleted(true)}
                    className="self-start text-accent-bright hover:underline underline-offset-2 text-sm transition-colors"
                  >
                    Empty Now
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* Tips */}
        <section className="rounded-lg border border-inset bg-surface p-4">
          <button
            type="button"
            onClick={() => setTipsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <h2 className="font-heading text-gold text-lg m-0">Tips</h2>
            <span className="text-gold-dim text-sm">{tipsOpen ? '▲' : '▼'}</span>
          </button>
          {tipsOpen && (
            <div className="mt-3 flex flex-col gap-1">
              {TIPS.map((tip) => {
                const expanded = expandedTip === tip.id
                return (
                  <div key={tip.id} className="border-b border-inset last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedTip(expanded ? null : tip.id)}
                      className="w-full flex items-center justify-between gap-2 text-left py-2"
                    >
                      <span className="text-parchment text-sm">{tip.title}</span>
                      <span className="text-gold-dim text-xs shrink-0">{expanded ? '−' : '+'}</span>
                    </button>
                    {expanded && <p className="text-parchment-muted text-sm mt-0 mb-3">{tip.body}</p>}
                  </div>
                )
              })}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'SET_LINK_HINT_SEEN', seen: false })
                    setHintReset(true)
                  }}
                  className="px-4 py-2 rounded border border-inset text-parchment hover:border-gold-dim transition-colors"
                >
                  Show bracket-linking hint again
                </button>
                {hintReset && (
                  <p className="text-link text-sm mt-2">
                    Done — the hint will appear again the next time you open a card's text field.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* About */}
        <section className="rounded-lg border border-inset bg-surface p-4">
          <h2 className="font-heading text-gold text-lg m-0 mb-1">About</h2>
          <p className="text-parchment-muted text-sm m-0">Part of the Author Magic Suite.</p>
          <p className="text-parchment text-sm m-0 mt-1">Version {APP_VERSION}</p>
        </section>

        {/* Changelog */}
        <section className="rounded-lg border border-inset bg-surface p-4">
          <h2 className="font-heading text-gold text-lg m-0 mb-3">Version History</h2>
          <div className="flex flex-col gap-4">
            {visibleChangelog.map((entry) => (
              <div key={entry.version}>
                <div className="font-heading text-gold text-sm">
                  v{entry.version} <span className="text-parchment-muted font-body">— {entry.date}</span>
                </div>
                <ul className="text-parchment-muted text-sm mt-1 mb-0 pl-5">
                  {entry.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {hiddenVersionCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllVersions((v) => !v)}
              className="mt-4 text-gold-dim hover:text-gold text-sm transition-colors"
            >
              {showAllVersions ? '‹ Show fewer' : `Show ${hiddenVersionCount} earlier version${hiddenVersionCount === 1 ? '' : 's'} …`}
            </button>
          )}
        </section>

        <p className="text-parchment-muted text-xs text-center pb-6">© 2026 BNS. All rights reserved.</p>
      </div>

      <Modal
        open={!!pendingImport}
        onClose={() => {
          setPendingImport(null)
          setConflictChoices({})
        }}
        title="Import Data"
        wide={!!pendingImport?.hasLocalData && pendingImport.conflicts.length > 0}
      >
        {pendingImport && (
          <div>
            {!pendingImport.hasLocalData ? (
              <>
                <p className="text-parchment mb-4">
                  This will restore <strong>{pendingImport.newProjects}</strong> project(s),{' '}
                  <strong>{pendingImport.newChapters}</strong> chapter(s),{' '}
                  <strong>{pendingImport.newScenes}</strong> scene(s), and{' '}
                  <strong>{pendingImport.newIndexEntries}</strong> Index entr
                  {pendingImport.newIndexEntries === 1 ? 'y' : 'ies'} to this fresh install.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setPendingImport(null)}
                    className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmRestore}
                    className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
                  >
                    Restore
                  </button>
                </div>
              </>
            ) : pendingImport.conflicts.length === 0 ? (
              <>
                <p className="text-parchment mb-4">
                  Found <strong>{pendingImport.newProjects}</strong> new project(s),{' '}
                  <strong>{pendingImport.newChapters}</strong> new chapter(s),{' '}
                  <strong>{pendingImport.newScenes}</strong> new scene(s), and{' '}
                  <strong>{pendingImport.newIndexEntries}</strong> new Index entr
                  {pendingImport.newIndexEntries === 1 ? 'y' : 'ies'}. Nothing here conflicts with what's already on
                  this device.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setPendingImport(null)}
                    className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmImport}
                    className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
                  >
                    Import
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-parchment mb-1">
                  Found <strong>{pendingImport.newProjects}</strong> new project(s),{' '}
                  <strong>{pendingImport.newChapters}</strong> new chapter(s), and{' '}
                  <strong>{pendingImport.newScenes}</strong> new scene(s) — those will be added automatically.
                </p>
                <p className="text-parchment mb-4">
                  <strong>{pendingImport.conflicts.length}</strong> item(s) below exist locally with different
                  content. Review each one, or use "Apply to all" as a starting point and adjust individual items
                  afterward.
                </p>

                <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-inset">
                  <span className="text-parchment-muted text-xs uppercase tracking-wide self-center mr-1">
                    Apply to all:
                  </span>
                  <button
                    type="button"
                    onClick={() => applyToAll('keep-local')}
                    className="px-3 py-1.5 rounded border border-inset text-parchment text-sm hover:border-gold-dim transition-colors"
                  >
                    Keep Local
                  </button>
                  <button
                    type="button"
                    onClick={() => applyToAll('keep-imported')}
                    className="px-3 py-1.5 rounded border border-inset text-parchment text-sm hover:border-gold-dim transition-colors"
                  >
                    Keep Imported
                  </button>
                  <button
                    type="button"
                    onClick={() => applyToAll('keep-both')}
                    className="px-3 py-1.5 rounded border border-inset text-parchment text-sm hover:border-gold-dim transition-colors"
                  >
                    Keep Both
                  </button>
                </div>

                <div className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto pr-1">
                  {pendingImport.conflicts.map((c) => {
                    const diffs = diffFields(c.kind, c.local, c.incoming)
                    const choice = conflictChoices[c.id] ?? 'keep-local'
                    return (
                      <div key={c.id} className="rounded border border-inset bg-canvas p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-parchment font-heading">
                            {labelFor(c.kind, c.local)}
                            <span className="text-gold-dim text-xs uppercase tracking-wide ml-2">
                              {kindLabel(c.kind)}
                            </span>
                          </span>
                        </div>

                        {diffs.length > 0 && (
                          <div className="flex flex-col gap-2 mb-3">
                            {diffs.map((d) => (
                              <div key={d.label} className="text-sm">
                                <div className="text-gold-dim text-xs uppercase tracking-wide mb-0.5">{d.label}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div className="rounded border border-inset bg-surface px-2 py-1.5">
                                    <div className="text-parchment-muted text-xs mb-0.5">Local</div>
                                    <div className="text-parchment whitespace-pre-wrap break-words">{d.local}</div>
                                  </div>
                                  <div className="rounded border border-inset bg-surface px-2 py-1.5">
                                    <div className="text-parchment-muted text-xs mb-0.5">Imported</div>
                                    <div className="text-parchment whitespace-pre-wrap break-words">{d.incoming}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {(['keep-local', 'keep-imported', 'keep-both'] as ItemResolution[]).map((opt) => (
                            <label
                              key={opt}
                              className={`px-3 py-1.5 rounded border text-sm cursor-pointer transition-colors ${
                                choice === opt
                                  ? 'border-gold bg-surface-2 text-gold'
                                  : 'border-inset text-parchment-muted hover:border-gold-dim'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`resolution-${c.id}`}
                                value={opt}
                                checked={choice === opt}
                                onChange={() => setChoice(c.id, opt)}
                                className="sr-only"
                              />
                              {opt === 'keep-local' ? 'Keep Local' : opt === 'keep-imported' ? 'Keep Imported' : 'Keep Both'}
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingImport(null)
                      setConflictChoices({})
                    }}
                    className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmImport}
                    className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
                  >
                    Import
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmEmptyDeleted}
        title="Empty Recently Deleted?"
        message="Everything in Recently Deleted will be permanently removed right now, instead of waiting out the 30-day window. This cannot be undone."
        confirmLabel="Empty Now"
        onCancel={() => setConfirmEmptyDeleted(false)}
        onConfirm={() => {
          dispatch({ type: 'EMPTY_RECENTLY_DELETED' })
          setConfirmEmptyDeleted(false)
        }}
      />

      {restoreCollision && (
        <RestoreCollisionDialog
          open
          deleted={describeDeletedSide(restoreCollision.item)}
          live={describeLiveSide(dataset, restoreCollision.collision)}
          onSwap={() => {
            dispatch({
              type: 'RESOLVE_RESTORE_COLLISION',
              deletedItemId: restoreCollision.item.id,
              resolution: 'swap',
            })
            setRestoreCollision(null)
          }}
          onDiscard={() => {
            dispatch({
              type: 'RESOLVE_RESTORE_COLLISION',
              deletedItemId: restoreCollision.item.id,
              resolution: 'discard',
            })
            setRestoreCollision(null)
          }}
          onCancel={() => setRestoreCollision(null)}
        />
      )}
    </div>
  )
}
