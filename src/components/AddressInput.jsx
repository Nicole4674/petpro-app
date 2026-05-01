// =============================================================================
// AddressInput.jsx — drop-in replacement for <input> on address fields.
// =============================================================================
// Wraps a normal text input with Google Places Autocomplete. As the user
// types, a dropdown of real Google addresses appears. When they pick one we
// hand the parent { address, latitude, longitude } in one shot — no separate
// geocoding needed later.
//
// Why this matters:
//   • Clients/groomers always end up with cleanly-formatted addresses
//   • Coords come back instantly with the address — store both at once
//   • Eliminates "13623 barons lake in cypress tx" garbage that breaks routing
//
// Usage:
//   <AddressInput
//     value={form.address}
//     onChange={(addr) => setForm({ ...form, address: addr })}     // typing
//     onSelect={({ address, latitude, longitude }) => {           // pick
//       setForm({ ...form, address, latitude, longitude })
//     }}
//     placeholder="Start typing the address..."
//     style={{ ... }}
//   />
//
// Falls back to a plain text input if the Google Maps script fails to load
// (offline, API key missing, etc.) — never blocks the user from typing.
// =============================================================================
import { useState, useRef } from 'react'
import { useLoadScript, Autocomplete } from '@react-google-maps/api'

// Libraries needed for Places Autocomplete to work.
// Defining the array OUTSIDE the component prevents useLoadScript from
// re-loading the script on every render (it diffs by reference).
const GOOGLE_LIBRARIES = ['places']

export default function AddressInput({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Start typing the address...',
  disabled = false,
  className = '',
  style = {},
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries: GOOGLE_LIBRARIES,
  })

  const autocompleteRef = useRef(null)

  function handleLoad(autocomplete) {
    autocompleteRef.current = autocomplete
    // Restrict to US addresses for our market. Drop this if shop expands abroad.
    autocomplete.setComponentRestrictions({ country: ['us'] })
    // Tell Places we want these specific fields. Asking for fewer = cheaper
    // and faster (Google bills per field "data tier" you request).
    autocomplete.setFields(['formatted_address', 'geometry'])
  }

  function handlePlaceChanged() {
    const ac = autocompleteRef.current
    if (!ac) return
    const place = ac.getPlace()
    if (!place || !place.geometry || !place.geometry.location) {
      // User typed something not in suggestions and hit enter — keep their
      // raw text. We won't have coords for it (will be live-geocoded later
      // if/when the Route page tries to map them).
      return
    }
    const formatted = place.formatted_address || value
    const lat = place.geometry.location.lat()
    const lng = place.geometry.location.lng()
    // Fire both callbacks so parent can update its state cleanly
    if (onChange) onChange(formatted)
    if (onSelect) onSelect({ address: formatted, latitude: lat, longitude: lng })
  }

  // ─── Fallback when Google can't load ────────────────────────────────
  // No API key, blocked by network, etc. → show a plain text input so the
  // user can still type an address. We just won't have coords.
  if (!apiKey || loadError) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        style={style}
      />
    )
  }

  // Loading state — script not ready yet. Plain input so user can still type.
  if (!isLoaded) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder="Loading addresses..."
        disabled={disabled}
        className={className}
        style={style}
      />
    )
  }

  return (
    <Autocomplete onLoad={handleLoad} onPlaceChanged={handlePlaceChanged}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        style={style}
        autoComplete="off"
      />
    </Autocomplete>
  )
}
