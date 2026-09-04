import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api';

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <div className="empty-state">Loading dashboard…</div>;

  const chartData = data.servedPerDay.map((d) => ({ day: d.day.slice(5), served: d.c }));

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span className="subtle">A snapshot of today, and the last two weeks.</span>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 24 }}>
        <div className="stat-box">
          <div className="num">{data.openOrders}</div>
          <div className="label">Open orders</div>
        </div>
        <div className="stat-box">
          <div className="num">{data.placedToday}</div>
          <div className="label">Placed today</div>
        </div>
        <div className="stat-box">
          <div className="num">{data.servedToday}</div>
          <div className="label">Served today</div>
        </div>
        <div className="stat-box">
          <div className="num">{money(data.revenueTodayCents)}</div>
          <div className="label">Revenue today</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Orders by status</h3>
          <table>
            <tbody>
              {data.byStatus.map((s) => (
                <tr key={s.status}>
                  <td><span className={`pill ${s.status}`}>{s.status}</span></td>
                  <td style={{ textAlign: 'right' }}>{s.c}</td>
                </tr>
              ))}
              {data.byStatus.length === 0 && <tr><td className="subtle">No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Today, by waiter</h3>
          <table>
            <tbody>
              {data.byWaiter.map((w) => (
                <tr key={w.waiter}>
                  <td>{w.waiter}</td>
                  <td style={{ textAlign: 'right' }}>{w.c}</td>
                </tr>
              ))}
              {data.byWaiter.length === 0 && <tr><td className="subtle">No orders placed today yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Orders served per day — last 14 days</h3>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5dcc4" />
              <XAxis dataKey="day" fontSize={11} stroke="#736a58" />
              <YAxis allowDecimals={false} fontSize={11} stroke="#736a58" />
              <Tooltip />
              <Bar dataKey="served" fill="#b9803a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
