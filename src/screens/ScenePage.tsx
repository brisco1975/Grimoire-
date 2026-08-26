import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import AppHeader from '../components/AppHeader'
import IndexFAB from '../components/IndexFAB'
import SceneDetail from '../components/SceneDetail'
import { sceneHeading } from '../utils/tocOrdering'
import { useIsWide } from '../utils/breakpoint'

export default function ScenePage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>()
  const navigate = useNavigate()
  const { getProject, getScene, dataset } = useApp()
  const isWide = useIsWide()

  const project = projectId ? getProject(projectId) : undefined
  const scene = sceneId ? getScene(sceneId) : undefined

  // On tablet/desktop, every entry point into a specific scene (Table of
  // Contents, a cross-project Connection jump, a browser deep link) funnels
  // into the two-page spread instead of this standalone full-screen route —
  // the spread is the canonical wide-screen experience, this route is the
  // phone one. See TableOfContents for the actual spread implementation.
  useEffect(() => {
    if (isWide && projectId && sceneId) {
      navigate(`/project/${projectId}?scene=${sceneId}`, { replace: true })
    }
  }, [isWide, projectId, sceneId, navigate])

  if (isWide) return null

  if (!project || !scene) {
    return (
      <div className="flex-1 flex flex-col">
        <AppHeader title="Not found" onBack={() => navigate(projectId ? `/project/${projectId}` : '/')} />
        <div className="p-6 text-parchment-muted">This scene no longer exists.</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col page-turn">
      <AppHeader title={sceneHeading(dataset.scenes, scene)} onBack={() => navigate(`/project/${projectId}`)} />
      <SceneDetail projectId={projectId!} scene={scene} />
      <IndexFAB projectId={projectId!} />
    </div>
  )
}
