// ====================================================================
// PetPro: Terms and Conditions Page
// ====================================================================
// Public page (no login required).
// Covers BOTH:
//   (A) Pamperedlittlepaws grooming/boarding services + SMS program
//       (required for Twilio A2P 10DLC approval)
//   (B) PetPro SaaS software subscription
//       (required for Stripe live-mode approval)
// URL: /terms
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
        <strong>Pamperedlittlepaws LLC</strong> (doing business as <strong>PetPro</strong>)<br />
        Last updated: April 22, 2026
      </p>

      <p>
        These Terms and Conditions ("Terms") govern your use of services provided by
        Pamperedlittlepaws LLC ("we," "us," or "our"). Pamperedlittlepaws LLC operates two
        related offerings:
      </p>
      <ul>
        <li>
          <strong>Pamperedlittlepaws Grooming &amp; Boarding</strong> — in-person pet grooming and
          boarding services for pet owners.
        </li>
        <li>
          <strong>PetPro</strong> — a software-as-a-service (SaaS) platform for professional
          groomers and boarding facilities to manage bookings, clients, and communications.
        </li>
      </ul>
      <p>
        Sections 1–8 below apply to <strong>grooming and boarding clients</strong>. Sections
        9–20 apply to <strong>PetPro software subscribers</strong>. Sections 21+ apply to
        everyone.
      </p>

      <h2 style={{ marginTop: '40px', paddingTop: '16px', borderTop: '2px solid #eee' }}>
        Part A — Pamperedlittlepaws Grooming &amp; Boarding
      </h2>

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

      <h2>5. Payment (Grooming &amp; Boarding)</h2>
      <p>
        Payment for grooming and boarding services is due at the time of service. We accept cash,
        Zelle, Venmo, and card payments. Outstanding balances may result in holds on future
        bookings until paid.
      </p>

      <h2>6. Liability (Grooming &amp; Boarding)</h2>
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

      <h2>8. Contact (Grooming &amp; Boarding)</h2>
      <ul>
        <li><strong>Business:</strong> Pamperedlittlepaws</li>
        <li><strong>Phone:</strong> 281-800-9776</li>
      </ul>

      <h2 style={{ marginTop: '48px', paddingTop: '16px', borderTop: '2px solid #eee' }}>
        Part B — PetPro Software Subscription
      </h2>
      <p>
        The following sections apply if you create an account and subscribe to PetPro, our
        software platform for grooming and boarding professionals.
      </p>

      <h2>9. The PetPro Service</h2>
      <p>
        PetPro is a cloud-based software platform that helps pet grooming and boarding businesses
        manage appointments, client information, pet records, communications, and related business
        operations. PetPro is operated by Pamperedlittlepaws LLC, a Texas limited liability company.
      </p>

      <h2>10. Account and Eligibility</h2>
      <p>
        To use PetPro, you must create an account and provide accurate registration information.
        You must be at least 18 years old and authorized to enter into a binding agreement on behalf
        of yourself or the business you represent. You are responsible for maintaining the
        confidentiality of your login credentials and for all activity under your account.
      </p>

      <h2>11. Subscriptions, Free Trial, and Billing</h2>
      <p>
        PetPro is offered on a monthly subscription basis through tiered plans. When you subscribe,
        you agree to the following:
      </p>
      <ul>
        <li>
          <strong>Free trial:</strong> New accounts may be offered a free trial period (typically
          14 days). At the end of the trial, your selected plan will begin billing automatically
          unless you cancel before the trial ends.
        </li>
        <li>
          <strong>Monthly auto-renewal:</strong> Subscriptions renew automatically each month on
          the same date you first subscribed, using the payment method on file, until you cancel.
        </li>
        <li>
          <strong>Payment processor:</strong> Subscription payments are processed securely by
          Stripe. Pamperedlittlepaws LLC does not store full card numbers.
        </li>
        <li>
          <strong>Price changes:</strong> We may change subscription prices from time to time. You
          will be notified at least 30 days in advance of any price change affecting your plan, and
          the new price will apply to the next billing cycle following that notice.
        </li>
        <li>
          <strong>Taxes:</strong> Prices are exclusive of applicable sales or use taxes, which may
          be added at checkout where required by law.
        </li>
      </ul>

      <h2>12. Cancellation and Refunds (Subscription)</h2>
      <p>
        You may cancel your PetPro subscription at any time from your account settings or by
        contacting us. Cancellation takes effect at the end of your current billing period — you
        will continue to have access until that date and will not be charged again.
      </p>
      <p>
        <strong>All subscription fees are non-refundable</strong>, including for partial billing
        periods, except where a refund is required by applicable law. We do not provide refunds for
        unused time on a subscription, for accounts left open but not used, or for features you
        chose not to use.
      </p>

      <h2>13. Acceptable Use</h2>
      <p>
        You agree not to use PetPro to:
      </p>
      <ul>
        <li>Violate any law or regulation, including privacy, anti-spam, or consumer-protection laws.</li>
        <li>Send unsolicited marketing messages to recipients who have not opted in.</li>
        <li>Upload content that is illegal, infringing, harmful, or deceptive.</li>
        <li>Attempt to gain unauthorized access to other accounts, systems, or data.</li>
        <li>Interfere with, disrupt, or reverse-engineer the service.</li>
        <li>Resell, sublicense, or make the service available to third parties outside your business.</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate this section, with or without notice.
      </p>

      <h2>14. Your Data</h2>
      <p>
        You retain ownership of the business and client data you enter into PetPro ("Customer
        Data"). You grant Pamperedlittlepaws LLC a limited license to host, process, transmit, and
        display your Customer Data solely as needed to provide the service to you. You are
        responsible for having appropriate authorization from your clients to store their
        information (including pet information and phone numbers) in PetPro.
      </p>

      <h2>15. AI-Assisted Features</h2>
      <p>
        PetPro uses third-party artificial intelligence services to power features such as booking
        validation, schedule suggestions, and voice commands. These features may be powered by
        providers including Anthropic (Claude) and OpenAI (Whisper). AI output is generated
        automatically and may occasionally contain errors. You are responsible for reviewing and
        approving AI-assisted bookings and communications before relying on them for business
        decisions. PetPro's AI features are a helpful assistant — not a replacement for your
        professional judgment.
      </p>

      <h2>16. Intellectual Property</h2>
      <p>
        The PetPro software, interface, design, text, graphics, trademarks (including the names
        "PetPro" and "Pamperedlittlepaws"), and related materials are owned by Pamperedlittlepaws
        LLC and are protected by copyright, trademark, and other laws. Your subscription grants you
        a limited, non-exclusive, non-transferable license to use PetPro for your business during
        your active subscription. No other rights are granted.
      </p>

      <h2>17. Third-Party Services</h2>
      <p>
        PetPro integrates with third-party services including (but not limited to) Stripe
        (payments), Twilio (SMS), Supabase (database and authentication), Vercel (hosting),
        Anthropic (Claude AI), and OpenAI (Whisper). Your use of features that rely on these
        services is also subject to those providers' terms. We are not responsible for outages,
        errors, or changes in third-party services outside our control.
      </p>

      <h2>18. Disclaimers</h2>
      <p>
        PetPro is provided <strong>"AS IS"</strong> and <strong>"AS AVAILABLE"</strong> without
        warranties of any kind, whether express, implied, or statutory, including but not limited
        to warranties of merchantability, fitness for a particular purpose, non-infringement, or
        uninterrupted operation. We do not warrant that the service will be error-free, secure, or
        available at all times.
      </p>

      <h2>19. Limitation of Liability (Subscription)</h2>
      <p>
        To the maximum extent permitted by law, Pamperedlittlepaws LLC and its officers, members,
        and agents shall not be liable for any indirect, incidental, special, consequential, or
        punitive damages, or for lost profits, lost revenue, lost data, or business interruption,
        arising out of or relating to your use of PetPro, even if advised of the possibility of
        such damages.
      </p>
      <p>
        Our total cumulative liability for any claim arising out of or relating to PetPro shall not
        exceed the total subscription fees you paid to us in the twelve (12) months immediately
        preceding the event giving rise to the claim.
      </p>

      <h2>20. Termination</h2>
      <p>
        You may terminate your account at any time by cancelling your subscription. We may
        terminate or suspend your account if you violate these Terms, fail to pay subscription
        fees, or use the service in a way that creates risk or legal exposure for us or other
        users. Upon termination, your right to use the service ends, and we may delete your
        Customer Data after a reasonable retention period as described in our Privacy Policy.
      </p>

      <h2 style={{ marginTop: '48px', paddingTop: '16px', borderTop: '2px solid #eee' }}>
        Part C — General Terms (Apply to Everyone)
      </h2>

      <h2>21. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of Texas, without regard to its conflict
        of law principles. Any dispute arising out of or relating to these Terms or the services
        shall be brought exclusively in the state or federal courts located in Harris County,
        Texas, and you consent to the personal jurisdiction of those courts.
      </p>

      <h2>22. Changes to These Terms</h2>
      <p>
        We may update these Terms and Conditions from time to time. Material changes will be
        announced by posting the updated Terms on this page with a new "Last updated" date. For
        subscribers, we will provide at least 14 days' notice of material changes by email or
        in-app notice before they take effect. Your continued use of the services after the
        effective date constitutes acceptance of the updated Terms.
      </p>

      <h2>23. Contact</h2>
      <ul>
        <li><strong>Legal entity:</strong> Pamperedlittlepaws LLC</li>
        <li><strong>Doing business as:</strong> PetPro</li>
        <li><strong>Address:</strong> 13623 Barons Lake Lane, Cypress, TX 77429</li>
        <li><strong>Grooming &amp; boarding phone:</strong> 281-800-9776</li>
        <li><strong>PetPro software support email:</strong> nicole@trypetpro.com</li>
      </ul>

      <p style={{ marginTop: '48px', padding: '16px', background: '#f6f6f8', borderRadius: '8px', fontSize: '14px', color: '#555' }}>
        <a href="/privacy" style={{ color: '#0057ff' }}>View Privacy Policy</a>
      </p>

      <p style={{ marginTop: '16px', fontSize: '13px', color: '#888', textAlign: 'center' }}>
        © 2026 Pamperedlittlepaws LLC. All rights reserved.
      </p>
    </div>
  )
}

export default Terms
