import { useNavigate } from 'react-router-dom'

export default function YearEndForms() {
  var navigate = useNavigate()
  var currentYear = new Date().getFullYear()

  return (
    <div className="yef-page">
      <div className="yef-header">
        <div>
          <h1>📄 Year-End Forms</h1>
          <p className="yef-subtitle">
            Generate W-2s, 1099s, and quarterly 941 forms for your accountant.
          </p>
        </div>
        <button className="yef-back" onClick={function() { navigate('/payroll') }}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="yef-coming-soon">
        <div className="yef-coming-icon">🗓️</div>
        <h2>Coming Soon</h2>
        <p>
          Year-end forms will be available once you've run payroll through a full tax year.
        </p>

        <div className="yef-forms-grid">
          <div className="yef-form-card">
            <div className="yef-form-icon">📋</div>
            <h3>W-2 (Employees)</h3>
            <p>Annual wage & tax statement for each W-2 staff member.</p>
            <div className="yef-form-status">Planned for January {currentYear + 1}</div>
          </div>

          <div className="yef-form-card">
            <div className="yef-form-icon">📝</div>
            <h3>1099-NEC (Contractors)</h3>
            <p>Non-employee compensation form for each 1099 contractor.</p>
            <div className="yef-form-status">Planned for January {currentYear + 1}</div>
          </div>

          <div className="yef-form-card">
            <div className="yef-form-icon">🏛️</div>
            <h3>Form 941 (Quarterly)</h3>
            <p>Employer's quarterly federal tax return (FICA + federal withholding).</p>
            <div className="yef-form-status">Planned quarterly</div>
          </div>

          <div className="yef-form-card">
            <div className="yef-form-icon">🗂️</div>
            <h3>Form 940 (Annual)</h3>
            <p>Employer's annual federal unemployment (FUTA) tax return.</p>
            <div className="yef-form-status">Planned for January {currentYear + 1}</div>
          </div>
        </div>

        <p className="yef-note">
          💡 <strong>Note:</strong> PetPro generates these forms for you to review and hand to
          your accountant. We do <strong>not</strong> file with the IRS on your behalf.
        </p>
      </div>
    </div>
  )
}
