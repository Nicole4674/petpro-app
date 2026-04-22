// PetPro AI Safety Service
// Calls the Supabase Edge Function to check bookings with Claude
import { supabase } from './supabase'
import { checkAICap, logAIUsage } from './aiUsage'

export async function checkBookingSafety({ pet_id, service_id, appointment_date, start_time, end_time, staff_id }) {
  try {
    // Check monthly AI cap BEFORE calling Claude.
    // If over cap, return the same shape the UI already expects for errors
    // so the booking flow keeps working (just with a warning flag).
    const capStatus = await checkAICap()
    if (!capStatus.allowed) {
      return {
        approved: false,
        flags: [{ level: 'warning', message: capStatus.message || 'Monthly AI limit reached. Upgrade your plan to keep using AI safety checks.' }],
        summary: 'AI cap reached — manual review required.',
      }
    }

    const { data, error } = await supabase.functions.invoke('check-booking', {
      body: { pet_id, service_id, appointment_date, start_time, end_time, staff_id: staff_id || null },
    })

    if (error) {
      console.error('Safety check error:', error)
      return {
        approved: false,
        flags: [{ level: 'warning', message: 'AI safety check unavailable right now. Please review this booking manually.' }],
        summary: 'Could not reach AI safety service.',
      }
    }

    // Log successful AI action against the groomer's monthly cap.
    logAIUsage('booking_check')
    return data
  } catch (err) {
    console.error('Safety check failed:', err)
    return {
      approved: false,
      flags: [{ level: 'warning', message: 'AI safety check unavailable right now. Please review this booking manually.' }],
      summary: 'Could not reach AI safety service.',
    }
  }
}
