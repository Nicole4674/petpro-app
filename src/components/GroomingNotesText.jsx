// =============================================================================
// GroomingNotesText.jsx — Color-codes pet grooming notes by author
// =============================================================================
// Pets have a free-text `grooming_notes` column that contains BOTH groomer-
// written notes AND Suds-written notes (added via the petpro-ai-chat
// add_grooming_note tool). Suds-written entries are prefixed with a marker
// like:
//
//   [May 27, 2026 · via Suds] dropped off matted, recommended pre-bath brush
//
// Entries are joined by '\n\n'. This component splits on that, and renders:
//   • Suds entries in a soft purple block with a "🦦 Suds" badge
//   • Groomer entries in default text
//
// Used on the appointment popup, client detail page, and anywhere else the
// pet's grooming notes show up. One place to fix color-coding ever.
// =============================================================================

import React from 'react'

// Matches "[anything · via Suds] " at the start of a paragraph
const SUDS_PREFIX_RE = /^\[(.+?)\s·\svia\sSuds\]\s*/

export default function GroomingNotesText({ text, compact }) {
  if (!text) return null
  const paragraphs = String(text).split(/\n{2,}/)
  return (
    <span style={{ display: 'inline' }}>
      {paragraphs.map(function (p, idx) {
        const match = p.match(SUDS_PREFIX_RE)
        if (match) {
          // Suds-written entry
          const datePart = match[1]
          const body = p.replace(SUDS_PREFIX_RE, '')
          return (
            <span
              key={idx}
              style={{
                display: 'block',
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                borderLeft: '3px solid #7c3aed',
                borderRadius: '6px',
                padding: compact ? '4px 8px' : '6px 10px',
                margin: idx === 0 ? '0 0 6px' : '6px 0',
                fontSize: compact ? '12px' : '13px',
                color: '#3b0764',
              }}
            >
              <span style={{
                display: 'inline-block',
                fontSize: '10px',
                fontWeight: 700,
                color: '#7c3aed',
                background: '#ede9fe',
                padding: '1px 6px',
                borderRadius: '999px',
                marginRight: '6px',
                verticalAlign: 'middle',
              }}>
                🦦 Suds · {datePart}
              </span>
              {body}
            </span>
          )
        }
        // Groomer-written (or legacy unmarked)
        return (
          <span
            key={idx}
            style={{
              display: 'block',
              margin: idx === 0 ? '0' : '6px 0 0',
              whiteSpace: 'pre-wrap',
            }}
          >
            {p}
          </span>
        )
      })}
    </span>
  )
}
