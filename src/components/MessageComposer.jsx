import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function MessageComposer({ onSend, disabled }) {
  var [text, setText] = useState('')
  var [attachmentUrl, setAttachmentUrl] = useState('')
  var [attachmentPreview, setAttachmentPreview] = useState('')
  var [uploading, setUploading] = useState(false)
  var [sending, setSending] = useState(false)
  var [error, setError] = useState('')
  var fileInputRef = useRef(null)

  function handleFileClick() {
    if (fileInputRef.current) fileInputRef.current.click()
  }

  async function handleFileChange(e) {
    var file = e.target.files && e.target.files[0]
    if (!file) return
    setError('')

    // Size check: 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      setError('Photo too large (max 10MB)')
      e.target.value = ''
      return
    }

    // Type check: images only
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file')
      e.target.value = ''
      return
    }

    setUploading(true)

    try {
      // Build unique filename: userId/timestamp-random.ext
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not signed in')
        setUploading(false)
        return
      }
      var ext = file.name.split('.').pop() || 'jpg'
      var fileName = user.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext

      var { error: upErr } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, file, { cacheControl: '3600', upsert: false })

      if (upErr) {
        console.error('Upload failed:', upErr)
        setError('Upload failed — try again')
        setUploading(false)
        return
      }

      // Get the public URL
      var { data: urlData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(fileName)

      setAttachmentUrl(urlData.publicUrl)
      // Show local preview while sending
      setAttachmentPreview(URL.createObjectURL(file))
    } catch (err) {
      console.error('Upload error:', err)
      setError('Upload failed — try again')
    }

    setUploading(false)
    e.target.value = ''
  }

  function removeAttachment() {
    setAttachmentUrl('')
    setAttachmentPreview('')
  }

  async function handleSend() {
    if (sending || uploading) return
    var trimmed = text.trim()
    if (!trimmed && !attachmentUrl) return

    setSending(true)
    try {
      await onSend(trimmed, attachmentUrl)
      setText('')
      setAttachmentUrl('')
      setAttachmentPreview('')
      setError('')
    } catch (err) {
      console.error('Send failed:', err)
      setError('Send failed — try again')
    }
    setSending(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  var containerStyle = {
    borderTop: '1px solid #e5e7eb',
    background: '#ffffff',
    padding: '12px',
  }

  var previewRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    padding: '6px',
    background: '#f8f9fa',
    borderRadius: '8px',
  }

  var previewImgStyle = {
    width: '60px',
    height: '60px',
    objectFit: 'cover',
    borderRadius: '6px',
  }

  var removeBtnStyle = {
    background: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '22px',
    height: '22px',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: '1',
  }

  var inputRowStyle = {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
  }

  var attachBtnStyle = {
    background: '#f1f3f5',
    border: 'none',
    borderRadius: '50%',
    width: '38px',
    height: '38px',
    cursor: uploading ? 'wait' : 'pointer',
    fontSize: '18px',
    flexShrink: 0,
    opacity: uploading ? 0.5 : 1,
  }

  var textareaStyle = {
    flex: 1,
    minHeight: '38px',
    maxHeight: '120px',
    padding: '8px 12px',
    border: '1px solid #dee2e6',
    borderRadius: '20px',
    fontSize: '15px',
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
  }

  var sendBtnStyle = {
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '38px',
    height: '38px',
    cursor: (sending || uploading || (!text.trim() && !attachmentUrl)) ? 'not-allowed' : 'pointer',
    fontSize: '18px',
    flexShrink: 0,
    opacity: (sending || uploading || (!text.trim() && !attachmentUrl)) ? 0.5 : 1,
  }

  var errorStyle = {
    color: '#dc3545',
    fontSize: '12px',
    marginBottom: '6px',
    paddingLeft: '4px',
  }

  return (
    <div style={containerStyle}>
      {error && <div style={errorStyle}>{error}</div>}

      {attachmentPreview && (
        <div style={previewRowStyle}>
          <img src={attachmentPreview} alt="preview" style={previewImgStyle} />
          <span style={{ fontSize: '13px', color: '#6c757d', flex: 1 }}>Photo attached</span>
          <button style={removeBtnStyle} onClick={removeAttachment} title="Remove">✕</button>
        </div>
      )}

      <div style={inputRowStyle}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          style={attachBtnStyle}
          onClick={handleFileClick}
          disabled={uploading || disabled}
          title="Attach photo"
        >
          {uploading ? '⏳' : '📎'}
        </button>
        <textarea
          style={textareaStyle}
          value={text}
          onChange={function (e) { setText(e.target.value) }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={sending || disabled}
        />
        <button
          style={sendBtnStyle}
          onClick={handleSend}
          disabled={sending || uploading || disabled || (!text.trim() && !attachmentUrl)}
          title="Send"
        >
          {sending ? '⏳' : '➤'}
        </button>
      </div>
    </div>
  )
}
