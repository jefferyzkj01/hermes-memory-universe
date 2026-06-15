import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MiniSearch from 'minisearch'
import { Activity, Database, Filter, GitBranch, Info, Maximize2, Minimize2 } from 'lucide-react'
import UniverseGraph from './components/UniverseGraph.jsx'
import NebulaPanel from './components/NebulaPanel.jsx'
import NodeDetail from './components/NodeDetail.jsx'
import SearchCommand from './components/SearchCommand.jsx'
import DataHealth from './components/DataHealth.jsx'

const DATA_URL = `${import.meta.env.BASE_URL}data/graph.json?v=all-points-gravity-orbit-v1`

function App() {
  const [graph, setGraph] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [activeNebula, setActiveNebula] = useState('all')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('loading')
  const [isImmersive, setIsImmersive] = useState(false)
  const [autoOrbit, setAutoOrbit] = useState(false)
  const idleTimerRef = useRef(null)

  const markInteraction = useCallback(() => {
    setAutoOrbit(false)
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      setActiveNebula('all')
      setSelectedNode(null)
      setAutoOrbit(true)
    }, 5000)
  }, [])

  const toggleImmersive = useCallback(async () => {
    const nextValue = !isImmersive
    setIsImmersive(nextValue)
    try {
      if (nextValue && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else if (!nextValue && document.exitFullscreen && document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch {
      // CSS immersive mode still works when browser fullscreen is unavailable.
    }
  }, [isImmersive])

  const exitImmersive = useCallback(async () => {
    if (!isImmersive) return
    setIsImmersive(false)
    try {
      if (document.exitFullscreen && document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch {
      // CSS immersive mode exits even if browser fullscreen cannot be closed programmatically.
    }
  }, [isImmersive])

  const handleImmersiveDoubleClick = useCallback((event) => {
    if (!isImmersive) return
    event.preventDefault()
    exitImmersive()
  }, [exitImmersive, isImmersive])

  useEffect(() => {
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load graph: ${response.status}`)
        return response.json()
      })
      .then((data) => {
        setGraph(data)
        setSelectedNode(null)
        setStatus('ready')
      })
      .catch((error) => {
        console.error(error)
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    idleTimerRef.current = window.setTimeout(() => {
      setActiveNebula('all')
      setSelectedNode(null)
      setAutoOrbit(true)
    }, 5000)
    const events = ['pointerdown', 'click', 'keydown', 'wheel', 'touchstart']
    events.forEach((eventName) => window.addEventListener(eventName, markInteraction, { passive: true }))
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      events.forEach((eventName) => window.removeEventListener(eventName, markInteraction))
    }
  }, [markInteraction])

  useEffect(() => {
    const syncFullscreenState = () => {
      if (!document.fullscreenElement) setIsImmersive(false)
    }
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [])

  const miniSearch = useMemo(() => {
    if (!graph) return null
    const search = new MiniSearch({
      fields: ['label', 'summary', 'type', 'nebula', 'tags'],
      storeFields: ['id', 'label', 'type', 'nebula', 'summary'],
      searchOptions: { boost: { label: 3, tags: 2 }, prefix: true, fuzzy: 0.18 },
    })
    search.addAll(graph.nodes.map((node) => ({ ...node, tags: (node.tags ?? []).join(' ') })))
    return search
  }, [graph])

  const searchResults = useMemo(() => {
    if (!miniSearch || query.trim().length < 2) return []
    return miniSearch.search(query).slice(0, 8)
  }, [miniSearch, query])

  const filteredGraph = useMemo(() => {
    if (!graph || activeNebula === 'all') return graph
    const visible = new Set(graph.nodes
      .filter((node) => node.keywordCore === activeNebula || node.nebula === activeNebula || (node.relatedNebulae ?? []).includes(activeNebula))
      .map((node) => node.id))
    return {
      ...graph,
      nodes: graph.nodes.filter((node) => visible.has(node.id)),
      links: graph.links.filter((link) => visible.has(link.source) && visible.has(link.target)),
    }
  }, [graph, activeNebula])

  if (status === 'loading') return <main className="loading">載入 Hermes Memory Universe…</main>
  if (status === 'error') return <main className="loading error">graph.json 載入失敗，請先執行 npm run export:data。</main>

  return (
    <main className={`app-shell${isImmersive ? ' immersive-mode' : ''}`} onDoubleClick={handleImmersiveDoubleClick}>
      <section className="topbar">
        <div className="topbar-meta">
          <span><Activity size={14} /> {graph.snapshot.generatedAt}</span>
          <span><Database size={14} /> {graph.nodes.length} nodes / {graph.links.length} links</span>
        </div>
      </section>

      <section className="layout">
        <aside className="left-panel panel">
          <SearchCommand query={query} onQueryChange={setQuery} results={searchResults} onSelect={(nodeId) => {
            setSelectedNode(graph.nodes.find((node) => node.id === nodeId))
            setQuery('')
          }} />
          <NebulaPanel nebulas={graph.nebulas} activeNebula={activeNebula} onChange={setActiveNebula} />
          <DataHealth snapshot={graph.snapshot} />
        </aside>

        <section className="universe-card">
          <div className="graph-toolbar">
            <span><GitBranch size={14} /> 無字全螢幕・5 秒無操作後自動環繞全部星雲</span>
            <span><Filter size={14} /> {autoOrbit ? '自動環繞中' : activeNebula === 'all' ? '全部星雲' : graph.nebulas[activeNebula]?.label}</span>
          </div>
          <button
            aria-label={isImmersive ? '離開全螢幕模式' : '進入無字全螢幕模式'}
            className="immersive-toggle"
            type="button"
            onClick={toggleImmersive}
          >
            {isImmersive ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <UniverseGraph graph={filteredGraph} selectedNode={selectedNode} activeNebula={activeNebula} autoOrbit={autoOrbit} isImmersive={isImmersive} onSelect={setSelectedNode} nebulaTheme={graph.nebulas} />
        </section>

        <aside className="right-panel panel">
          <p className="panel-title"><Info size={14} /> Selected Node</p>
          <NodeDetail node={selectedNode} graph={graph} onSelect={(nodeId) => setSelectedNode(graph.nodes.find((node) => node.id === nodeId))} />
        </aside>
      </section>
    </main>
  )
}

export default App
