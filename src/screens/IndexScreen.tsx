import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import AppHeader from '../components/AppHeader'
import IndexEntryBlurbField from '../components/IndexEntryBlurbField'
import IndexEntryPeekModal from '../components/IndexEntryPeekModal'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import SeeAlsoPicker from '../components/SeeAlsoPicker'
import type { IndexEntry, IndexEntryType } from '../types'
import { ENTRY_TYPES, ENTRY_TYPE_LABELS } from '../data/indexEntryTypes'
import { entryScenes } from '../utils/links'
import { sceneHeading } from '../utils/tocOrdering'

const SECTIONS: { type: IndexEntryType; label: string; empty: string }[] = [
  { type: 'person', label: ENTRY_TYPE_LABELS.person, empty: 'No people indexed yet — mention someone with [[ in any text field.' },
  { type: 'place', label: 'Places', empty: 'No places indexed yet — mention one with [[ in any text field.' },
  { type: 'thing', label: 'Things', empty: 'No things indexed yet — mention one with [[ in any text field.' },
]

export default function IndexScreen() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [changingType, setChangingType] = useState(false)
  const [aliasValue, setAliasValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickingSeeAlso, setPickingSeeAlso] = useState(false)
  // A link tapped inside THIS entry's own blurb opens a nested quick peek,
  // separate from `selected` (the full entry page underneath stays open).
  // Tracked by ID and looked up live (like `liveSelected` above) so an edit
  // made inside the popup itself — its own blurb field — shows immediately
  // instead of the popup holding a stale snapshot from when it was opened.
  const [peekEntryId, setPeekEntryId] = useState<string | null>(null)

  // "Open full entry →" from a peek popup elsewhere in the app lands here
  // with ?entry=<id> — auto-opens that entry's detail on arrival, same as
  // tapping it directly from the list below. This is a one-shot deep link,
  // not a navigable step of its own: back from an entry opened this way
  // still goes straight back to wherever the link was tapped from, same as
  // before — only opening an entry FROM THE BROWSABLE LIST below gets its
  // own back-returns-to-the-list step (see openedFromListRef below).
  const entryParam = searchParams.get('entry')
  useEffect(() => {
    if (!entryParam) return
    const target = entries.find((e) => e.id === entryParam)
    if (target) {
      setSelected(target)
      setRenaming(false)
      setChangingType(false)
      setAliasValue('')
    }
    setSearchParams((params) => {
      params.delete('entry')
      return params
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryParam])

  // Opening an entry from the browsable list pushes a REAL history entry
  // (same URL, carrying a marker in location.state) instead of just setting
  // local state, so that a pop — the in-app arrow or the system back
  // gesture — lands back on the list, not wherever the Index itself was
  // opened from. This ref tracks whether the currently-open entry came from
  // that push (as opposed to a sideways See Also jump or a `?entry=` deep
  // link, neither of which push anything, and whose existing back behavior
  // — straight past Index to its own opener — is left unchanged).
  const openedFromListRef = useRef(false)
  useEffect(() => {
    const listEntryId = (location.state as { listEntryId?: string } | null)?.listEntryId
    if (listEntryId) {
      const target = entries.find((e) => e.id === listEntryId)
      setSelected(target ?? null)
      setRenaming(false)
      setChangingType(false)
      setAliasValue('')
    } else if (openedFromListRef.current) {
      // Landed back on the pre-push /index location (a pop) — close
      // whatever was opened from the list.
      setSelected(null)
      openedFromListRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  if (!project || !projectId) {
    return (
      <div className="flex-1 flex flex-col">
        <AppHeader title="Not found" onBack={() => navigate(-1)} />
        <div className="p-6 text-parchment-muted">This project no longer exists.</div>
      </div>
    )
  }

  // Keep the open detail panel in sync with live dataset changes (renames, new aliases, etc.).
  const liveSelected = selected ? (entries.find((e) => e.id === selected.id) ?? null) : null
  const peekEntry = peekEntryId ? entries.find((e) => e.id === peekEntryId) ?? null : null

  // Sideways jump (a See Also chip inside an already-open entry) and the
  // `?entry=` deep-link effect above both use this directly — neither
  // pushes history, matching their existing, unchanged back behavior.
  function openEntry(entry: IndexEntry) {
    setSelected(entry)
    setRenaming(false)
    setChangingType(false)
    setAliasValue('')
  }

  // Opening FROM THE BROWSABLE LIST pushes a history entry (see the effect
  // above) so back returns to the list instead of skipping past it.
  function openEntryFromList(entry: IndexEntry) {
    openedFromListRef.current = true
    navigate(`${location.pathname}${location.search}`, { state: { listEntryId: entry.id } })
  }

  // Closes whatever entry is open, consuming the pending list-open history
  // push (if any) so it doesn't linger as a wasted extra back step — same
  // reasoning as FullCardView's leave().
  function closeEntry() {
    if (openedFromListRef.current) {
      navigate(-1)
    } else {
      setSelected(null)
    }
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
      {/* The Index LIST always sits directly above wherever it was opened
          from (Table of Contents or a Scene Page — see IndexFAB, always a
          plain push now), so a pop here always reaches that opener,
          matching the in-app arrow to the system back gesture. An entry
          opened FROM the list adds one more step of its own (see
          openEntryFromList above), so this single unconditional
          navigate(-1) correctly lands on the list first and the opener
          second — no branching needed here, since that extra step is a
          real history entry. */}
      <AppHeader title={`${project.title} — Index`} onBack={() => navigate(-1)} />

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
                        onClick={() => openEntryFromList(e)}
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
      <Modal open={!!liveSelected} onClose={closeEntry} title={liveSelected?.name ?? ''} wide>
        {liveSelected && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="shrink-0 inline-flex items-center rounded-full border border-gold-dim px-2.5 py-0.5 text-[13px] font-heading text-gold uppercase tracking-wide">
                {ENTRY_TYPE_LABELS[liveSelected.type]}
              </span>
              <div className="flex gap-4 text-sm whitespace-nowrap">
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
                  className="text-gold-dim hover:text-gold transition-colors"
                  onClick={() => setChangingType((v) => !v)}
                >
                  Change type
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

            {changingType && (
              <div className="grid grid-cols-3 gap-2 -mt-2">
                {ENTRY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={t === liveSelected.type}
                    onClick={() => {
                      // Same id, same name/aliases/seeAlso/blurb — only the
                      // type changes, so every existing [[link]] (which
                      // resolves by id, never by type) still resolves, and
                      // the entry simply reappears in the Index's section
                      // for its new category. Entry names are unique
                      // PROJECT-WIDE already (see utils/links.findExactMatch,
                      // which never filters by type), so changing type alone
                      // can never collide with another entry's name — there
                      // is nothing here for a "Same thing / Different thing"
                      // collision prompt to resolve.
                      dispatch({ type: 'UPDATE_INDEX_ENTRY', id: liveSelected.id, patch: { type: t } })
                      setChangingType(false)
                    }}
                    className="rounded border border-inset bg-surface hover:border-gold-dim hover:bg-surface-2 transition-colors px-3 py-2 text-center text-parchment text-sm disabled:opacity-40 disabled:cursor-default disabled:hover:border-inset disabled:hover:bg-surface"
                  >
                    {ENTRY_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}

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

            {/* Blurb */}
            <div>
              <h3 className="font-heading text-gold text-sm uppercase tracking-wide m-0 mb-2">Description</h3>
              <IndexEntryBlurbField
                entry={liveSelected}
                entries={entries}
                projectId={projectId}
                onSave={(blurb) => dispatch({ type: 'UPDATE_INDEX_ENTRY', id: liveSelected.id, patch: { blurb } })}
                onOpenEntry={(entry) => setPeekEntryId(entry.id)}
              />
            </div>

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
                        // replace, not push — jumping to a scene from here is a
                        // lateral move (Index already sits where the Table of
                        // Contents would), so it must not stack a second entry
                        // on top of Index's; see IndexFAB's doc comment.
                        onClick={() => navigate(`/project/${s.projectId}/scene/${s.id}`, { replace: true })}
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
          closeEntry()
        }}
      />

      <IndexEntryPeekModal
        entry={peekEntry}
        entries={entries}
        projectId={projectId}
        onClose={() => setPeekEntryId(null)}
        onOpenEntry={(entry) => setPeekEntryId(entry.id)}
        onSaveBlurb={(id, blurb) => dispatch({ type: 'UPDATE_INDEX_ENTRY', id, patch: { blurb } })}
        onOpenFullEntry={(entry) => {
          setPeekEntryId(null)
          openEntry(entry)
        }}
      />
    </div>
  )
}

