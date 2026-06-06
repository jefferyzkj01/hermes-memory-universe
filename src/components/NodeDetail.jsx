export default function NodeDetail({ node, graph, onSelect }) {
  if (!node) return <p className="muted">點選一個星點查看細節。</p>
  const connected = graph.links
    .filter((link) => link.source === node.id || link.target === node.id)
    .map((link) => ({ ...link, other: graph.nodes.find((candidate) => candidate.id === (link.source === node.id ? link.target : link.source)) }))
    .filter((item) => item.other)
    .slice(0, 10)

  return (
    <div className="node-detail">
      <div className="node-heading">
        <span className={`type-pill ${node.type}`}>{node.type}</span>
        <h2>{node.label}</h2>
        <p>{node.summary}</p>
      </div>
      <div className="detail-grid">
        <span>Keyword Core</span><strong>{node.keyword ?? node.keywordCore ?? 'orbit'}</strong>
        <span>Original Layer</span><strong>{node.nebula}</strong>
        <span>Semantic Score</span><strong>{node.keywordScore ?? 'computed'}</strong>
        <span>Visibility</span><strong>{node.visibility ?? 'public-safe'}</strong>
        <span>Freshness</span><strong>{node.freshness ?? 'snapshot'}</strong>
      </div>
      {node.tags?.length > 0 && <div className="tag-cloud">{node.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
      <section>
        <p className="panel-title">Connections</p>
        <div className="connection-list">
          {connected.map((item) => (
            <button key={`${item.source}-${item.target}`} onClick={() => onSelect(item.other.id)}>
              <span>{item.other.label}</span>
              <small>{item.type}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
