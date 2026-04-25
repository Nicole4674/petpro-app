// ============================================================================
// BreedPicker.jsx — Type-to-filter breed dropdown with custom-breed fallback
// ============================================================================
// Drop-in replacement for a plain breed text input. Type to filter the list,
// click a breed to select. If what they want isn't there, they can use
// whatever they typed as a custom breed (one click).
//
// Usage:
//   import BreedPicker from '../components/BreedPicker'
//   import { ALL_BREEDS, DOG_BREEDS, CAT_BREEDS } from '../lib/breeds'
//
//   <BreedPicker
//     value={breed}
//     onChange={setBreed}
//     breeds={DOG_BREEDS}        // or ALL_BREEDS / CAT_BREEDS
//     placeholder="Search or type a breed..."
//     required
//   />
// ============================================================================
import { useState, useEffect, useRef, useMemo } from 'react'
import { ALL_BREEDS } from '../lib/breeds'

export default function BreedPicker({
  value,
  onChange,
  breeds,
  placeholder,
  required,
  disabled,
  inputStyle,
}) {
  const list = breeds || ALL_BREEDS
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(value || '')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Keep the visible text in sync if parent changes the value externally
  // (e.g. resetting the form, switching pets, "Edit" prefilling)
  useEffect(() => {
    setSearch(value || '')
  }, [value])

  // Click outside the picker → close the dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Filter the master list against what they've typed (case-insensitive)
  const filteredBreeds = useMemo(() => {
    const term = (search || '').toLowerCase().trim()
    if (!term) return list
    return list.filter(function (b) { return b.toLowerCase().includes(term) })
  }, [search, list])

  // True if the typed text is an EXACT match for an existing breed
  // (so we don't show the "Use as custom breed" footer redundantly)
  const exactMatch = useMemo(() => {
    const term = (search || '').toLowerCase().trim()
    if (!term) return false
    return list.some(function (b) { return b.toLowerCase() === term })
  }, [search, list])

  function handleSelect(breed) {
    setSearch(breed)
    onChange(breed)
    setOpen(false)
    // unfocus so they can move on
    if (inputRef.current) inputRef.current.blur()
  }

  function handleTyping(e) {
    const v = e.target.value
    setSearch(v)
    // Bubble up immediately — whatever they've typed IS the value until they
    // pick something. That way submit-without-clicking still saves the typed
    // text as a custom breed.
    onChange(v)
    if (!open) setOpen(true)
  }

  const baseInputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: '16px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    background: disabled ? '#f9fafb' : '#fff',
    color: '#111827',
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={handleTyping}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        placeholder={placeholder || 'Search or type a breed...'}
        required={required}
        disabled={disabled}
        autoComplete="off"
        style={Object.assign({}, baseInputStyle, inputStyle || {})}
      />

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: '280px',
            overflowY: 'auto',
            zIndex: 50,
          }}
        >
          {filteredBreeds.length > 0 ? (
            filteredBreeds.map(function (b) {
              const isSelected = (search || '').trim().toLowerCase() === b.toLowerCase()
              return (
                <div
                  key={b}
                  onMouseDown={function (e) { e.preventDefault() /* keep input focused while clicking */ }}
                  onClick={function () { handleSelect(b) }}
                  style={{
                    padding: '9px 14px',
                    fontSize: '14px',
                    color: '#111827',
                    cursor: 'pointer',
                    background: isSelected ? '#f3e8ff' : 'transparent',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                  onMouseEnter={function (e) { e.currentTarget.style.background = '#faf5ff' }}
                  onMouseLeave={function (e) { e.currentTarget.style.background = isSelected ? '#f3e8ff' : 'transparent' }}
                >
                  {b}
                </div>
              )
            })
          ) : (
            <div style={{ padding: '12px 14px', color: '#6b7280', fontSize: '13px', fontStyle: 'italic' }}>
              No breeds match "{search}"
            </div>
          )}

          {/* Custom-breed footer — only shows when they've typed something
              that isn't an exact match for an existing breed. One click
              accepts their typed text as the breed. */}
          {(search || '').trim() && !exactMatch && (
            <div
              onMouseDown={function (e) { e.preventDefault() }}
              onClick={function () { handleSelect(search.trim()) }}
              style={{
                padding: '11px 14px',
                fontSize: '14px',
                color: '#7c3aed',
                cursor: 'pointer',
                background: '#faf5ff',
                borderTop: '1px solid #e5e7eb',
                fontWeight: 600,
                position: 'sticky',
                bottom: 0,
              }}
              onMouseEnter={function (e) { e.currentTarget.style.background = '#f3e8ff' }}
              onMouseLeave={function (e) { e.currentTarget.style.background = '#faf5ff' }}
            >
              + Use "{search.trim()}" as a custom breed
            </div>
          )}
        </div>
      )}
    </div>
  )
}
