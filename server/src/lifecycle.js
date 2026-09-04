// Order status state machine (goal 4).
// Placed -> Accepted -> Preparing -> Ready -> Served
// Cancelled is reachable only from Placed or Accepted.
const TRANSITIONS = {
  Placed: ['Accepted', 'Cancelled'],
  Accepted: ['Preparing', 'Cancelled'],
  Preparing: ['Ready'],
  Ready: ['Served'],
  Served: [],
  Cancelled: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function isOpen(status) {
  // "open" = any state before Served or Cancelled (goal 4, voiding rule)
  return status !== 'Served' && status !== 'Cancelled';
}

module.exports = { TRANSITIONS, canTransition, isOpen };
