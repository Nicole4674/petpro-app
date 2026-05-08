// =======================================================
// PetPro — Help / Knowledge Base
// URL: /help
// In-app self-service guide. Click a question → answer expands.
// Designed like a game walkthrough — clear, short, step-by-step.
// =======================================================
import { useState } from 'react'

// ─── Article data ──────────────────────────────────────
// Each article: title + body (array of steps OR a paragraph + steps).
// To add a new article: drop it in the right SECTION array below.
var SECTIONS = [
  {
    title: '📅 Calendar & Bookings',
    articles: [
      {
        q: 'How do I book a new appointment?',
        steps: [
          'Open Calendar from the left sidebar.',
          'Click any open time slot OR click "+ New Appointment" in the sidebar.',
          'Pick a client (or create a new one inline by clicking "+ Add new client").',
          'Pick the pet from that client\'s list.',
          'Pick a service — the time block + price auto-fill.',
          'Pick a groomer if you have multiple staff.',
          'Add notes if needed (special handling, requests).',
          'Click Save. The AI booking brain checks your rules before confirming.',
        ],
        tip: 'If a booking trips one of your booking rules (vaccinations expired, breed cutoff, etc.), it goes to Flagged Bookings for your approval instead of landing on the calendar.',
      },
      {
        q: 'How do I cancel an appointment?',
        steps: [
          'Click the appointment block on the calendar to open the popup.',
          'Click the colored status badge at the top (it shows the current status).',
          'Pick "Cancelled" from the dropdown.',
          'The block updates instantly — appears with strikethrough on the calendar.',
        ],
        tip: 'Cancelled appointments stay on the calendar (faded) for your records. They don\'t count toward your daily revenue. If you want to delete them entirely, contact support — but normally cancelled is the right state to keep.',
      },
      {
        q: 'How do I reschedule an appointment?',
        steps: [
          'Two ways:',
          '1) DRAG-AND-DROP — Click and hold the appointment block, drag to a new time slot. A confirmation popup appears asking if you really want to move it. Confirm and it\'s done.',
          '2) RESCHEDULE BUTTON — Click the appointment, then click "Reschedule" in the popup. Pick the new date + time. For recurring appointments, you also choose: just this one / this one + all future / all in series.',
        ],
        tip: 'The drag-and-drop confirmation is intentional — prevents stray clicks from accidentally moving an appointment.',
      },
      {
        q: 'How do I edit the appointment time after it\'s booked?',
        steps: [
          'Click the appointment to open the popup.',
          'Find the 🕐 Time row.',
          'Click the ✏️ Edit button next to the time.',
          'Use the Start/End time pickers OR the quick-extend buttons (+15m, +30m, +1h) OR set total duration buttons (1h, 2h, 3h).',
          'Click ✓ Save.',
        ],
        tip: 'Same-day only. For changing the date, use the Reschedule button instead.',
      },
      {
        q: 'How do I add an add-on service (nail dremel, dematting, etc.)?',
        steps: [
          'Click the appointment to open the popup.',
          'Find the pet you want to add the service to.',
          'Click "+ Add Service" under that pet.',
          'Pick the add-on from the dropdown.',
          'For RECURRING appointments: a checkbox appears asking "Apply to all future appointments". Check it to copy the add-on to every future visit in the series.',
          'Click "✓ Add service". The appointment time + total price auto-update.',
        ],
        tip: 'Save yourself work — if a client wants nail dremel added permanently, use the "Apply to all future appointments" checkbox the first time.',
      },
      {
        q: 'How do I set up a recurring appointment?',
        steps: [
          'Start booking a new appointment as normal.',
          'Toggle "Make this recurring" on.',
          'Pick the interval — every X weeks (e.g. every 6 weeks).',
          'Pick how many total appointments to schedule (e.g. 10 visits).',
          'Preview shows all the generated dates. Edit any individual date if it conflicts with a holiday or vacation.',
          'Click Save. All appointments land on the calendar at once.',
        ],
      },
      {
        q: 'How do I block off time for lunch / errands / day off?',
        steps: [
          'Click the time slot you want to block.',
          'Choose "Block off time" instead of "+ New Appointment".',
          'Set the start/end time and a label (e.g. "Lunch", "Vet visit", "Closed").',
          'Save. The block appears as a striped gray section on the calendar.',
        ],
        tip: 'AI booking brain refuses to schedule into blocked time, and clients can\'t book over it through the portal.',
      },
      {
        q: 'How do I print today\'s schedule for the front desk?',
        steps: [
          'On the Calendar page, click the 🖨️ Print Today button at the top.',
          'A new window opens with all today\'s appointments + boarding check-ins/outs.',
          'It auto-prints — confirm in the print dialog.',
        ],
        tip: 'The Boarding Calendar has its own Print Today button for boarding-only sheets.',
      },
    ],
  },

  {
    title: '👤 Clients & Pets',
    articles: [
      {
        q: 'How do I add a new client?',
        steps: [
          'Open Clients from the sidebar.',
          'Click "+ Add Client".',
          'Enter name, phone, email, preferred contact method.',
          'Save. You can add their pets afterward.',
        ],
      },
      {
        q: 'How do I add a pet to an existing client?',
        steps: [
          'Open the client\'s profile.',
          'Click "+ Add Pet".',
          'Pick Dog or Cat at the top.',
          'Type the breed (the picker auto-suggests; or use a custom breed).',
          'Fill in name, weight, age, behavior tags, vaccinations, etc.',
          'Save.',
        ],
      },
      {
        q: 'How do I send a client portal invite?',
        steps: [
          'Open Settings → Shop Settings.',
          'At the very top of the page, you\'ll see your client portal link section.',
          'Click "Copy Link" — copies the portal URL to your clipboard.',
          'Share it with clients via text, email, on a business card, or pinned on your front desk.',
          'They open the link, create their own portal account, and can view appointments, message you, update their pet info, and self-book.',
        ],
        tip: 'The client portal is included on Pro tier and above. Solo Starter accounts only let YOU manage clients directly.',
      },
      {
        q: 'How do I merge two duplicate clients?',
        steps: [
          'Open the duplicate client (the one you want to delete).',
          'Click the 🔀 Merge button (top-right).',
          'Search for the real client by name or phone.',
          'Click "Merge →" next to the right one.',
          'Type "merge" to confirm.',
          'All pets, appointments, payments, notes, and contacts move to the target. The duplicate is deleted.',
        ],
        tip: 'This is irreversible. The "type merge to confirm" step prevents accidental clicks.',
      },
      {
        q: 'How do I add an emergency or pickup contact?',
        steps: [
          'Open the client\'s profile.',
          'Scroll to "Emergency & Pickup Contacts".',
          'Click "+ Add Contact".',
          'Enter name, phone, relationship.',
          'Check "Emergency contact" if they should be called in emergencies (gets a 🚨 marker).',
          'Check "Can pick up" if they\'re authorized to pick up the pet.',
        ],
      },
      {
        q: 'How do I add behavior tags to a pet?',
        steps: [
          'Open the pet\'s profile.',
          'Click Edit.',
          'Scroll to Behavior Tags.',
          'Click any tag to toggle it on/off (Bites, Kennel Aggressive, Hates Clippers, etc.).',
          'Save.',
        ],
        tip: 'High-priority tags (red — Bites, Kennel Aggressive, etc.) appear directly on calendar tiles so you can\'t miss them.',
      },
      {
        q: 'How do I write a report card after a visit?',
        steps: [
          'Open the appointment popup OR the boarding kennel card.',
          'Find the pet, click "+ Create Report Card".',
          'Fill in: services performed, behavior rating (Great/Good/Okay/Anxious/Difficult), notes, recommendations, next visit timing.',
          'Upload an after-photo (optional but loved by clients).',
          'Save.',
        ],
        tip: 'Report cards appear automatically on the client\'s portal — they can view and print them.',
      },
    ],
  },

  {
    title: '🏠 Boarding',
    articles: [
      {
        q: 'How do I set up boarding kennels?',
        steps: [
          'Open Boarding → Boarding Setup.',
          'Pick the setup type: Numbered (Kennel 1, 2, 3…), Capacity (total nightly count), Sized (S/M/L/XL), or Tiered (Standard/Deluxe/Suite).',
          'Add your kennels (or counts) and set the nightly rate per type.',
          'Save.',
        ],
        tip: 'Switching setup types later is possible but resets the kennel list — change carefully.',
      },
      {
        q: 'How do I book a boarding stay?',
        steps: [
          'Open Boarding → Boarding Calendar.',
          'Click "+ New Stay" or click an open kennel slot.',
          'Pick client + pet(s) (multi-pet stays go in the same kennel by default).',
          'Pick check-in date/time and check-out date/time.',
          'Pick the kennel or capacity slot.',
          'Fill the 11-field intake — feeding schedule, meds, walks, special instructions, emergency contacts.',
          'Save. AI checks capacity, vaccinations, and length-of-stay rules.',
        ],
      },
      {
        q: 'How do I check in / check out a boarding pet?',
        steps: [
          'Open Boarding Calendar → click the kennel card.',
          'For check-in: click the prominent "Check In" button at the top of the card.',
          'For check-out: click "Check Out" — locks pricing in, marks the stay as completed.',
        ],
      },
      {
        q: 'How do I print a boarding intake form for the client to sign?',
        steps: [
          'Open the kennel card.',
          'Click "🖨️ Print Intake Form".',
          'A printable check-in form opens — feeding, meds, emergency contacts, signature line.',
        ],
      },
    ],
  },

  {
    title: '💳 Payments & Billing',
    articles: [
      {
        q: 'How do I record a payment + tip?',
        steps: [
          'Open the appointment popup.',
          'Click "Pay".',
          'Total auto-fills from the appointment (sum of all pets + add-ons).',
          'Pick payment method: Cash, Zelle, Venmo, Credit Card, Other.',
          'Enter the actual amount paid.',
          'Add a tip (optionally split across groomers if multiple staff worked the dog).',
          'Click "Confirm Payment". Appointment marks as Completed + Paid.',
        ],
      },
      {
        q: 'How do I track an outstanding balance?',
        steps: [
          'Outstanding balances appear on the Dashboard (top widget).',
          'Click into the Balances page (left sidebar) to see all unpaid amounts by client.',
          'Each row shows what they owe and a quick "Send reminder" button.',
        ],
      },
      {
        q: 'How do I edit or refund a payment?',
        steps: [
          'Open the client\'s profile → Payments tab.',
          'Click the payment you want to change.',
          'Edit the amount, method, tip, or delete entirely.',
          'For refunds via Stripe: log into your Stripe Dashboard and refund there (PetPro tracks the cash side, Stripe handles the card side).',
        ],
      },
      {
        q: 'How do I update or cancel my PetPro subscription?',
        steps: [
          'Open Settings → Plans (or click your name → Account).',
          'Click "Manage Subscription". Stripe\'s portal opens.',
          'You can upgrade, downgrade, update your card, or cancel from there.',
          'Cancellations stop renewal at the end of your current billing period — no refunds for partial months.',
        ],
      },
    ],
  },

  {
    title: '🤖 AI & Automation',
    articles: [
      {
        q: 'How do I use voice booking with Suds (hands-free)?',
        steps: [
          'Look for Suds 🦦 in the bottom-right corner of any page — he\'s always there.',
          'Click the purple 🎤 mic button in the bar below Suds.',
          'Speak naturally: "Book Bella for a full groom Thursday at 2."',
          'Suds transcribes what you said, sends it to the AI, and replies in a speech bubble + voice.',
          'Say "yes" or "confirm" to lock in the booking, or describe a change ("make it 3 instead").',
          'The booking lands on your calendar — hands stay clean, dog stays calm.',
        ],
        tip: 'Suds is voice + text in one — perfect for mobile groomers in the van or when your hands are wet. You can also call him by name: "Hey Suds" or "Hey PetPro" — both work.',
      },
      {
        q: 'How do I set up booking rules to prevent bad bookings?',
        steps: [
          'Open AI → Booking Rules.',
          'Toggle on the rules you want enforced: vaccinations current, aggressive dog handling, breed-time cutoffs, boarding length cap, daily booking cap, etc.',
          'Bookings that trip a rule go to Flagged Bookings instead of the calendar.',
          'Open Flagged Bookings (sidebar) → approve, deny, or edit each one.',
        ],
      },
    ],
  },

  {
    title: '💬 Communication',
    articles: [
      {
        q: 'How do I send a mass text to today\'s clients?',
        steps: [
          'On the Calendar, click "Mass Text" (top-right).',
          'Type your message (e.g. "Running 30 min behind, sorry!").',
          'Sends to every client with an appointment that day.',
        ],
      },
      {
        q: 'How do I message one specific client?',
        steps: [
          'Open their appointment → click "Send Message".',
          'OR open their profile → Messages tab.',
          'Type and send. Goes via text. Conversation thread is saved.',
        ],
      },
    ],
  },

  {
    title: '🚐 Mobile Grooming',
    articles: [
      {
        q: 'How do I tell PetPro I\'m a mobile groomer?',
        steps: [
          'During the new-shop wizard, pick "🚐 Mobile" on Question 2.',
          'Already past the wizard? Open Settings → Shop Settings → toggle "I\'m a mobile groomer."',
          'Mobile groomers see Route + Drive Time features unlock automatically.',
        ],
        tip: 'You can also flip individual appointments between in-shop and mobile from the appointment popup if you do both.',
      },
      {
        q: 'How does the Route page work?',
        steps: [
          'Open Route in the sidebar — shows every stop on today\'s schedule with addresses + drive times.',
          'PetPro calculates the optimal order based on Google Maps drive time between stops.',
          'Tap "Optimize" to reorder for maximum efficiency, or drag stops manually.',
          'Each stop shows: client name, pet, service, ETA, address. Tap → directions in your phone\'s map app.',
          'Print Route Sheet (top-right) gives you a paper backup if you lose signal.',
        ],
      },
      {
        q: 'What is the Late Detector / running-late warning?',
        steps: [
          'Settings → Shop Settings → toggle "Late warnings" ON.',
          'PetPro tracks the clock + your GPS (with permission) and warns you when you\'re running behind.',
          'When late, a yellow banner shows on the Route page with three actions: 📧 Email, 📱 SMS, or 📞 Call your next client.',
          'Email uses your branded email; SMS uses your "Running Late" template (counts against quota).',
        ],
        tip: 'GPS-based predictions are more accurate, but you can still get late warnings from time-only mode if you don\'t want to share location.',
      },
      {
        q: 'How do drive-time conflicts work when booking?',
        steps: [
          'PetPro auto-checks Google Maps drive time between back-to-back mobile appointments.',
          'If the drive between two stops is longer than the gap, you\'ll see a yellow drive-time warning before saving.',
          'You can ignore it (e.g. if you\'re hands-on driving fast) or pick a later slot.',
          'Auto-clusters bookings by zip/neighborhood so close stops stay together.',
        ],
      },
      {
        q: 'Can I block off lunch or a personal break on the road?',
        steps: [
          'Open Calendar → click a time slot → choose "Block this time."',
          'Add a note like "Lunch" or "Driving across town."',
          'Suds AI respects blocks — it won\'t let clients book over them through the portal.',
        ],
      },
    ],
  },

  {
    title: '📱 SMS / Texting',
    articles: [
      {
        q: 'How many SMS do I get per month?',
        steps: [
          'Basic ($70): 0 SMS — upgrade to Pro for texting features.',
          'Pro ($129): 1,000 SMS / month.',
          'Pro+ ($199): 1,500 SMS / month.',
          'Growing ($399): 3,000 SMS / month.',
          'Quota resets the 1st of every month. Unused SMS don\'t roll over.',
        ],
        tip: 'Founders get unlimited SMS as a thank-you for being early supporters.',
      },
      {
        q: 'How do I customize my SMS templates?',
        steps: [
          'Open Settings → Shop Settings → ✏️ SMS Templates section.',
          'Edit any of 6 templates: Reminder, Confirmation, Pickup Ready, Running Late, Rebook Follow-up, Thank You.',
          'Use placeholders like {client_first_name}, {pet_name}, {date}, {time}, {shop_name} — they auto-fill at send time.',
          'Watch the character count — over 160 chars splits into multiple SMS (counts as multiple sends).',
          'Click "Reset to default" if you mess up — restores the original wording.',
          'Save Settings.',
        ],
      },
      {
        q: 'How do automated appointment reminders work?',
        steps: [
          'Settings → Shop Settings → 📬 Appointment Reminders → toggle ON.',
          'Pick what time of day to send (e.g. 5 PM the day before).',
          'Pick how far ahead (1, 2, or 3 days before each appointment).',
          'PetPro sends every client with sms_consent=true a reminder text using your Reminder template.',
          'Clients reply Y to confirm or N to cancel — PetPro auto-updates the appointment status.',
        ],
        tip: 'Each reminder counts as 1 SMS from your monthly quota. The auto Y/N reply doesn\'t cost extra (handled via Twilio TwiML).',
      },
      {
        q: 'How do I send a quick text from an appointment?',
        steps: [
          'Open the appointment popup on the Calendar.',
          'Click 💬 next to the client\'s phone number.',
          'Pick a template: Booking Confirmation, Appointment Reminder, Ready for Pickup, or Custom.',
          'Edit the prefilled text if needed → click Send.',
          'Counts as 1 SMS from your quota.',
        ],
      },
      {
        q: 'What is the SMS Inbox?',
        steps: [
          'Open Messages (sidebar) → 📱 SMS Inbox tab.',
          'Shows every text conversation grouped by client (most-recent on top).',
          'Red badge = unread inbound message. Click to open.',
          'Reply right from the inbox — sends as SMS, counts against quota.',
          'Hover any message → ✕ deletes that single message.',
          'Header → 🗑️ Delete thread removes the entire conversation from your inbox (original SMS unaffected).',
        ],
      },
      {
        q: 'How do I get a heads-up SMS when a client books on their own?',
        steps: [
          'Settings → Shop Settings → 🔔 Client Action Alerts.',
          'Enter your phone number (E.164 format like +12815551234).',
          'Toggle "Send me an SMS when a client books or changes" ON.',
          'You\'ll get a text every time a client books, reschedules, or cancels through the portal or AI.',
          'Calendar also shows colored badges (🤖 AI, 👤 portal, 🔄 moved, ❌ cancelled) with red pulse until you open them.',
        ],
        tip: 'These alerts use 1 SMS each — turn off if you\'d rather just check the calendar.',
      },
      {
        q: 'How do I test SMS to make sure it works?',
        steps: [
          'Settings → Shop Settings → 📱 Test SMS section.',
          'Enter any phone number (your own works great).',
          'Click "Send Test SMS."',
          'Within seconds you should get a text confirming Twilio is wired up.',
          'Counts as 1 SMS from your quota (free for founders).',
        ],
      },
    ],
  },

  {
    title: '⚙️ Settings & Account',
    articles: [
      {
        q: 'How do I update my shop name, hours, or logo?',
        steps: [
          'Open Settings → Shop Settings.',
          'Edit name, address, hours, brand color.',
          'Upload a logo (appears on the client portal + intake forms).',
          'Save.',
        ],
      },
      {
        q: 'How do I add a staff member?',
        steps: [
          'Open Staff → Staff List.',
          'Click "+ Add Staff Member".',
          'Enter name, email, color code, specialties.',
          'Set their pay type (hourly or commission %).',
          'To give them their own login, open Roles & Permissions and assign a role (Manager / Groomer / Receptionist).',
        ],
      },
      {
        q: 'How do I run payroll?',
        steps: [
          'Open Payroll → Pay Periods.',
          'Set up your recurring period (weekly / biweekly / monthly).',
          'When the period ends, click "Run Payroll".',
          'PetPro calculates each groomer\'s hours, commission, tips, and total.',
          'Export a CSV for your bookkeeper.',
        ],
      },
      {
        q: 'I\'m stuck — how do I get help?',
        steps: [
          'Email nicole@trypetpro.com — replies come from a real groomer (the founder), usually within a few hours.',
          'Or use the in-app PetPro AI assistant — ask it anything ("how do I add a pet?") and it\'ll walk you through with the right buttons highlighted.',
        ],
      },
    ],
  },
]

