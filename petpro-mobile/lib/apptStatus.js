// Appointment status → badge colors + label, mirroring the website's color coding.
const STATUS_STYLE = {
  unconfirmed: { color: '#92400e', bg: '#fef3c7', label: 'Unconfirmed' },
  confirmed:   { color: '#1e40af', bg: '#dbeafe', label: 'Confirmed' },
  scheduled:   { color: '#5b21b6', bg: '#ede9fe', label: 'Scheduled' },
  checked_in:  { color: '#166534', bg: '#dcfce7', label: 'Checked in' },
  in_progress: { color: '#92400e', bg: '#fef3c7', label: 'In progress' },
  completed:   { color: '#166534', bg: '#dcfce7', label: 'Completed' },
  no_show:     { color: '#6b7280', bg: '#f3f4f6', label: 'No show' },
  pending:     { color: '#92400e', bg: '#fef3c7', label: 'Pending' },
};

export function statusStyle(s) {
  return STATUS_STYLE[s] || { color: '#6b7280', bg: '#f3f4f6', label: s ? String(s).replace(/_/g, ' ') : '' };
}
