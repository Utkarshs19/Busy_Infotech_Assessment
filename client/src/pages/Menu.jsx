import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function Menu() {
  const { user } = useAuth();
  const isManager = user.role === 'manager';
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkAvailable, setBulkAvailable] = useState('');
  const [bulkResults, setBulkResults] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');

  function load() {
    api.listMenu(showArchived).then((d) => setItems(d.items)).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, [showArchived]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function createItem(e) {
    e.preventDefault();
    setError('');
    try {
      const priceCents = Math.round(parseFloat(newPrice) * 100);
      await api.createMenuItem({ name: newName, priceCents });
      setNewName(''); setNewPrice('');
      load();
    } catch (err) { setError(err.message); }
  }

  async function toggleAvailable(item) {
    await api.updateMenuItem(item.id, { available: item.available ? false : true });
    load();
  }

  async function archive(item) {
    await api.archiveMenuItem(item.id);
    load();
  }
  async function unarchive(item) {
    await api.unarchiveMenuItem(item.id);
    load();
  }

  async function applyBulk() {
    setError('');
    setBulkResults(null);
    const payload = { ids: Array.from(selected) };
    if (bulkPrice !== '') payload.priceCents = Math.round(parseFloat(bulkPrice) * 100);
    if (bulkAvailable !== '') payload.available = bulkAvailable === 'true';
    if (payload.ids.length === 0) { setError('Select at least one item first.'); return; }
    try {
      const res = await api.bulkMenuUpdate(payload);
      setBulkResults(res);
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Menu</h1>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#59503f' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {isManager && (
        <form onSubmit={createItem} className="toolbar card" style={{ marginBottom: 18 }}>
          <div className="field">
            <label>New item name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="e.g. Garlic Bread" />
          </div>
          <div className="field" style={{ minWidth: 100 }}>
            <label>Price ($)</label>
            <input type="number" step="0.01" min="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} required />
          </div>
          <button className="btn primary" type="submit">Add item</button>
        </form>
      )}

      {isManager && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Bulk update ({selected.size} selected)</h3>
          <div className="toolbar">
            <div className="field">
              <label>Set price to ($, optional)</label>
              <input type="number" step="0.01" min="0" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} placeholder="leave blank to skip" />
            </div>
            <div className="field">
              <label>Set availability (optional)</label>
              <select value={bulkAvailable} onChange={(e) => setBulkAvailable(e.target.value)}>
                <option value="">Don't change</option>
                <option value="true">Available</option>
                <option value="false">Unavailable</option>
              </select>
            </div>
            <button className="btn primary" onClick={applyBulk}>Apply to selected</button>
          </div>
          {bulkResults && (
            <div className="subtle" style={{ marginTop: 8 }}>
              {bulkResults.succeeded} succeeded, {bulkResults.failed} failed.
              {bulkResults.results.filter(r => !r.ok).map(r => (
                <div key={r.id} style={{ color: '#b3402a' }}>Item {r.id}: {r.error}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              {isManager && <th></th>}
              <th>Name</th><th>Price</th><th>Available</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                {isManager && (
                  <td>
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} disabled={!!item.archived} />
                  </td>
                )}
                <td>{item.name} {!!item.archived && <span className="subtle">(archived)</span>}</td>
                <td>${(item.price_cents / 100).toFixed(2)}</td>
                <td>{item.available ? 'Yes' : 'No'}</td>
                <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {isManager && !item.archived && (
                    <>
                      <button className="btn small" onClick={() => toggleAvailable(item)}>
                        {item.available ? 'Mark unavailable' : 'Mark available'}
                      </button>
                      <button className="btn small danger" onClick={() => archive(item)}>Archive</button>
                    </>
                  )}
                  {isManager && item.archived && (
                    <button className="btn small" onClick={() => unarchive(item)}>Restore</button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="empty-state">No menu items.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
