import { useState } from 'react'

export default function MessageBubble({ message, isOwnMessage, onDelete }) {
  var [imageExpanded, setImageExpanded] = useState(false)
  var [hovered, setHovered] = useState(false)

  // Format timestamp as "2:34 PM" or "Yesterday 2:34 PM" or "Apr 18 2:34 PM"
  function formatTime(iso) {
    if (!iso) return ''
    var d = new Date(iso)
    var now = new Date()
    var timeStr = d.toLocaleTimeString('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit',
    })
    var sameDay = d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      === now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    if (sameDay) return timeStr
    var yest = new Date(now)
    yest.setDate(yest.getDate() - 1)
    var yestStr = yest.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    if (d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) === yestStr) {
      return 'Yesterday ' + timeStr
    }
    var dayStr = d.toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
    })
    return dayStr + ' ' + timeStr
  }

  var rowStyle = {
    display: 'flex',
    justifyContent: isOwnMessage ? 'flex-end' : 'flex-start',
    marginBottom: '12px',
    padding: '0 12px',
  }

  var bubbleStyle = {
    maxWidth: '75%',
    padding: message.attachment_url && !message.text ? '6px' : '10px 14px',
    borderRadius: '18px',
    background: isOwnMessage ? '#667eea' : '#f1f3f5',
    color: isOwnMessage ? '#ffffff' : '#1a1a1a',
    fontSize: '15px',
    lineHeight: '1.4',
    wordBreak: 'break-word',
    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
  }

  var timeStyle = {
    fontSize: '11px',
    color: isOwnMessage ? 'rgba(255,255,255,0.8)' : '#6c757d',
    marginTop: '4px',
    textAlign: isOwnMessage ? 'right' : 'left',
  }

  var imgStyle = {
    maxWidth: '100%',
    maxHeight: imageExpanded ? '500px' : '220px',
    borderRadius: '12px',
    display: 'block',
    cursor: 'pointer',
    objectFit: 'cover',
  }

  function handleDeleteClick() {
    if (!onDelete) return
    if (!window.confirm('Delete this message? This cannot be undone.')) return
    onDelete(message.id)
  }

  return (
    <div
      style={rowStyle}
      onMouseEnter={function () { setHovered(true) }}
      onMouseLeave={function () { setHovered(false) }}
    >
      <div style={{ position: 'relative', maxWidth: '75%' }}>
        <div style={bubbleStyle}>
          {message.attachment_url && (
            <img
              src={message.attachment_url}
              alt="attachment"
              style={imgStyle}
              onClick={function () { setImageExpanded(!imageExpanded) }}
            />
          )}
          {message.text && (
            <div style={{ marginTop: message.attachment_url ? '8px' : '0', padding: message.attachment_url ? '0 4px' : '0' }}>
              {message.text}
            </div>
          )}
          <div style={timeStyle}>{formatTime(message.created_at)}</div>
        </div>
        {onDelete && (hovered || 'ontouchstart' in window) && (
          <button
            type="button"
            onClick={handleDeleteClick}
            title="Delete message"
            style={{
              position: 'absolute',
              top: '-6px',
              [isOwnMessage ? 'left' : 'right']: '-6px',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              fontSize: '13px',
              fontWeight: '700',
              lineHeight: '1',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
