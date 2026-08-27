import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './store/AppContext'
import Bookshelf from './screens/Bookshelf'
import TableOfContents from './screens/TableOfContents'
import ScenePage from './screens/ScenePage'
import FullCardView from './screens/FullCardView'
import IndexScreen from './screens/IndexScreen'
import Settings from './screens/Settings'
import ProjectSettings from './screens/ProjectSettings'

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Bookshelf />} />
          <Route path="/project/:projectId" element={<TableOfContents />} />
          <Route path="/project/:projectId/index" element={<IndexScreen />} />
          <Route path="/project/:projectId/settings" element={<ProjectSettings />} />
          <Route path="/project/:projectId/scene/:sceneId" element={<ScenePage />} />
          <Route path="/project/:projectId/scene/:sceneId/card/:cardKey" element={<FullCardView />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  )
}
