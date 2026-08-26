import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import type { Project } from '../types'
import Modal from '../components/Modal'
import AppHeader from '../components/AppHeader'

function BookSpine({
  label,
  onClick,
  variant = 'project',
}: {
  label: string
  onClick: () => void
  variant?: 'project' | 'create'
}) {
  const isCreate = variant === 'create'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group shrink-0 h-64 sm:h-72 w-14 sm:w-16 rounded-sm border-2 flex flex-col items-center justify-between py-4 transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 outline-none ${
        isCreate
          ? 'border-dashed border-gold bg-surface/40 hover:bg-surface'
          : 'border-inset bg-gradient-to-b from-accent to-surface-2 hover:brightness-110 shadow-lg shadow-black/40'
      }`}
      aria-label={isCreate ? 'Create new project' : `Open ${label}`}
    >
      <span className={`text-2xl ${isCreate ? 'text-gold' : 'text-gold'}`}>{isCreate ? '+' : '❧'}</span>
      <span
        className={`font-heading tracking-wide text-sm sm:text-base ${isCreate ? 'text-gold' : 'text-parchment'}`}
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          transform: 'rotate(180deg)',
          maxHeight: '75%',
        }}
      >
        {label}
      </span>
      <span className={`text-xs ${isCreate ? 'text-gold' : 'text-gold-dim'}`}>{isCreate ? '' : '❧'}</span>
    </button>
  )
}

function Bookend({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      aria-hidden="true"
      className={`shrink-0 h-64 sm:h-72 w-8 sm:w-10 self-end mb-0 rounded-sm bg-gradient-to-b from-gold-dim to-inset ${
        side === 'left' ? 'rounded-l-md' : 'rounded-r-md'
      }`}
      style={{
        clipPath:
          side === 'left'
            ? 'polygon(30% 0, 100% 0, 100% 100%, 0 100%)'
            : 'polygon(0 0, 70% 0, 100% 100%, 0 100%)',
      }}
    />
  )
}

export default function Bookshelf() {
  const { dataset, dispatch, loading } = useApp()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const shelfRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)

  const ordered = useMemo(() => {
    const left: Project[] = []
    const right: Project[] = []
    dataset.projects.forEach((p, i) => {
      if (i % 2 === 0) left.unshift(p)
      else right.push(p)
    })
    return { left, right }
  }, [dataset.projects])

  useEffect(() => {
    centerRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [dataset.projects.length])

  function submitNewProject(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    dispatch({ type: 'ADD_PROJECT', title })
    setNewTitle('')
    setCreating(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-parchment-muted font-heading">
        Opening the bookshelf…
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader title="The Grimoire" />

      <div className="px-4 pt-2">
        <p className="text-parchment-muted text-sm italic m-0">Track, store, plan and reference your tomes.</p>
      </div>

      <div className="flex-1 flex items-end overflow-x-auto overflow-y-hidden px-6 sm:px-12" ref={shelfRef}>
        <div className="flex items-end gap-3 sm:gap-4 mx-auto py-10 min-w-min">
          <Bookend side="left" />
          {ordered.left.map((p) => (
            <BookSpine key={p.id} label={p.title} onClick={() => navigate(`/project/${p.id}`)} />
          ))}
          <div ref={centerRef}>
            <BookSpine label="Create New" variant="create" onClick={() => setCreating(true)} />
          </div>
          {ordered.right.map((p) => (
            <BookSpine key={p.id} label={p.title} onClick={() => navigate(`/project/${p.id}`)} />
          ))}
          <Bookend side="right" />
        </div>
      </div>

      {/* the shelf itself */}
      <div className="h-3 mx-4 sm:mx-8 mb-8 rounded-sm bg-gradient-to-b from-inset to-surface-2 shadow-lg shadow-black/50" />

      <Modal open={creating} onClose={() => setCreating(false)} title="Create New Project">
        <form onSubmit={submitNewProject}>
          <label className="block text-sm text-parchment-muted mb-2" htmlFor="new-project-title">
            Project title
          </label>
          <input
            id="new-project-title"
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. The Last Ember"
            className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 mb-5 focus:border-gold outline-none"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add to Shelf
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
