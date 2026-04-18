// ====================================================================
// PetPro: Privacy Policy Page
// ====================================================================
// Public page (no login required) - required for A2P 10DLC SMS approval.
// URL: https://petpro-app.vercel.app/privacy
// ====================================================================

function Privacy() {
  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '40px 24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      lineHeight: '1.6',
      color: '#222'
    }}>
      <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        <strong>Pamperedlittlepaws / PetPro</strong><br />
        Last updated: April 18, 2026
      </p>

      <h2>1. Information We Collect</h2>
      <p>
        Pamperedlittlepaws (operating the PetPro booking platform) collects the following information
        from clients who book grooming or boarding services with us:
      </p>
      <ul>
        <li>Your name and contact phone number</li>
        <li>Your email address (optional)</li>
        <li>Your pet's name, breed, age, and grooming/boarding history</li>
        <li>Appointment dates, times, and service details</li>
        <li>Payment records (cash, Zelle, Venmo, or card reference - full card details are never stored)</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect strictly to operate our pet grooming and boarding business:</p>
      <ul>
        <li>To schedule, confirm, and manage your pet's appointments</li>
        <li>To send appointment reminders, confirmations, and rebook notifications via SMS</li>
        <li>To maintain your pet's care history, notes, and health flags</li>
        <li>To contact you about schedule changes or urgent issues regarding your pet</li>
        <li>To process payments for services rendered</li>
      </ul>

      <h2>3. SMS Messaging</h2>
      <p>
        When you provide your phone number at the time of booking, you consent to receive SMS
        messages from Pamperedlittlepaws related to your pet's appointments. Message frequency
        depends on your appointment activity. Message and data rates may apply. You can reply
        <strong> STOP </strong> at any time to opt out of SMS messages, or reply <strong> HELP </strong>
        for assistance.
      </p>

      <h2>4. How We Share Your Information</h2>
      <p>
        We <strong>do not sell, rent, or share</strong> your personal information with third parties
        for marketing purposes. Your information is shared only with trusted service providers that
        help us operate our business:
      </p>
      <ul>
        <li><strong>Twilio</strong> - for sending SMS appointment reminders</li>
        <li><strong>Supabase</strong> - for securely storing your appointment and client records</li>
        <li><strong>Stripe</strong> - for processing card payments when applicable</li>
        <li><strong>Anthropic (Claude AI)</strong> - for AI-assisted booking validation (no personal identifiers sent beyond first name and pet info)</li>
      </ul>

      <h2>5. Data Security</h2>
      <p>
        We take reasonable measures to protect your information. Data is stored in encrypted
        databases, and access is restricted to authorized staff only. No system is 100% secure,
        but we work to keep your data safe.
      </p>

      <h2>6. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Request a copy of the information we have about you and your pet</li>
        <li>Request that we update or correct your information</li>
        <li>Request that we delete your information (subject to business record retention requirements)</li>
        <li>Opt out of SMS messages by replying STOP to any message from us</li>
      </ul>

      <h2>7. Children's Privacy</h2>
      <p>
        Our services are intended for pet owners who are 18 years of age or older. We do not
        knowingly collect personal information from children under 18.
      </p>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Any changes will be posted on this
        page with an updated "Last updated" date.
      </p>

      <h2>9. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy, please contact us:
      </p>
      <ul>
        <li><strong>Business:</strong> Pamperedlittlepaws</li>
        <li><strong>Phone:</strong> 281-800-9776</li>
      </ul>

      <p style={{ marginTop: '48px', padding: '16px', background: '#f6f6f8', borderRadius: '8px', fontSize: '14px', color: '#555' }}>
        <a href="/terms" style={{ color: '#0057ff' }}>View Terms and Conditions</a>
      </p>
    </div>
  )
}

export default Privacy
