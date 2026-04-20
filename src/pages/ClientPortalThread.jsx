import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import MessageBubble from '../components/MessageBubble'
import MessageComposer from '../components/MessageComposer'

export default function ClientPortalThread() {
  var navigate = useNavigate()
  var { threadId } = useParams()

  var [user, setUser] = useState(null)
  var [clientRow, setClientRow] = useState(null)
  var [thread, setThread] = useState(null)
  var [shopName, setShopName] = useState('Your Groomer')
  var [messages, setMessages] = useState([])
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')
  var [pendingConfirms, setPendingConfirms] = useState([])
  // Mobile detect — flips styles when viewport is phone-sized
  var [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(function () {
    function onResize() { setIsMobile(window.innerWidth < 768) }
    window.addEventListener('resize', onResize)
    return function () { window.removeEventListener('resize', onResize) }
  }, [])
  var messagesEndRef = useRef(null)
  var originalTitleRef = useRef(document.title)
  var titleFlashIntervalRef = useRef(null)

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
        setError('Client profile not found.')
        setLoading(false)
        return
      }
      setClientRow(client)

      // Load thread
      var { data: t } = await supabase
        .from('threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle()

      if (!t) {
        setError('Chat not found.')
        setLoading(false)
        return
      }
      setThread(t)

      // Shop name
      var { data: shop } = await supabase
        .from('shop_settings')
        .select('shop_name')
        .eq('groomer_id', client.groomer_id)
        .maybeSingle()
      if (shop && shop.shop_name) setShopName(shop.shop_name)

      // Load messages
      var { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
      setMessages(msgs || [])

      // Mark groomer-sent messages as read
      await supabase
        .from('messages')
        .update({ read_by_client: true })
        .eq('thread_id', threadId)
        .eq('sender_type', 'groomer')
        .eq('read_by_client', false)

      setLoading(false)
    }
    init()

    return function () {
      if (titleFlashIntervalRef.current) clearInterval(titleFlashIntervalRef.current)
      document.title = originalTitleRef.current
    }
  }, [threadId])

  // Realtime
  useEffect(function () {
    if (!threadId) return

    var channel = supabase
      .channel('portal-thread-' + threadId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'thread_id=eq.' + threadId,
      }, async function (payload) {
        var newMsg = payload.new
        setMessages(function (prev) {
          if (prev.find(function (m) { return m.id === newMsg.id })) return prev
          return [...prev, newMsg]
        })
        if (newMsg.sender_type === 'groomer') {
          await supabase
            .from('messages')
            .update({ read_by_client: true })
            .eq('id', newMsg.id)
          playNotifySound()
          flashTitle()
        }
      })
      .subscribe()

    return function () {
      supabase.removeChannel(channel)
    }
  }, [threadId])

  // Reload pending confirms whenever thread, client, or messages change.
  // This also catches new reminders that arrive via realtime while portal is open.
  useEffect(function () {
    if (!thread || !clientRow) return
    if (thread.subject !== 'Appointment Reminders') return
    loadPendingConfirms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, clientRow, messages.length])

  // Autoscroll
  useEffect(function () {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Stop title flash on interaction
  useEffect(function () {
    function handleInteraction() { stopTitleFlash() }
    window.addEventListener('click', handleInteraction)
    window.addEventListener('keydown', handleInteraction)
    return function () {
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
    }
  }, [])

  // -------------------------------------------------------
  // Format helpers for confirm button labels + reply text
  // -------------------------------------------------------
  function formatTime12h(timeStr) {
    if (!timeStr) return ''
    var parts = String(timeStr).split(':')
    var h = parseInt(parts[0], 10)
    var m = parts[1] || '00'
    var ampm = h >= 12 ? 'PM' : 'AM'
    if (h > 12) h -= 12
    if (h === 0) h = 12
    return h + ':' + m + ' ' + ampm
  }

  function formatDateLong(dateStr) {
    if (!dateStr) return ''
    var d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return ''
    var d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // -------------------------------------------------------
  // Load all pending confirmations (grooming + boarding) for
  // this client. Only runs inside "Appointment Reminders".
  // -------------------------------------------------------
  async function loadPendingConfirms() {
    if (!thread || !clientRow) return
    if (thread.subject !== 'Appointment Reminders') return

    var items = []

    // Grooming appointments
    var { data: appts } = await supabase
      .from('appointments')
      .select('id, appointment_date, start_time, pet_id, pets:pet_id(name)')
      .eq('groomer_id', thread.groomer_id)
      .eq('client_id', clientRow.id)
      .not('reminder_sent_at', 'is', null)
      .not('status', 'in', '(cancelled,confirmed)')
      .order('reminder_sent_at', { ascending: false })

    if (appts) {
      appts.forEach(function (a) {
        var petName = (a.pets && a.pets.name) ? a.pets.name : 'your pet'
        var when = formatDateLong(a.appointment_date) + ' at ' + formatTime12h(a.start_time)
        items.push({
          type: 'grooming',
          id: a.id,
          label: petName + '\u2019s grooming — ' + when,
          clientMsg: 'Confirming ' + petName + '\u2019s grooming on ' + when + '.',
          shopReply: '✅ Got it! ' + petName + '\u2019s appointment for ' + when + ' is confirmed. See you then! 🐾',
        })
      })
    }

    // Boarding reservations
    var { data: resvs } = await supabase
      .from('boarding_reservations')
      .select(
        'id, start_date, end_date, ' +
        'boarding_reservation_pets(pets:pet_id(name))'
      )
      .eq('groomer_id', thread.groomer_id)
      .eq('client_id', clientRow.id)
      .not('reminder_sent_at', 'is', null)
      .not('status', 'in', '(cancelled,confirmed)')
      .order('reminder_sent_at', { ascending: false })

    if (resvs) {
      resvs.forEach(function (r) {
        var petNames = (r.boarding_reservation_pets || [])
          .map(function (brp) { return brp.pets ? brp.pets.name : null })
          .filter(function (n) { return n })
          .join(' & ')
        if (!petNames) petNames = 'your pet'

        var range = formatDateShort(r.start_date) + ' → ' + formatDateShort(r.end_date)
        items.push({
          type: 'boarding',
          id: r.id,
          label: petNames + '\u2019s boarding — ' + range,
          clientMsg: 'Confirming ' + petNames + '\u2019s boarding from ' +
            formatDateLong(r.start_date) + ' to ' + formatDateLong(r.end_date) + '.',
          shopReply: '✅ Got it! ' + petNames + '\u2019s boarding stay ' + range +
            ' is confirmed. See you then! 🐾',
        })
      })
    }

    setPendingConfirms(items)
  }

  // -------------------------------------------------------
  // Confirm a specific pending item (Option C flow):
  // 1) Insert client-side confirm message
  // 2) Call RPC to flip status to 'confirmed'
  // 3) Insert shop auto-reply
  // 4) Reload the pending list (item drops off)
  // -------------------------------------------------------
  async function confirmPendingItem(item) {
    try {
      // 1) Client-side message
      var { data: clientMsgRow, error: cErr } = await supabase
        .from('messages')
        .insert({
          thread_id: thread.id,
          groomer_id: thread.groomer_id,
          client_id: clientRow.id,
          sender_type: 'client',
          text: item.clientMsg,
          read_by_groomer: false,
          read_by_client: true,
        })
        .select()
        .single()
      if (cErr) throw cErr

      setMessages(function (prev) {
        if (prev.find(function (m) { return m.id === clientMsgRow.id })) return prev
        return [...prev, clientMsgRow]
      })

      // 2) Flip status via RPC
      if (item.type === 'grooming') {
        await supabase.rpc('client_confirm_appointment', { p_appointment_id: item.id })
      } else {
        await supabase.rpc('client_confirm_boarding', { p_reservation_id: item.id })
      }

      // 3) Shop auto-reply
      var { data: shopMsgRow, error: sErr } = await supabase
        .from('messages')
        .insert({
          thread_id: thread.id,
          groomer_id: thread.groomer_id,
          client_id: clientRow.id,
          sender_type: 'groomer',
          text: item.shopReply,
          read_by_groomer: true,
          read_by_client: true,
        })
        .select()
        .single()
      if (sErr) throw sErr

      setMessages(function (prev) {
        if (prev.find(function (m) { return m.id === shopMsgRow.id })) return prev
        return [...prev, shopMsgRow]
      })

      await supabase
        .from('threads')
        .update({ last_message_at: shopMsgRow.created_at })
        .eq('id', thread.id)

      // 4) Reload pending list (confirmed item drops off)
      await loadPendingConfirms()
    } catch (e) {
      console.error('confirmPendingItem failed:', e)
      alert('Could not confirm. Please try again.')
    }
  }

  async function handleSend(text, attachmentUrl) {
    if (!clientRow || !thread) return
    var payload = {
      thread_id: thread.id,
      groomer_id: thread.groomer_id,
      client_id: clientRow.id,
      sender_type: 'client',
      text: text || null,
      attachment_url: attachmentUrl || null,
      read_by_groomer: false,
      read_by_client: true,
    }
    var { data, error: sendErr } = await supabase.from('messages').insert(payload).select().single()
    if (sendErr) {
      console.error('Client send error:', sendErr)
      throw sendErr
    }

    // Update thread last_message_at
    await supabase
      .from('threads')
      .update({ last_message_at: data.created_at })
      .eq('id', thread.id)

    // Optimistic append
    setMessages(function (prev) {
      if (prev.find(function (m) { return m.id === data.id })) return prev
      return [...prev, data]
    })
  }

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

  // Date separators
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
          <div key={'sep-' + m.id} style={{ textAlign: 'center', margin: '16px 0 8px 0' }}>
            <span style={{
              display: 'inline-block', padding: '4px 12px',
              background: '#e9ecef', color: '#6c757d',
              fontSize: '12px', borderRadius: '12px',
            }}>{dayLabel(m.created_at)}</span>
          </div>
        )
        lastDay = thisDay
      }
      out.push(
        <MessageBubble
          key={m.id}
          message={m}
          isOwnMessage={m.sender_type === 'client'}
        />
      )
    })
    return out
  }

  // ---------- STYLES ----------
  var pageStyle = {
    maxWidth: isMobile ? 'none' : '720px',
    margin: isMobile ? '0' : '20px auto',
    background: '#fff',
    border: isMobile ? 'none' : '1px solid #e5e7eb',
    borderRadius: isMobile ? '0' : '12px',
    overflow: 'hidden',
    height: isMobile ? '100vh' : 'calc(100vh - 40px)',
    display: 'flex',
    flexDirection: 'column',
  }

  var headerStyle = {
    padding: isMobile ? '10px 12px' : '14px 20px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '8px' : '12px',
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

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading chat...</div>

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#dc3545' }}>
        {error}
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={function () { navigate('/portal/messages') }}
            style={{ padding: '8px 16px', background: '#667eea', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Back to Messages
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <button style={backBtnStyle} onClick={function () { navigate('/portal/messages') }}>← Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {thread && thread.subject ? thread.subject : shopName}
          </div>
          <div style={{ fontSize: '12px', color: '#6c757d' }}>
            {thread && thread.subject ? shopName : 'Messages'}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', background: '#fafbfc' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6c757d', padding: '40px 20px', fontSize: '14px' }}>
            No messages yet.
          </div>
        ) : (
          renderMessagesWithSeparators()
        )}
        <div ref={messagesEndRef} />
      </div>

      {pendingConfirms.length > 0 && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb',
          background: '#fffbea',
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#92400e',
            marginBottom: '8px',
            letterSpacing: '0.3px',
            textTransform: 'uppercase',
          }}>
            Pending confirmations
          </div>
          {pendingConfirms.map(function (item) {
            return (
              <button
                key={item.type + '-' + item.id}
                onClick={function () { confirmPendingItem(item) }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  marginBottom: '6px',
                  background: '#fff',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#1f2937',
                  fontWeight: 500,
                }}
              >
                ✅ Confirm {item.label}
              </button>
            )
          })}
        </div>
      )}

      <MessageComposer onSend={handleSend} />
    </div>
  )
}
