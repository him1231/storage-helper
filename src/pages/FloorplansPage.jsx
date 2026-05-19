import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFloorplans, createFloorplan, deleteFloorplan } from '../data.js';

export default function FloorplansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(400);
  const [err, setErr] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      setPlans(await listFloorplans());
      setErr(null);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await createFloorplan({ name: name.trim(), width, height });
    setName('');
    refresh();
  }

  async function onDelete(id) {
    if (!confirm('Delete floorplan and all its units/items?')) return;
    await deleteFloorplan(id);
    refresh();
  }

  return (
    <div>
      <div className="card">
        <h2>New Floorplan</h2>
        <form className="row" onSubmit={onCreate}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Width
            <input
              type="number"
              min={100}
              max={4000}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <label>
            Height
            <input
              type="number"
              min={100}
              max={4000}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </label>
          <button type="submit" className="primary">Create</button>
        </form>
      </div>

      <div className="card">
        <h2>Floorplans</h2>
        {err && <div className="muted">Error: {err}</div>}
        {loading && <div className="muted">Loading…</div>}
        {!loading && plans.length === 0 && (
          <div className="muted">No floorplans yet. Create one above.</div>
        )}
        {plans.map((p) => (
          <div key={p.id} className="list-item row">
            <Link to={`/floorplan/${p.id}`}>{p.name}</Link>
            <span className="muted">
              {p.width}×{p.height}
            </span>
            <button
              className="danger"
              style={{ marginLeft: 'auto' }}
              onClick={() => onDelete(p.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
