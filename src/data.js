import {
  collection,
  collectionGroup,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase.js';

const floorplansCol = () => collection(db, 'floorplans');
const unitsCol = (floorplanId) =>
  collection(db, 'floorplans', floorplansId(floorplanId), 'units');
const itemsCol = (floorplanId, unitId) =>
  collection(
    db,
    'floorplans',
    floorplansId(floorplanId),
    'units',
    unitId,
    'items'
  );

function floorplansId(id) {
  if (!id) throw new Error('floorplanId required');
  return id;
}

export async function listFloorplans() {
  const snap = await getDocs(floorplansCol());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getFloorplan(id) {
  const snap = await getDoc(doc(db, 'floorplans', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createFloorplan({ name, width, height }) {
  const ref = await addDoc(floorplansCol(), {
    name,
    width: Number(width),
    height: Number(height),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteFloorplan(id) {
  const units = await listUnits(id);
  for (const u of units) {
    await deleteUnit(id, u.id, { cascade: true });
  }
  await deleteDoc(doc(db, 'floorplans', id));
}

export async function listUnits(floorplanId) {
  const snap = await getDocs(unitsCol(floorplanId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createUnit(floorplanId, unit) {
  const ref = await addDoc(unitsCol(floorplanId), {
    name: unit.name || 'Unit',
    kind: unit.kind || 'box',
    x: Number(unit.x) || 0,
    y: Number(unit.y) || 0,
    w: Number(unit.w) || 80,
    h: Number(unit.h) || 60,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateUnit(floorplanId, unitId, patch) {
  await updateDoc(
    doc(db, 'floorplans', floorplanId, 'units', unitId),
    patch
  );
}

export async function deleteUnit(floorplanId, unitId, { cascade = false } = {}) {
  const items = await listItems(floorplanId, unitId);
  if (items.length > 0 && !cascade) {
    throw new Error(
      `Cannot delete unit with ${items.length} item(s). Move or delete them first.`
    );
  }
  for (const it of items) {
    await deleteDoc(
      doc(db, 'floorplans', floorplanId, 'units', unitId, 'items', it.id)
    );
  }
  await deleteDoc(doc(db, 'floorplans', floorplanId, 'units', unitId));
}

export async function listItems(floorplanId, unitId) {
  const snap = await getDocs(itemsCol(floorplanId, unitId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createItem(floorplanId, unitId, item) {
  const ref = await addDoc(itemsCol(floorplanId, unitId), {
    name: item.name,
    quantity: Number(item.quantity) || 1,
    tags: Array.isArray(item.tags) ? item.tags : [],
    notes: item.notes || '',
    photoUrl: item.photoUrl || '',
    storageUnitId: unitId,
    floorplanId,
    nameLower: (item.name || '').toLowerCase(),
    tagsLower: (Array.isArray(item.tags) ? item.tags : []).map((t) =>
      String(t).toLowerCase()
    ),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateItem(floorplanId, unitId, itemId, patch) {
  const next = { ...patch };
  if (patch.name !== undefined) next.nameLower = String(patch.name).toLowerCase();
  if (patch.tags !== undefined) {
    next.tags = Array.isArray(patch.tags) ? patch.tags : [];
    next.tagsLower = next.tags.map((t) => String(t).toLowerCase());
  }
  if (patch.quantity !== undefined) next.quantity = Number(patch.quantity) || 1;
  await updateDoc(
    doc(db, 'floorplans', floorplanId, 'units', unitId, 'items', itemId),
    next
  );
}

export async function deleteItem(floorplanId, unitId, itemId) {
  await deleteDoc(
    doc(db, 'floorplans', floorplanId, 'units', unitId, 'items', itemId)
  );
}

export async function searchItems(queryStr) {
  const q = (queryStr || '').trim().toLowerCase();
  if (!q) return [];
  const all = await getDocs(collectionGroup(db, 'items'));
  const matches = [];
  for (const d of all.docs) {
    const data = d.data();
    const nameHit = (data.nameLower || '').includes(q);
    const tagHit = (data.tagsLower || []).some((t) => t.includes(q));
    if (nameHit || tagHit) {
      matches.push({ id: d.id, ...data });
    }
  }
  const fpIds = [...new Set(matches.map((m) => m.floorplanId).filter(Boolean))];
  const fpMap = {};
  for (const id of fpIds) {
    const fp = await getFloorplan(id);
    if (fp) fpMap[id] = fp;
  }
  const unitMap = {};
  for (const m of matches) {
    const key = `${m.floorplanId}/${m.storageUnitId}`;
    if (m.floorplanId && m.storageUnitId && !unitMap[key]) {
      const snap = await getDoc(
        doc(db, 'floorplans', m.floorplanId, 'units', m.storageUnitId)
      );
      unitMap[key] = snap.exists() ? snap.data().name : '(deleted)';
    }
  }
  return matches.map((m) => ({
    ...m,
    floorplanName: fpMap[m.floorplanId]?.name || '(unknown)',
    storageUnitName: unitMap[`${m.floorplanId}/${m.storageUnitId}`] || '(unknown)',
  }));
}
