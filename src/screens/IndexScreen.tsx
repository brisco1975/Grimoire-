import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import AppHeader from '../components/AppHeader'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import SeeAlsoPicker from '../components/SeeAlsoPicker'
import type { IndexEntry, IndexEntryType } from '../types'
import { entryScenes } from '../utils/links'
import { sceneHeading } from '../utils/tocOrdering'

const SECTIONS: { type: IndexEntryType; label: string; empty: string }[] = [
  { type: 'person', label: 'People', empty: 'No people indexed yet — mention someone with [[ in any text field.' },
  { type: 'place', label: 'Places', empty: 'No places indexed yet — mention one with [[ in any text field.' },
  { type: 'thing', label: 'Things', empty: 'No things indexed yet — mention one with [[ in any text field.' },
]

export default function IndexScreen() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { getProject, dataset, dispatch } = useApp()

  const project = projectId ? getProject(projectId) : undefined
  const entries = useMemo(
    () => dataset.indexEntries.filter((e) => e.projectId === projectId),
    [dataset.indexEntries, projectId],
  )

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<IndexEntry | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [aliasValue, setAliasValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickingSeeAlso, setPickingSeeAlso] = useState(false)

  if (!project || !projectId) {
    return (
      <div className="flex-1 flex flex-col">
        <AppHeader title="Not found" onBack={() => navigate('/')} />
        <div className="p-6 text-parchment-muted">This project no longer exists.</div>
      </div>
    )
  }

  // Keep the open detail panel in sync with live dataset changes (renames, new aliases, etc.).
  const liveSelected = selected ? (entries.find((e) => e.id === selected.id) ?? null) : null

  function openEntry(entry: IndexEntry) {
    setSelected(entry)
    setRenaming(false)
    setAliasValue('')
  }

  const scenesForSelected = liveSelected ? entryScenes(liveSelected, dataset.scenes) : []
  const seeAlsoForSelected = liveSelected
    ? liveSelected.seeAlso.map((id) => entries.find((e) => e.id === id)).filter((e): e is IndexEntry => !!e)
    : []

  // Matches against the canonical name AND any registered alias, case-
  // insensitive — an entry found only by an alias still needs to surface.
  const searchQuery = search.trim().toLowerCase()
  const isSearching = searchQuery.length > 0
  const visibleEntries = isSearching
    ? entries.filter(
        (e) => e.name.toLowerCase().includes(searchQuery) || e.aliases.some((a) => a.toLowerCase().includes(searchQuery)),
      )
    : entries

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader title={`${project.title} — Index`} onBack={() => navigate(`/project/${projectId}`)} />

      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full flex flex-col gap-6">
        {entries.length > 0 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names and aliases…"
            aria-label="Search the Index"
            className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
          />
        )}

        {entries.length === 0 && (
          <p className="text-parchment-muted italic text-center mt-10">
            The Index fills itself in — type <span className="text-link">[[</span> in any Actions, Characters,
            Summary, or other text field to link a person, place, or thing.
          </p>
        )}

        {isSearching && visibleEntries.length === 0 && entries.length > 0 && (
          <p className="text-parchment-muted italic text-center mt-6">No matches for "{search.trim()}".</p>
        )}

        {SECTIONS.map(({ type, label, empty }) => {
          const items = visibleEntries.filter((e) => e.type === type).sort((a, b) => a.name.localeCompare(b.name))
          // While searching, a section with no matches hides its header
          // entirely rather than showing an empty state — the "empty"
          // copy below ("No people indexed yet…") is for a genuinely
          // empty Index, not a search that came up short for this type.
          if (isSearching ? items.length === 0 : entries.length > 0 && items.length === 0) return null
          return (
            <section key={type}>
              <h2 className="font-heading text-gold-dim text-xs tracking-widest uppercase m-0 mb-2">{label}</h2>
              {items.length === 0 ? (
                <p className="text-parchment-muted text-sm italic">{empty}</p>
              ) : (
                <ul className="list-none m-0 p-0 flex flex-col gap-2">
                  {items.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => openEntry(e)}
                        className="w-full text-left rounded border border-inset bg-surface hover:bg-surface-2 hover:border-gold-dim transition-colors px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="font-heading text-parchment block truncate">{e.name}</span>
                          {e.aliases.length > 0 && (
                            <span className="text-parchment-muted text-xs block truncate">
                              also: {e.aliases.join(', ')}
                            </span>
                          )}
                        </span>
                        <span className="text-gold-dim text-lg shrink-0">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {/* Entry detail */}
      <Modal open={!!liveSelected} onClose={() => setSelected(null)} title={liveSelected?.name ?? ''} wide>
        {liveSelected && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-gold-dim text-xs uppercase tracking-wide">
                {liveSelected.type === 'person' ? 'Person' : liveSelected.type === 'place' ? 'Place' : 'Thing'}
              </span>
              <div className="flex gap-4 text-sm">
                <button
                  type="button"
                  className="text-gold-dim hover:text-gold transition-colors"
                  onClick={() => {
                    setRenameValue(liveSelected.name)
                    setRenaming(true)
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="text-accent-bright hover:text-accent transition-colors"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              </div>
            </div>

            {renaming && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const name = renameValue.trim()
                  if (!name) return
                  dispatch({ type: 'UPDATE_INDEX_ENTRY', id: liveSelected.id, patch: { name } })
                  setRenaming(false)
                }}
                className="flex gap-2"
              >
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="flex-1 rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded bg-accent hover:bg-accent-bright text-parchment text-sm transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(false)}
                  className="px-3 py-2 rounded border border-inset text-parchment-muted hover:text-parchment transition-colors text-sm"
                >
                  Cancel
                </button>
              </form>
            )}

            <p className="text-parchment-muted text-xs -mt-2">
              Renaming updates every place this entry is linked instantly — nothing needs re-typing.
            </p>

            {/* Aliases */}
            <div>
              <h3 className="font-heading text-gold text-sm uppercase tracking-wide m-0 mb-2">Also Known As</h3>
              {liveSelected.aliases.length === 0 ? (
                <p className="text-parchment-muted text-sm italic m-0 mb-2">No aliases yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-2">
                  {liveSelected.aliases.map((a) => (
                    <span
                      key={a}
                      className="inline-flex items-center gap-1 rounded-full border border-inset bg-surface text-parchment px-3 py-1 text-sm"
                    >
                      {a}
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={() =>
                          dispatch({
                            type: 'UPDATE_INDEX_ENTRY',
                            id: liveSelected.id,
                            patch: { aliases: liveSelected.aliases.filter((x) => x !== a) },
                          })
                        }
                        className="ml-1 text-parchment-muted hover:text-parchment"
                        aria-label={`Remove alias ${a}`}
                      >
                        ×
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const alias = aliasValue.trim()
                  if (!alias) return
                  if (liveSelected.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) return
                  dispatch({
                    type: 'UPDATE_INDEX_ENTRY',
                    id: liveSelected.id,
                    patch: { aliases: [...liveSelected.aliases, alias] },
                  })
                  setAliasValue('')
                }}
                className="flex gap-2"
              >
                <input
                  value={aliasValue}
                  onChange={(e) => setAliasValue(e.target.value)}
                  placeholder="Add another name…"
                  className="flex-1 rounded border border-inset bg-canvas text-parchment px-3 py-2 text-sm focus:border-gold outline-none"
                />
                <button
                  type="submit"
                  disabled={!aliasValue.trim()}
                  className="px-3 py-2 rounded border border-inset text-parchment hover:border-gold-dim text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </form>
            </div>

            {/* See Also */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading text-gold text-sm uppercase tracking-wide m-0">See Also</h3>
                <button
                  type="button"
                  onClick={() => setPickingSeeAlso(true)}
                  className="text-xs text-gold-dim hover:text-gold transition-colors"
                >
                  + Add
                </button>
              </div>
              {seeAlsoForSelected.length === 0 ? (
                <p className="text-parchment-muted text-sm italic m-0">No related entries linked yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {seeAlsoForSelected.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => openEntry(target)}
                      className="inline-flex items-center gap-1 rounded-full border border-link/60 bg-link/10 text-link px-3 py-1 text-sm hover:bg-link/20 transition-colors"
                    >
                      {target.name}
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch({ type: 'REMOVE_SEE_ALSO_LINK', aId: liveSelected.id, bId: target.id })
                        }}
                        className="ml-1 text-link/70 hover:text-link"
                        aria-label={`Remove see-also ${target.name}`}
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scenes */}
            <div>
              <h3 className="font-heading text-gold text-sm uppercase tracking-wide m-0 mb-2">
                Appears In ({scenesForSelected.length})
              </h3>
              {scenesForSelected.length === 0 ? (
                <p className="text-parchment-muted text-sm italic m-0">Not yet linked in any scene text.</p>
              ) : (
                <ul className="list-none m-0 p-0 flex flex-col gap-1">
                  {scenesForSelected.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/project/${s.projectId}/scene/${s.id}`)}
                        className="text-link hover:underline underline-offset-2 text-sm"
                      >
                        → {sceneHeading(dataset.scenes, s)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {liveSelected && (
        <SeeAlsoPicker
          open={pickingSeeAlso}
          onClose={() => setPickingSeeAlso(false)}
          currentEntry={liveSelected}
          allEntries={entries}
          onPick={(target) => {
            dispatch({ type: 'ADD_SEE_ALSO_LINK', aId: liveSelected.id, bId: target.id })
            setPickingSeeAlso(false)
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this Index entry?"
        message={`"${liveSelected?.name}" will be removed from the Index. Any [[bracket links]] to it in scene text will revert to plain, unresolved text rather than breaking outright. This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!liveSelected) return
          dispatch({ type: 'DELETE_INDEX_ENTRY', id: liveSelected.id })
          setConfirmDelete(false)
          setSelected(null)
        }}
      />
    </div>
  )
}

