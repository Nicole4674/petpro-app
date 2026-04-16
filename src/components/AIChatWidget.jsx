import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hey! I\'m PetPro AI. Ask me anything about your schedule, clients, or pets. I\'m here to help!' }
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

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

      const { data, error } = await supabase.functions.invoke('chat-command', {
        body: {
          message: userMessage,
          groomer_id: user.id,
          history: recentHistory,
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
        <div className="chat-window">
          {/* Chat Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <span className="chat-header-dot"></span>
              <span className="chat-header-title">PetPro AI</span>
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
                  PetPro AI is typing...
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
              placeholder="Ask PetPro AI anything..."
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