import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { checkAICap, logAIUsage } from '../lib/aiUsage'

export default function ClientChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! I\'m your shop\'s AI assistant. I can help you book, reschedule, or cancel appointments. What can I do for you?' }
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [enabled, setEnabled] = useState(null) // null = loading, true/false = known
  // Store this client's groomer_id so AI usage is capped against the
  // SHOP's monthly cap (clients don't have a tier of their own).
  const [groomerId, setGroomerId] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // 📎 Image attachments — clients can send photos (matted spot, vax cert, hair length, meds bottle)
  const [pendingImages, setPendingImages] = useState([])
  const fileInputRef = useRef(null)

  // --- Draggable widget state ---
  // position = { x, y } (top-left corner in px) or null = use default CSS (bottom-right)
  const [position, setPosition] = useState(null)
  const [dragging, setDragging] = useState(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const widgetSizeRef = useRef({ w: 380, h: 520 })

  // Load saved position from localStorage on mount
  useEffect(() => {
    try {
      var saved = localStorage.getItem('petpro_client_chat_pos')
      if (saved) {
        var parsed = JSON.parse(saved)
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPosition(parsed)
        }
      }
    } catch (e) { /* ignore */ }
  }, [])

  // Clamp position so widget always stays visible
  function clampPosition(x, y) {
    var w = widgetSizeRef.current.w
    var h = widgetSizeRef.current.h
    var maxX = window.innerWidth - w
    var maxY = window.innerHeight - h
    if (maxX < 0) maxX = 0
    if (maxY < 0) maxY = 0
    if (x < 0) x = 0
    if (y < 0) y = 0
    if (x > maxX) x = maxX
    if (y > maxY) y = maxY
    return { x: x, y: y }
  }

  // Mouse/touch event helpers
  function getPoint(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    return { x: e.clientX, y: e.clientY }
  }

  function onDragStart(e) {
    // Don't start drag if they clicked a button in the header (close, clear)
    if (e.target && e.target.closest && e.target.closest('button')) return

    var point = getPoint(e)
    // Find the current widget position on screen
    var widgetEl = e.currentTarget.parentElement // .chat-window
    if (widgetEl) {
      var rect = widgetEl.getBoundingClientRect()
      widgetSizeRef.current = { w: rect.width, h: rect.height }
      dragOffsetRef.current = { x: point.x - rect.left, y: point.y - rect.top }
      // Snap position to current location before dragging (so first move doesn't jump)
      setPosition({ x: rect.left, y: rect.top })
    }
    setDragging(true)
    if (e.preventDefault) e.preventDefault()
  }

  // Attach global listeners while dragging
  useEffect(() => {
    if (!dragging) return
    function onMove(e) {
      var point = getPoint(e)
      var newX = point.x - dragOffsetRef.current.x
      var newY = point.y - dragOffsetRef.current.y
      setPosition(clampPosition(newX, newY))
      if (e.preventDefault) e.preventDefault()
    }
    function onEnd() {
      setDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [dragging])

  // Persist position whenever it settles (not while actively dragging, to avoid spam)
  useEffect(() => {
    if (!dragging && position) {
      try { localStorage.setItem('petpro_client_chat_pos', JSON.stringify(position)) } catch (e) { /* ignore */ }
    }
  }, [dragging, position])

  // Re-clamp on window resize so the widget doesn't end up off-screen
  useEffect(() => {
    function onResize() {
      if (position) setPosition(function(p) { return p ? clampPosition(p.x, p.y) : p })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position])

  // On mount: check if client-side PetPro AI is enabled for this client's groomer.
  // Two layers, and EITHER one off = hide the widget:
  //   1. shop_settings.client_ai_booking_enabled (new master toggle — Classic Mode 🐾)
  //   2. ai_personalization.client_claude_enabled (old granular toggle — backwards compat)
  useEffect(() => {
    async function checkEnabled() {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setEnabled(false)
        return
      }
      // Find this client's groomer
      var { data: clientRow } = await supabase
        .from('clients')
        .select('groomer_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!clientRow) {
        setEnabled(false)
        return
      }
      // Store it so sendMessage() can check + log against the shop's cap
      setGroomerId(clientRow.groomer_id)

      // Layer 1 — MASTER toggle (Classic Mode). If OFF, hide immediately.
      var { data: shop } = await supabase
        .from('shop_settings')
        .select('client_ai_booking_enabled')
        .eq('groomer_id', clientRow.groomer_id)
        .maybeSingle()
      if (shop && shop.client_ai_booking_enabled === false) {
        setEnabled(false)
        return
      }

      // Layer 2 — legacy granular toggle (from old ChatSettings page)
      var { data: settings } = await supabase
        .from('ai_personalization')
        .select('client_claude_enabled')
        .eq('groomer_id', clientRow.groomer_id)
        .maybeSingle()
      if (!settings) {
        setEnabled(true)
        return
      }
      setEnabled(settings.client_claude_enabled !== false)
    }
    checkEnabled()
  }, [])

  // Auto scroll to bottom when new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // 📎 Pick image(s) from disk/camera, validate, convert to base64, stash in pendingImages
  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const newPending = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > 5 * 1024 * 1024) {
        alert('Photo "' + file.name + '" is too big (5MB max). Try a smaller one.')
        continue
      }

      try {
        const result = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const data = reader.result
            const comma = data.indexOf(',')
            resolve(comma >= 0 ? data.substring(comma + 1) : data)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        let mediaType = file.type
        if (mediaType === 'image/heic' || mediaType === 'image/heif') mediaType = 'image/jpeg'

        newPending.push({
          media_type: mediaType,
          data: result,
          preview: URL.createObjectURL(file),
          name: file.name,
        })
      } catch (err) {
        console.error('Failed to read image:', err)
      }
    }

    if (newPending.length) {
      setPendingImages(prev => [...prev, ...newPending])
    }
    e.target.value = ''   // allow re-picking same file
  }

  const removePendingImage = (idx) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx))
  }

  const sendMessage = async () => {
    const hasText = input.trim().length > 0
    const hasImages = pendingImages.length > 0
    if ((!hasText && !hasImages) || sending) return

    const userMessage = input.trim()
    const imagesForSend = pendingImages
    setInput('')
    setPendingImages([])
    setSending(true)

    // Add user message to chat with any image previews
    setMessages(prev => [...prev, {
      role: 'user',
      text: userMessage || (hasImages ? '📷 Sent a photo' : ''),
      images: imagesForSend.map(i => i.preview),
    }])

    try {
      // Monthly AI cap check — count this against the SHOP's cap, not the client's.
      // (The client has no tier; we look up their groomer on mount and stash the id.)
      if (groomerId) {
        const capStatus = await checkAICap(groomerId)
        if (!capStatus.allowed) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: 'Your shop\'s AI assistant is temporarily unavailable for this month. Please message your groomer directly to book.'
          }])
          setSending(false)
          return
        }
      }

      // Build conversation history (last 10 exchanges, in-memory only)
      const history = []
      const allMessages = [...messages, { role: 'user', text: userMessage }]
      for (let i = 1; i < allMessages.length - 1; i += 2) {
        if (allMessages[i].role === 'user' && allMessages[i + 1] && allMessages[i + 1].role === 'assistant') {
          history.push({
            user: allMessages[i].text,
            assistant: allMessages[i + 1].text,
          })
        }
      }
      const recentHistory = history.slice(-10)

      const { data, error } = await supabase.functions.invoke('client-chat-command', {
        body: {
          message: userMessage || 'Please look at this photo.',
          history: recentHistory,
          images: imagesForSend.map(i => ({ media_type: i.media_type, data: i.data })),
        },
      })

      if (error) {
        console.error('Client chat error:', error)
        setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I had trouble with that. Try again or message your groomer directly.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.text }])
        // Successful AI response — count this against the SHOP's monthly cap
        if (groomerId) {
          logAIUsage('client_chat_widget', 0, groomerId)
        }
      }
    } catch (err) {
      console.error('Client chat failed:', err)
      setMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Try again or message your groomer directly.' }])
    }

    setSending(false)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([
      { role: 'assistant', text: 'Chat cleared! What can I help you with?' }
    ])
  }

  // Don't render anything if loading or disabled
  if (enabled === null || enabled === false) {
    return null
  }

  return (
    <>
      {/* Chat Bubble Button */}
      {!isOpen && (
        <button className="chat-bubble-btn" onClick={() => setIsOpen(true)}>
          <span className="chat-bubble-icon">💬</span>
          <span className="chat-bubble-label">Book with AI</span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="chat-window"
          style={position ? {
            left: position.x + 'px',
            top: position.y + 'px',
            bottom: 'auto',
            right: 'auto',
          } : undefined}
        >
          {/* Chat Header — also the drag handle */}
          <div
            className="chat-header"
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
            title="Drag to move"
          >
            <div className="chat-header-info">
              <span className="chat-header-dot"></span>
              <span className="chat-header-title">Shop AI Assistant</span>
            </div>
            <div className="chat-header-actions">
              <button className="chat-clear-btn" onClick={clearChat} title="Clear chat">🗑</button>
              <button className="chat-close-btn" onClick={() => setIsOpen(false)}>✕</button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`}>
                {msg.role === 'assistant' && <span className="chat-msg-avatar">🐾</span>}
                <div className={`chat-msg-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
                  {msg.images && msg.images.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: msg.text ? '6px' : '0' }}>
                      {msg.images.map((src, ii) => (
                        <img key={ii} src={src} alt="attachment" style={{ maxWidth: '140px', maxHeight: '140px', borderRadius: '8px', objectFit: 'cover' }} />
                      ))}
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="chat-msg chat-msg-ai">
                <span className="chat-msg-avatar">🐾</span>
                <div className="chat-bubble-ai chat-typing">
                  AI is typing...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pending image previews (above input) */}
          {pendingImages.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', padding: '6px 10px', background: '#f8f9fa', borderTop: '1px solid #e5e7eb', overflowX: 'auto' }}>
              {pendingImages.map((img, idx) => (
                <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={img.preview} alt="preview" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} />
                  <button
                    onClick={() => removePendingImage(idx)}
                    style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '11px', cursor: 'pointer', lineHeight: '1' }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Chat Input */}
          <div className="chat-input-area">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilePick}
              style={{ display: 'none' }}
            />
            <button
              className="chat-send-btn"
              onClick={() => { if (fileInputRef.current) fileInputRef.current.click() }}
              disabled={sending}
              title="Attach a photo (hair length, matted spot, vax cert, meds)"
              style={{ background: '#f1f3f5', color: '#6c757d' }}
            >
              📎
            </button>
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me to book, reschedule, or cancel..."
              rows={1}
              disabled={sending}
            />
            <button
              className="chat-send-btn"
              onClick={sendMessage}
              disabled={sending || (!input.trim() && pendingImages.length === 0)}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  )
}
