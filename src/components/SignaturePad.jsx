// =============================================================================
// SignaturePad.jsx — drawn-signature component (canvas, no dependencies)
// =============================================================================
// Renders a small canvas the user can sign on with mouse or finger.
// Provides three controls: Clear, plus implicit "use this" via onSignature
// callback that fires whenever the drawing changes (debounced via state).
//
// Used during client signup + future booking-time waiver signing.
//
// Usage:
//   <SignaturePad
//     onSignature={(base64) => setSignature(base64)}  // fires on every stroke
//     value={signatureBase64}                          // for restoring saved sigs
//   />
// =============================================================================
import { useRef, useState, useEffect } from 'react'

export default function SignaturePad({ onSignature, value, height = 140 }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef({ x: 0, y: 0 })
  const [isEmpty, setIsEmpty] = useState(true)

  // Initialize canvas once
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Make canvas crisp on Retina
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#111827'

    // Restore previous signature if value provided
    if (value) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height)
        setIsEmpty(false)
      }
      img.src = value
    }
  }, [])  // run once

  // Translate mouse/touch event coords → canvas-local coords
  function getEventPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    let clientX, clientY
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function handleStart(e) {
    e.preventDefault()
    drawingRef.current = true
    lastPointRef.current = getEventPoint(e)
  }

  function handleMove(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const point = getEventPoint(e)
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
    setIsEmpty(false)
  }

  function handleEnd() {
    if (!drawingRef.current) return
    drawingRef.current = false
    // Emit the latest snapshot of the canvas as a base64 PNG
    if (onSignature && canvasRef.current) {
      onSignature(canvasRef.current.toDataURL('image/png'))
    }
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    if (onSignature) onSignature(null)
  }

  return (
    <div>
      <div
        style={{
          position: 'relative',
          background: '#fff',
          border: '1px dashed #9ca3af',
          borderRadius: '10px',
          height: height + 'px',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            cursor: 'crosshair',
            touchAction: 'none',  // prevent scroll while drawing on mobile
          }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
        {isEmpty && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: '13px',
            pointerEvents: 'none',
            fontStyle: 'italic',
          }}>
            ✍️ Sign with your finger or mouse here
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
        <button
          type="button"
          onClick={handleClear}
          disabled={isEmpty}
          style={{
            background: 'none',
            border: 'none',
            color: isEmpty ? '#9ca3af' : '#7c3aed',
            fontSize: '12px',
            fontWeight: 600,
            cursor: isEmpty ? 'not-allowed' : 'pointer',
            padding: '4px 8px',
          }}
        >Clear</button>
      </div>
    </div>
  )
}
