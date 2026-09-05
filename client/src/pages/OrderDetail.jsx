import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';

const NEXT_STATUS = {
  Placed: 'Accepted',
  Accepted: 'Preparing',
  Preparing: 'Ready',
  Ready: 'Served',
};

function money(cents) { return `₹${(cents / 100).toFixed(2)}`; }

export default function OrderDetail({ onChanged }) {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [menu, setMenu] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const [lineItem, setLineItem] = useState('');
  const [lineQty, setLineQty] = useState(1);
  const [lineInstructions, setLineInstructions] = useState('');
  const [noteText, setNoteText] = useState('');
  const [collabId, setCollabId] = useState('');
  const [voidingLine, setVoidingLine] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  const load = useCallback(() => {
    api.getOrder(id).then((d) => setOrder(d.order)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.listMenu(false).then((d) => setMenu(d.items)).catch(() => {});
    api.listUsers().then((d) => setUsers(d.users)).catch(() => {});
  }, []);

  async function doAction(fn) {
    setError('');
    try {
      await fn();
      load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !order) return <div className="error-banner">{error}</div>;
  if (!order) return <div className="empty-state">Loading order…</div>;

  const isOpen = order.status !== 'Served' && order.status !== 'Cancelled';
  const canAdvance = NEXT_STATUS[order.status];
  const canCancel = order.status === 'Placed' || order.status === 'Accepted';

  return (
    <div>
      <Link to="/orders" className="subtle">&larr; All orders</Link>
      <div className="page-header" style={{ marginTop: 8 }}>
        <h1>Table #{order.tableNumber} <span className={`pill ${order.status}`} style={{ marginLeft: 10 }}>{order.status}</span></h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canAdvance && (
            <button className="btn primary" onClick={() => doAction(() => api.setOrderStatus(order.id, canAdvance))}>
              Move to {canAdvance}
            </button>
          )}
          {canCancel && (
            <button className="btn danger" onClick={() => doAction(() => api.cancelOrder(order.id))}>Cancel order</button>
          )}
          {!order.archived ? (
            <button className="btn" onClick={() => doAction(() => api.archiveOrder(order.id))}>Archive</button>
          ) : (
            <button className="btn" onClick={() => doAction(() => api.unarchiveOrder(order.id))}>Restore</button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="subtle" style={{ marginBottom: 16 }}>
        Placed {order.placedAt} by {order.primaryWaiterName}
        {order.collaborators.length > 0 && <> &middot; with {order.collaborators.map(c => c.name).join(', ')}</>}
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Order lines</h3>
            <table>
              <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.name}
                      {l.specialInstructions && <div className="subtle">{l.specialInstructions}</div>}
                      {l.status === 'Void' && <div className="subtle" style={{ color: '#b3402a' }}>Void: {l.voidReason}</div>}
                    </td>
                    <td>{l.quantity}</td>
                    <td>{money(l.unitPriceCents * l.quantity)}</td>
                    <td>{l.status}</td>
                    <td>
                      {l.status === 'Active' && isOpen && (
                        <button className="btn small danger" onClick={() => { setVoidingLine(l.id); setVoidReason(''); }}>Void</button>
                      )}
                    </td>
                  </tr>
                ))}
                {order.lines.length === 0 && <tr><td colSpan={5} className="subtle">No lines yet.</td></tr>}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', marginTop: 10, fontWeight: 600 }}>
              Total: {money(order.totalCents)}
            </div>

            {voidingLine && (
              <div className="modal-backdrop" onClick={() => setVoidingLine(null)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Void line</h3>
                  <div className="field">
                    <label>Reason (required)</label>
                    <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} autoFocus />
                  </div>
                  <div className="modal-actions">
                    <button className="btn" onClick={() => setVoidingLine(null)}>Cancel</button>
                    <button className="btn danger" onClick={() => doAction(async () => {
                      await api.voidLine(order.id, voidingLine, voidReason);
                      setVoidingLine(null);
                    })}>Void line</button>
                  </div>
                </div>
              </div>
            )}

            {isOpen && (
              <div style={{ borderTop: '1px dashed var(--line)', marginTop: 14, paddingTop: 14 }}>
                <div className="toolbar">
                  <div className="field">
                    <label>Add item</label>
                    <select value={lineItem} onChange={(e) => setLineItem(e.target.value)}>
                      <option value="">Choose a menu item…</option>
                      {menu.map((m) => <option key={m.id} value={m.id}>{m.name} — {money(m.price_cents)}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ width: 70 }}>
                    <label>Qty</label>
                    <input type="number" min="1" value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Special instructions</label>
                    <input value={lineInstructions} onChange={(e) => setLineInstructions(e.target.value)} placeholder="optional" />
                  </div>
                  <button className="btn primary" onClick={() => doAction(async () => {
                    if (!lineItem) throw new Error('Choose a menu item first.');
                    await api.addLine(order.id, { menuItemId: Number(lineItem), quantity: Number(lineQty), specialInstructions: lineInstructions || undefined });
                    setLineItem(''); setLineQty(1); setLineInstructions('');
                  })}>Add line</button>
                </div>
              </div>
            )}
          </div>

          {isOpen && (
            <div className="card">
              <h3>Collaborators</h3>
              <div className="toolbar">
                <div className="field">
                  <label>Add a waiter</label>
                  <select value={collabId} onChange={(e) => setCollabId(e.target.value)}>
                    <option value="">Choose…</option>
                    {users.filter(u => u.id !== order.primaryWaiterId && !order.collaborators.some(c => c.id === u.id)).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <button className="btn" onClick={() => doAction(async () => {
                  if (!collabId) throw new Error('Choose a waiter first.');
                  await api.addCollaborator(order.id, Number(collabId));
                  setCollabId('');
                })}>Add</button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Timeline</h3>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {order.timeline.map((e) => (
              <div className="timeline-item" key={e.id}>
                <div className="timeline-time">{e.createdAt} &middot; {e.actorName}</div>
                {e.type === 'status_change' && <div>{e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : `Order placed (${e.toStatus})`}</div>}
                {e.type === 'line_added' && <div>Added: {e.note}</div>}
                {e.type === 'line_voided' && <div>Voided line — {e.reason}</div>}
                {e.type === 'note' && <div>Note: {e.note}</div>}
                {e.type === 'collaborator_added' && <div>{e.note}</div>}
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px dashed var(--line)', marginTop: 12, paddingTop: 12 }}>
            <div className="field">
              <label>Add a note</label>
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} />
            </div>
            <button className="btn small" onClick={() => doAction(async () => {
              if (!noteText.trim()) throw new Error('Note cannot be empty.');
              await api.addNote(order.id, noteText);
              setNoteText('');
            })}>Add note</button>
          </div>
        </div>
      </div>
    </div>
  );
}
