import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ClientChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! I\'m your shop\'s AI assistant. I can help you book, reschedule, or cancel appointments. What can I do for you?' }
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [enabled, setEnabled] = useState(null) // null = loading, true/false = known
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

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

  // On mount: check if client Claude is enabled for this client's groomer
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
      // Check the groomer's toggle
      var { data: settings } = await supabase
        .from('ai_personalization')
        .select('client_claude_enabled')
        .eq('groomer_id', clientRow.groomer_id)
        .maybeSingle()
      // Default to true if no settings row yet
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

  const sendMessage = async () => {
    if (!input.trim() || sending) return

    const userMessage = input.trim()
    setInput('')
    setSending(true)

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', text: userMessage }])

    try {
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
          message: userMessage,
          history: recentHistory,
        },
      })

      if (error) {
        console.error('Client chat error:', error)
        setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I had trouble with that. Try again or message your groomer directly.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.text }])
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

          {/* Chat Input */}
          <div className="chat-input-area">
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
              disabled={sending || !input.trim()}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  )
}
