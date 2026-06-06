export default function DataHealth({ snapshot }) {
  return (
    <section className="module">
      <p className="panel-title">Data Health</p>
      <div className="health-list">
        {snapshot.health.map((item) => (
          <div key={item.label} className="health-row">
            <span className={`health-dot ${item.status}`} />
            <span>{item.label}</span>
            <strong>{item.status}</strong>
          </div>
        ))}
      </div>
      <p className="fineprint">Public-safe static snapshot. Full private data remains local.</p>
    </section>
  )
}
