import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ClientPortalMessages() {
  var navigate = useNavigate()
  var [user, setUser] = useState(null)
  var [clientRow, setClientRow] = useState(null)
  var [shopName, setShopName] = useState('Your Groomer')
  var [threads, setThreads] = useState([])
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')
  var [showNewChat, setShowNewChat] = useState(false)
  var [newChatSubject, setNewChatSubject] = useState('')
  var [newChatMessage, setNewChatMessage] = useState('')
  var [newChatSaving, setNewChatSaving] = useState(false)

  useEffect(function () {
    async function init() {
      var { data: { user: u } } = await supabase.auth.getUser()
      if (!u) {
        navigate('/portal/login')
        return
      }
      setUser(u)

      var { data: client } = await supabase
        .from('clients')
        .select('id, groomer_id, first_name')
        .eq('user_id', u.id)
        .maybeSingle()

      if (!client) {
        setError('Client profile not found. Please contact your groomer.')
        setLoading(false)
        return
      }
      setClientRow(client)

      var { data: shop } = await supabase
        .from('shop_settings')
        .select('shop_name')
        .eq('groomer_id', client.groomer_id)
        .maybeSingle()
      if (shop && shop.shop_name) setShopName(shop.shop_name)

      await loadThreads(client)
      setLoading(false)
    }
    init()
  }, [])

  // Realtime — new threads/messages update the list live
  useEffect(function () {
    if (!clientRow) return

    var channel = supabase
      .channel('portal-threads-' + clientRow.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'threads',
        filter: 'client_id=eq.' + clientRow.id,
      }, function () {
        loadThreads(clientRow)
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'client_id=eq.' + clientRow.id,
      }, function () {
        loadThreads(clientRow)
      })
      .subscribe()

    return function () {
      supabase.removeChannel(channel)
    }
  }, [clientRow])

  async function loadThreads(client) {
    var { data: threadRows } = await supabase
      .from('threads')
      .select('id, subject, last_message_at, created_at')
      .eq('client_id', client.id)
      .eq('groomer_id', client.groomer_id)
      .order('last_message_at', { ascending: false })

    var { data: msgs } = await supabase
      .from('messages')
      .select('thread_id, text, attachment_url, created_at, sender_type, read_by_client')
      .eq('client_id', client.id)
      .eq('groomer_id', client.groomer_id)
      .order('created_at', { ascending: false })

    var lastMap = {}
    var unreadMap = {}
    ;(msgs || []).forEach(function (m) {
      if (!lastMap[m.thread_id]) {
        lastMap[m.thread_id] = { text: m.text, attachment_url: m.attachment_url, sender_type: m.sender_type }
      }
      if (m.sender_type === 'groomer' && !m.read_by_client) {
        unreadMap[m.thread_id] = (unreadMap[m.thread_id] || 0) + 1
      }
    })

    var enriched = (threadRows || []).map(function (t) {
      return {
        id: t.id,
        subject: t.subject,
        last_message_at: t.last_message_at,
        created_at: t.created_at,
        last_preview: lastMap[t.id] ? previewText(lastMap[t.id]) : '',
        last_sender: lastMap[t.id] ? lastMap[t.id].sender_type : null,
        unread_count: unreadMap[t.id] || 0,
      }
    })
    setThreads(enriched)
  }

  async function handleCreateNewChat() {
    if (!newChatMessage.trim() || newChatSaving || !clientRow) return
    setNewChatSaving(true)

    try {
      // Create thread
      var { data: thread, error: tErr } = await supabase
        .from('threads')
        .insert({
          groomer_id: clientRow.groomer_id,
          client_id: clientRow.id,
          subject: newChatSubject.trim() || null,
        })
        .select()
        .single()

      if (tErr) throw tErr

      // Insert first message
      var { data: msg, error: mErr } = await supabase
        .from('messages')
        .insert({
          thread_id: thread.id,
          groomer_id: clientRow.groomer_id,
          client_id: clientRow.id,
          sender_type: 'client',
          text: newChatMessage.trim(),
          read_by_groomer: false,
          read_by_client: true,
        })
        .select()
        .single()

      if (mErr) throw mErr

      // Update thread last_message_at
      await supabase
        .from('threads')
        .update({ last_message_at: msg.created_at })
        .eq('id', thread.id)

      setShowNewChat(false)
      setNewChatSubject('')
      setNewChatMessage('')
      navigate('/portal/messages/' + thread.id)
    } catch (err) {
      console.error('Create thread error:', err)
      alert('Could not start chat: ' + (err.message || 'unknown error'))
    }

    setNewChatSaving(false)
  }

  function previewText(m) {
    if (!m) return ''
    if (m.attachment_url && !m.text) return '📷 Photo'
    if (m.attachment_url && m.text) return '📷 ' + m.text
    return m.text || ''
  }

  function formatTime(iso) {
    if (!iso) return ''
    var d = new Date(iso)
    var now = new Date()
    var sameDay = d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      === now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    if (sameDay) {
      return d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
    }
    return d.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' })
  }

  // ---------- STYLES ----------
  var pageStyle = {
    maxWidth: '720px',
    margin: '20px auto',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    overflow: 'hidden',
    minHeight: 'calc(100vh - 40px)',
    display: 'flex',
    flexDirection: 'column',
  }

  var headerStyle = {
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  }

  var backBtnStyle = {
    background: 'transparent',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#495057',
  }

  var newChatBtnStyle = {
    margin: '16px',
    padding: '12px',
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  }

  var threadRowStyle = {
    padding: '14px 16px',
    borderBottom: '1px solid #e9ecef',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  }

  var modalOverlay = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '20px',
  }
  var modalStyle = {
    background: '#fff', borderRadius: '12px', padding: '24px',
    maxWidth: '480px', width: '100%',
    maxHeight: '90vh', overflowY: 'auto',
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading messages...</div>

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#dc3545' }}>
        {error}
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <button style={backBtnStyle} onClick={function () { navigate('/portal') }}>← Back</button>
        <div>
          <div style={{ fontWeight: 600, fontSize: '16px' }}>{shopName}</div>
          <div style={{ fontSize: '12px', color: '#6c757d' }}>Messages</div>
        </div>
      </div>

      <button style={newChatBtnStyle} onClick={function () { setShowNewChat(true) }}>
        + New Chat
      </button>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {threads.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6c757d', padding: '40px 20px', fontSize: '14px' }}>
            No chats yet. Tap <b>+ New Chat</b> above to message {shopName}.
          </div>
        ) : (
          threads.map(function (t) {
            return (
              <div
                key={t.id}
                style={threadRowStyle}
                onClick={function () { navigate('/portal/messages/' + t.id) }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                    <div style={{ fontSize: '15px', color: '#1a1a1a', fontWeight: t.unread_count > 0 ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.subject || (t.last_preview ? t.last_preview.slice(0, 40) : 'New chat')}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6c757d', flexShrink: 0 }}>
                      {formatTime(t.last_message_at)}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '13px', color: '#6c757d',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginTop: '2px',
                    fontWeight: t.unread_count > 0 ? 600 : 400,
                  }}>
                    {t.last_sender === 'client' ? 'You: ' : ''}{t.last_preview}
                  </div>
                </div>
                {t.unread_count > 0 && (
                  <span style={{
                    background: '#dc3545', color: '#fff',
                    borderRadius: '10px', padding: '2px 8px',
                    fontSize: '11px', fontWeight: 700,
                    minWidth: '20px', textAlign: 'center',
                    flexShrink: 0, marginTop: '2px',
                  }}>
                    {t.unread_count}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* NEW CHAT MODAL */}
      {showNewChat && (
        <div style={modalOverlay} onClick={function () { setShowNewChat(false) }}>
          <div style={modalStyle} onClick={function (e) { e.stopPropagation() }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Start a new chat</h3>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
              Subject (optional)
            </label>
            <input
              type="text"
              value={newChatSubject}
              onChange={function (e) { setNewChatSubject(e.target.value) }}
              placeholder="e.g. Kilo's nail trim question"
              maxLength={80}
              style={{
                width: '100%', padding: '8px 12px', border: '1px solid #dee2e6',
                borderRadius: '6px', fontSize: '14px', marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            />

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
              Your message *
            </label>
            <textarea
              value={newChatMessage}
              onChange={function (e) { setNewChatMessage(e.target.value) }}
              placeholder="Type your message..."
              rows={4}
              style={{
                width: '100%', padding: '8px 12px', border: '1px solid #dee2e6',
                borderRadius: '6px', fontSize: '14px', marginBottom: '16px',
                fontFamily: 'inherit', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={function () { setShowNewChat(false) }}
                style={{
                  padding: '8px 16px', background: '#f1f3f5', border: 'none',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewChat}
                disabled={!newChatMessage.trim() || newChatSaving}
                style={{
                  padding: '8px 16px', background: '#667eea', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
                  opacity: (!newChatMessage.trim() || newChatSaving) ? 0.5 : 1,
                }}
              >
                {newChatSaving ? 'Starting...' : 'Start Chat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
