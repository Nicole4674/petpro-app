// =============================================================================
// PetProAI.jsx — The PetPro AI chat page
// =============================================================================
// Full conversational chat UI for the lifted-guardrails PetPro AI feature.
// Calls the petpro-ai-chat edge function which has the Groomer Brain +
// Breed Reference baked in as the system prompt.
//
// Layout: ChatGPT-style — conversation list sidebar on the left,
// message thread on the right, input box at the bottom.
// =============================================================================
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PetProAI() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingConvs, setLoadingConvs] = useState(true)
  const messagesEndRef = useRef(null)

  // ─── On mount, load conversation list + verify auth ─────────────────
  useEffect(() => {
    loadConversations()
  }, [])

  // ─── When the active conversation changes, load its messages ────────
  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId)
    } else {
      setMessages([])
    }
  }, [activeConvId])

  // ─── Auto-scroll to bottom whenever messages change ─────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function loadConversations() {
    setLoadingConvs(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      navigate('/login')
      return
    }
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id, title, last_message_at')
      .eq('groomer_id', user.id)
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false })
    if (error) console.error('[PetProAI] loadConversations error:', error)
    setConversations(data || [])
    setLoadingConvs(false)
  }

  async function loadMessages(convId) {
    const { data, error } = await supabase
      .from('ai_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    if (error) console.error('[PetProAI] loadMessages error:', error)
    setMessages(data || [])
  }

  async function handleSend(e) {
    if (e) e.preventDefault()
    const userMessage = input.trim()
    if (!userMessage || sending) return

    setInput('')
    setSending(true)

    // Optimistically show the user's message right away
    const tempUserMsg = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const { data, error } = await supabase.functions.invoke('petpro-ai-chat', {
        body: {
          conversation_id: activeConvId,
          message: userMessage,
        },
      })

      if (error) throw new Error(error.message || 'Edge function error')
      if (data?.error) throw new Error(data.error)

      // If this was a brand-new conversation, capture the new ID
      const newConvId = data.conversation_id
      if (!activeConvId && newConvId) {
        setActiveConvId(newConvId)
        loadConversations() // refresh sidebar to show the new conversation
      }

      // Reload messages from DB so we get real IDs + the AI reply
      await loadMessages(newConvId)
    } catch (err) {
      console.error('[PetProAI] send error:', err)
      alert('Could not send message: ' + (err.message || 'unknown error'))
      // Remove the optimistic user message since send failed
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
      // Restore the input so they don't lose what they typed
      setInput(userMessage)
    } finally {
      setSending(false)
    }
  }

  function startNewConversation() {
    setActiveConvId(null)
    setMessages([])
    setInput('')
  }

  // Suggested starter prompts shown on the empty state
  const SUGGESTED_PROMPTS = [
    "What should I do with a matted goldendoodle?",
    "Help me write an Instagram post for slow Tuesday",
    "Client says I gave their dog a hot spot — what do I say?",
    "How do I handle a screaming husky on the table?",
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f9fafb' }}>
      {/* ─── Sidebar — Conversations ─────────────────────────────── */}
      <div style={{
        width: '260px',
        background: '#fff',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: '14px', borderBottom: '1px solid #e5e7eb' }}>
          <button
            onClick={startNewConversation}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + New chat
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loadingConvs ? (
            <div style={{ padding: '12px', color: '#9ca3af', fontSize: '13px' }}>
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '12px', color: '#9ca3af', fontSize: '13px', lineHeight: 1.5 }}>
              No chats yet. Start one above! 👆
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                style={{
                  padding: '10px 12px',
                  marginBottom: '4px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: activeConvId === conv.id ? '#f3e8ff' : 'transparent',
                  fontSize: '13px',
                  color: activeConvId === conv.id ? '#5b21b6' : '#374151',
                  fontWeight: activeConvId === conv.id ? 600 : 400,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={conv.title}
              >
                {conv.title}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── Main chat area ─────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h1 style={{ margin: 0, fontSize: '18px', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🤖</span> PetPro AI
          </h1>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#374151',
            }}
          >
            ← Dashboard
          </button>
        </div>

        {/* Messages or empty state */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          background: '#f9fafb',
        }}>
          {messages.length === 0 && !sending ? (
            <div style={{ maxWidth: '600px', margin: '60px auto', textAlign: 'center' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🤖</div>
              <h2 style={{ fontSize: '24px', margin: '0 0 8px', color: '#111827' }}>
                Hey! I'm PetPro AI
              </h2>
              <p style={{ color: '#6b7280', lineHeight: 1.6, fontSize: '14px' }}>
                Your always-on grooming friend. Ask me anything — tough clients,
                breed-specific cuts, marketing ideas, payroll math, dog photos.
                I'm here to help.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px',
                marginTop: '28px',
              }}>
                {SUGGESTED_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => setInput(prompt)}
                    style={{
                      padding: '12px',
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#374151',
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb' }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: '750px', margin: '0 auto' }}>
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {sending && (
                <div style={{
                  padding: '12px 16px',
                  marginBottom: '12px',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  maxWidth: '80%',
                  color: '#6b7280',
                  fontSize: '14px',
                  fontStyle: 'italic',
                }}>
                  PetPro AI is thinking...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <form
          onSubmit={handleSend}
          style={{
            padding: '14px 20px',
            background: '#fff',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <div style={{
            maxWidth: '750px',
            margin: '0 auto',
            display: 'flex',
            gap: '8px',
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                // Enter to send, Shift+Enter for newline
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask PetPro AI anything..."
              disabled={sending}
              rows={1}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                maxHeight: '160px',
                outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = '#7c3aed' }}
              onBlur={e => { e.target.style.borderColor = '#d1d5db' }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              style={{
                padding: '10px 22px',
                background: sending || !input.trim() ? '#d1d5db' : '#7c3aed',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                fontSize: '14px',
              }}
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
          <div style={{
            maxWidth: '750px',
            margin: '8px auto 0',
            fontSize: '11px',
            color: '#9ca3af',
            textAlign: 'center',
          }}>
            PetPro AI can make mistakes. Always use professional judgment for
            anything safety-critical.
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Single message bubble ──────────────────────────────────────────────
function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '12px',
    }}>
      <div style={{
        maxWidth: '80%',
        padding: '12px 16px',
        background: isUser ? '#7c3aed' : '#fff',
        color: isUser ? '#fff' : '#111827',
        border: isUser ? 'none' : '1px solid #e5e7eb',
        borderRadius: '12px',
        fontSize: '14px',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: isUser ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
      }}>
        {message.content}
      </div>
    </div>
  )
}
