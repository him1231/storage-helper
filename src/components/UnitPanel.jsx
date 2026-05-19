import { useEffect, useState } from 'react';
import {
  listItems,
  createItem,
  updateItem,
  deleteItem,
} from '../data.js';

export default function UnitPanel({ floorplanId, unit, onRename, onDelete }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState(unit.name);
  const [kind, setKind] = useState(unit.kind || 'box');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setItems(await listItems(floorplanId, unit.id));
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [floorplanId, unit.id]);
  useEffect(() => {
    setName(unit.name);
    setKind(unit.kind || 'box');
  }, [unit.id, unit.name, unit.kind]);

  return (
    <>
      <div className="card">
        <h3>Unit</h3>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== unit.name && onRename({ name })}
          />
        </label>
        <label>
          Kind
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              onRename({ kind: e.target.value });
            }}
          >
            <option value="box">Box</option>
            <option value="shelf">Shelf</option>
            <option value="drawer">Drawer</option>
            <option value="room">Room</option>
            <option value="cabinet">Cabinet</option>
          </select>
        </label>
        <div className="muted" style={{ marginTop: '0.5rem' }}>
          {Math.round(unit.w)}×{Math.round(unit.h)} at ({Math.round(unit.x)},{' '}
          {Math.round(unit.y)})
        </div>
        <button
          className="danger"
          style={{ marginTop: '0.5rem' }}
          onClick={onDelete}
        >
          Delete unit
        </button>
      </div>

      <div className="card">
        <h3>Items ({items.length})</h3>
        <AddItemForm
          onAdd={async (item) => {
            await createItem(floorplanId, unit.id, item);
            refresh();
          }}
        />
        {loading && <div className="muted">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="muted">No items yet.</div>
        )}
        {items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            onSave={async (patch) => {
              await updateItem(floorplanId, unit.id, it.id, patch);
              refresh();
            }}
            onDelete={async () => {
              await deleteItem(floorplanId, unit.id, it.id);
              refresh();
            }}
          />
        ))}
      </div>
    </>
  );
}

function AddItemForm({ onAdd }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd({
      name: name.trim(),
      quantity,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      notes,
      photoUrl,
    });
    setName('');
    setQuantity(1);
    setTags('');
    setNotes('');
    setPhotoUrl('');
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.75rem' }}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <div className="row">
        <label style={{ flex: 1 }}>
          Qty
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <label style={{ flex: 2 }}>
          Tags (comma)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label>
        Photo URL
        <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
      </label>
      <button type="submit" className="primary">Add item</button>
    </form>
  );
}

function ItemRow({ item, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity || 1);
  const [tags, setTags] = useState((item.tags || []).join(', '));
  const [notes, setNotes] = useState(item.notes || '');

  if (!editing) {
    return (
      <div className="list-item">
        <div className="row">
          <strong>{item.name}</strong>
          <span className="muted">×{item.quantity || 1}</span>
          {item.tags?.length > 0 && (
            <span className="muted">[{item.tags.join(', ')}]</span>
          )}
          <button style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="danger" onClick={onDelete}>Delete</button>
        </div>
        {item.notes && <div className="muted">{item.notes}</div>}
      </div>
    );
  }

  return (
    <div className="list-item" style={{ display: 'grid', gap: '0.4rem' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        <input
          placeholder="tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="row">
        <button
          className="primary"
          onClick={async () => {
            await onSave({
              name,
              quantity,
              tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
              notes,
            });
            setEditing(false);
          }}
        >
          Save
        </button>
        <button onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}
