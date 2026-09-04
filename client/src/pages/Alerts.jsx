import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Alerts({ onChanged }) {
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.alerts().then((d) => setAlerts(d.alerts)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function ack(id) {
    await api.ackAlert(id);
    load();
    onChanged?.();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Slow-order alerts</h1>
        <span className="subtle">Orders that have been open too long without reaching Ready.</span>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {alerts.length === 0 && <div className="empty-state">No slow orders right now — nice work.</div>}
      <div className="grid cols-3">
        {alerts.map((a) => (
          <div className="ticket" key={a.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <strong>Table #{a.tableNumber}</strong>
                <div className="subtle">Open {a.minutesOpen} min</div>
              </div>
              <span className={`pill ${a.status}`}>{a.status}</span>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn small" onClick={() => navigate(`/orders/${a.id}`)}>View</button>
              <button className="btn small primary" onClick={() => ack(a.id)}>Acknowledge</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
