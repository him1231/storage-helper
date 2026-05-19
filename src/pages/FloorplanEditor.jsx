import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  getFloorplan,
  listUnits,
  createUnit,
  updateUnit,
  deleteUnit,
} from '../data.js';
import UnitPanel from '../components/UnitPanel.jsx';

export default function FloorplanEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const highlightId = params.get('highlight');
  const [plan, setPlan] = useState(null);
  const [units, setUnits] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  async function refresh() {
    try {
      const fp = await getFloorplan(id);
      setPlan(fp);
      const us = await listUnits(id);
      setUnits(us);
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  useEffect(() => { refresh(); }, [id]);

  useEffect(() => {
    if (highlightId && units.some((u) => u.id === highlightId)) {
      setSelectedId(highlightId);
    }
  }, [highlightId, units]);

  if (error) return <div className="card">Error: {error}</div>;
  if (!plan) return <div className="card">Loading…</div>;

  async function addUnit() {
    const id2 = await createUnit(id, {
      name: 'New Unit',
      kind: 'box',
      x: 20,
      y: 20,
      w: 100,
      h: 80,
    });
    await refresh();
    setSelectedId(id2);
  }

  function svgPoint(evt) {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const m = ctm.inverse();
    const p = pt.matrixTransform(m);
    return { x: p.x, y: p.y };
  }

  function onUnitMouseDown(e, unit) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(unit.id);
    const { x, y } = svgPoint(e);
    dragRef.current = {
      mode: 'move',
      unitId: unit.id,
      offsetX: x - unit.x,
      offsetY: y - unit.y,
      latest: { x: unit.x, y: unit.y, w: unit.w, h: unit.h },
    };
  }

  function onHandleMouseDown(e, unit) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(unit.id);
    dragRef.current = {
      mode: 'resize',
      unitId: unit.id,
      startW: unit.w,
      startH: unit.h,
      startMouse: svgPoint(e),
      latest: { x: unit.x, y: unit.y, w: unit.w, h: unit.h },
    };
  }

  function onMouseMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const p = svgPoint(e);
    setUnits((prev) =>
      prev.map((u) => {
        if (u.id !== d.unitId) return u;
        if (d.mode === 'move') {
          const x = clamp(p.x - d.offsetX, 0, plan.width - u.w);
          const y = clamp(p.y - d.offsetY, 0, plan.height - u.h);
          d.latest = { ...d.latest, x, y };
          return { ...u, x, y };
        }
        if (d.mode === 'resize') {
          const w = clamp(d.startW + (p.x - d.startMouse.x), 20, plan.width - u.x);
          const h = clamp(d.startH + (p.y - d.startMouse.y), 20, plan.height - u.y);
          d.latest = { ...d.latest, w, h };
          return { ...u, w, h };
        }
        return u;
      })
    );
  }

  async function onMouseUp() {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    try {
      if (d.mode === 'move') {
        await updateUnit(id, d.unitId, { x: d.latest.x, y: d.latest.y });
      } else if (d.mode === 'resize') {
        await updateUnit(id, d.unitId, { w: d.latest.w, h: d.latest.h });
      }
    } catch (e) {
      setError(String(e.message || e));
      refresh();
    }
  }

  async function onDeleteUnit(unitId) {
    try {
      await deleteUnit(id, unitId);
      setSelectedId(null);
      refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function onRenameUnit(unitId, patch) {
    await updateUnit(id, unitId, patch);
    refresh();
  }

  const selected = units.find((u) => u.id === selectedId) || null;

  return (
    <div>
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        <Link to="/">← All floorplans</Link>
        <h2 style={{ margin: 0 }}>{plan.name}</h2>
        <span className="muted">
          {plan.width}×{plan.height}
        </span>
        <button className="primary" onClick={addUnit}>
          + Add storage unit
        </button>
      </div>
      <div className="floorplan-grid">
        <div className="floorplan-canvas-wrap">
          <svg
            ref={svgRef}
            className="floorplan"
            width={plan.width}
            height={plan.height}
            viewBox={`0 0 ${plan.width} ${plan.height}`}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onClick={(e) => {
              if (e.target === svgRef.current) setSelectedId(null);
            }}
          >
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width={plan.width} height={plan.height} fill="url(#grid)" />
            {units.map((u) => {
              const cls =
                'unit' +
                (u.id === selectedId ? ' selected' : '') +
                (u.id === highlightId ? ' highlighted' : '');
              return (
                <g key={u.id} onMouseDown={(e) => onUnitMouseDown(e, u)}>
                  <rect
                    className={cls}
                    x={u.x}
                    y={u.y}
                    width={u.w}
                    height={u.h}
                    rx="4"
                  />
                  <text
                    className="unit-label"
                    x={u.x + 6}
                    y={u.y + 16}
                  >
                    {u.name}
                  </text>
                  {u.id === selectedId && (
                    <rect
                      className="handle"
                      x={u.x + u.w - 8}
                      y={u.y + u.h - 8}
                      width={10}
                      height={10}
                      onMouseDown={(e) => onHandleMouseDown(e, u)}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="sidebar">
          {selected ? (
            <UnitPanel
              key={selected.id}
              floorplanId={id}
              unit={selected}
              onRename={(patch) => onRenameUnit(selected.id, patch)}
              onDelete={() => onDeleteUnit(selected.id)}
            />
          ) : (
            <div className="card">
              <div className="muted">
                Select a unit to view its items, or add a new one.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
