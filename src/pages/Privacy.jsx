// ====================================================================
// PetPro: Privacy Policy Page
// ====================================================================
// Public page (no login required).
// Covers BOTH:
//   (A) Pamperedlittlepaws grooming/boarding clients + SMS program
//       (required for Twilio A2P 10DLC approval)
//   (B) PetPro SaaS software subscribers
//       (required for Stripe live-mode approval)
// URL: /privacy
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
        <strong>Pamperedlittlepaws LLC</strong> (doing business as <strong>PetPro</strong>)<br />
        Last updated: April 22, 2026
      </p>

      <p>
        Pamperedlittlepaws LLC ("we," "us," or "our") operates two related services:
      </p>
      <ul>
        <li>
          <strong>Pamperedlittlepaws Grooming &amp; Boarding</strong> — in-person pet grooming and
          boarding for pet owners.
        </li>
        <li>
          <strong>PetPro</strong> — a software-as-a-service (SaaS) platform used by professional
          groomers and boarding facilities to manage their businesses.
        </li>
      </ul>
      <p>
        This Privacy Policy explains what information we collect, how we use it, and your choices.
        Sections 1–6 describe how we handle information from <strong>grooming and boarding
        clients</strong>. Sections 7–12 describe how we handle information from <strong>PetPro
        software subscribers</strong> and the pet-owner clients they serve. Sections 13+ apply to
        everyone.
      </p>

      <h2 style={{ marginTop: '40px', paddingTop: '16px', borderTop: '2px solid #eee' }}>
        Part A — Grooming &amp; Boarding Clients (Pamperedlittlepaws)
      </h2>

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

      <h2>6. Your Rights as a Grooming Client</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Request a copy of the information we have about you and your pet</li>
        <li>Request that we update or correct your information</li>
        <li>Request that we delete your information (subject to business record retention requirements)</li>
        <li>Opt out of SMS messages by replying STOP to any message from us</li>
      </ul>

      <h2 style={{ marginTop: '48px', paddingTop: '16px', borderTop: '2px solid #eee' }}>
        Part B — PetPro Software Subscribers
      </h2>
      <p>
        The following sections apply if you create an account and subscribe to PetPro, our
        software-as-a-service platform for grooming and boarding professionals. They also
        describe how we handle information that PetPro subscribers enter about their own clients
        and pets.
      </p>

      <h2>7. Information We Collect from PetPro Subscribers</h2>
      <p>When you sign up for or use PetPro, we collect:</p>
      <ul>
        <li><strong>Account information:</strong> your full name, business name, email address, and a password (stored as a secure hash — we never store plain-text passwords).</li>
        <li><strong>Billing information:</strong> we use Stripe to collect your payment details. Stripe provides us with a customer ID, subscription ID, billing address, the last four digits of your card, card brand (e.g., Visa), and renewal dates. We do not receive or store full card numbers.</li>
        <li><strong>Usage information:</strong> login times, pages used, features accessed, and basic device/browser information for security and troubleshooting.</li>
        <li><strong>Support communications:</strong> any messages you send us and our replies.</li>
        <li><strong>Voice input (if used):</strong> if you use PetPro's voice booking feature, speech-to-text is performed locally by your web browser's built-in speech recognition. Your audio is not sent to PetPro or a third-party server. Only the resulting transcribed text is sent to PetPro's AI for booking processing. We do not record or retain audio.</li>
      </ul>

      <h2>8. Information Collected About Your Clients (as a PetPro Subscriber)</h2>
      <p>
        If you are a groomer or boarding operator using PetPro, PetPro stores the client and pet
        information you enter into the system (for example: client names, phone numbers, email
        addresses, pet names, breeds, service history, and appointment details). This is your
        "Customer Data." You control this data — you decide what to enter, you own it, and you can
        export or delete it through your account.
      </p>
      <p>
        You are responsible for obtaining appropriate consent from your clients to store their
        information in PetPro and to send them SMS messages through the platform.
      </p>

      <h2>9. How We Use Subscriber Information</h2>
      <p>We use the information above to:</p>
      <ul>
        <li>Provide and operate the PetPro service</li>
        <li>Process subscription payments and renewals through Stripe</li>
        <li>Send transactional emails (welcome, receipts, password resets, account notices)</li>
        <li>Improve product reliability, fix bugs, and investigate abuse or fraud</li>
        <li>Respond to support requests</li>
        <li>Comply with legal obligations</li>
      </ul>
      <p>
        We do not sell subscriber information. We do not use your Customer Data to train AI models
        or for advertising.
      </p>

      <h2>10. Third-Party Services We Use to Operate PetPro</h2>
      <p>
        To run PetPro, we rely on a small number of trusted service providers. Each processes only
        the data necessary for its specific function:
      </p>
      <ul>
        <li><strong>Supabase</strong> — hosts the PetPro database and handles user authentication.</li>
        <li><strong>Vercel</strong> — hosts the PetPro web application.</li>
        <li><strong>Stripe</strong> — processes subscription payments and stores billing details.</li>
        <li><strong>Twilio</strong> — sends SMS messages (appointment reminders, confirmations, etc.) on behalf of PetPro subscribers to their own clients.</li>
        <li><strong>Anthropic</strong> — provides the Claude AI model that powers PetPro's AI-assisted booking validation and scheduling features.</li>
        <li><strong>ElevenLabs</strong> — provides the text-to-speech voice synthesis used when PetPro reads responses aloud. Only the text to be spoken is sent to ElevenLabs; no customer audio or identifying information is transmitted.</li>
        <li><strong>Browser Speech Recognition (built-in):</strong> voice input is transcribed locally on your device by your web browser. No audio is sent to PetPro or any third party.</li>
      </ul>
      <p>
        These providers are bound by their own privacy and security commitments. We do not permit
        them to use your data for their own marketing.
      </p>

      <h2>11. AI Features and Data Handling</h2>
      <p>
        PetPro's AI-assisted features (booking validation, scheduling suggestions, voice commands)
        send limited booking-related data to Anthropic (Claude) to generate a response. When voice
        output is used, only the text to be spoken aloud is sent to ElevenLabs for voice synthesis.
        Voice input is transcribed locally by your web browser and is never sent to a third-party
        server as audio. We do not send full client lists, financial records, or information that is
        not needed for the specific AI task. AI providers process this data to return a result and,
        per their business-tier agreements, do not use it to train their models.
      </p>

      <h2>12. Data Retention for Subscribers</h2>
      <p>
        We retain your PetPro account and Customer Data for as long as your subscription is active.
        If you cancel your subscription, we retain your data for <strong>90 days</strong> after
        cancellation to allow for reactivation, after which your account and associated Customer
        Data are permanently deleted from active systems. Backup copies may persist for a limited
        additional period before being overwritten in the ordinary course of business.
      </p>
      <p>
        You may request earlier deletion at any time by contacting us at nicole@trypetpro.com.
        Certain records (such as billing records required for tax and accounting purposes) may be
        retained longer where required by law.
      </p>

      <h2 style={{ marginTop: '48px', paddingTop: '16px', borderTop: '2px solid #eee' }}>
        Part C — General (Applies to Everyone)
      </h2>

      <h2>13. Cookies and Session Storage</h2>
      <p>
        Our website uses essential cookies and browser storage to keep you signed in, remember your
        preferences, and operate the service securely. We do not use third-party advertising
        cookies. You can clear cookies through your browser settings, but signing in again will be
        required.
      </p>

      <h2>14. California Privacy Rights (CCPA / CPRA)</h2>
      <p>
        If you are a California resident, you have the right to: (a) know what personal information
        we collect and how we use it; (b) request a copy of your personal information; (c) request
        correction or deletion of your personal information; and (d) not be discriminated against
        for exercising these rights. We do not sell personal information or share it for
        cross-context behavioral advertising. To exercise your rights, email us at
        nicole@trypetpro.com.
      </p>

      <h2>15. Children's Privacy</h2>
      <p>
        Our services are intended for pet owners and business operators who are 18 years of age or
        older. We do not knowingly collect personal information from children under 18.
      </p>

      <h2>16. International Users</h2>
      <p>
        PetPro and Pamperedlittlepaws operate from the United States. If you access our services
        from outside the United States, your information will be transferred to and stored in the
        United States, which may have different data protection laws than your country.
      </p>

      <h2>17. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be posted on
        this page with a new "Last updated" date. For PetPro subscribers, we will provide at least
        14 days' advance notice by email or in-app notice for material changes.
      </p>

      <h2>18. Contact Us</h2>
      <ul>
        <li><strong>Legal entity:</strong> Pamperedlittlepaws LLC</li>
        <li><strong>Doing business as:</strong> PetPro</li>
        <li><strong>Address:</strong> 13623 Barons Lake Lane, Cypress, TX 77429</li>
        <li><strong>Grooming &amp; boarding phone:</strong> 281-800-9776</li>
        <li><strong>PetPro software support email:</strong> nicole@trypetpro.com</li>
      </ul>

      <p style={{ marginTop: '48px', padding: '16px', background: '#f6f6f8', borderRadius: '8px', fontSize: '14px', color: '#555' }}>
        <a href="/terms" style={{ color: '#0057ff' }}>View Terms and Conditions</a>
      </p>

      <p style={{ marginTop: '16px', fontSize: '13px', color: '#888', textAlign: 'center' }}>
        © 2026 Pamperedlittlepaws LLC. All rights reserved.
      </p>
    </div>
  )
}

export default Privacy
