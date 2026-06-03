// Appointment status → badge colors + label, mirroring the website's color coding.
const STATUS_STYLE = {
  unconfirmed: { color: '#92400e', bg: '#fef3c7', label: 'Unconfirmed' },
  confirmed:   { color: '#1e40af', bg: '#dbeafe', label: 'Confirmed' },
  scheduled:   { color: '#5b21b6', bg: '#ede9fe', label: 'Scheduled' },
  checked_in:  { color: '#166534', bg: '#dcfce7', label: 'Checked in' },
  in_progress: { color: '#92400e', bg: '#fef3c7', label: 'In progress' },
  completed:   { color: '#166534', bg: '#dcfce7', label: 'Completed' },
  checked_out: { color: '#166534', bg: '#dcfce7', label: 'Checked out' },
  no_show:     { color: '#6b7280', bg: '#f3f4f6', label: 'No show' },
  cancelled:   { color: '#b91c1c', bg: '#fee2e2', label: 'Cancelled' },
  pending:     { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
};

export function statusStyle(s) {
  return STATUS_STYLE[s] || { color: '#6b7280', bg: '#f3f4f6', label: s ? String(s).replace(/_/g, ' ') : '' };
}

// The DISPLAY status, matching the website: checkout stamps checked_out_at
// (and check-in stamps checked_in_at) WITHOUT always changing `status`.
// So derive the real state from those timestamps, falling back to status.
export function effectiveStatus(appt) {
  if (!appt) return 'unconfirmed';
  if (appt.status === 'cancelled') return 'cancelled';
  if (appt.checked_out_at) return 'checked_out';
  if (appt.status === 'completed') return 'completed';
  if (appt.checked_in_at || appt.status === 'checked_in') return 'checked_in';
  return appt.status || 'unconfirmed';
}
