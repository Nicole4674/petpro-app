// =======================================================
// PetPro — Contact Us Page
// Lets PetPro users email feature requests, bugs, questions
// directly to nicole@trypetpro.com via their own email client.
// Uses mailto: so no backend email service is needed.
// =======================================================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Contact() {
  var [loading, setLoading] = useState(true)
  var [name, setName] = useState('')
  var [email, setEmail] = useState('')
  var [subject, setSubject] = useState('Feature Request')
  var [message, setMessage] = useState('')
  var [sent, setSent] = useState(false)

  // Pre-fill name + email from the logged-in user so they don't have to retype
  useEffect(function () {
    async function loadUser() {
      try {
        var { data } = await supabase.auth.getUser()
        var user = data && data.user
        if (user) {
          setEmail(user.email || '')
          // Try to get their name from user_metadata (set at signup)
          var meta = user.user_metadata || {}
          var firstName = meta.first_name || meta.firstName || ''
          var lastName = meta.last_name || meta.lastName || ''
          var fullName = (firstName + ' ' + lastName).trim()
          if (fullName) setName(fullName)
        }
      } catch (err) {
        // Silently fail — user can type their name/email themselves
      } finally {
        setLoading(false)
      }
    }
    loadUser()
  }, [])

  var handleSend = function (e) {
    e.preventDefault()

    // Build a mailto: link that pre-fills their email client
    var mailSubject = '[PetPro ' + subject + '] from ' + (name || 'a PetPro user')
    var mailBody =
      'Name: ' + name + '\n' +
      'Email: ' + email + '\n' +
      'Subject: ' + subject + '\n' +
      '\n' +
      '------ Message ------\n' +
      message + '\n'

    var mailto =
      'mailto:nicole@trypetpro.com' +
      '?subject=' + encodeURIComponent(mailSubject) +
      '&body=' + encodeURIComponent(mailBody)

    // Open the user's default email client with the form pre-filled
    window.location.href = mailto
    setSent(true)
  }

  var handleNewMessage = function () {
    setSent(false)
    setSubject('Feature Request')
    setMessage('')
  }

  // ----- Styles -----
  var pageStyle = {
    padding: '40px',
    maxWidth: '720px',
    margin: '0 auto',
  }
  var headerStyle = {
    marginBottom: '8px',
    fontSize: '32px',
    fontWeight: 700,
    color: '#1f2937',
  }
  var subheaderStyle = {
    marginBottom: '32px',
    color: '#6b7280',
    fontSize: '15px',
    lineHeight: 1.5,
  }
  var cardStyle = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  }
  var labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '6px',
    marginTop: '16px',
  }
  var inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    background: '#fff',
    color: '#1f2937',
    boxSizing: 'border-box',
  }
  var textareaStyle = Object.assign({}, inputStyle, {
    minHeight: '160px',
    resize: 'vertical',
    fontFamily: 'inherit',
  })
  var buttonStyle = {
    marginTop: '24px',
    width: '100%',
    padding: '14px',
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
  }
  var successStyle = {
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: '8px',
    padding: '20px',
    color: '#065f46',
    textAlign: 'center',
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <h1 style={headerStyle}>💬 Contact PetPro</h1>
      <p style={subheaderStyle}>
        Have a feature request, found a bug, or have a question? Send us a message and we'll
        get back to you as soon as possible. When you click Send, your email app will open
        with your message ready to send.
      </p>

      {sent ? (
        <div style={cardStyle}>
          <div style={successStyle}>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>✅ Email Ready to Send</h2>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Your email app should have opened with the message filled in.
              Click <strong>Send</strong> in your email app to deliver it to nicole@trypetpro.com.
            </p>
          </div>
          <button
            onClick={handleNewMessage}
            style={Object.assign({}, buttonStyle, { background: '#6b7280' })}
          >
            Send Another Message
          </button>
        </div>
      ) : (
        <form onSubmit={handleSend} style={cardStyle}>
          <label style={Object.assign({}, labelStyle, { marginTop: 0 })}>Your Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={function (e) { setName(e.target.value) }}
            style={inputStyle}
            placeholder="Jane Smith"
          />

          <label style={labelStyle}>Your Email *</label>
          <input
            type="email"
            required
            value={email}
            onChange={function (e) { setEmail(e.target.value) }}
            style={inputStyle}
            placeholder="you@example.com"
          />

          <label style={labelStyle}>Subject *</label>
          <select
            value={subject}
            onChange={function (e) { setSubject(e.target.value) }}
            style={inputStyle}
          >
            <option value="Feature Request">Feature Request</option>
            <option value="Bug">Bug</option>
            <option value="Question">Question</option>
            <option value="Other">Other</option>
          </select>

          <label style={labelStyle}>Message *</label>
          <textarea
            required
            value={message}
            onChange={function (e) { setMessage(e.target.value) }}
            style={textareaStyle}
            placeholder="Tell us what's on your mind..."
          />

          <button type="submit" style={buttonStyle}>
            Send Message
          </button>

          <p style={{ marginTop: '16px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
            Clicking Send will open your email app with this message pre-filled.
            You'll still need to hit Send in your email app.
          </p>
        </form>
      )}
    </div>
  )
}
