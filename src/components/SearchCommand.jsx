import { Search } from 'lucide-react'

export default function SearchCommand({ query, onQueryChange, results, onSelect }) {
  return (
    <section className="module search-module">
      <label className="search-box">
        <Search size={15} />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search memory, skills, tools…" />
      </label>
      {results.length > 0 && (
        <div className="search-results">
          {results.map((result) => (
            <button key={result.id} onClick={() => onSelect(result.id)}>
              <strong>{result.label}</strong>
              <span>{result.nebula} · {result.type}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
