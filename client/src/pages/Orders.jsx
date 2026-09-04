import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import NewOrderModal from '../components/NewOrderModal.jsx';

const STATUSES = ['Placed', 'Accepted', 'Preparing', 'Ready', 'Served', 'Cancelled'];

export default function Orders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [waiterId, setWaiterId] = useState('');
  const [archived, setArchived] = useState('false');
  const [sort, setSort] = useState('placed_at');
  const [dir, setDir] = useState('desc');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const load = useCallback(async () => {
    try {
      const data = await api.listOrders({ q, status, waiterId, archived, sort, dir, page, pageSize });
      setOrders(data.orders);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    }
  }, [q, status, waiterId, archived, sort, dir, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.listUsers().then((d) => setUsers(d.users)).catch(() => {}); }, []);

  async function createOrder(tableNumber) {
    const { order } = await api.createOrder({ tableNumber });
    navigate(`/orders/${order.id}`);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="page-header">
        <h1>All orders</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn" href={api.exportCsvUrl()} target="_blank" rel="noreferrer">Export today's orders (CSV)</a>
          <button className="btn primary" onClick={() => setShowNew(true)}>+ New order</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <div className="field">
          <label>Search table #</label>
          <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="e.g. 7" />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Waiter</label>
          <select value={waiterId} onChange={(e) => { setPage(1); setWaiterId(e.target.value); }}>
            <option value="">All</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Sort by</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="placed_at">Placed time</option>
            <option value="status">Status</option>
            <option value="table">Table</option>
          </select>
        </div>
        <div className="field">
          <label>Direction</label>
          <select value={dir} onChange={(e) => setDir(e.target.value)}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <div className="field">
          <label>View</label>
          <select value={archived} onChange={(e) => { setPage(1); setArchived(e.target.value); }}>
            <option value="false">Active</option>
            <option value="true">Archived</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Status</th>
              <th>Primary waiter</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                <td>#{o.tableNumber}</td>
                <td><span className={`pill ${o.status}`}>{o.status}</span></td>
                <td>{o.primaryWaiterName}</td>
                <td>{o.placedAt}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={4} className="empty-state">No orders match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span className="subtle">{total} order{total === 1 ? '' : 's'} total</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span className="subtle">Page {page} of {totalPages}</span>
          <button className="btn small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onCreate={createOrder} />}
    </div>
  );
}
