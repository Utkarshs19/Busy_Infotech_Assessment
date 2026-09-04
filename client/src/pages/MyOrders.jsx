import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.myOrders().then((d) => setOrders(d.orders)).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>My orders</h1>
        <span className="subtle">Orders where you're the primary waiter or a collaborator.</span>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Table</th><th>Status</th><th>Primary waiter</th><th>Placed</th></tr>
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
            {orders.length === 0 && <tr><td colSpan={4} className="empty-state">You have no orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
