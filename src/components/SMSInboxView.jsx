// =============================================================================
// SMSInboxView.jsx — SMS conversation inbox (used as a tab in Messages page)
// =============================================================================
// Two-pane layout:
//   • Left:  client list grouped by SMS history (most recent on top, unread bold)
//   • Right: full conversation thread for the selected client + reply box
//
// Powered by:
//   • sms_messages table (created by SMS Messages Schema v1.sql)
//   • send-sms edge function (for replies)
// =============================================================================

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatPhone } from '../lib/phone'

export default function SMSInboxView() {
  var navigate = useNavigate() // clickable client name -> profile
  // Deep-link support: if Messages was opened with ?client=<id> we auto-select
  // that client's conversation on mount. Used by the appointment popup "View
  // full conversation" link so one click lands the groomer on the right thread.
  var [searchParams] = useSearchParams()
  var initialClientFromUrl = searchParams.get('client') || null
  var [user, setUser] = useState(null)
  var [conversations, setConversations] = useState([])  // [{ client_id, client_name, client_phone, last_body, last_at, last_direction, unread_count }]
  var [selectedClientId, setSelectedClientId] = useState(initialClientFromUrl)
  var [thread, setThread] = useState([])  // messages for the selected conversation
  var [loading, setLoading] = useState(true)
  var [replyDraft, setReplyDraft] = useState('')
  var [sending, setSending] = useState(false)
  var [sendError, setSendError] = useState(null)
  var threadEndRef = useRef(null)

  // ─── Initial load + realtime subscription ───
  useEffect(function () {
    async function init() {
      var { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { setLoading(false); return }
      setUser(u)
      await loadConversations(u.id)
      setLoading(false)
    }
    init()
  }, [])

  // Realtime — refresh when a new sms_messages row arrives for this groomer
  useEffect(function () {
    if (!user) return
    var channel = supabase
      .channel('sms-inbox-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sms_messages',
        filter: 'groomer_id=eq.' + user.id,
      }, function () {
        loadConversations(user.id)
        if (selectedClientId) loadThread(user.id, selectedClientId)
      })
      .subscribe()
    return function () { supabase.removeChannel(channel) }
  }, [user, selectedClientId])

  // Load thread + mark as read when a conversation is selected
  useEffect(function () {
    if (!selectedClientId || !user) return
    loadThread(user.id, selectedClientId)
    markThreadRead(user.id, selectedClientId)
  }, [selectedClientId, user])

  // Auto-scroll to bottom of thread on new messages
  useEffect(function () {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [thread])

  async function loadConversations(groomerId) {
    // Get all SMS for this groomer, then group by client_id (or by from_phone if no client_id).
    var { data } = await supabase
      .from('sms_messages')
      .select('id, client_id, direction, from_phone, to_phone, body, sms_type, is_read, created_at, clients:client_id(first_name, last_name, phone)')
      .eq('groomer_id', groomerId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (!data) { setConversations([]); return }

    // Group by client_id (or fall back to from_phone for orphan inbounds)
    var byKey = {}
    data.forEach(function (msg) {
      var key = msg.client_id || ('phone:' + msg.from_phone)
      if (!byKey[key]) {
        var name = msg.clients
          ? ((msg.clients.first_name || '') + ' ' + (msg.clients.last_name || '')).trim()
          : null
        byKey[key] = {
          key: key,
          client_id: msg.client_id,
          client_name: name || 'Unknown',
          client_phone: msg.clients ? msg.clients.phone : msg.from_phone,
          last_body: msg.body,
          last_at: msg.created_at,
          last_direction: msg.direction,
          unread_count: 0,
        }
      }
      if (msg.direction === 'inbound' && !msg.is_read) {
        byKey[key].unread_count++
      }
    })
    var list = Object.values(byKey)
    list.sort(function (a, b) { return new Date(b.last_at) - new Date(a.last_at) })
    setConversations(list)
  }

  async function loadThread(groomerId, clientId) {
    var query = supabase
      .from('sms_messages')
      .select('id, direction, from_phone, to_phone, body, sms_type, is_read, created_at')
      .eq('groomer_id', groomerId)
      .order('created_at', { ascending: true })
    // If clientId is null/orphan key, can't filter on client_id alone — skip for now
    if (clientId) query = query.eq('client_id', clientId)
    var { data } = await query
    setThread(data || [])
  }

  async function markThreadRead(groomerId, clientId) {
    if (!clientId) return
    await supabase
      .from('sms_messages')
      .update({ is_read: true })
      .eq('groomer_id', groomerId)
      .eq('client_id', clientId)
      .eq('direction', 'inbound')
      .eq('is_read', false)
    // Ping the sidebar badge so the red SMS count clears the instant you open
    // the conversation (no wait for realtime or a refresh).
    try { window.dispatchEvent(new Event('messages-updated')) } catch (e) {}
  }

  // ─── Delete a single message from the inbox (hard delete) ───
  // Doesn't affect the actual SMS that was sent — only removes the audit row.
  async function deleteMessage(msgId) {
    if (!msgId) return
    var ok = window.confirm('Delete this message from your inbox?\n\nThis only removes it from your view — the original text was already sent.')
    if (!ok) return
    var { error } = await supabase
      .from('sms_messages')
      .delete()
      .eq('id', msgId)
      .eq('groomer_id', user.id)
    if (error) {
      window.alert('Could not delete: ' + error.message)
      return
    }
    // Optimistically remove from local thread + refresh conversations (last-message preview may change)
    setThread(function (prev) { return prev.filter(function (m) { return m.id !== msgId }) })
    if (user) await loadConversations(user.id)
  }

  // ─── Delete the entire conversation thread ───
  async function deleteConversation() {
    if (!selectedClientId || !user) return
    var conv = conversations.find(function (c) { return (c.client_id || c.key) === selectedClientId })
    var clientName = conv ? conv.client_name : 'this client'
    var ok = window.confirm('Delete the ENTIRE conversation with ' + clientName + '?\n\nThis removes every message in this thread from your inbox. The original texts are unaffected.\n\nThis cannot be undone.')
    if (!ok) return

    var query = supabase.from('sms_messages').delete().eq('groomer_id', user.id)
    // If this is a real client thread, filter by client_id; otherwise match by phone (orphan inbounds)
    if (conv && conv.client_id) {
      query = query.eq('client_id', conv.client_id)
    } else if (conv && conv.client_phone) {
      query = query.or('from_phone.eq.' + conv.client_phone + ',to_phone.eq.' + conv.client_phone)
    } else {
      window.alert('Could not delete — missing client info.')
      return
    }
    var { error } = await query
    if (error) {
      window.alert('Could not delete conversation: ' + error.message)
      return
    }
    setThread([])
    setSelectedClientId(null)
    await loadConversations(user.id)
  }

  async function sendReply() {
    if (!replyDraft.trim()) return
    var conv = conversations.find(function (c) { return c.key === ('phone:' + selectedClientId) || c.client_id === selectedClientId })
    if (!conv || !conv.client_phone) {
      setSendError('No phone number on file for this client.')
      return
    }
    setSending(true); setSendError(null)
    try {
      var { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          to: conv.client_phone,
          message: replyDraft.trim(),
          groomer_id: user.id,
          sms_type: 'inbox_reply',
        },
      })
      if (error || !data || !data.success) {
        setSendError((data && data.error) || (error && error.message) || 'Send failed')
      } else {
        setReplyDraft('')
        // Realtime listener will refresh — but also re-fetch to be safe
        await loadThread(user.id, selectedClientId)
        await loadConversations(user.id)
      }
    } catch (e) {
      setSendError(e.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading SMS inbox…</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 180px)', minHeight: '500px', gap: 0, border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      {/* ─── LEFT: conversation list ─── */}
      <div style={{ borderRight: '1px solid #e5e7eb', overflowY: 'auto', background: '#fafafa' }}>
        {conversations.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            No SMS conversations yet.<br /><br />
            Send a text from any appointment popup to start one.
          </div>
        ) : conversations.map(function (c) {
          var isActive = (c.client_id || c.key) === selectedClientId
          return (
            <button
              key={c.key}
              onClick={function () { setSelectedClientId(c.client_id || c.key) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                background: isActive ? '#fff' : 'transparent',
                border: 'none',
                borderBottom: '1px solid #e5e7eb',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: c.unread_count > 0 ? 800 : 600, fontSize: '14px', color: '#1f2937' }}>
                  {c.client_name}
                </span>
                {c.unread_count > 0 && (
                  <span style={{
                    background: '#dc2626', color: '#fff',
                    fontSize: '10px', fontWeight: 700,
                    padding: '2px 7px', borderRadius: '999px',
                  }}>
                    {c.unread_count}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                {formatPhone(c.client_phone)}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {c.last_direction === 'outbound' ? '→ ' : '← '}{c.last_body}
              </div>
              <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '4px' }}>
                {new Date(c.last_at).toLocaleString()}
              </div>
            </button>
          )
        })}
      </div>

      {/* ─── RIGHT: selected thread + reply ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {!selectedClientId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '14px' }}>
            Pick a conversation on the left to view it.
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              {(function () {
                var conv = conversations.find(function (c) { return (c.client_id || c.key) === selectedClientId })
                return conv ? (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {conv.client_id ? (
                      <div
                        onClick={function () { navigate('/clients/' + conv.client_id) }}
                        title="View client profile"
                        style={{ fontWeight: 700, fontSize: '15px', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                      >{conv.client_name}</div>
                    ) : (
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#1f2937' }}>{conv.client_name}</div>
                    )}
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{formatPhone(conv.client_phone)}</div>
                  </div>
                ) : <div style={{ flex: 1 }} />
              })()}
              <button
                onClick={deleteConversation}
                title="Delete entire conversation"
                style={{
                  background: 'transparent',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                🗑️ Delete thread
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {thread.map(function (msg) {
                var isOut = msg.direction === 'outbound'
                return (
                  <div
                    key={msg.id}
                    className="sms-msg-row"
                    style={{
                      display: 'flex',
                      justifyContent: isOut ? 'flex-end' : 'flex-start',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '12px',
                    }}
                  >
                    {/* Per-message delete button — left side for outbound, right side for inbound */}
                    {isOut && (
                      <button
                        className="sms-msg-delete-btn"
                        onClick={function () { deleteMessage(msg.id) }}
                        title="Delete this message"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#9ca3af',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          opacity: 0.4,
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#dc2626' }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = '#9ca3af' }}
                      >
                        ✕
                      </button>
                    )}
                    <div style={{
                      maxWidth: '70%',
                      background: isOut ? '#7c3aed' : '#f3f4f6',
                      color: isOut ? '#fff' : '#1f2937',
                      padding: '10px 14px',
                      borderRadius: '14px',
                      borderBottomRightRadius: isOut ? '4px' : '14px',
                      borderBottomLeftRadius: isOut ? '14px' : '4px',
                      fontSize: '14px',
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {msg.body}
                      <div style={{
                        fontSize: '10px',
                        color: isOut ? 'rgba(255,255,255,0.7)' : '#9ca3af',
                        marginTop: '4px',
                      }}>
                        {new Date(msg.created_at).toLocaleString()}
                      </div>
                    </div>
                    {!isOut && (
                      <button
                        className="sms-msg-delete-btn"
                        onClick={function () { deleteMessage(msg.id) }}
                        title="Delete this message"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#9ca3af',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          opacity: 0.4,
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#dc2626' }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = '#9ca3af' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
              <div ref={threadEndRef} />
            </div>

            {/* Reply box */}
            <div style={{ borderTop: '1px solid #e5e7eb', padding: '12px 16px', background: '#fafafa' }}>
              {sendError && (
                <div style={{
                  marginBottom: '8px',
                  padding: '6px 10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#991b1b',
                }}>
                  {sendError}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <textarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  placeholder="Type a reply…"
                  rows={2}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    minHeight: '44px',
                  }}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !replyDraft.trim()}
                  style={{
                    background: sending || !replyDraft.trim() ? '#9ca3af' : '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: sending || !replyDraft.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? '…' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
