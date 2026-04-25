import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getBreedDefaults } from '../lib/breedDefaults'
import BreedPicker from '../components/BreedPicker'
import { DOG_BREEDS, CAT_BREEDS } from '../lib/breeds'

export default function AddPet() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Smart auto-fill: once groomer manually picks a coat type, stop auto-filling on breed change
  const [coatManuallyChanged, setCoatManuallyChanged] = useState(false)
  const [form, setForm] = useState({
    // Basic Info
    name: '',
    species: 'dog', // dog or cat — drives the breed picker filter
    breed: '',
    weight: '',
    age: '',
    sex: 'female',
    is_spayed_neutered: false,

    // Safety Fields
    allergies: '',
    medications: '',
    vaccination_status: 'unknown',
    vaccination_expiry: '',
    is_senior: false,
    hip_joint_issues: false,
    front_leg_sensitivity: false,
    collapsed_trachea: false,

    // Behavior and Handling
    behavior_notes: '',
    anxiety_level: 'none',
    dog_aggressive: false,
    people_aggressive: false,
    bite_history: false,
    good_with_dryer: true,
    muzzle_required: false,
    handling_fee: false,

    // Coat
    coat_type: 'smooth',
    matting_level: 'none',
    matting_notes: '',
    last_groom_date: '',

    // Notes
    grooming_notes: '',
    special_notes: '',
  })

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    const newValue = type === 'checkbox' ? checked : value

    // Groomer manually picked a coat type → lock it so future breed edits don't overwrite
    if (name === 'coat_type') {
      setCoatManuallyChanged(true)
      setForm({ ...form, coat_type: newValue })
      return
    }

    // Breed changed → try to auto-fill coat_type (only if groomer hasn't manually picked one)
    if (name === 'breed' && !coatManuallyChanged) {
      const defaults = getBreedDefaults(newValue)
      if (defaults.coat_type) {
        setForm({ ...form, breed: newValue, coat_type: defaults.coat_type })
        return
      }
    }

    setForm({ ...form, [name]: newValue })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Require weight + age — Claude needs both to quote price ranges accurately
    if (!form.weight || Number(form.weight) <= 0) {
      setError('Weight is required (in lbs) — Claude uses it to quote accurate prices.')
      setLoading(false)
      return
    }
    if (form.age === '' || form.age === null || Number(form.age) < 0) {
      setError('Age is required (in years).')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    // Clean up empty strings to null for optional fields
    const cleanForm = { ...form }
    if (!cleanForm.weight) cleanForm.weight = null
    if (!cleanForm.age) cleanForm.age = null
    if (!cleanForm.vaccination_expiry) cleanForm.vaccination_expiry = null
    if (!cleanForm.last_groom_date) cleanForm.last_groom_date = null

    const { error: insertError } = await supabase
      .from('pets')
      .insert({
        ...cleanForm,
        client_id: clientId,
        groomer_id: user.id,
      })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    navigate(`/clients/${clientId}`)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Add New Pet</h1>
      </div>

      <form onSubmit={handleSubmit} className="form-card">

        {/* BASIC INFO */}
        <h2 className="form-section-title">Basic Info</h2>
        <div className="form-row">
          <div className="form-group">
            <label>Pet Name *</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Species *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={function () { setForm({ ...form, species: 'dog', breed: '' }) }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid ' + (form.species === 'dog' ? '#7c3aed' : '#d1d5db'),
                  background: form.species === 'dog' ? '#7c3aed' : '#fff',
                  color: form.species === 'dog' ? '#fff' : '#374151',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                🐶 Dog
              </button>
              <button
                type="button"
                onClick={function () { setForm({ ...form, species: 'cat', breed: '' }) }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid ' + (form.species === 'cat' ? '#7c3aed' : '#d1d5db'),
                  background: form.species === 'cat' ? '#7c3aed' : '#fff',
                  color: form.species === 'cat' ? '#fff' : '#374151',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                🐱 Cat
              </button>
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ width: '100%' }}>
            <label>Breed *</label>
            <BreedPicker
              value={form.breed}
              onChange={function (newBreed) {
                // Reuse handleChange's coat auto-fill logic by simulating an event
                handleChange({ target: { name: 'breed', value: newBreed, type: 'text' } })
              }}
              breeds={form.species === 'cat' ? CAT_BREEDS : DOG_BREEDS}
              placeholder={form.species === 'cat' ? 'Search or type a cat breed...' : 'Search or type a dog breed...'}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Weight (lbs) *</label>
            <input type="number" name="weight" value={form.weight} onChange={handleChange} required min="0" step="0.1" placeholder="e.g. 45" />
          </div>
          <div className="form-group">
            <label>Age (years) *</label>
            <input type="number" name="age" value={form.age} onChange={handleChange} required min="0" step="0.5" placeholder="e.g. 3" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Sex</label>
            <select name="sex" value={form.sex} onChange={handleChange}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>
          <div className="form-group checkbox-group">
            <label>
              <input type="checkbox" name="is_spayed_neutered" checked={form.is_spayed_neutered} onChange={handleChange} />
              Spayed / Neutered
            </label>
          </div>
        </div>

        {/* SAFETY FIELDS */}
        <h2 className="form-section-title">Safety Info</h2>

        <div className="form-group">
          <label>Allergies</label>
          <textarea name="allergies" value={form.allergies} onChange={handleChange} rows={2} placeholder="List any known allergies..." />
        </div>

        <div className="form-group">
          <label>Medications</label>
          <textarea name="medications" value={form.medications} onChange={handleChange} rows={2} placeholder="Current medications and schedule..." />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Vaccination Status</label>
            <select name="vaccination_status" value={form.vaccination_status} onChange={handleChange}>
              <option value="current">Current</option>
              <option value="expired">Expired</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="form-group">
            <label>Vaccination Expiry Date</label>
            <input type="date" name="vaccination_expiry" value={form.vaccination_expiry} onChange={handleChange} />
          </div>
        </div>

        <div className="checkbox-grid">
          <label className="checkbox-label">
            <input type="checkbox" name="is_senior" checked={form.is_senior} onChange={handleChange} />
            Senior Dog
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="hip_joint_issues" checked={form.hip_joint_issues} onChange={handleChange} />
            Hip / Joint Issues
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="front_leg_sensitivity" checked={form.front_leg_sensitivity} onChange={handleChange} />
            Front Leg Sensitivity
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="collapsed_trachea" checked={form.collapsed_trachea} onChange={handleChange} />
            Collapsed Trachea (Shoulder Wrap Only)
          </label>
        </div>

        {/* BEHAVIOR AND HANDLING */}
        <h2 className="form-section-title">Behavior & Handling</h2>

        <div className="form-group">
          <label>Behavior Notes</label>
          <textarea name="behavior_notes" value={form.behavior_notes} onChange={handleChange} rows={2} placeholder="Anxiety triggers, reactivity, temperament..." />
        </div>

        <div className="form-group">
          <label>Anxiety Level</label>
          <select name="anxiety_level" value={form.anxiety_level} onChange={handleChange}>
            <option value="none">None</option>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
        </div>

        <div className="checkbox-grid">
          <label className="checkbox-label danger">
            <input type="checkbox" name="dog_aggressive" checked={form.dog_aggressive} onChange={handleChange} />
            Dog Aggressive
          </label>
          <label className="checkbox-label danger">
            <input type="checkbox" name="people_aggressive" checked={form.people_aggressive} onChange={handleChange} />
            People Aggressive
          </label>
          <label className="checkbox-label danger">
            <input type="checkbox" name="bite_history" checked={form.bite_history} onChange={handleChange} />
            Bite History
          </label>
          <label className="checkbox-label danger">
            <input type="checkbox" name="muzzle_required" checked={form.muzzle_required} onChange={handleChange} />
            Muzzle Required
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="good_with_dryer" checked={form.good_with_dryer} onChange={handleChange} />
            Good With Dryer
          </label>
          <label className="checkbox-label warning">
            <input type="checkbox" name="handling_fee" checked={form.handling_fee} onChange={handleChange} />
            Handling Fee Required
          </label>
        </div>

        {/* COAT */}
        <h2 className="form-section-title">Coat Info</h2>

        <div className="form-row">
          <div className="form-group">
            <label>Coat Type</label>
            <select name="coat_type" value={form.coat_type} onChange={handleChange}>
              <option value="smooth">Smooth</option>
              <option value="double">Double Coat</option>
              <option value="curly">Curly</option>
              <option value="wire">Wire / Rough</option>
              <option value="doodle">Doodle</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Matting Level</label>
            <select name="matting_level" value={form.matting_level} onChange={handleChange}>
              <option value="none">None</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Matting Notes</label>
          <textarea name="matting_notes" value={form.matting_notes} onChange={handleChange} rows={2} placeholder="Where on body, severity details..." />
        </div>

        <div className="form-group">
          <label>Last Groom Date</label>
          <input type="date" name="last_groom_date" value={form.last_groom_date} onChange={handleChange} />
        </div>

        {/* GROOMING NOTES */}
        <h2 className="form-section-title">Grooming Notes</h2>

        <div className="form-group">
          <label>Grooming Notes</label>
          <textarea name="grooming_notes" value={form.grooming_notes} onChange={handleChange} rows={3} placeholder="Blade preferences, style notes, anything the groomer needs to know..." />
        </div>

        <div className="form-group">
          <label>Special Notes</label>
          <textarea name="special_notes" value={form.special_notes} onChange={handleChange} rows={2} placeholder="Anything else not covered above..." />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate(`/clients/${clientId}`)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Pet'}
          </button>
        </div>
      </form>
    </div>
  )
}
