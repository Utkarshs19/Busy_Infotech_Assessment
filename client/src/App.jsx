import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { api } from './api';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Menu from './pages/Menu.jsx';
import Alerts from './pages/Alerts.jsx';
import MyOrders from './pages/MyOrders.jsx';

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, logout } = useAuth();
  const [alertCount, setAlertCount] = useState(0);

  const refreshAlerts = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.alerts();
      setAlertCount(data.count);
    } catch {
      /* ignore transient failures */
    }
  }, [user]);

  useEffect(() => {
    refreshAlerts();
    const id = setInterval(refreshAlerts, 30000);
    return () => clearInterval(id);
  }, [refreshAlerts]);

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <nav className="nav-rail">
        <div className="nav-brand">
          The Corkboard
          <small>order management</small>
        </div>
        <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Dashboard</NavLink>
        <NavLink to="/orders" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>All orders</NavLink>
        <NavLink to="/mine" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>My orders</NavLink>
        <NavLink to="/alerts" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          Alerts {alertCount > 0 && <span className="nav-badge">{alertCount}</span>}
        </NavLink>
        <NavLink to="/menu" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Menu</NavLink>

        <div className="nav-footer">
          {user.name} &middot; {user.role}
          <button onClick={logout}>Sign out</button>
        </div>
      </nav>

      <div className="main">
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/orders" element={<Protected><Orders /></Protected>} />
          <Route path="/orders/:id" element={<Protected><OrderDetail onChanged={refreshAlerts} /></Protected>} />
          <Route path="/mine" element={<Protected><MyOrders /></Protected>} />
          <Route path="/alerts" element={<Protected><Alerts onChanged={refreshAlerts} /></Protected>} />
          <Route path="/menu" element={<Protected><Menu /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