// ─── Component ─────────────────────────────────────────
export default function Help() {
  // Track which article is currently expanded (only one at a time, like an accordion).
  // Articles are keyed by `${sectionIdx}-${articleIdx}`.
  var [openKey, setOpenKey] = useState(null)
  var [searchTerm, setSearchTerm] = useState('')

  // Contact-form state — emails Nicole directly via send-help-message function
  var [contactEmail, setContactEmail] = useState('')
  var [contactSubject, setContactSubject] = useState('')
  var [contactMessage, setContactMessage] = useState('')
  var [contactSending, setContactSending] = useState(false)
  var [contactResult, setContactResult] = useState(null)  // { ok: true } or { error: '...' }

  async function sendContactForm(e) {
    if (e && e.preventDefault) e.preventDefault()
    setContactResult(null)
    if (!contactEmail.trim()) {
      setContactResult({ error: 'Please enter your email so we can reply.' })
      return
    }
    if (!contactMessage.trim()) {
      setContactResult({ error: 'Please write a message.' })
      return
    }
    setContactSending(true)
    try {
      // Lazy-import supabase to avoid circular issues + only when needed
      var supabaseMod = await import('../lib/supabase')
      var supabase = supabaseMod.supabase
      var { data, error } = await supabase.functions.invoke('send-help-message', {
        body: {
          from_email: contactEmail.trim(),
          subject: contactSubject.trim() || 'PetPro Help Message',
          message: contactMessage.trim(),
        },
      })
      if (error) {
        setContactResult({ error: error.message || 'Could not send. Try again.' })
      } else if (data && data.error) {
        setContactResult({ error: data.error })
      } else {
        setContactResult({ ok: true })
        setContactSubject('')
        setContactMessage('')
      }
    } catch (err) {
      setContactResult({ error: err.message || 'Could not send. Try again.' })
    } finally {
      setContactSending(false)
    }
  }

  function toggle(key) {
    setOpenKey(openKey === key ? null : key)
  }

  // Live filter — match search across question + steps + tip
  function articleMatches(article) {
    if (!searchTerm.trim()) return true
    var t = searchTerm.toLowerCase()
    var hay = [
      article.q,
      (article.steps || []).join(' '),
      article.tip || '',
    ].join(' ').toLowerCase()
    return hay.indexOf(t) >= 0
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: '880px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ─── Hero ─── */}
      <div style={{
        background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
        color: '#fff',
        padding: '32px 28px',
        borderRadius: '16px',
        marginBottom: '24px',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>📚</div>
        <h1 style={{ margin: '0 0 8px', fontSize: '28px', fontWeight: 800 }}>PetPro Help</h1>
        <p style={{ margin: 0, fontSize: '15px', opacity: 0.92, lineHeight: 1.5 }}>
          Step-by-step walkthroughs for the most common things. Click any question to expand.
          Still stuck? Email <strong style={{ color: '#fff' }}>nicole@trypetpro.com</strong>.
        </p>
      </div>

      {/* ─── Search ─── */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={function (e) { setSearchTerm(e.target.value) }}
          placeholder="🔍 Search how-to articles…"
          style={{
            width: '100%',
            padding: '14px 16px',
            fontSize: '15px',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* ─── Sections ─── */}
      {SECTIONS.map(function (section, si) {
        var visibleArticles = section.articles.filter(articleMatches)
        if (visibleArticles.length === 0) return null
        return (
          <div key={si} style={{ marginBottom: '28px' }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#5b21b6',
              borderBottom: '2px solid #e9d5ff',
              paddingBottom: '6px',
              marginBottom: '12px',
            }}>
              {section.title}
            </h2>
            {visibleArticles.map(function (article) {
              var ai = section.articles.indexOf(article)
              var key = si + '-' + ai
              var isOpen = openKey === key
              return (
                <div key={key} style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  marginBottom: '10px',
                  background: '#fff',
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={function () { toggle(key) }}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      background: isOpen ? '#faf5ff' : '#fff',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: '15px',
                      fontWeight: 600,
                      color: '#111827',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span>{article.q}</span>
                    <span style={{ fontSize: '20px', color: '#7c3aed', fontWeight: 700, marginLeft: 12, flexShrink: 0 }}>
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 18px 16px', borderTop: '1px solid #f3f4f6' }}>
                      {(article.steps || []).map(function (step, idx) {
                        return (
                          <div key={idx} style={{
                            padding: '8px 0',
                            fontSize: '14px',
                            color: '#374151',
                            lineHeight: 1.55,
                          }}>
                            {step}
                          </div>
                        )
                      })}
                      {article.tip && (
                        <div style={{
                          marginTop: '10px',
                          padding: '10px 12px',
                          background: '#f3e8ff',
                          borderLeft: '3px solid #7c3aed',
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: '#5b21b6',
                          lineHeight: 1.5,
                        }}>
                          💡 <strong>Tip:</strong> {article.tip}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* ─── No results ─── */}
      {searchTerm && SECTIONS.every(function (s) { return s.articles.filter(articleMatches).length === 0 }) && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#6b7280',
          fontSize: '14px',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🤔</div>
          No articles match "<strong>{searchTerm}</strong>". Email nicole@trypetpro.com and we\'ll add it.
        </div>
      )}

      {/* ─── Contact form — emails Nicole directly (founder reads every one) ─── */}
      <div style={{
        marginTop: '40px',
        padding: '24px',
        background: '#faf5ff',
        border: '1px solid #e9d5ff',
        borderRadius: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontSize: '24px' }}>✉️</span>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#5b21b6' }}>
            Couldn't find what you needed?
          </div>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
          Email me directly — replies come from a working groomer (the founder), usually within a few hours.
          Found a bug? Just describe it. Have a feature wish? Spill it.
        </p>

        {contactResult && contactResult.ok && (
          <div style={{
            padding: '12px 14px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '8px',
            color: '#065f46',
            fontSize: '13px',
            marginBottom: '14px',
          }}>
            ✅ Sent! Nicole will reply to <strong>{contactEmail}</strong> as soon as she sees it. 🐾
          </div>
        )}
        {contactResult && contactResult.error && (
          <div style={{
            padding: '12px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '13px',
            marginBottom: '14px',
          }}>
            ⚠️ {contactResult.error}
          </div>
        )}

        <form onSubmit={sendContactForm}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Your email <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={contactSending}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                background: '#fff',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Subject <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={contactSubject}
              onChange={(e) => setContactSubject(e.target.value)}
              placeholder="Found a bug / Feature idea / etc."
              disabled={contactSending}
              maxLength={120}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                background: '#fff',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Message <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              value={contactMessage}
              onChange={(e) => setContactMessage(e.target.value)}
              placeholder="What happened, what you expected, screenshots if you have them — the more detail the better."
              required
              disabled={contactSending}
              rows={6}
              maxLength={5000}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                background: '#fff',
                boxSizing: 'border-box',
                resize: 'vertical',
                minHeight: '120px',
              }}
            />
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', textAlign: 'right' }}>
              {contactMessage.length} / 5000
            </div>
          </div>
          <button
            type="submit"
            disabled={contactSending}
            style={{
              background: contactSending ? '#9ca3af' : '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: contactSending ? 'wait' : 'pointer',
              boxShadow: '0 2px 6px rgba(124,58,237,0.3)',
            }}
          >
            {contactSending ? 'Sending…' : '✉️ Send to Nicole'}
          </button>
        </form>

        <p style={{ margin: '14px 0 0', fontSize: '12px', color: '#9ca3af', lineHeight: 1.5 }}>
          Or use the floating PetPro AI assistant — it can walk you through most things live.
        </p>
      </div>
    </div>
  )
}
