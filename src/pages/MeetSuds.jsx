// =============================================================================
// MeetSuds.jsx — "Meet Suds" profile page (Task #43)
// =============================================================================
// Public-facing page that introduces Suds the otter — PetPro's AI assistant.
// Linkable from marketing, Help section, and the Sidebar so both prospects
// and existing groomers can see what Suds does (and feel warm + curious
// about it).
//
// Tone is friendly + a little playful — Suds has a personality. Avoid corporate
// "AI assistant" language. He's a teammate.
//
// Uses the 5 Suds images already in /public:
//   suds.png, suds-waving.png, suds-thinking.png, suds-celebrate.png, suds-sleeping.png
// =============================================================================

import { useNavigate } from 'react-router-dom'

export default function MeetSuds() {
  const navigate = useNavigate()

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px', color: '#111827' }}>
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 280px) 1fr',
        gap: '24px',
        alignItems: 'center',
        padding: '28px',
        background: 'linear-gradient(135deg, #ede9fe 0%, #fdf4ff 100%)',
        border: '1px solid #c4b5fd',
        borderRadius: '20px',
        marginBottom: '28px',
      }}>
        <img
          src="/suds-waving.png"
          alt="Suds the otter waving hello"
          style={{ width: '100%', maxWidth: '260px', justifySelf: 'center' }}
        />
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
            Your AI Teammate
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: '36px', fontWeight: 800, color: '#3b0764' }}>
            Hi, I'm Suds 🦦
          </h1>
          <p style={{ margin: '0 0 12px', fontSize: '16px', color: '#4c1d95', lineHeight: 1.5 }}>
            I'm the otter who lives inside PetPro. I book your appointments, remind your clients,
            catch your mistakes before they happen, and keep your shop running while you focus on the dogs.
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b21a8', fontStyle: 'italic' }}>
            I work 24/7, never call in sick, and I'm really good with poodles.
          </p>
        </div>
      </div>

      {/* ─── Backstory ─────────────────────────────────────────── */}
      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#111827', marginBottom: '10px' }}>
          A little about me
        </h2>
        <p style={{ fontSize: '15px', color: '#374151', lineHeight: 1.7, margin: 0 }}>
          I was built by a real dog groomer for real dog groomers. I'm trained on actual grooming knowledge —
          breed standards, coat care, vaccine schedules, behavior cues — not just generic AI fluff. When a client
          books online, I cross-check the breed against your time slot, double-check the vaccines, watch for medication
          conflicts, and flag anything weird before it hits your calendar.
        </p>
        <p style={{ fontSize: '15px', color: '#374151', lineHeight: 1.7, marginTop: '10px' }}>
          I'm an otter because otters are smart, hardworking, and surprisingly chill. Also they're adorable. Don't @ me.
        </p>
      </section>

      {/* ─── What Suds Does ────────────────────────────────────── */}
      <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#111827', marginBottom: '14px' }}>
          What I do for your shop
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          <SudsCard
            emoji="🧠"
            title="I book clients without breaking your day"
            body="When a client tries to book, I check the breed against your shop hours, your blocked times, the kennel availability, and even how many appointments you already have. If something's off, I flag it instead of letting it slip through."
          />
          <SudsCard
            emoji="🛡️"
            title="I catch dangerous bookings"
            body="Medications that don't mix with bathing. Senior pets who can't handle long sessions. Vaccines that expired last week. I see it all before you do, so you never have to apologize."
          />
          <SudsCard
            emoji="📱"
            title="I text your clients so you don't have to"
            body="Reminders 24 hours before. Pickup-ready alerts when the dog's done. Rebook nudges 6 weeks later. If they reply Y or N, I confirm or cancel automatically."
          />
          <SudsCard
            emoji="✂️"
            title="I write grooming notes in your style"
            body="Tell me what you did and I'll add it to the pet's record. 'De-shed needed next time, mom prefers shorter ears, watch the back leg' — saved forever, color-coded so you know I wrote it."
          />
          <SudsCard
            emoji="💰"
            title="I remember pricing"
            body="When the same pet comes back, I quote the price you charged last time. No more awkward 'oh wait we raised our rates' conversations with longtime clients."
          />
          <SudsCard
            emoji="🐾"
            title="I notice multi-pet families"
            body="If Bella always books with Max, I'll ask before letting one of them slip through alone. Saves you the 'hey did you mean both?' phone call."
          />
        </div>
      </section>

      {/* ─── How to talk to Suds ───────────────────────────────── */}
      <section style={{ marginBottom: '28px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(140px, 200px) 1fr',
          gap: '20px',
          alignItems: 'center',
          padding: '20px',
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '14px',
        }}>
          <img
            src="/suds-thinking.png"
            alt="Suds the otter thinking"
            style={{ width: '100%', justifySelf: 'center' }}
          />
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
              💬 How to talk to me
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
              Click the purple chat bubble at the bottom of any page. Type, tap the mic, or just text me casually —
              "book Bella for a full groom Thursday at 10," "what's my schedule next week," or "add a note to Max about his ear infection."
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', fontStyle: 'italic' }}>
              I prefer plain English. You don't have to learn special commands.
            </p>
          </div>
        </div>
      </section>

      {/* ─── The Suds Promise ──────────────────────────────────── */}
      <section style={{ marginBottom: '28px' }}>
        <div style={{
          padding: '20px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '14px',
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 800, color: '#065f46' }}>
            🤝 The Suds Promise
          </h3>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#065f46', lineHeight: 1.8 }}>
            <li><strong>I never touch card numbers.</strong> Stripe handles payments — I don't see them, ever.</li>
            <li><strong>I won't spam your clients.</strong> Every text I send respects quiet hours + opt-outs.</li>
            <li><strong>I show my work.</strong> When I write a grooming note, you see "🦦 Suds" so you know it's mine.</li>
            <li><strong>You're always in control.</strong> You can turn me off, edit what I say, or override anything I do.</li>
            <li><strong>I don't pretend to be a vet.</strong> If something's medical, I'll tell the client to call you, not give advice.</li>
          </ul>
        </div>
      </section>

      {/* ─── Closing ──────────────────────────────────────────── */}
      <section style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '20px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px' }}>
          <img
            src="/suds-sleeping.png"
            alt="Suds the otter sleeping"
            style={{ width: '120px', flexShrink: 0 }}
          />
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
              When I'm not working…
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
              I'm probably napping. Otters sleep about 11 hours a day. But the second a client tries to book or a question
              comes in, I'm wide awake.
            </p>
          </div>
        </div>
      </section>

      {/* ─── CTA buttons ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '16px' }}>
        <button
          onClick={function () { navigate('/petpro-ai') }}
          style={{ padding: '12px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
        >
          💬 Chat with me now
        </button>
        <button
          onClick={function () { navigate('/roadmap') }}
          style={{ padding: '12px 24px', background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: '10px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
        >
          🗺️ See what's next
        </button>
      </div>
    </div>
  )
}

function SudsCard({ emoji, title, body }) {
  return (
    <div style={{ padding: '16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', height: '100%' }}>
      <div style={{ fontSize: '28px', marginBottom: '6px' }}>{emoji}</div>
      <div style={{ fontSize: '15px', fontWeight: 800, color: '#111827', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{body}</div>
    </div>
  )
}
