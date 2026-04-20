// PetPro AI Safety Service
// Calls the Supabase Edge Function to check bookings with Claude
import { supabase } from './supabase'

export async function checkBookingSafety({ pet_id, service_id, appointment_date, start_time, end_time, staff_id }) {
  try {
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
