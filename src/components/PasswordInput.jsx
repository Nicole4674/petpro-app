// PasswordInput.jsx — a text field with a show/hide eyeball toggle.
// Pure front-end (no Supabase). Drop-in replacement for <input type="password">.
// Forwards standard props; onChange receives the native event like a normal input.
import { useState } from 'react'

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  className,
  style,
  required,
  minLength,
  autoComplete,
  id,
  name,
}) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        id={id}
        name={name}
        style={Object.assign({ width: '100%', boxSizing: 'border-box' }, style || {}, { paddingRight: '44px' })}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
          padding: '4px',
          color: '#6b7280',
        }}
      >{show ? '🙈' : '👁️'}</button>
    </div>
  )
}
