// =======================================================
// PetPro — Shop Settings Page
// Per-groomer branding. Reads/writes shop_settings table.
// Uploads logos to shop-logos Supabase Storage bucket.
// =======================================================
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import EnableNotifications from '../components/EnableNotifications'

export default function ShopSettings() {
  var navigate = useNavigate()
  var fileInputRef = useRef(null)

  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [uploadingLogo, setUploadingLogo] = useState(false)
  var [saved, setSaved] = useState(false)
  var [error, setError] = useState('')
  var [userId, setUserId] = useState(null)
  var [copiedLink, setCopiedLink] = useState(false)

  // Form fields
  var [shopName, setShopName] = useState('')
  var [tagline, setTagline] = useState('')
  var [phone, setPhone] = useState('')
  var [email, setEmail] = useState('')
  var [address, setAddress] = useState('')
  var [website, setWebsite] = useState('')
  var [logoUrl, setLogoUrl] = useState('')
  var [primaryColor, setPrimaryColor] = useState('#7c3aed')
  var [hours, setHours] = useState('')
  // AI toggles — tier 1 (manual / "Moe Go Mode") vs tier 2 (full AI brain)
  var [groomerAiEnabled, setGroomerAiEnabled] = useState(true)
  var [clientAiBookingEnabled, setClientAiBookingEnabled] = useState(true)

  // One-click migration: flip all existing clients from "New" to "Existing"
  var [markingExisting, setMarkingExisting] = useState(false)
  var [markedCount, setMarkedCount] = useState(null)
  var [markError, setMarkError] = useState('')

  useEffect(function () {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    setError('')
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }
      setUserId(user.id)

      var { data, error: fetchError } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('groomer_id', user.id)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (data) {
        setShopName(data.shop_name || '')
        setTagline(data.tagline || '')
        setPhone(data.phone || '')
        setEmail(data.email || '')
        setAddress(data.address || '')
        setWebsite(data.website || '')
        setLogoUrl(data.logo_url || '')
        setPrimaryColor(data.primary_color || '#7c3aed')
        setHours(data.hours || '')
        // AI toggles — default to ON if the column is missing or null (existing behavior)
        setGroomerAiEnabled(data.groomer_ai_enabled !== false)
        setClientAiBookingEnabled(data.client_ai_booking_enabled !== false)
      }
    } catch (err) {
      console.error('Error loading shop settings:', err)
      setError('Could not load settings: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogoUpload(e) {
    var file = e.target.files[0]
    if (!file) return

    // Validate file size (2 MB max)
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo file is too big. Max size: 2 MB.')
      return
    }

    // Validate file type
    var allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
    if (allowed.indexOf(file.type) === -1) {
      setError('Only PNG, JPG, WEBP, or SVG images allowed.')
      return
    }

    setUploadingLogo(true)
    setError('')
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      var fileExt = file.name.split('.').pop().toLowerCase()
      var filePath = user.id + '/logo.' + fileExt

      // Upload (upsert = overwrite if exists)
      var { error: uploadError } = await supabase.storage
        .from('shop-logos')
        .upload(filePath, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      // Get public URL with cache-buster so new logo shows immediately
      var { data: urlData } = supabase.storage
        .from('shop-logos')
        .getPublicUrl(filePath)

      var publicUrl = urlData.publicUrl + '?t=' + Date.now()
      setLogoUrl(publicUrl)
    } catch (err) {
      console.error('Logo upload failed:', err)
      setError('Logo upload failed: ' + err.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleRemoveLogo() {
    if (!confirm('Remove your shop logo?')) return
    setLogoUrl('')
  }

  function handleCopyLink() {
    if (!userId) return
    var link = window.location.origin + '/portal/signup?g=' + userId
    navigator.clipboard.writeText(link).then(function () {
      setCopiedLink(true)
      setTimeout(function () { setCopiedLink(false) }, 2000)
    }).catch(function () {
      // Fallback: select text instead
      alert('Copy failed. Link: ' + link)
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      var payload = {
        groomer_id: user.id,
        shop_name: shopName || null,
        tagline: tagline || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        website: website || null,
        logo_url: logoUrl || null,
        primary_color: primaryColor || '#7c3aed',
        hours: hours || null,
        groomer_ai_enabled: groomerAiEnabled,
        client_ai_booking_enabled: clientAiBookingEnabled,
      }

      var { error: upsertError } = await supabase
        .from('shop_settings')
        .upsert(payload, { onConflict: 'groomer_id' })

      if (upsertError) throw upsertError

      setSaved(true)
      setTimeout(function () { setSaved(false) }, 3000)
    } catch (err) {
      console.error('Save failed:', err)
      setError('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // One-click migration — flips every existing client under this groomer
  // from is_first_time=true to is_first_time=false. Anyone added after this
  // still gets is_first_time=true on creation (AddClient.jsx default).
  async function handleMarkAllExisting() {
    var ok = window.confirm(
      'Mark ALL current clients in your system as existing (not new)?\n\n' +
      'This removes the "New Client" badge from everyone already added. ' +
      'Any clients you add AFTER this will still be flagged as new.\n\n' +
      'Do this BEFORE handing out client portal logins to existing customers.'
    )
    if (!ok) return

    setMarkingExisting(true)
    setMarkError('')
    setMarkedCount(null)
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      // Flip only rows that are still flagged new, owned by this groomer
      var { data, error: updErr } = await supabase
        .from('clients')
        .update({ is_first_time: false })
        .eq('groomer_id', user.id)
        .eq('is_first_time', true)
        .select('id')

      if (updErr) throw updErr
      setMarkedCount((data || []).length)
    } catch (err) {
      console.error('Mark existing failed:', err)
      setMarkError('Could not update clients: ' + err.message)
    } finally {
      setMarkingExisting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading shop settings...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '800', color: '#111827' }}>
          🏪 Shop Settings
        </h1>
        <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>
          Your shop's branding appears on printed forms, client emails, and invoices.
        </p>
      </div>

      {/* Save status */}
      {saved && (
        <div style={{ padding: '12px 16px', background: '#d1fae5', border: '1px solid #10b981', borderRadius: '8px', color: '#065f46', marginBottom: '16px', fontWeight: '600' }}>
          ✅ Settings saved!
        </div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '8px', color: '#991b1b', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Client Portal Signup Link */}
      <div style={{ background: '#f3e8ff', border: '1px solid #c084fc', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#6b21a8', marginBottom: '6px' }}>
          🔗 Client Portal Signup Link
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#581c87' }}>
          Share this link with new clients. They sign up, verify email, and get their own portal account linked to you.
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            readOnly
            value={userId ? (window.location.origin + '/portal/signup?g=' + userId) : 'Loading...'}
            onClick={function (e) { e.target.select() }}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '13px',
              fontFamily: 'monospace',
              background: '#fff',
              boxSizing: 'border-box'
            }}
          />
          <button
            onClick={handleCopyLink}
            disabled={!userId}
            style={{
              padding: '10px 18px',
              background: copiedLink ? '#10b981' : '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: userId ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap'
            }}
          >
            {copiedLink ? '✓ Copied!' : '📋 Copy Link'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
          🔔 Notifications
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
          Get pinged when a client books, sends a message, or PetPro AI flags an appointment — even when PetPro isn't open. Turn this on in every browser you use.
        </p>
        <EnableNotifications variant="settings" userType="groomer" />
      </div>

      {/* Client Migration — one-click flip all current clients from "New" to "Existing" */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
          📇 Client Migration
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
          Switching from another system? Click below to mark <strong>all clients currently in PetPro</strong> as existing.
          This removes the "New Client" badge for everyone already in your system. <strong>Anyone added AFTER this click</strong> will still be flagged as new.
        </p>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
          Tip: click this BEFORE you hand out client portal logins to existing customers.
        </p>

        <button
          type="button"
          onClick={handleMarkAllExisting}
          disabled={markingExisting}
          style={{
            padding: '10px 18px',
            background: markingExisting ? '#9ca3af' : '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '700',
            fontSize: '14px',
            cursor: markingExisting ? 'wait' : 'pointer'
          }}
        >
          {markingExisting ? 'Marking…' : '✓ Mark all current clients as existing'}
        </button>

        {markedCount !== null && !markError && (
          <div style={{ marginTop: '12px', padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', fontSize: '13px', color: '#047857', fontWeight: '600' }}>
            ✓ Done — {markedCount} client{markedCount === 1 ? '' : 's'} marked as existing.
          </div>
        )}
        {markError && (
          <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#b91c1c', fontWeight: '600' }}>
            {markError}
          </div>
        )}
      </div>

      {/* AI Features — tier 1 / tier 2 master toggles */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
          🤖 AI Features
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
          Turn PetPro AI on or off per feature. Flip both off = <strong style={{ color: '#7c3aed' }}>Classic Mode 🐾</strong> (pure manual booking).
        </p>

        <Toggle
          label="Groomer AI Chat"
          description="Voice booking + ask-anything PetPro AI on your Dashboard. Off = no chat widget, pure manual calendar."
          value={groomerAiEnabled}
          onChange={setGroomerAiEnabled}
        />
        <Toggle
          label="Client Self-Booking (AI)"
          description="The PetPro AI chat bubble in your client portal. Off = no bubble at all — clients can only message you directly or call the shop."
          value={clientAiBookingEnabled}
          onChange={setClientAiBookingEnabled}
        />

        {(!groomerAiEnabled && !clientAiBookingEnabled) && (
          <div style={{ marginTop: '14px', padding: '10px 14px', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '8px', fontSize: '13px', color: '#6d28d9', fontWeight: '600' }}>
            🐾 Classic Mode activated — pure manual booking, no AI anywhere.
          </div>
        )}
      </div>

      {/* Logo upload */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <label style={{ fontWeight: '700', fontSize: '14px', color: '#374151', display: 'block', marginBottom: '12px' }}>
          Shop Logo
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {/* Logo preview */}
          <div style={{
            width: '120px',
            height: '120px',
            border: '2px dashed #d1d5db',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f9fafb',
            overflow: 'hidden'
          }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Shop logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '40px' }}>🏪</span>
            )}
          </div>

          {/* Upload controls */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={function () { fileInputRef.current && fileInputRef.current.click() }}
              disabled={uploadingLogo}
              style={{
                padding: '10px 18px',
                background: '#7c3aed',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: uploadingLogo ? 'wait' : 'pointer',
                marginRight: '8px'
              }}
            >
              {uploadingLogo ? 'Uploading...' : (logoUrl ? 'Replace Logo' : 'Upload Logo')}
            </button>
            {logoUrl && (
              <button
                onClick={handleRemoveLogo}
                style={{
                  padding: '10px 18px',
                  background: '#fff',
                  color: '#ef4444',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Remove
              </button>
            )}
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#6b7280' }}>
              PNG, JPG, WEBP, or SVG. Max 2 MB. Square logos look best.
            </p>
          </div>
        </div>
      </div>

      {/* Shop Identity */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
          Shop Identity
        </div>

        <Field label="Shop Name *" value={shopName} onChange={setShopName} placeholder="e.g. Paws & Claws Grooming" />
        <Field label="Tagline" value={tagline} onChange={setTagline} placeholder="e.g. Luxury grooming since 2018" />
        <Field label="Brand Color" type="color" value={primaryColor} onChange={setPrimaryColor} />
      </div>

      {/* Contact Info */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
          Contact Info
        </div>

        <Field label="Phone" value={phone} onChange={setPhone} placeholder="(555) 123-4567" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="shop@example.com" type="email" />
        <Field label="Website" value={website} onChange={setWebsite} placeholder="https://yourshop.com" />
        <TextArea label="Address" value={address} onChange={setAddress} placeholder="123 Main St, City, State 12345" />
        <TextArea label="Hours" value={hours} onChange={setHours} placeholder="Mon–Sat 8am–6pm, Closed Sundays" />
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          onClick={function () { navigate(-1) }}
          style={{
            padding: '12px 24px',
            background: '#fff',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 24px',
            background: saving ? '#9ca3af' : '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '700',
            cursor: saving ? 'wait' : 'pointer'
          }}
        >
          {saving ? 'Saving...' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  )
}

// ─── Helper components ────────────────────────────────────
function Field({ label, value, onChange, placeholder, type }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
        {label}
      </label>
      <input
        type={type || 'text'}
        value={value}
        onChange={function (e) { onChange(e.target.value) }}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          fontSize: '14px',
          boxSizing: 'border-box',
          height: type === 'color' ? '44px' : 'auto'
        }}
      />
    </div>
  )
}

// Toggle switch — green when ON, gray when OFF. Used for AI feature flags.
function Toggle({ label, description, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#111827', marginBottom: '2px' }}>
          {label}
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.4' }}>
          {description}
        </div>
      </div>
      <button
        type="button"
        onClick={function () { onChange(!value) }}
        role="switch"
        aria-checked={value}
        aria-label={label}
        style={{
          position: 'relative',
          width: '52px',
          height: '28px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          background: value ? '#10b981' : '#d1d5db',
          flexShrink: 0,
          transition: 'background 0.15s',
          padding: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: value ? '27px' : '3px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transition: 'left 0.15s',
          }}
        />
      </button>
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={function (e) { onChange(e.target.value) }}
        placeholder={placeholder}
        rows={2}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          fontSize: '14px',
          boxSizing: 'border-box',
          resize: 'vertical',
          fontFamily: 'inherit'
        }}
      />
    </div>
  )
}
