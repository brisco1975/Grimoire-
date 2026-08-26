import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp, type ConflictResolutions, type ItemResolution } from '../store/AppContext'
import { SCHEMA_VERSION, type GrimoireDataset, type IndexEntry, type Project, type Scene } from '../types'
import AppHeader from '../components/AppHeader'
import Modal from '../components/Modal'
import { APP_VERSION, CHANGELOG } from '../data/changelog'
import { nowIso } from '../utils/id'
import { toPlainDisplayText } from '../utils/links'

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

type ConflictKind = 'project' | 'scene' | 'indexEntry'
interface ConflictItem {
  kind: ConflictKind
  id: string
  local: Project | Scene | IndexEntry
  incoming: Project | Scene | IndexEntry
}

const SCENE_TEXT_FIELDS = new Set(['characters', 'actions', 'setting', 'time', 'lore', 'summary'])

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  status: 'Status',
  characters: 'Characters',
  actions: 'Actions',
  setting: 'Setting',
  time: 'Time',
  lore: 'Lore',
  summary: 'Summary',
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
  local: Project | Scene | IndexEntry,
  incoming: Project | Scene | IndexEntry,
): { label: string; local: string; incoming: string }[] {
  const keys: string[] =
    kind === 'project'
      ? ['title']
      : kind === 'scene'
        ? ['title', 'status', 'characters', 'actions', 'setting', 'time', 'lore', 'summary']
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

function labelFor(kind: ConflictKind, item: Project | Scene | IndexEntry): string {
  if (kind === 'project') return (item as Project).title || 'Untitled project'
  if (kind === 'scene') return (item as Scene).title || 'Untitled scene'
  return (item as IndexEntry).name || 'Untitled entry'
}

function kindLabel(kind: ConflictKind): string {
  return kind === 'project' ? 'Project' : kind === 'scene' ? 'Scene' : 'Index entry'
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
    newScenes: number
    newIndexEntries: number
    hasLocalData: boolean
  } | null>(null)
  const [conflictChoices, setConflictChoices] = useState<ConflictResolutions>({})
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState<string | null>(null)

  function handleExport() {
    if (exporting.current) return
    exporting.current = true
    setImportError(null)
    setExportSuccess(null)
    try {
      const payload: GrimoireDataset = {
        ...dataset,
        schemaVersion: SCHEMA_VERSION,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const filename = `grimoire-export-${stamp}.json`
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
      dispatch({ type: 'SET_LAST_EXPORTED', timestamp: nowIso() })
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
        const localScenes = new Map(dataset.scenes.map((s) => [s.id, s]))
        const localIndexEntries = new Map(dataset.indexEntries.map((e) => [e.id, e]))

        const incomingProjects: Project[] = Array.isArray(parsed.projects) ? parsed.projects : []
        const incomingScenes: Scene[] = Array.isArray(parsed.scenes) ? parsed.scenes : []
        const incomingIndexEntries: IndexEntry[] = Array.isArray(parsed.indexEntries) ? parsed.indexEntries : []

        const conflicts: ConflictItem[] = []
        let newProjects = 0
        let newScenes = 0
        let newIndexEntries = 0

        for (const p of incomingProjects) {
          const existing = localProjects.get(p.id)
          if (!existing) newProjects++
          else if (JSON.stringify(existing) !== JSON.stringify(p)) conflicts.push({ kind: 'project', id: p.id, local: existing, incoming: p })
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
      `Import complete — ${pendingImport.newProjects} new project(s), ${pendingImport.newScenes} new scene(s), ` +
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
      `Import complete — restored ${pendingImport.newProjects} project(s) and ${pendingImport.newScenes} scene(s).`,
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
              onClick={handleExport}
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
            {CHANGELOG.map((entry) => (
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
                  Found <strong>{pendingImport.newProjects}</strong> new project(s) and{' '}
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
    </div>
  )
}
