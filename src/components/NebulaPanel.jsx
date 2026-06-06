export default function NebulaPanel({ nebulas, activeNebula, onChange }) {
  return (
    <section className="module">
      <p className="panel-title">Nebulae</p>
      <div className="nebula-list">
        <button className={activeNebula === 'all' ? 'active nebula-button' : 'nebula-button'} onClick={() => onChange('all')}>
          <span className="dot" style={{ background: '#e2e8f0' }} />全部星雲
        </button>
        {Object.entries(nebulas).map(([key, nebula]) => (
          <button key={key} className={activeNebula === key ? 'active nebula-button' : 'nebula-button'} onClick={() => onChange(key)}>
            <span className="dot" style={{ background: nebula.color }} />
            <span>{nebula.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
