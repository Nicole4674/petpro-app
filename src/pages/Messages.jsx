import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import MessageBubble from '../components/MessageBubble'
import MessageComposer from '../components/MessageComposer'
import { notifyUser } from '../lib/push'

export default function Messages() {
  var navigate = useNavigate()
  var [user, setUser] = useState(null)
  var [threads, setThreads] = useState([]) // each: { id, groomer_id, client_id, subject, last_message_at, client_name, last_preview, last_sender, unread_count }
  var [selectedThreadId, setSelectedThreadId] = useState(null)
  var [messages, setMessages] = useState([])
  var [loading, setLoading] = useState(true)
  var [search, setSearch] = useState('')
  var [showNewChat, setShowNewChat] = useState(false)
  var [clientsList, setClientsList] = useState([])
  var [newChatClientId, setNewChatClientId] = useState('')
  var [newChatSubject, setNewChatSubject] = useState('')
  var [newChatMessage, setNewChatMessage] = useState('')
  var [newChatSaving, setNewChatSaving] = useState(false)

  var messagesEndRef = useRef(null)
  var originalTitleRef = useRef(document.title)
  var titleFlashIntervalRef = useRef(null)

  // ---------- INITIAL LOAD ----------
  useEffect(function () {
    async function init() {
      var { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return
      setUser(u)
      await loadAll(u.id)
      setLoading(false)
    }
    init()

    return function () {
      if (titleFlashIntervalRef.current) clearInterval(titleFlashIntervalRef.current)
      document.title = originalTitleRef.current
    }
  }, [])

  // ---------- REALTIME ----------
  useEffect(function () {
    if (!user) return

    var channel = supabase
      .channel('messages-groomer-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'groomer_id=eq.' + user.id,
      }, function (payload) {
        handleIncomingMessage(payload.new)
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'threads',
        filter: 'groomer_id=eq.' + user.id,
      }, function () {
        // A new thread was created — reload the thread list
        loadAll(user.id)
      })
      .subscribe()

    return function () {
      supabase.removeChannel(channel)
    }
  }, [user, selectedThreadId])

  // ---------- LOAD THREAD MESSAGES ON SELECTION ----------
  useEffect(function () {
    if (!selectedThreadId || !user) return
    loadThreadMessages(selectedThreadId)
    markThreadRead(selectedThreadId)
    stopTitleFlash()
  }, [selectedThreadId])

  // ---------- AUTOSCROLL ----------
  useEffect(function () {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // ---------- HELPERS ----------
  async function loadAll(groomerId) {
    // Load threads + client names
    var { data: threadRows, error: tErr } = await supabase
      .from('threads')
      .select('id, groomer_id, client_id, subject, last_message_at, created_at, clients(first_name, last_name)')
      .eq('groomer_id', groomerId)
      .order('last_message_at', { ascending: false })

    if (tErr) {
      console.error('Thread load error:', tErr)
      setThreads([])
      return
    }

    // Load last message per thread + unread counts
    var { data: allMsgs } = await supabase
      .from('messages')
      .select('thread_id, text, attachment_url, created_at, sender_type, read_by_groomer')
      .eq('groomer_id', groomerId)
      .order('created_at', { ascending: false })

    var lastMap = {}
    var unreadMap = {}
    ;(allMsgs || []).forEach(function (m) {
      if (!lastMap[m.thread_id]) {
        lastMap[m.thread_id] = { text: m.text, attachment_url: m.attachment_url, sender_type: m.sender_type }
      }
      if (m.sender_type === 'client' && !m.read_by_groomer) {
        unreadMap[m.thread_id] = (unreadMap[m.thread_id] || 0) + 1
      }
    })

    var enriched = (threadRows || []).map(function (t) {
      var c = t.clients || {}
      return {
        id: t.id,
        groomer_id: t.groomer_id,
        client_id: t.client_id,
        subject: t.subject,
        last_message_at: t.last_message_at,
        created_at: t.created_at,
        client_name: ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Client',
        last_preview: lastMap[t.id] ? previewText(lastMap[t.id]) : '',
        last_sender: lastMap[t.id] ? lastMap[t.id].sender_type : null,
        unread_count: unreadMap[t.id] || 0,
      }
    })
    setThreads(enriched)
  }

  async function loadThreadMessages(threadId) {
    var { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('Thread msg load error:', error)
      setMessages([])
      return
    }
    setMessages(data || [])
  }

  async function markThreadRead(threadId) {
    await supabase
      .from('messages')
      .update({ read_by_groomer: true })
      .eq('thread_id', threadId)
      .eq('sender_type', 'client')
      .eq('read_by_groomer', false)
    setThreads(function (prev) {
      return prev.map(function (t) {
        return t.id === threadId ? Object.assign({}, t, { unread_count: 0 }) : t
      })
    })
  }

  function handleIncomingMessage(newMsg) {
    // If it belongs to the currently open thread, append it
    if (newMsg.thread_id === selectedThreadId) {
      setMessages(function (prev) {
        if (prev.find(function (m) { return m.id === newMsg.id })) return prev
        return [...prev, newMsg]
      })
      if (newMsg.sender_type === 'client') {
        markThreadRead(newMsg.thread_id)
      }
    } else if (newMsg.sender_type === 'client') {
      playNotifySound()
      flashTitle()
    }

    // Bump thread list — update preview, move to top, bump unread
    setThreads(function (prev) {
      var found = prev.find(function (t) { return t.id === newMsg.thread_id })
      if (!found) {
        // New thread we haven't loaded yet — reload
        if (user) loadAll(user.id)
        return prev
      }
      var updated = Object.assign({}, found, {
        last_message_at: newMsg.created_at,
        last_preview: previewText(newMsg),
        last_sender: newMsg.sender_type,
        unread_count: (newMsg.sender_type === 'client' && newMsg.thread_id !== selectedThreadId)
          ? found.unread_count + 1
          : found.unread_count,
      })
      var rest = prev.filter(function (t) { return t.id !== newMsg.thread_id })
      return [updated, ...rest]
    })
  }

  async function handleSend(text, attachmentUrl) {
    if (!selectedThreadId || !user) return
    var selected = threads.find(function (t) { return t.id === selectedThreadId })
    if (!selected) return

    var payload = {
      thread_id: selectedThreadId,
      groomer_id: user.id,
      client_id: selected.client_id,
      sender_type: 'groomer',
      text: text || null,
      attachment_url: attachmentUrl || null,
      read_by_groomer: true,
      read_by_client: false,
    }
    var { data, error } = await supabase.from('messages').insert(payload).select().single()
    if (error) {
      console.error('Send error:', error)
      throw error
    }

    // Update thread last_message_at
    await supabase
      .from('threads')
      .update({ last_message_at: data.created_at })
      .eq('id', selectedThreadId)

    // ─── Push notify the client (fire and forget — never blocks send) ───
    ;(async function notifyClient() {
      try {
        var { data: clientRow } = await supabase
          .from('clients')
          .select('user_id')
          .eq('id', selected.client_id)
          .maybeSingle()
        if (!clientRow?.user_id) return // client has no portal account, skip
        var { data: shopRow } = await supabase
          .from('shop_settings')
          .select('shop_name')
          .eq('groomer_id', user.id)
          .maybeSingle()
        var shopName = (shopRow && shopRow.shop_name) || 'Your groomer'
        var preview = text ? text.slice(0, 100) : '📷 Sent a photo'
        notifyUser({
          userId: clientRow.user_id,
          title: shopName,
          body: preview,
          url: '/portal/messages/' + selectedThreadId,
          tag: 'thread-' + selectedThreadId,
        })
      } catch (e) {
        console.warn('[push] notify client failed (non-fatal):', e)
      }
    })()

    // Optimistic append + thread bump
    setMessages(function (prev) {
      if (prev.find(function (m) { return m.id === data.id })) return prev
      return [...prev, data]
    })
    setThreads(function (prev) {
      var found = prev.find(function (t) { return t.id === selectedThreadId })
      if (!found) return prev
      var updated = Object.assign({}, found, {
        last_message_at: data.created_at,
        last_preview: previewText(data),
        last_sender: 'groomer',
      })
      var rest = prev.filter(function (t) { return t.id !== selectedThreadId })
      return [updated, ...rest]
    })
  }

  // ---------- NEW CHAT MODAL ----------
  async function openNewChatModal() {
    setShowNewChat(true)
    if (clientsList.length === 0 && user) {
      var { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .eq('groomer_id', user.id)
        .order('last_name', { ascending: true })
      setClientsList(data || [])
    }
  }

  function closeNewChatModal() {
    setShowNewChat(false)
    setNewChatClientId('')
    setNewChatSubject('')
    setNewChatMessage('')
  }

  async function handleCreateNewChat() {
    if (!newChatClientId || !newChatMessage.trim() || newChatSaving || !user) return
    setNewChatSaving(true)

    try {
      // Create thread
      var { data: thread, error: tErr } = await supabase
        .from('threads')
        .insert({
          groomer_id: user.id,
          client_id: newChatClientId,
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
          groomer_id: user.id,
          client_id: newChatClientId,
          sender_type: 'groomer',
          text: newChatMessage.trim(),
          read_by_groomer: true,
          read_by_client: false,
        })
        .select()
        .single()

      if (mErr) throw mErr

      // Update thread last_message_at
      await supabase
        .from('threads')
        .update({ last_message_at: msg.created_at })
        .eq('id', thread.id)

      // ─── Push notify the client (fire and forget) ───
      ;(async function notifyNewChatClient() {
        try {
          var { data: clientRow } = await supabase
            .from('clients')
            .select('user_id')
            .eq('id', newChatClientId)
            .maybeSingle()
          if (!clientRow?.user_id) return
          var { data: shopRow } = await supabase
            .from('shop_settings')
            .select('shop_name')
            .eq('groomer_id', user.id)
            .maybeSingle()
          var shopName = (shopRow && shopRow.shop_name) || 'Your groomer'
          var preview = newChatMessage.trim().slice(0, 100)
          notifyUser({
            userId: clientRow.user_id,
            title: shopName,
            body: preview,
            url: '/portal/messages/' + thread.id,
            tag: 'thread-' + thread.id,
          })
        } catch (e) {
          console.warn('[push] notify new-chat client failed (non-fatal):', e)
        }
      })()

      closeNewChatModal()
      await loadAll(user.id)
      setSelectedThreadId(thread.id)
    } catch (err) {
      console.error('New chat error:', err)
      alert('Could not start chat: ' + (err.message || 'unknown error'))
    }

    setNewChatSaving(false)
  }

  // ---------- NOTIFICATION HELPERS ----------
  function playNotifySound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)()
      var osc = ctx.createOscillator()
      var gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    } catch (e) {
      console.log('Sound blocked:', e)
    }
  }

  function flashTitle() {
    if (titleFlashIntervalRef.current) return
    var toggle = false
    titleFlashIntervalRef.current = setInterval(function () {
      document.title = toggle ? originalTitleRef.current : '💬 New message — PetPro'
      toggle = !toggle
    }, 1000)
  }

  function stopTitleFlash() {
    if (titleFlashIntervalRef.current) {
      clearInterval(titleFlashIntervalRef.current)
      titleFlashIntervalRef.current = null
      document.title = originalTitleRef.current
    }
  }

  // ---------- DATE SEPARATORS ----------
  function dayLabel(iso) {
    var d = new Date(iso)
    var now = new Date()
    var todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    var dStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    if (dStr === todayStr) return 'Today'
    var yest = new Date(now); yest.setDate(yest.getDate() - 1)
    if (dStr === yest.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })) return 'Yesterday'
    return d.toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  function renderMessagesWithSeparators() {
    var out = []
    var lastDay = null
    messages.forEach(function (m) {
      var thisDay = m.created_at ? new Date(m.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : ''
      if (thisDay && thisDay !== lastDay) {
        out.push(
          <div key={'sep-' + m.id} style={separatorStyle}>
            <span style={separatorTextStyle}>{dayLabel(m.created_at)}</span>
          </div>
        )
        lastDay = thisDay
      }
      out.push(
        <MessageBubble
          key={m.id}
          message={m}
          isOwnMessage={m.sender_type === 'groomer'}
        />
      )
    })
    return out
  }

  function previewText(m) {
    if (!m) return ''
    if (m.attachment_url && !m.text) return '📷 Photo'
    if (m.attachment_url && m.text) return '📷 ' + m.text
    return m.text || ''
  }

  function threadTitle(t) {
    if (t.subject) return t.subject
    if (t.last_preview) return t.last_preview.slice(0, 40) + (t.last_preview.length > 40 ? '...' : '')
    return 'New chat'
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

  // ---------- FILTER ----------
  var filteredThreads = threads.filter(function (t) {
    var q = search.toLowerCase().trim()
    if (!q) return true
    var hay = (t.client_name + ' ' + (t.subject || '') + ' ' + (t.last_preview || '')).toLowerCase()
    return hay.includes(q)
  })

  var selectedThread = threads.find(function (t) { return t.id === selectedThreadId })

  // ---------- STYLES ----------
  var pageStyle = {
    display: 'flex',
    height: 'calc(100vh - 40px)',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    margin: '20px',
  }

  var leftColStyle = {
    width: '340px',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    background: '#f8f9fa',
  }

  var leftHeaderStyle = {
    padding: '16px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fff',
  }

  var newChatBtnStyle = {
    width: '100%',
    padding: '8px 12px',
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '10px',
  }

  var searchStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  var listStyle = { flex: 1, overflowY: 'auto' }

  var threadRowBase = {
    padding: '12px 16px',
    borderBottom: '1px solid #e9ecef',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  }

  var rightColStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
  }

  var threadHeaderStyle = {
    padding: '14px 20px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fff',
  }

  var threadBodyStyle = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 0',
    background: '#fafbfc',
  }

  var separatorStyle = {
    textAlign: 'center',
    margin: '16px 0 8px 0',
  }

  var separatorTextStyle = {
    display: 'inline-block',
    padding: '4px 12px',
    background: '#e9ecef',
    color: '#6c757d',
    fontSize: '12px',
    borderRadius: '12px',
  }

  var emptyStateStyle = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6c757d',
    fontSize: '15px',
    textAlign: 'center',
    padding: '20px',
  }

  var unreadBadgeStyle = {
    background: '#dc3545',
    color: '#fff',
    borderRadius: '10px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 700,
    minWidth: '20px',
    textAlign: 'center',
    flexShrink: 0,
  }

  // Modal styles
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

  if (loading) return <div style={{ padding: '20px' }}>Loading messages...</div>

  return (
    <div style={pageStyle}>
      {/* LEFT: Thread list */}
      <div style={leftColStyle}>
        <div style={leftHeaderStyle}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '18px' }}>Messages</h2>
          <button style={newChatBtnStyle} onClick={openNewChatModal}>+ New Message</button>
          <input
            type="text"
            placeholder="Search by client or subject..."
            value={search}
            onChange={function (e) { setSearch(e.target.value) }}
            style={searchStyle}
          />
        </div>
        <div style={listStyle}>
          {filteredThreads.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d', fontSize: '14px' }}>
              {search ? 'No chats match' : 'No chats yet. Clients can start conversations from the portal, or click + New Message above.'}
            </div>
          ) : (
            filteredThreads.map(function (t) {
              var isSelected = t.id === selectedThreadId
              var rowStyle = Object.assign({}, threadRowBase, {
                background: isSelected ? '#e7efff' : 'transparent',
                fontWeight: t.unread_count > 0 ? 600 : 400,
              })
              return (
                <div
                  key={t.id}
                  style={rowStyle}
                  onClick={function () { setSelectedThreadId(t.id) }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <div
                        onClick={function (e) {
                          e.stopPropagation()
                          if (t.client_id) navigate('/clients/' + t.client_id)
                        }}
                        style={{
                          fontSize: '14px',
                          color: '#667eea',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                        title="View client profile"
                      >
                        {t.client_name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6c757d', flexShrink: 0 }}>
                        {formatTime(t.last_message_at)}
                      </div>
                    </div>
                    {t.subject && (
                      <div style={{ fontSize: '12px', color: '#667eea', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.subject}
                      </div>
                    )}
                    <div style={{
                      fontSize: '12px', color: '#6c757d',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {t.last_sender === 'groomer' ? 'You: ' : ''}{t.last_preview}
                    </div>
                  </div>
                  {t.unread_count > 0 && <span style={unreadBadgeStyle}>{t.unread_count}</span>}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* RIGHT: Thread messages */}
      <div style={rightColStyle}>
        {!selectedThreadId ? (
          <div style={emptyStateStyle}>
            Select a chat or click + New Message
          </div>
        ) : (
          <>
            <div style={threadHeaderStyle}>
              {selectedThread && selectedThread.client_id ? (
                <div
                  onClick={function () { navigate('/clients/' + selectedThread.client_id) }}
                  style={{
                    fontWeight: 600,
                    fontSize: '16px',
                    color: '#667eea',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    display: 'inline-block',
                  }}
                  title="View client profile"
                >
                  {selectedThread.client_name}
                </div>
              ) : (
                <div style={{ fontWeight: 600, fontSize: '16px' }}>
                  {selectedThread ? selectedThread.client_name : 'Chat'}
                </div>
              )}
              {selectedThread && selectedThread.subject && (
                <div style={{ fontSize: '13px', color: '#667eea', marginTop: '2px' }}>
                  {selectedThread.subject}
                </div>
              )}
            </div>
            <div style={threadBodyStyle}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#6c757d', padding: '40px 20px', fontSize: '14px' }}>
                  No messages yet.
                </div>
              ) : (
                renderMessagesWithSeparators()
              )}
              <div ref={messagesEndRef} />
            </div>
            <MessageComposer onSend={handleSend} />
          </>
        )}
      </div>

      {/* NEW CHAT MODAL */}
      {showNewChat && (
        <div style={modalOverlay} onClick={closeNewChatModal}>
          <div style={modalStyle} onClick={function (e) { e.stopPropagation() }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Start a new chat</h3>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
              Client *
            </label>
            <select
              value={newChatClientId}
              onChange={function (e) { setNewChatClientId(e.target.value) }}
              style={{
                width: '100%', padding: '8px 12px', border: '1px solid #dee2e6',
                borderRadius: '6px', fontSize: '14px', marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            >
              <option value="">Select a client...</option>
              {clientsList.map(function (c) {
                return (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                )
              })}
            </select>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
              Subject (optional)
            </label>
            <input
              type="text"
              value={newChatSubject}
              onChange={function (e) { setNewChatSubject(e.target.value) }}
              placeholder="e.g. Kilo's Saturday appointment"
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
              placeholder="Type your first message..."
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
                onClick={closeNewChatModal}
                style={{
                  padding: '8px 16px', background: '#f1f3f5', border: 'none',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewChat}
                disabled={!newChatClientId || !newChatMessage.trim() || newChatSaving}
                style={{
                  padding: '8px 16px', background: '#667eea', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
                  opacity: (!newChatClientId || !newChatMessage.trim() || newChatSaving) ? 0.5 : 1,
                }}
              >
                {newChatSaving ? 'Creating...' : 'Start Chat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
