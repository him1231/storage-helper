import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  getFloorplan,
  listUnits,
  createUnit,
  createUnitWithId,
  updateUnit,
  deleteUnit,
} from '../data.js';
import UnitPanel from '../components/UnitPanel.jsx';

const KIND_COLORS = {
  box:     { fill: '#dbeafe', stroke: '#2563eb' },
  shelf:   { fill: '#d1fae5', stroke: '#059669' },
  drawer:  { fill: '#fef3c7', stroke: '#d97706' },
  room:    { fill: '#ede9fe', stroke: '#7c3aed' },
  cabinet: { fill: '#ccfbf1', stroke: '#0d9488' },
};

const KIND_DEFAULTS = {
  shelf:   { w: 120, h: 30 },
  drawer:  { w: 60,  h: 60 },
  box:     { w: 80,  h: 60 },
  cabinet: { w: 80,  h: 140 },
  room:    { w: 240, h: 180 },
};

const QUICK_ADD_KINDS = ['shelf', 'drawer', 'box', 'cabinet', 'room'];

const VIEWPORT_W = 800;
const VIEWPORT_H = 600;
const GUIDE_THRESHOLD = 2;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function snapTo(v, grid) { return Math.round(v / grid) * grid; }

export default function FloorplanEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const highlightId = params.get('highlight');
  const [plan, setPlan] = useState(null);
  const [units, setUnits] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [marquee, setMarquee] = useState(null);
  const [guides, setGuides] = useState({ h: null, v: null });
  const [dragMeta, setDragMeta] = useState(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [error, setError] = useState(null);

  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const altRef = useRef(false);
  const spaceRef = useRef(false);
  const historyRef = useRef({ undo: [], redo: [] });
  const pendingMoveRef = useRef(null);
  const unitsRef = useRef([]);
  useEffect(() => { unitsRef.current = units; }, [units]);

  const gridSize = plan?.gridSize || 20;

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

  // On first load of plan, fit-to-view
  const didInitViewport = useRef(false);
  useEffect(() => {
    if (plan && !didInitViewport.current) {
      didInitViewport.current = true;
      setViewport(computeFit(plan));
    }
  }, [plan]);

  useEffect(() => {
    if (highlightId && units.some((u) => u.id === highlightId)) {
      setSelectedIds(new Set([highlightId]));
    }
  }, [highlightId, units]);

  function computeFit(p) {
    if (!p) return { x: 0, y: 0, zoom: 1 };
    const zoomX = VIEWPORT_W / p.width;
    const zoomY = VIEWPORT_H / p.height;
    const zoom = clamp(Math.min(zoomX, zoomY, 1), MIN_ZOOM, MAX_ZOOM);
    const x = (VIEWPORT_W - p.width * zoom) / 2;
    const y = (VIEWPORT_H - p.height * zoom) / 2;
    return { x, y, zoom };
  }

  function svgPoint(evt) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  function worldPoint(evt) {
    const s = svgPoint(evt);
    return { x: (s.x - viewport.x) / viewport.zoom, y: (s.y - viewport.y) / viewport.zoom };
  }

  // History
  function pushHistory(op) {
    historyRef.current.undo.push(op);
    historyRef.current.redo = [];
    setHistoryTick((t) => t + 1);
  }

  async function applyOp(op, direction) {
    // direction: 'do' applies forward; 'undo' applies inverse
    if (op.type === 'create') {
      if (direction === 'do') {
        for (const u of op.units) await createUnitWithId(id, u.id, u);
        setUnits((prev) => [...prev.filter((p) => !op.units.some((u) => u.id === p.id)), ...op.units]);
        setSelectedIds(new Set(op.units.map((u) => u.id)));
      } else {
        for (const u of op.units) await deleteUnit(id, u.id);
        setUnits((prev) => prev.filter((p) => !op.units.some((u) => u.id === p.id)));
        setSelectedIds(new Set());
      }
    } else if (op.type === 'delete') {
      if (direction === 'do') {
        for (const u of op.units) await deleteUnit(id, u.id);
        setUnits((prev) => prev.filter((p) => !op.units.some((u) => u.id === p.id)));
        setSelectedIds(new Set());
      } else {
        for (const u of op.units) await createUnitWithId(id, u.id, u);
        setUnits((prev) => [...prev.filter((p) => !op.units.some((u) => u.id === p.id)), ...op.units]);
        setSelectedIds(new Set(op.units.map((u) => u.id)));
      }
    } else if (op.type === 'move') {
      const map = direction === 'do' ? op.after : op.before;
      for (const [unitId, pos] of Object.entries(map)) {
        await updateUnit(id, unitId, { x: pos.x, y: pos.y });
      }
      setUnits((prev) =>
        prev.map((u) => (map[u.id] ? { ...u, ...map[u.id] } : u))
      );
    } else if (op.type === 'resize') {
      const map = direction === 'do' ? op.after : op.before;
      for (const [unitId, sz] of Object.entries(map)) {
        await updateUnit(id, unitId, { w: sz.w, h: sz.h });
      }
      setUnits((prev) =>
        prev.map((u) => (map[u.id] ? { ...u, ...map[u.id] } : u))
      );
    }
  }

  async function undo() {
    const op = historyRef.current.undo.pop();
    if (!op) return;
    try {
      await applyOp(op, 'undo');
      historyRef.current.redo.push(op);
      setHistoryTick((t) => t + 1);
    } catch (e) {
      setError(String(e.message || e));
      historyRef.current.undo.push(op);
      setHistoryTick((t) => t + 1);
    }
  }

  async function redo() {
    const op = historyRef.current.redo.pop();
    if (!op) return;
    try {
      await applyOp(op, 'do');
      historyRef.current.undo.push(op);
      setHistoryTick((t) => t + 1);
    } catch (e) {
      setError(String(e.message || e));
      historyRef.current.redo.push(op);
      setHistoryTick((t) => t + 1);
    }
  }

  // Quick-add unit
  async function quickAdd(kind) {
    const sz = KIND_DEFAULTS[kind] || KIND_DEFAULTS.box;
    const x = snapTo(20, gridSize);
    const y = snapTo(20, gridSize);
    const unit = {
      name: capitalize(kind),
      kind,
      x,
      y,
      w: sz.w,
      h: sz.h,
    };
    const newId = await createUnit(id, unit);
    const created = { id: newId, ...unit };
    setUnits((prev) => [...prev, created]);
    setSelectedIds(new Set([newId]));
    pushHistory({ type: 'create', units: [created] });
  }

  // Drag handling
  function onUnitMouseDown(e, unit) {
    if (spaceRef.current || e.button === 1) return; // pan path
    e.preventDefault();
    e.stopPropagation();
    let nextSelected;
    if (e.shiftKey) {
      nextSelected = new Set(selectedIds);
      if (nextSelected.has(unit.id)) nextSelected.delete(unit.id);
      else nextSelected.add(unit.id);
    } else if (selectedIds.has(unit.id)) {
      nextSelected = new Set(selectedIds);
    } else {
      nextSelected = new Set([unit.id]);
    }
    setSelectedIds(nextSelected);
    const w = worldPoint(e);
    const movingIds = [...nextSelected];
    const startPositions = {};
    for (const uid of movingIds) {
      const u = units.find((x) => x.id === uid);
      if (u) startPositions[uid] = { x: u.x, y: u.y };
    }
    dragRef.current = {
      mode: 'move',
      anchorId: unit.id,
      offsetX: w.x - unit.x,
      offsetY: w.y - unit.y,
      startPositions,
      movingIds,
      latest: { ...startPositions },
    };
    setDragMeta({ mode: 'move', unitId: unit.id });
  }

  function onHandleMouseDown(e, unit) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds(new Set([unit.id]));
    dragRef.current = {
      mode: 'resize',
      unitId: unit.id,
      startW: unit.w,
      startH: unit.h,
      startMouse: worldPoint(e),
      latestSize: { w: unit.w, h: unit.h },
    };
    setDragMeta({ mode: 'resize', unitId: unit.id });
  }

  function onCanvasMouseDown(e) {
    if (e.button === 1 || spaceRef.current) {
      e.preventDefault();
      const s = svgPoint(e);
      dragRef.current = {
        mode: 'pan',
        startMouse: s,
        startPan: { x: viewport.x, y: viewport.y },
      };
      setDragMeta({ mode: 'pan' });
      return;
    }
    if (e.target !== svgRef.current && e.target.tagName !== 'rect' && !e.target.classList?.contains('canvas-bg')) {
      // Click was on a child; ignore
    }
    // Start marquee
    const w = worldPoint(e);
    if (!e.shiftKey) setSelectedIds(new Set());
    dragRef.current = {
      mode: 'marquee',
      startWorld: w,
      currentWorld: w,
      additive: e.shiftKey,
      initialSelection: new Set(selectedIds),
    };
    setMarquee({ x1: w.x, y1: w.y, x2: w.x, y2: w.y });
    setDragMeta({ mode: 'marquee' });
  }

  function onMouseMove(e) {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'pan') {
      const s = svgPoint(e);
      const dx = s.x - d.startMouse.x;
      const dy = s.y - d.startMouse.y;
      setViewport((v) => ({ ...v, x: d.startPan.x + dx, y: d.startPan.y + dy }));
      return;
    }
    const w = worldPoint(e);
    if (d.mode === 'move') {
      const anchor = units.find((u) => u.id === d.anchorId);
      if (!anchor) return;
      const desiredAnchorX = w.x - d.offsetX;
      const desiredAnchorY = w.y - d.offsetY;
      const deltaX = desiredAnchorX - d.startPositions[d.anchorId].x;
      const deltaY = desiredAnchorY - d.startPositions[d.anchorId].y;
      const latest = {};
      const nextUnits = units.map((u) => {
        if (!d.movingIds.includes(u.id)) return u;
        const sp = d.startPositions[u.id];
        let nx = sp.x + deltaX;
        let ny = sp.y + deltaY;
        nx = clamp(nx, 0, plan.width - u.w);
        ny = clamp(ny, 0, plan.height - u.h);
        latest[u.id] = { x: nx, y: ny };
        return { ...u, x: nx, y: ny };
      });
      d.latest = latest;
      setUnits(nextUnits);
      // Compute alignment guides relative to the anchor unit
      const anchorNext = nextUnits.find((u) => u.id === d.anchorId);
      setGuides(computeGuides(anchorNext, nextUnits, plan));
      return;
    }
    if (d.mode === 'resize') {
      const u = units.find((x) => x.id === d.unitId);
      if (!u) return;
      const newW = clamp(d.startW + (w.x - d.startMouse.x), 20, plan.width - u.x);
      const newH = clamp(d.startH + (w.y - d.startMouse.y), 20, plan.height - u.y);
      d.latestSize = { w: newW, h: newH };
      setUnits((prev) => prev.map((x) => (x.id === u.id ? { ...x, w: newW, h: newH } : x)));
      return;
    }
    if (d.mode === 'marquee') {
      d.currentWorld = w;
      setMarquee({ x1: d.startWorld.x, y1: d.startWorld.y, x2: w.x, y2: w.y });
      // Live update selection
      const x1 = Math.min(d.startWorld.x, w.x);
      const x2 = Math.max(d.startWorld.x, w.x);
      const y1 = Math.min(d.startWorld.y, w.y);
      const y2 = Math.max(d.startWorld.y, w.y);
      const inside = new Set(d.additive ? d.initialSelection : []);
      for (const u of units) {
        if (u.x >= x1 && u.y >= y1 && u.x + u.w <= x2 && u.y + u.h <= y2) {
          inside.add(u.id);
        }
      }
      setSelectedIds(inside);
      return;
    }
  }

  async function onMouseUp() {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setGuides({ h: null, v: null });
    setDragMeta(null);
    if (d.mode === 'pan') return;
    if (d.mode === 'marquee') {
      setMarquee(null);
      return;
    }
    if (d.mode === 'move') {
      // Snap on release unless Alt held
      const snap = !altRef.current;
      const afterMap = {};
      const beforeMap = {};
      for (const uid of Object.keys(d.latest)) {
        const u = unitsRef.current.find((x) => x.id === uid);
        if (!u) continue;
        let { x, y } = d.latest[uid];
        if (snap) {
          x = clamp(snapTo(x, gridSize), 0, plan.width - u.w);
          y = clamp(snapTo(y, gridSize), 0, plan.height - u.h);
        }
        afterMap[uid] = { x, y };
        beforeMap[uid] = d.startPositions[uid];
      }
      setUnits((prev) =>
        prev.map((u) => (afterMap[u.id] ? { ...u, ...afterMap[u.id] } : u))
      );
      try {
        for (const [uid, pos] of Object.entries(afterMap)) {
          await updateUnit(id, uid, { x: pos.x, y: pos.y });
        }
        const changed = Object.keys(afterMap).some(
          (uid) => beforeMap[uid].x !== afterMap[uid].x || beforeMap[uid].y !== afterMap[uid].y
        );
        if (changed) pushHistory({ type: 'move', before: beforeMap, after: afterMap });
      } catch (e) {
        setError(String(e.message || e));
        refresh();
      }
      return;
    }
    if (d.mode === 'resize') {
      const snap = !altRef.current;
      const u = unitsRef.current.find((x) => x.id === d.unitId);
      if (!u) return;
      let { w, h } = d.latestSize;
      if (snap) {
        w = clamp(snapTo(w, gridSize), gridSize, plan.width - u.x);
        h = clamp(snapTo(h, gridSize), gridSize, plan.height - u.y);
      }
      const before = { [d.unitId]: { w: d.startW, h: d.startH } };
      const after = { [d.unitId]: { w, h } };
      setUnits((prev) => prev.map((x) => (x.id === u.id ? { ...x, w, h } : x)));
      try {
        await updateUnit(id, d.unitId, { w, h });
        if (before[d.unitId].w !== w || before[d.unitId].h !== h) {
          pushHistory({ type: 'resize', before, after });
        }
      } catch (e) {
        setError(String(e.message || e));
        refresh();
      }
      return;
    }
  }

  // Keyboard handling
  useEffect(() => {
    function onKeyDown(e) {
      // Ignore when typing in inputs
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        spaceRef.current = true;
        e.preventDefault();
        return;
      }
      if (e.key === 'Alt') {
        altRef.current = true;
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }
      if (meta && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        if (plan) {
          setViewport(computeFit(plan));
        }
        return;
      }
      if (selectedIds.size > 0 && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? gridSize : 1;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        // Begin a pending move if not already
        if (!pendingMoveRef.current) {
          const before = {};
          for (const uid of selectedIds) {
            const u = units.find((x) => x.id === uid);
            if (u) before[uid] = { x: u.x, y: u.y };
          }
          pendingMoveRef.current = before;
        }
        setUnits((prev) =>
          prev.map((u) => {
            if (!selectedIds.has(u.id)) return u;
            const nx = clamp(u.x + dx, 0, plan.width - u.w);
            const ny = clamp(u.y + dy, 0, plan.height - u.h);
            return { ...u, x: nx, y: ny };
          })
        );
      }
    }
    async function onKeyUp(e) {
      if (e.code === 'Space') spaceRef.current = false;
      if (e.key === 'Alt') altRef.current = false;
      if (e.key.startsWith('Arrow') && pendingMoveRef.current) {
        const before = pendingMoveRef.current;
        pendingMoveRef.current = null;
        const after = {};
        for (const uid of Object.keys(before)) {
          const u = unitsRef.current.find((x) => x.id === uid);
          if (u) after[uid] = { x: u.x, y: u.y };
        }
        const changed = Object.keys(before).some(
          (uid) => after[uid] && (before[uid].x !== after[uid].x || before[uid].y !== after[uid].y)
        );
        if (changed) {
          try {
            for (const [uid, pos] of Object.entries(after)) {
              await updateUnit(id, uid, { x: pos.x, y: pos.y });
            }
            pushHistory({ type: 'move', before, after });
          } catch (err) {
            setError(String(err.message || err));
            refresh();
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedIds, units, plan, id, gridSize]);

  // Wheel for zoom
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e) {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const s = svgPoint(e);
      setViewport((v) => {
        const newZoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const actualFactor = newZoom / v.zoom;
        return {
          zoom: newZoom,
          x: s.x - (s.x - v.x) * actualFactor,
          y: s.y - (s.y - v.y) * actualFactor,
        };
      });
    }
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef.current]);

  async function duplicateSelected() {
    if (typeof window !== 'undefined') window.__dupCount = (window.__dupCount || 0) + 1;
    if (selectedIds.size === 0) return;
    const newUnits = [];
    for (const uid of selectedIds) {
      const u = units.find((x) => x.id === uid);
      if (!u) continue;
      const dup = {
        name: u.name,
        kind: u.kind,
        x: clamp(u.x + gridSize, 0, plan.width - u.w),
        y: clamp(u.y + gridSize, 0, plan.height - u.h),
        w: u.w,
        h: u.h,
      };
      const newId = await createUnit(id, dup);
      newUnits.push({ id: newId, ...dup });
    }
    if (newUnits.length > 0) {
      setUnits((prev) => [...prev, ...newUnits]);
      setSelectedIds(new Set(newUnits.map((u) => u.id)));
      pushHistory({ type: 'create', units: newUnits });
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    const toDelete = units.filter((u) => selectedIds.has(u.id));
    try {
      for (const u of toDelete) {
        await deleteUnit(id, u.id);
      }
      setUnits((prev) => prev.filter((u) => !selectedIds.has(u.id)));
      setSelectedIds(new Set());
      pushHistory({ type: 'delete', units: toDelete });
    } catch (e) {
      alert(e.message || String(e));
      refresh();
    }
  }

  async function onRenameUnit(unitId, patch) {
    await updateUnit(id, unitId, patch);
    refresh();
  }

  if (error) return <div className="card">Error: {error}</div>;
  if (!plan) return <div className="card">Loading…</div>;

  const selected = selectedIds.size === 1 ? units.find((u) => [...selectedIds][0] === u.id) : null;

  // Compute marquee rect in world coords for rendering
  const marqueeRect = marquee
    ? {
        x: Math.min(marquee.x1, marquee.x2),
        y: Math.min(marquee.y1, marquee.y2),
        w: Math.abs(marquee.x2 - marquee.x1),
        h: Math.abs(marquee.y2 - marquee.y1),
      }
    : null;

  const undoCount = historyRef.current.undo.length;
  const redoCount = historyRef.current.redo.length;

  return (
    <div>
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        <Link to="/">← All floorplans</Link>
        <h2 style={{ margin: 0 }}>{plan.name}</h2>
        <span className="muted">
          {plan.width}×{plan.height} · grid {gridSize}
        </span>
      </div>
      <div className="row toolbar" style={{ marginBottom: '0.5rem' }}>
        {QUICK_ADD_KINDS.map((k) => (
          <button
            key={k}
            data-quick-add={k}
            onClick={() => quickAdd(k)}
            style={{
              background: KIND_COLORS[k].fill,
              borderColor: KIND_COLORS[k].stroke,
              color: '#1f2937',
            }}
          >
            + {capitalize(k)}
          </button>
        ))}
        <span style={{ marginLeft: '1rem' }} className="muted">|</span>
        <button data-action="undo" disabled={undoCount === 0} onClick={undo}>
          Undo
        </button>
        <button data-action="redo" disabled={redoCount === 0} onClick={redo}>
          Redo
        </button>
        <button data-action="fit" onClick={() => setViewport(computeFit(plan))}>
          Fit (f)
        </button>
        <span data-zoom-indicator style={{ marginLeft: '0.5rem' }} className="muted">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {selectedIds.size > 0 && `${selectedIds.size} selected`}
        </span>
      </div>
      <div className="floorplan-grid">
        <div
          className="floorplan-canvas-wrap"
          style={{
            width: VIEWPORT_W,
            height: VIEWPORT_H,
            overflow: 'hidden',
            position: 'relative',
            cursor: spaceRef.current ? 'grab' : 'default',
          }}
        >
          <svg
            ref={svgRef}
            className="floorplan"
            width={VIEWPORT_W}
            height={VIEWPORT_H}
            viewBox={`0 0 ${VIEWPORT_W} ${VIEWPORT_H}`}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            style={{ display: 'block' }}
          >
            <defs>
              <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect
              className="canvas-bg"
              x={0}
              y={0}
              width={VIEWPORT_W}
              height={VIEWPORT_H}
              fill="#fafafa"
            />
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
              <rect x={0} y={0} width={plan.width} height={plan.height} fill="url(#grid)" />
              <rect
                x={0}
                y={0}
                width={plan.width}
                height={plan.height}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={1 / viewport.zoom}
              />
              {units.map((u) => {
                const color = KIND_COLORS[u.kind] || KIND_COLORS.box;
                const isSelected = selectedIds.has(u.id);
                const isHighlighted = u.id === highlightId;
                const classes = [
                  'unit',
                  isSelected ? 'selected' : '',
                  isHighlighted ? 'highlighted' : '',
                  `kind-${u.kind}`,
                ].filter(Boolean).join(' ');
                return (
                  <g
                    key={u.id}
                    onMouseDown={(e) => onUnitMouseDown(e, u)}
                  >
                    <rect
                      className={classes}
                      data-unit-id={u.id}
                      data-kind={u.kind}
                      data-x={u.x}
                      data-y={u.y}
                      data-w={u.w}
                      data-h={u.h}
                      x={u.x}
                      y={u.y}
                      width={u.w}
                      height={u.h}
                      rx={4}
                      fill={color.fill}
                      stroke={isHighlighted ? '#dc2626' : isSelected ? '#d97706' : color.stroke}
                      strokeWidth={isHighlighted ? 3 / viewport.zoom : (isSelected ? 2 / viewport.zoom : 1.5 / viewport.zoom)}
                    />
                    <text
                      className="unit-label"
                      x={u.x + 6}
                      y={u.y + 16}
                      style={{ fontSize: 12 / viewport.zoom }}
                    >
                      {u.name}
                    </text>
                    {isSelected && selectedIds.size === 1 && (
                      <rect
                        className="handle"
                        x={u.x + u.w - 8 / viewport.zoom}
                        y={u.y + u.h - 8 / viewport.zoom}
                        width={10 / viewport.zoom}
                        height={10 / viewport.zoom}
                        onMouseDown={(e) => onHandleMouseDown(e, u)}
                      />
                    )}
                    {dragMeta && (dragMeta.unitId === u.id || (dragMeta.mode === 'move' && selectedIds.has(u.id))) && (
                      <text
                        className="dim-label"
                        x={u.x}
                        y={u.y - 4 / viewport.zoom}
                        style={{ fontSize: 11 / viewport.zoom, fill: '#1f2937' }}
                      >
                        {Math.round(u.w)}×{Math.round(u.h)} @ ({Math.round(u.x)}, {Math.round(u.y)})
                      </text>
                    )}
                  </g>
                );
              })}
              {guides.h !== null && (
                <line
                  className="align-guide horizontal"
                  data-guide="horizontal"
                  x1={0}
                  y1={guides.h}
                  x2={plan.width}
                  y2={guides.h}
                  stroke="#ec4899"
                  strokeWidth={1 / viewport.zoom}
                  strokeDasharray={`${4 / viewport.zoom} ${4 / viewport.zoom}`}
                />
              )}
              {guides.v !== null && (
                <line
                  className="align-guide vertical"
                  data-guide="vertical"
                  x1={guides.v}
                  y1={0}
                  x2={guides.v}
                  y2={plan.height}
                  stroke="#ec4899"
                  strokeWidth={1 / viewport.zoom}
                  strokeDasharray={`${4 / viewport.zoom} ${4 / viewport.zoom}`}
                />
              )}
              {marqueeRect && (
                <rect
                  className="marquee"
                  x={marqueeRect.x}
                  y={marqueeRect.y}
                  width={marqueeRect.w}
                  height={marqueeRect.h}
                  fill="rgba(37, 99, 235, 0.1)"
                  stroke="#2563eb"
                  strokeWidth={1 / viewport.zoom}
                  strokeDasharray={`${4 / viewport.zoom} ${2 / viewport.zoom}`}
                  pointerEvents="none"
                />
              )}
            </g>
          </svg>
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: 8,
              fontSize: 11,
              color: '#6b7280',
              background: 'rgba(255,255,255,0.8)',
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          >
            Tips: drag to marquee · Space+drag to pan · Cmd+scroll to zoom · arrows to nudge · Cmd+D dup · Cmd+Z undo · Del delete · f fit
          </div>
        </div>
        <div className="sidebar">
          {selected ? (
            <UnitPanel
              key={selected.id}
              floorplanId={id}
              unit={selected}
              onRename={(patch) => onRenameUnit(selected.id, patch)}
              onDelete={() => deleteSelected()}
            />
          ) : (
            <div className="card">
              <div className="muted">
                {selectedIds.size > 1
                  ? `${selectedIds.size} units selected. Use Del to delete, Cmd+D to duplicate, arrows to nudge.`
                  : 'Select a unit (or drag to marquee-select), or use the toolbar to add one.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function computeGuides(anchor, allUnits, plan) {
  if (!anchor) return { h: null, v: null };
  const others = allUnits.filter((u) => u.id !== anchor.id);
  const anchorEdges = {
    top: anchor.y,
    bottom: anchor.y + anchor.h,
    centerY: anchor.y + anchor.h / 2,
    left: anchor.x,
    right: anchor.x + anchor.w,
    centerX: anchor.x + anchor.w / 2,
  };
  let bestH = null, bestHDist = GUIDE_THRESHOLD + 1;
  let bestV = null, bestVDist = GUIDE_THRESHOLD + 1;
  const horizontalCandidates = [plan.height / 2];
  const verticalCandidates = [plan.width / 2];
  for (const o of others) {
    horizontalCandidates.push(o.y, o.y + o.h, o.y + o.h / 2);
    verticalCandidates.push(o.x, o.x + o.w, o.x + o.w / 2);
  }
  for (const yCand of horizontalCandidates) {
    for (const aY of [anchorEdges.top, anchorEdges.bottom, anchorEdges.centerY]) {
      const d = Math.abs(aY - yCand);
      if (d <= GUIDE_THRESHOLD && d < bestHDist) {
        bestH = yCand;
        bestHDist = d;
      }
    }
  }
  for (const xCand of verticalCandidates) {
    for (const aX of [anchorEdges.left, anchorEdges.right, anchorEdges.centerX]) {
      const d = Math.abs(aX - xCand);
      if (d <= GUIDE_THRESHOLD && d < bestVDist) {
        bestV = xCand;
        bestVDist = d;
      }
    }
  }
  return { h: bestH, v: bestV };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
