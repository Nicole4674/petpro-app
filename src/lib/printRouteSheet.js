// =============================================================================
// printRouteSheet.js — printable backup of today's mobile route.
// =============================================================================
// Generates a clean, print-friendly HTML page showing the day's stops in
// the order the groomer plans to drive them. Used by the Route page's
// "🖨️ Print" button.
//
// Why print?
//   • Phone dies mid-route → paper backup with addresses + phone numbers
//   • Some clients prefer a callback if running late, want a phone list
//   • Easy to hand to a helper or apprentice
//
// Pattern matches printDailySheet.js:
//   • Opens a new browser window
//   • Writes formatted HTML with print CSS
//   • The page has a "🖨️ Print this page" button at the top (hidden on print)
//   • User triggers Cmd/Ctrl+P or the on-page button to print
// =============================================================================

import { formatPhone } from './phone'

// "9:00 AM" from "09:00:00"
function fmtTime(t) {
  if (!t) return ''
  var parts = String(t).split(':')
  var h = parseInt(parts[0], 10)
  var m = (parts[1] || '00').slice(0, 2)
  var ampm = h >= 12 ? 'PM' : 'AM'
  var h12 = h % 12 || 12
  return h12 + ':' + m + ' ' + ampm
}

// Today as "Saturday, May 2, 2026"
function fmtDateToday() {
  var d = new Date()
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  var months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
}

// "X min" or "X hr Y min"
function fmtDriveTime(seconds) {
  if (!seconds || seconds < 0) return ''
  var mins = Math.round(seconds / 60)
  if (mins < 60) return mins + ' min'
  var hrs = Math.floor(mins / 60)
  var rem = mins - hrs * 60
  return hrs + ' hr' + (rem > 0 ? ' ' + rem + ' min' : '')
}

function escapeHtml(s) {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Pretty label for the type of stop
function stopTypeLabel(type) {
  if (type === 'boarding_pickup')  return '🏠 Boarding Pick-up'
  if (type === 'boarding_dropoff') return '🏠 Boarding Drop-off'
  return '✂️ Grooming'
}

/**
 * Generate + open the printable route sheet.
 *
 * @param {Array}  stops    — array of stop objects from Route.jsx (in display order)
 * @param {Object} opts     — { shopName, isOptimized, savedSeconds }
 */
export function printRouteSheet(stops, opts) {
  opts = opts || {}
  var shopName = opts.shopName || 'Today\'s Route'
  var isOptimized = !!opts.isOptimized
  var savedSeconds = opts.savedSeconds || 0

  var win = window.open('', '_blank', 'width=900,height=900')
  if (!win) {
    alert('Could not open print window — please allow pop-ups for this site.')
    return
  }

  var html = ''
  html += '<!DOCTYPE html><html><head><meta charset="UTF-8">'
  html += '<title>Route — ' + escapeHtml(fmtDateToday()) + '</title>'
  html += '<style>'
  html += 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 24px; }'
  html += 'h1 { font-size: 22px; margin: 0 0 4px; }'
  html += '.meta { color: #4b5563; font-size: 13px; margin-bottom: 4px; }'
  html += '.optimized-banner { display: inline-block; padding: 4px 10px; background: #dcfce7; color: #166534; border: 1px solid #86efac; border-radius: 6px; font-size: 12px; font-weight: 700; margin-bottom: 12px; }'
  html += '.stop { display: flex; gap: 14px; padding: 14px 0; border-top: 1px solid #d1d5db; page-break-inside: avoid; }'
  html += '.stop-num { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; background: #1f2937; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; }'
  html += '.stop-body { flex: 1; min-width: 0; }'
  html += '.stop-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }'
  html += '.stop-time { font-weight: 800; font-size: 15px; color: #111827; }'
  html += '.stop-type { font-size: 12px; color: #6b7280; font-weight: 600; }'
  html += '.stop-client { font-size: 14px; color: #1f2937; margin-bottom: 2px; }'
  html += '.stop-pet { font-weight: 700; }'
  html += '.stop-service { font-size: 12px; color: #6b7280; margin-bottom: 4px; }'
  html += '.stop-address { font-size: 13px; color: #1f2937; margin-bottom: 2px; }'
  html += '.stop-phone { font-size: 13px; color: #4b5563; margin-bottom: 2px; }'
  html += '.stop-notes { font-size: 12px; color: #92400e; background: #fef9c3; border: 1px solid #fde047; padding: 4px 8px; border-radius: 4px; margin-top: 4px; }'
  html += '.empty { color: #9ca3af; font-style: italic; padding: 24px 0; text-align: center; }'
  html += '@media print { body { margin: 14px; } .no-print { display: none; } }'
  html += '.print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 18px; background: #7c3aed; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13px; }'
  html += '</style></head><body>'

  html += '<button class="print-btn no-print" onclick="window.print()">🖨️ Print this page</button>'

  html += '<h1>📍 ' + escapeHtml(shopName) + ' — Route Sheet</h1>'
  html += '<div class="meta">' + escapeHtml(fmtDateToday()) + ' · <strong>' + (stops || []).length + ' stop' + ((stops || []).length === 1 ? '' : 's') + '</strong></div>'

  if (isOptimized && savedSeconds > 0) {
    html += '<div class="optimized-banner">🧠 Route optimized — saves ~' + fmtDriveTime(savedSeconds) + ' of drive time</div>'
  }

  if (!stops || stops.length === 0) {
    html += '<div class="empty">No stops today. Enjoy the day off! 🌤️</div>'
  } else {
    stops.forEach(function (s, i) {
      html += '<div class="stop">'
      html += '<div class="stop-num">' + (i + 1) + '</div>'
      html += '<div class="stop-body">'
      html += '<div class="stop-head">'
      html += '<span class="stop-time">' + escapeHtml(s.timeLabel || fmtTime(s.time)) + '</span>'
      html += '<span class="stop-type">' + stopTypeLabel(s.type) + '</span>'
      html += '</div>'

      // Client + pet + service line
      if (s.clientName) {
        html += '<div class="stop-client">'
        if (s.petName) html += '<span class="stop-pet">' + escapeHtml(s.petName) + '</span> · '
        html += escapeHtml(s.clientName)
        html += '</div>'
      }
      if (s.serviceName) {
        html += '<div class="stop-service">' + escapeHtml(s.serviceName) + '</div>'
      }

      // Address + phone — most useful when phone dies and you need a paper backup
      if (s.address) {
        html += '<div class="stop-address">📍 ' + escapeHtml(s.address) + '</div>'
      }
      if (s.phone) {
        html += '<div class="stop-phone">📞 ' + escapeHtml(formatPhone(s.phone)) + '</div>'
      }

      // Address notes — gate codes, parking tips. Highlighted yellow because
      // these are the things a groomer NEEDS at the doorstep.
      if (s.addressNotes) {
        html += '<div class="stop-notes">📍 ' + escapeHtml(s.addressNotes) + '</div>'
      }

      html += '</div>'  // .stop-body
      html += '</div>'  // .stop
    })
  }

  html += '<div class="meta" style="margin-top:24px;border-top:1px solid #d1d5db;padding-top:8px;font-size:11px;color:#9ca3af;">'
  html += 'Printed from PetPro · ' + new Date().toLocaleString('en-US')
  html += '</div>'

  html += '</body></html>'

  win.document.open()
  win.document.write(html)
  win.document.close()
  // Note: we DON'T auto-trigger window.print() because some browsers block it
  // when called immediately after open(). User clicks the purple button instead.
}
