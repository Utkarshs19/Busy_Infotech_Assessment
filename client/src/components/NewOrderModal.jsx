import { useState } from 'react';

export default function NewOrderModal({ onClose, onCreate }) {
  const [tableNumber, setTableNumber] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    const n = Number(tableNumber);
    if (!Number.isInteger(n) || n <= 0) {
      setError('Enter a valid table number.');
      return;
    }
    setBusy(true);
    try {
      await onCreate(n);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New order</h3>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="table">Table number</label>
            <input id="table" type="number" min="1" autoFocus value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)} required />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
