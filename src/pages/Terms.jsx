// ====================================================================
// PetPro: Terms and Conditions Page
// ====================================================================
// Public page (no login required) - required for A2P 10DLC SMS approval.
// URL: https://petpro-app.vercel.app/terms
// ====================================================================

function Terms() {
  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '40px 24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      lineHeight: '1.6',
      color: '#222'
    }}>
      <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Terms and Conditions</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        <strong>Pamperedlittlepaws / PetPro</strong><br />
        Last updated: April 18, 2026
      </p>

      <h2>1. Services</h2>
      <p>
        Pamperedlittlepaws provides pet grooming and boarding services. Appointments can be
        scheduled in person, by phone at 281-800-9776, or through our online booking portal.
      </p>

      <h2>2. SMS Messaging Program</h2>
      <p>
        By providing your phone number at booking, you agree to receive text messages (SMS) from
        Pamperedlittlepaws. These messages include:
      </p>
      <ul>
        <li>Appointment reminders (typically 24 hours before your appointment)</li>
        <li>Booking confirmations when an appointment is scheduled</li>
        <li>Rebook reminders when your pet is due for their next service</li>
        <li>Schedule change notifications if your appointment needs to be moved</li>
        <li>Urgent updates about your pet during boarding or grooming</li>
      </ul>
      <p>
        <strong>Message frequency:</strong> varies based on your appointment activity. Typically 1-4
        messages per appointment cycle.
      </p>
      <p>
        <strong>Message and data rates may apply.</strong> Check with your mobile carrier for
        applicable rates.
      </p>
      <p>
        <strong>To opt out:</strong> Reply <strong>STOP</strong> to any message. You will receive a
        confirmation that you have been unsubscribed and will receive no further messages.
      </p>
      <p>
        <strong>For help:</strong> Reply <strong>HELP</strong> to any message, or call us at
        281-800-9776.
      </p>
      <p>
        <strong>Supported carriers:</strong> AT&amp;T, T-Mobile, Verizon, Sprint, and most other U.S.
        mobile carriers. Carriers are not liable for delayed or undelivered messages.
      </p>

      <h2>3. Appointments and Cancellations</h2>
      <p>
        Appointments are scheduled on a first-come, first-served basis. We ask that you provide at
        least 24 hours' notice if you need to cancel or reschedule. Repeated no-shows may result in
        a requirement to pre-pay for future appointments.
      </p>

      <h2>4. Pet Health and Safety</h2>
      <p>
        You are responsible for providing accurate information about your pet's health, including
        any allergies, medications, medical conditions, or behavioral concerns. Pamperedlittlepaws
        reserves the right to refuse service to any pet that appears aggressive, ill, or otherwise
        unfit for grooming or boarding. Current vaccinations may be required for boarding.
      </p>

      <h2>5. Payment</h2>
      <p>
        Payment is due at the time of service. We accept cash, Zelle, Venmo, and card payments.
        Outstanding balances may result in holds on future bookings until paid.
      </p>

      <h2>6. Liability</h2>
      <p>
        While we take every precaution to ensure your pet's safety, Pamperedlittlepaws is not
        liable for pre-existing conditions, unforeseen allergic reactions, or injuries caused by
        aggressive behavior. By booking, you acknowledge that grooming and boarding involve inherent
        risks and agree to hold Pamperedlittlepaws harmless from claims unrelated to proven
        negligence.
      </p>

      <h2>7. Privacy</h2>
      <p>
        Your personal information is handled in accordance with our{' '}
        <a href="/privacy" style={{ color: '#0057ff' }}>Privacy Policy</a>.
      </p>

      <h2>8. Changes to These Terms</h2>
      <p>
        We may update these Terms and Conditions from time to time. Updated terms will be posted on
        this page with a new "Last updated" date.
      </p>

      <h2>9. Contact</h2>
      <ul>
        <li><strong>Business:</strong> Pamperedlittlepaws</li>
        <li><strong>Phone:</strong> 281-800-9776</li>
      </ul>

      <p style={{ marginTop: '48px', padding: '16px', background: '#f6f6f8', borderRadius: '8px', fontSize: '14px', color: '#555' }}>
        <a href="/privacy" style={{ color: '#0057ff' }}>View Privacy Policy</a>
      </p>
    </div>
  )
}

export default Terms
