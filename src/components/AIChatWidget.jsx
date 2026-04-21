import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hey! I\'m PetPro AI. Ask me anything about your schedule, clients, or pets. I\'m here to help!' }
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [adminMode, setAdminMode] = useState(false)
  const [migrationMode, setMigrationMode] = useState(false)
  const [pendingImages, setPendingImages] = useState([]) // [{ name, data, media_type, preview }]
  const fileInputRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  // Classic Mode: hide widget if groomer_ai_enabled is OFF in shop_settings.
  // Starts as null (unknown) so we don't flash the widget before the check resolves.
  const [aiEnabled, setAiEnabled] = useState(null)

  // Check the toggle on mount — reads shop_settings.groomer_ai_enabled for the current user
  useEffect(function () {
    var cancelled = false
    async function checkToggle() {
      try {
        var { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (!cancelled) setAiEnabled(false); return }
        var { data } = await supabase
          .from('shop_settings')
          .select('groomer_ai_enabled')
          .eq('groomer_id', user.id)
          .maybeSingle()
        if (cancelled) return
        // If no row yet OR column is null/true → show the widget (default on)
        // Only hide if explicitly set to false (Classic Mode)
        setAiEnabled(!data || data.groomer_ai_enabled !== false)
      } catch (e) {
        // On any error, fail open — keep AI visible so groomer isn't accidentally locked out
        if (!cancelled) setAiEnabled(true)
      }
    }
    checkToggle()
    return function () { cancelled = true }
  }, [])

  // Listen for 'petpro:start-migration' custom event (dispatched from /import page button)
  // and auto-open the widget in migration mode.
  useEffect(function () {
    function handleStartMigration() {
      setIsOpen(true)
      setMigrationMode(true)
      setMessages([
        { role: 'assistant', text: 'Hey! I\'m going to help you move your shop over — this is the easy part, promise. Quick question to start: what software (or system) are you coming from? Moe Go, Gingr, Pawfinity, paper notebook, spreadsheet — whatever it is, I can work with it.' }
      ])
    }
    window.addEventListener('petpro:start-migration', handleStartMigration)
    return function () {
      window.removeEventListener('petpro:start-migration', handleStartMigration)
    }
  }, [])

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
      var saved = localStorage.getItem('petpro_groomer_chat_pos')
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
    var widgetEl = e.currentTarget.parentElement // .chat-window
    if (widgetEl) {
      var rect = widgetEl.getBoundingClientRect()
      widgetSizeRef.current = { w: rect.width, h: rect.height }
      dragOffsetRef.current = { x: point.x - rect.left, y: point.y - rect.top }
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

  // Persist position whenever it settles
  useEffect(() => {
    if (!dragging && position) {
      try { localStorage.setItem('petpro_groomer_chat_pos', JSON.stringify(position)) } catch (e) { /* ignore */ }
    }
  }, [dragging, position])

  // Re-clamp on window resize
  useEffect(() => {
    function onResize() {
      if (position) setPosition(function(p) { return p ? clampPosition(p.x, p.y) : p })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position])

  // Load saved chat from Supabase on mount
  useEffect(() => {
    async function loadChat() {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoaded(true)
        return
      }
      var { data, error } = await supabase
        .from('chat_conversations')
        .select('messages, admin_mode')
        .eq('groomer_id', user.id)
        .maybeSingle()
      if (error) {
        console.error('Chat load error:', error)
      } else if (data && data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(data.messages)
        setAdminMode(data.admin_mode || false)
      }
      setLoaded(true)
    }
    loadChat()
  }, [])

  // Save chat to Supabase whenever messages or admin mode change (after initial load)
  useEffect(() => {
    if (!loaded) return
    async function saveChat() {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      var { error } = await supabase
        .from('chat_conversations')
        .upsert({
          groomer_id: user.id,
          messages: messages,
          admin_mode: adminMode,
          updated_at: new Date().toISOString(),
        })
      if (error) console.error('Chat save error:', error)
    }
    saveChat()
  }, [messages, adminMode, loaded])

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
    // Allow sending if there's text OR pending images
    if ((!input.trim() && pendingImages.length === 0) || sending) return

    const userMessage = input.trim()
    const imagesToSend = pendingImages.slice() // snapshot
    setInput('')
    setPendingImages([])
    setSending(true)

    // Check for admin mode toggle
    var isAdminToggle = userMessage.toLowerCase().replace(/\s+/g, ' ').trim() === 'mortal ties access'
    if (isAdminToggle) {
      if (!adminMode) {
        setAdminMode(true)
        setMessages(prev => [...prev,
          { role: 'user', text: userMessage },
          { role: 'assistant', text: 'Admin mode activated. Full access unlocked - ask me anything about how PetPro works, debugging, features, architecture, or anything else. Say "business mode" to switch back.' }
        ])
        setSending(false)
        return
      }
    }

    // Check for switching back to business mode (works for admin AND migration mode)
    var lowerMsg = userMessage.toLowerCase().trim()
    if ((adminMode || migrationMode) && (lowerMsg === 'business mode' || lowerMsg === 'done with migration' || lowerMsg === 'exit migration')) {
      setAdminMode(false)
      setMigrationMode(false)
      setMessages(prev => [...prev,
        { role: 'user', text: userMessage },
        { role: 'assistant', text: 'Got it! I\'m back to your regular assistant. Say \'help me migrate\' anytime to come back to migration mode.' }
      ])
      setSending(false)
      return
    }

    // Detect "help me migrate" / "start migration" phrases — flip INTO migration mode
    var migrationTriggers = [
      'help me migrate', 'start migration', 'migrate my', 'migration mode',
      'im switching from', "i'm switching from", 'switching from moego',
      'switching from gingr', 'switching from pawfinity', 'import my clients',
      'import my business', 'move from moego', 'move from gingr'
    ]
    var shouldTriggerMigration = !migrationMode && migrationTriggers.some(function (t) { return lowerMsg.indexOf(t) !== -1 })
    if (shouldTriggerMigration) {
      setMigrationMode(true)
      // Still continue to send the message below with migration_mode: true
    }

    // Add user message to chat (show image previews inline)
    setMessages(prev => [...prev, {
      role: 'user',
      text: userMessage || '(sent an image)',
      images: imagesToSend.map(function (img) { return img.preview })
    }])

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Build conversation history (last 10 exchanges)
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
      // Keep only last 10 exchanges
      const recentHistory = history.slice(-10)

      // Strip the preview field before sending — only send { media_type, data } to the edge function
      var imagesPayload = imagesToSend.map(function (img) {
        return { media_type: img.media_type, data: img.data }
      })

      const { data, error } = await supabase.functions.invoke('chat-command', {
        body: {
          message: userMessage,
          groomer_id: user.id,
          history: recentHistory,
          admin_mode: adminMode,
          migration_mode: migrationMode || shouldTriggerMigration || false,
          images: imagesPayload.length > 0 ? imagesPayload : undefined,
        },
      })

      if (error) {
        console.error('Chat error:', error)
        setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I had trouble with that. Try again!' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.text }])
      }
    } catch (err) {
      console.error('Chat failed:', err)
      setMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Try again!' }])
    }

    setSending(false)
  }

  // Handle file picker — converts images to base64 and adds to pendingImages
  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    var newImages = []
    for (var file of files) {
      // Only images — Claude API supports jpeg/png/gif/webp
      if (!file.type.startsWith('image/')) {
        alert('Only image files are supported right now (jpg, png, webp, heic). For PDFs, screenshot the page first.')
        continue
      }
      // 5MB limit per image to stay well under edge function request size limits
      if (file.size > 5 * 1024 * 1024) {
        alert(file.name + ' is too large (max 5MB per image).')
        continue
      }
      // Convert to base64
      try {
        var base64 = await new Promise(function (resolve, reject) {
          var reader = new FileReader()
          reader.onload = function () {
            // reader.result is "data:image/jpeg;base64,XXXX" — strip the prefix
            var result = reader.result
            var commaIdx = result.indexOf(',')
            resolve(result.substring(commaIdx + 1))
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        var mediaType = file.type
        // Normalize heic/heif to jpeg-compatible media type if browser can't handle it natively
        if (mediaType === 'image/heic' || mediaType === 'image/heif') {
          mediaType = 'image/jpeg' // Claude treats this as a best-effort read
        }
        newImages.push({
          name: file.name,
          data: base64,
          media_type: mediaType,
          preview: 'data:' + mediaType + ';base64,' + base64,
        })
      } catch (err) {
        console.error('Failed to read image:', err)
      }
    }
    setPendingImages(prev => [...prev, ...newImages])
    // Reset the input so the same file can be picked again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePendingImage = (idx) => {
    setPendingImages(prev => prev.filter(function (_, i) { return i !== idx }))
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = async () => {
    setAdminMode(false)
    setMessages([
      { role: 'assistant', text: 'Chat cleared! What can I help you with?' }
    ])
    // Also wipe the Supabase row for a truly clean slate
    var { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('chat_conversations').delete().eq('groomer_id', user.id)
    }
  }

  // Classic Mode — render nothing if toggle is OFF (or still loading)
  // Returning null while loading avoids a quick flash of the widget before the check resolves
  if (aiEnabled !== true) return null

  return (
    <>
      {/* Chat Bubble Button */}
      {!isOpen && (
        <button className="chat-bubble-btn" onClick={() => setIsOpen(true)}>
          <span className="chat-bubble-icon">💬</span>
          <span className="chat-bubble-label">PetPro AI</span>
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
              <span className="chat-header-title">
                PetPro AI
                {adminMode ? ' (Admin)' : ''}
                {migrationMode ? ' 🤖 Migration Mode' : ''}
              </span>
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
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: msg.text ? '6px' : 0 }}>
                      {msg.images.map(function (src, k) {
                        return <img key={k} src={src} alt="attachment" style={{ maxWidth: '160px', maxHeight: '160px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.1)' }} />
                      })}
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
                  PetPro AI is typing...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pending image previews (before send) */}
          {pendingImages.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 12px 0', borderTop: '1px solid #eee' }}>
              {pendingImages.map(function (img, idx) {
                return (
                  <div key={idx} style={{ position: 'relative' }}>
                    <img src={img.preview} alt={img.name} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #ccc' }} />
                    <button
                      onClick={function () { removePendingImage(idx) }}
                      style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: '#e74c3c', color: 'white', cursor: 'pointer', fontSize: '12px', lineHeight: 1, padding: 0 }}
                      title="Remove"
                    >×</button>
                  </div>
                )
              })}
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
              onClick={function () { if (fileInputRef.current) fileInputRef.current.click() }}
              disabled={sending}
              title="Attach image (screenshot, photo, cert)"
              style={{ background: migrationMode ? '#10b981' : undefined }}
            >
              📎
            </button>
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={migrationMode ? 'Chat or drop a screenshot...' : 'Ask PetPro AI anything...'}
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
