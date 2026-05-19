import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { searchItems } from '../data.js';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const r = await searchItems(q);
        if (!cancelled) setResults(r);
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [q]);

  if (!q) {
    return (
      <div className="card">
        <h2>Search</h2>
        <div className="muted">Type a query in the top bar to find items.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Results for "{q}"</h2>
      {loading && <div className="muted">Searching…</div>}
      {err && <div className="muted">Error: {err}</div>}
      {!loading && !err && results.length === 0 && (
        <div className="muted">No items matched.</div>
      )}
      {results.map((r) => (
        <div
          key={`${r.floorplanId}-${r.storageUnitId}-${r.id}`}
          className="result"
          onClick={() =>
            nav(`/floorplan/${r.floorplanId}?highlight=${r.storageUnitId}`)
          }
        >
          <div>
            <strong>{r.name}</strong>{' '}
            <span className="muted">×{r.quantity || 1}</span>
          </div>
          <div className="muted">
            In unit <strong>{r.storageUnitName}</strong> on floorplan{' '}
            <strong>{r.floorplanName}</strong>
          </div>
          {r.tags?.length > 0 && (
            <div className="muted">tags: {r.tags.join(', ')}</div>
          )}
        </div>
      ))}
    </div>
  );
}
