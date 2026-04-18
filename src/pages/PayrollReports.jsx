import { useNavigate } from 'react-router-dom'

export default function PayrollReports() {
  var navigate = useNavigate()

  return (
    <div className="pr-page">
      <div className="pr-header">
        <div>
          <h1>📊 Payroll Reports</h1>
          <p className="pr-subtitle">
            Summary reports, YTD totals, and exports for your accountant.
          </p>
        </div>
        <button className="pr-back" onClick={function() { navigate('/payroll') }}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="pr-coming-soon">
        <div className="pr-coming-icon">🚧</div>
        <h2>Coming Soon</h2>
        <p>
          This is where you'll be able to generate payroll reports once you've run your first
          pay period.
        </p>

        <div className="pr-preview">
          <h3>Planned reports:</h3>
          <ul>
            <li>📅 <strong>Payroll Summary</strong> — all paychecks in a date range</li>
            <li>👤 <strong>By Staff Member</strong> — YTD earnings per person</li>
            <li>💰 <strong>Tax Liability Report</strong> — what you owe the IRS & state</li>
            <li>🧾 <strong>Employer Tax Report</strong> — FICA matches + FUTA + SUTA</li>
            <li>💡 <strong>Tips Report</strong> — reported tips per staff (for W-2 Box 7)</li>
            <li>📎 <strong>QuickBooks CSV Export</strong> — drop into your accountant's books</li>
          </ul>
        </div>

        <p className="pr-next">
          Once you've set up Tax Settings and run your first payroll, come back here.
        </p>
      </div>
    </div>
  )
}
