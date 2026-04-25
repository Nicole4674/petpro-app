// ====================================================================
// PetPro — Behavior Tag UI components
// ====================================================================
// Two pieces:
//   <BehaviorTagsRow tags={pet.behavior_tags} compact={false} />
//     → Read-only pill row. Used on appointment popups, kennel cards,
//        and the pet profile header.
//
//   <BehaviorTagsEditor value={...} onChange={...} />
//     → Toggleable picker. Used on the pet profile.
// ====================================================================

import { BEHAVIOR_TAGS, resolveBehaviorTags, resolveHighPriorityTags } from '../lib/behaviorTags'

// Simple read-only pill row.
// Pass `compact={true}` to only show high-priority tags (for calendar tiles).
export function BehaviorTagsRow({ tags, compact, max }) {
  const resolved = compact ? resolveHighPriorityTags(tags) : resolveBehaviorTags(tags)
  if (!resolved || resolved.length === 0) return null

  const shown = max ? resolved.slice(0, max) : resolved
  const overflow = max && resolved.length > max ? resolved.length - max : 0

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: compact ? '3px' : '6px',
      marginTop: compact ? '2px' : '6px',
    }}>
      {shown.map(t => (
        <span
          key={t.key}
          title={t.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: compact ? '1px 6px' : '3px 9px',
            background: t.bg,
            color: t.color,
            border: '1px solid ' + t.color + '33',
            borderRadius: '999px',
            fontSize: compact ? '10px' : '12px',
            fontWeight: 700,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden>{t.emoji}</span>
          {!compact && <span>{t.label}</span>}
        </span>
      ))}
      {overflow > 0 && (
        <span style={{
          padding: compact ? '1px 6px' : '3px 9px',
          background: '#f3f4f6',
          color: '#4b5563',
          border: '1px solid #e5e7eb',
          borderRadius: '999px',
          fontSize: compact ? '10px' : '12px',
          fontWeight: 700,
        }}>
          +{overflow}
        </span>
      )}
    </div>
  )
}

// Editor: toggleable pills. Click to add/remove a tag.
// `value` = array of tag keys (string[])
// `onChange` = (newArray) => void
export function BehaviorTagsEditor({ value, onChange }) {
  const current = Array.isArray(value) ? value : []

  function toggle(key) {
    if (current.includes(key)) {
      onChange(current.filter(k => k !== key))
    } else {
      onChange([...current, key])
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {BEHAVIOR_TAGS.map(t => {
        const active = current.includes(t.key)
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => toggle(t.key)}
            title={t.priority === 'high' ? '🚨 High priority — shows on calendar' : 'Shows in detail views'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              background: active ? t.bg : '#fff',
              color: active ? t.color : '#6b7280',
              border: '1.5px solid ' + (active ? t.color : '#e5e7eb'),
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
          >
            <span aria-hidden>{t.emoji}</span>
            <span>{t.label}</span>
            {active && <span style={{ marginLeft: '2px' }}>✓</span>}
          </button>
        )
      })}
    </div>
  )
}
