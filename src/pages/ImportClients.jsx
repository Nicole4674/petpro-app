import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

export default function ImportClients() {
  const [step, setStep] = useState('upload') // upload, preview, importing, done
  const [rawData, setRawData] = useState([])
  const [parsedClients, setParsedClients] = useState([])
  const [importStats, setImportStats] = useState(null)
  const [progress, setProgress] = useState(0)
  const [errors, setErrors] = useState([])
  const [filterStatus, setFilterStatus] = useState('all') // all, active, inactive
  const [selectAll, setSelectAll] = useState(true)
  const [selectedRows, setSelectedRows] = useState({})
  const fileInputRef = useRef(null)

  // Clean up MoeGo encoding artifacts
  function cleanText(text) {
    if (!text) return ''
    return text
      .replace(/Â/g, '')
      .replace(/\s*\(h\)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Parse pet(breed) format like "Sadie(Havanese),Lucy(Shih Tzu)"
  function parsePets(petString) {
    if (!petString || !petString.trim()) return []
    var pets = []
    // Split by comma but be careful with breeds that might have commas
    var parts = petString.split('),')
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim()
      if (!part) continue
      // Add back the closing paren if it was split off (except last one)
      if (i < parts.length - 1) part = part + ')'
      // Remove trailing ) if it has one
      part = part.replace(/\)$/, '')
      var match = part.match(/^([^(]+)\((.+)/)
      if (match) {
        pets.push({
          name: cleanText(match[1]),
          breed: cleanText(match[2])
        })
      } else {
        // No breed info, just a name
        pets.push({
          name: cleanText(part.replace(/[()]/g, '')),
          breed: ''
        })
      }
    }
    return pets
  }

  // Parse the MoeGo CSV/TSV file
  function parseFile(text) {
    var lines = text.split('\n').filter(function(line) { return line.trim().length > 0 })
    if (lines.length < 2) {
      setErrors(['File appears empty or has no data rows'])
      return
    }

    // Parse header row
    var headerLine = lines[0]
    var headers = parseRow(headerLine)

    // Map header names to indices (clean up whitespace and quotes)
    var headerMap = {}
    for (var h = 0; h < headers.length; h++) {
      var cleanHeader = headers[h].replace(/"/g, '').replace(/\t/g, '').trim().toLowerCase()
      headerMap[cleanHeader] = h
    }
    // Debug: log what headers we found and first row
    console.log('Parsed headers:', headerMap)
    console.log('Number of headers:', headers.length)
    console.log('Raw headers:', headers)
    if (lines.length > 1) {
      var firstRow = parseRow(lines[1])
      console.log('First data row values:', firstRow)
      console.log('First row length:', firstRow.length)
    }

    // Parse data rows
    var clients = []
    var parseErrors = []

    for (var i = 1; i < lines.length; i++) {
      try {
        var values = parseRow(lines[i])
        if (values.length < 3) continue // Skip empty or malformed rows

        var firstName = getVal(values, headerMap, 'first name')
        var lastName = getVal(values, headerMap, 'last name')

        // Skip rows with no name
        if (!firstName && !lastName) continue

        var petString = getVal(values, headerMap, 'pet(breed)')
        var pets = parsePets(petString)
        var notes = getVal(values, headerMap, 'notes')
        var tags = getVal(values, headerMap, 'tags')
        var prefFreq = getVal(values, headerMap, 'preferred frequency')
        var status = getVal(values, headerMap, 'status') || 'active'

        // Combine tags and preferred frequency into booking notes
        var bookingNotes = []
        if (tags) bookingNotes.push(tags)
        if (prefFreq) bookingNotes.push('Preferred frequency: ' + prefFreq)

        clients.push({
          selected: true,
          first_name: cleanText(firstName),
          last_name: cleanText(lastName),
          email: cleanText(getVal(values, headerMap, 'email')),
          phone: cleanText(getVal(values, headerMap, 'primary contact')),
          alt_phone: cleanText(getVal(values, headerMap, 'additional contact')),
          address: cleanText(getVal(values, headerMap, 'address')),
          notes: cleanText(notes),
          booking_notes: bookingNotes.join(' | '),
          status: status.toLowerCase().trim(),
          pets: pets,
          total_sales: getVal(values, headerMap, 'total sales'),
          last_service: getVal(values, headerMap, 'last service'),
          next_service: getVal(values, headerMap, 'next service'),
          total_bookings: getVal(values, headerMap, 'total booking number'),
          overdue_days: getVal(values, headerMap, 'overdue days'),
          row_number: i + 1
        })
      } catch (err) {
        parseErrors.push('Row ' + (i + 1) + ': ' + err.message)
      }
    }

    if (parseErrors.length > 0) {
      setErrors(parseErrors)
    }

    return clients
  }

  // Parse an Excel (.xlsx/.xls) workbook from an ArrayBuffer
  function parseExcelWorkbook(arrayBuffer) {
    try {
      var workbook = XLSX.read(arrayBuffer, { type: 'array' })
      var firstSheetName = workbook.SheetNames[0]
      if (!firstSheetName) {
        setErrors(['Excel file has no sheets'])
        return []
      }
      var sheet = workbook.Sheets[firstSheetName]
      // header:1 -> array of arrays (first row = headers). raw:false -> values as strings.
      var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })

      if (!rows || rows.length < 2) {
        setErrors(['Excel file appears empty or has no data rows'])
        return []
      }

      // Build header map (same shape as parseFile)
      var headers = rows[0] || []
      var headerMap = {}
      for (var h = 0; h < headers.length; h++) {
        var cleanHeader = String(headers[h] || '').replace(/"/g, '').replace(/\t/g, '').trim().toLowerCase()
        headerMap[cleanHeader] = h
      }
      console.log('Excel parsed headers:', headerMap)
      console.log('Excel total rows:', rows.length)

      var clients = []
      var parseErrors = []

      for (var i = 1; i < rows.length; i++) {
        try {
          var raw = rows[i] || []
          // Normalize every cell to a string so downstream helpers stay happy
          var values = []
          for (var v = 0; v < raw.length; v++) {
            values.push(raw[v] != null ? String(raw[v]) : '')
          }
          if (values.length < 3) continue

          var firstName = getVal(values, headerMap, 'first name')
          var lastName = getVal(values, headerMap, 'last name')
          if (!firstName && !lastName) continue

          var petString = getVal(values, headerMap, 'pet(breed)')
          var pets = parsePets(petString)
          var notes = getVal(values, headerMap, 'notes')
          var tags = getVal(values, headerMap, 'tags')
          var prefFreq = getVal(values, headerMap, 'preferred frequency')
          var status = getVal(values, headerMap, 'status') || 'active'

          var bookingNotes = []
          if (tags) bookingNotes.push(tags)
          if (prefFreq) bookingNotes.push('Preferred frequency: ' + prefFreq)

          clients.push({
            selected: true,
            first_name: cleanText(firstName),
            last_name: cleanText(lastName),
            email: cleanText(getVal(values, headerMap, 'email')),
            phone: cleanText(getVal(values, headerMap, 'primary contact')),
            alt_phone: cleanText(getVal(values, headerMap, 'additional contact')),
            address: cleanText(getVal(values, headerMap, 'address')),
            notes: cleanText(notes),
            booking_notes: bookingNotes.join(' | '),
            status: status.toLowerCase().trim(),
            pets: pets,
            total_sales: getVal(values, headerMap, 'total sales'),
            last_service: getVal(values, headerMap, 'last service'),
            next_service: getVal(values, headerMap, 'next service'),
            total_bookings: getVal(values, headerMap, 'total booking number'),
            overdue_days: getVal(values, headerMap, 'overdue days'),
            row_number: i + 1
          })
        } catch (err) {
          parseErrors.push('Row ' + (i + 1) + ': ' + err.message)
        }
      }

      if (parseErrors.length > 0) {
        setErrors(parseErrors)
      }

      return clients
    } catch (err) {
      setErrors(['Failed to read Excel file: ' + err.message])
      return []
    }
  }

  // Parse a single row — handles BOTH MoeGo's weird tab-comma format AND standard CSV
  // MoeGo format: "value"\t,"value"\t,"value"\t,  (delimiter is \t,)
  // Standard CSV: value,value,value  (delimiter is just a comma, but respects quoted strings)
  function parseRow(line) {
    var parts
    // If the line has the MoeGo tab-comma delimiter, use that
    if (line.indexOf('\t,') !== -1) {
      parts = line.split('\t,')
    } else {
      // Otherwise treat as standard CSV (respecting quoted values with commas inside)
      parts = splitCSVLine(line)
    }
    var values = []
    for (var i = 0; i < parts.length; i++) {
      values.push(parts[i].replace(/"/g, '').replace(/\t/g, '').trim())
    }
    return values
  }

  // Split a standard CSV line — handles quoted values with commas inside them
  function splitCSVLine(line) {
    var result = []
    var current = ''
    var inQuotes = false
    for (var i = 0; i < line.length; i++) {
      var ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current)
    return result
  }

  // Get value from row by header name (flexible match — tries exact, then with/without spaces)
  function getVal(values, headerMap, headerName) {
    var idx = headerMap[headerName]
    // If exact match didn't work, try matching by stripping all spaces from the header names
    if (idx === undefined) {
      var target = headerName.replace(/\s+/g, '')
      for (var key in headerMap) {
        if (key.replace(/\s+/g, '') === target) {
          idx = headerMap[key]
          break
        }
      }
    }
    if (idx === undefined || idx >= values.length) return ''
    return (values[idx] || '').replace(/"/g, '').replace(/\t/g, '').trim()
  }

  // Handle file upload
  function handleFileUpload(e) {
    var file = e.target.files[0]
    if (!file) return

    setErrors([])
    var fileName = (file.name || '').toLowerCase()
    var isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')

    var reader = new FileReader()
    reader.onload = function(event) {
      var clients
      if (isExcel) {
        clients = parseExcelWorkbook(event.target.result)
      } else {
        var text = event.target.result
        clients = parseFile(text)
      }
      if (clients && clients.length > 0) {
        setParsedClients(clients)
        // Initialize all as selected
        var selected = {}
        for (var i = 0; i < clients.length; i++) {
          selected[i] = true
        }
        setSelectedRows(selected)
        setSelectAll(true)
        setStep('preview')
      }
    }

    if (isExcel) {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file)
    }
  }

  // Toggle select all
  function handleSelectAll() {
    var newVal = !selectAll
    setSelectAll(newVal)
    var newSelected = {}
    var filtered = getFilteredClients()
    for (var i = 0; i < parsedClients.length; i++) {
      // Only toggle filtered ones
      var isFiltered = false
      for (var f = 0; f < filtered.length; f++) {
        if (filtered[f]._origIndex === i) { isFiltered = true; break }
      }
      if (isFiltered) {
        newSelected[i] = newVal
      } else {
        newSelected[i] = selectedRows[i] || false
      }
    }
    setSelectedRows(newSelected)
  }

  // Toggle single row
  function toggleRow(origIndex) {
    var newSelected = Object.assign({}, selectedRows)
    newSelected[origIndex] = !newSelected[origIndex]
    setSelectedRows(newSelected)
  }

  // Get filtered clients based on status filter
  function getFilteredClients() {
    var filtered = []
    for (var i = 0; i < parsedClients.length; i++) {
      var client = Object.assign({}, parsedClients[i])
      client._origIndex = i
      if (filterStatus === 'all') {
        filtered.push(client)
      } else if (filterStatus === client.status) {
        filtered.push(client)
      }
    }
    return filtered
  }

  // Count selected
  function getSelectedCount() {
    var count = 0
    for (var key in selectedRows) {
      if (selectedRows[key]) count++
    }
    return count
  }

  // Count total pets in selected clients
  function getSelectedPetCount() {
    var count = 0
    for (var key in selectedRows) {
      if (selectedRows[key] && parsedClients[key]) {
        count = count + parsedClients[key].pets.length
      }
    }
    return count
  }

  // Import selected clients
  async function doImport() {
    setStep('importing')
    setProgress(0)
    setErrors([])

    var importErrors = []
    var clientsImported = 0
    var petsImported = 0
    var skipped = 0

    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setErrors(['Not logged in. Please log in first.'])
        setStep('preview')
        return
      }

      // Get selected clients
      var toImport = []
      for (var key in selectedRows) {
        if (selectedRows[key] && parsedClients[key]) {
          toImport.push(parsedClients[key])
        }
      }

      var total = toImport.length

      for (var i = 0; i < toImport.length; i++) {
        var client = toImport[i]
        setProgress(Math.round(((i + 1) / total) * 100))

        try {
          // Format phone - add +1 if it's 10 digits
          var phone = (client.phone || '').replace(/\D/g, '')
          if (phone.length === 10) phone = '1' + phone
          if (phone.length === 11 && phone[0] === '1') phone = '+' + phone
          if (phone && phone[0] !== '+') phone = '+' + phone

          // Check if client already exists by phone
          var existingClient = null
          if (phone) {
            var { data: existing } = await supabase
              .from('clients')
              .select('id')
              .eq('groomer_id', user.id)
              .eq('phone', phone)
              .limit(1)

            if (existing && existing.length > 0) {
              existingClient = existing[0]
            }
          }

          // Also check by name if no phone match
          if (!existingClient && client.first_name && client.last_name) {
            var { data: existingByName } = await supabase
              .from('clients')
              .select('id')
              .eq('groomer_id', user.id)
              .ilike('first_name', client.first_name)
              .ilike('last_name', client.last_name)
              .limit(1)

            if (existingByName && existingByName.length > 0) {
              existingClient = existingByName[0]
            }
          }

          var clientId = null

          if (existingClient) {
            // Client already exists, skip creating but still add pets
            clientId = existingClient.id
            skipped++
          } else {
            // Build notes combining MoeGo notes + booking notes
            var combinedNotes = ''
            if (client.notes) combinedNotes = client.notes
            if (client.booking_notes) {
              if (combinedNotes) combinedNotes = combinedNotes + ' | '
              combinedNotes = combinedNotes + client.booking_notes
            }

            // Create the client
            var clientData = {
              groomer_id: user.id,
              first_name: client.first_name,
              last_name: client.last_name || '',
              phone: phone || '',
              email: client.email || null,
              address: client.address || null,
              notes: combinedNotes || null,
            }

            var { data: newClient, error: clientErr } = await supabase
              .from('clients')
              .insert(clientData)
              .select('id')
              .single()

            if (clientErr) {
              importErrors.push(client.first_name + ' ' + client.last_name + ': ' + clientErr.message)
              continue
            }

            clientId = newClient.id
            clientsImported++
          }

          // Import pets for this client
          if (clientId && client.pets.length > 0) {
            for (var p = 0; p < client.pets.length; p++) {
              var pet = client.pets[p]

              // Check if pet already exists for this client
              var { data: existingPet } = await supabase
                .from('pets')
                .select('id')
                .eq('client_id', clientId)
                .eq('groomer_id', user.id)
                .ilike('name', pet.name)
                .limit(1)

              if (existingPet && existingPet.length > 0) {
                // Pet already exists, skip
                continue
              }

              var petData = {
                groomer_id: user.id,
                client_id: clientId,
                name: pet.name,
                breed: pet.breed || null,
              }

              // If the client has grooming notes and only 1 pet, attach to pet
              if (client.pets.length === 1 && client.notes) {
                // Check if notes are grooming-related (blade numbers, A/O, etc)
                var notesLower = client.notes.toLowerCase()
                if (notesLower.indexOf('a/o') >= 0 || notesLower.indexOf('blade') >= 0 ||
                    notesLower.indexOf('comb') >= 0 || notesLower.indexOf('shave') >= 0 ||
                    notesLower.indexOf('trim') >= 0 || notesLower.indexOf('cut') >= 0 ||
                    notesLower.indexOf('gland') >= 0 || notesLower.indexOf('matted') >= 0 ||
                    notesLower.indexOf('tbh') >= 0 || notesLower.indexOf('face') >= 0 ||
                    notesLower.indexOf('feet') >= 0 || notesLower.indexOf('ears') >= 0 ||
                    /\d+[a-z]?\s*(a\/o|all over|blade)/i.test(client.notes)) {
                  petData.grooming_notes = client.notes
                }
              }

              var { data: newPet, error: petErr } = await supabase
                .from('pets')
                .insert(petData)
                .select('id')
                .single()

              if (petErr) {
                importErrors.push(pet.name + ' (pet of ' + client.first_name + '): ' + petErr.message)
              } else {
                petsImported++
              }
            }
          }
        } catch (rowErr) {
          importErrors.push(client.first_name + ' ' + client.last_name + ': ' + rowErr.message)
        }
      }
    } catch (err) {
      importErrors.push('Import failed: ' + err.message)
    }

    setErrors(importErrors)
    setImportStats({
      clients: clientsImported,
      pets: petsImported,
      skipped: skipped,
      errors: importErrors.length
    })
    setStep('done')
  }

  // Export current PetPro clients to CSV
  async function doExport() {
    try {
      var { data: { user } } = await supabase.auth.getUser()

      var { data: clients } = await supabase
        .from('clients')
        .select('*, pets(*)')
        .eq('groomer_id', user.id)
        .order('last_name')

      if (!clients || clients.length === 0) {
        setErrors(['No clients to export'])
        return
      }

      // Build CSV
      var csvLines = []
      csvLines.push('First Name,Last Name,Phone,Email,Address,Notes,Pet Name,Pet Breed,Pet Weight,Grooming Notes,Special Notes,Allergies,Medications')

      for (var i = 0; i < clients.length; i++) {
        var c = clients[i]
        if (c.pets && c.pets.length > 0) {
          for (var p = 0; p < c.pets.length; p++) {
            var pet = c.pets[p]
            csvLines.push(csvRow([
              c.first_name, c.last_name, c.phone, c.email, c.address, c.notes,
              pet.name, pet.breed, pet.weight, pet.grooming_notes, pet.special_notes,
              pet.allergies, pet.medications
            ]))
          }
        } else {
          csvLines.push(csvRow([
            c.first_name, c.last_name, c.phone, c.email, c.address, c.notes,
            '', '', '', '', '', '', ''
          ]))
        }
      }

      var csvContent = csvLines.join('\n')
      var blob = new Blob([csvContent], { type: 'text/csv' })
      var url = URL.createObjectURL(blob)
      var a = document.createElement('a')
      a.href = url
      a.download = 'petpro-clients-export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setErrors(['Export failed: ' + err.message])
    }
  }

  function csvRow(values) {
    return values.map(function(v) {
      var val = (v || '').toString().replace(/"/g, '""')
      return '"' + val + '"'
    }).join(',')
  }

  // Reset everything
  function resetImport() {
    setStep('upload')
    setRawData([])
    setParsedClients([])
    setImportStats(null)
    setProgress(0)
    setErrors([])
    setSelectedRows({})
    setSelectAll(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Count stats
  var activeCount = 0
  var inactiveCount = 0
  var totalPets = 0
  var doNotBookCount = 0
  for (var i = 0; i < parsedClients.length; i++) {
    if (parsedClients[i].status === 'active') activeCount++
    if (parsedClients[i].status === 'inactive') inactiveCount++
    totalPets = totalPets + parsedClients[i].pets.length
    var n = (parsedClients[i].notes || '').toLowerCase()
    if (n.indexOf('do not book') >= 0) doNotBookCount++
  }

  return (
    <div className="import-page">
      <div className="import-header">
        <h1>Import / Export Clients</h1>
        <p className="import-subtitle">Import your clients from MoeGo or export your PetPro data</p>
      </div>

      {/* UPLOAD STEP */}
      {step === 'upload' && (
        <div className="import-content">
          <div className="import-card">
            <h2>Import from MoeGo</h2>
            <p>Export your client list from MoeGo as a CSV or TSV file, then upload it here. PetPro will automatically parse your clients and pets.</p>

            <div className="import-dropzone" onClick={function() { fileInputRef.current && fileInputRef.current.click() }}>
              <div className="dropzone-icon">📁</div>
              <div className="dropzone-text">Click to upload your client list</div>
              <div className="dropzone-hint">Supports .csv, .tsv, .xlsx, and .xls files</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>

            <div className="import-tips">
              <h3>How to export from MoeGo:</h3>
              <p>1. Go to MoeGo → Clients → Export</p>
              <p>2. Select "All Clients" and download</p>
              <p>3. Upload the file here</p>
            </div>
          </div>

          <div className="import-card">
            <h2>Export PetPro Data</h2>
            <p>Download all your PetPro clients and pets as a CSV file for backup or transfer.</p>
            <button className="import-btn export-btn" onClick={doExport}>
              Download CSV Export
            </button>
          </div>
        </div>
      )}

      {/* PREVIEW STEP */}
      {step === 'preview' && (
        <div className="import-content">
          <div className="import-stats-bar">
            <div className="import-stat">
              <span className="stat-number">{parsedClients.length}</span>
              <span className="stat-label">Total Clients</span>
            </div>
            <div className="import-stat">
              <span className="stat-number">{totalPets}</span>
              <span className="stat-label">Total Pets</span>
            </div>
            <div className="import-stat stat-green">
              <span className="stat-number">{activeCount}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="import-stat stat-gray">
              <span className="stat-number">{inactiveCount}</span>
              <span className="stat-label">Inactive</span>
            </div>
            {doNotBookCount > 0 && (
              <div className="import-stat stat-red">
                <span className="stat-number">{doNotBookCount}</span>
                <span className="stat-label">Do Not Book</span>
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <div className="import-warnings">
              <h3>Parse Warnings ({errors.length})</h3>
              {errors.slice(0, 5).map(function(err, idx) {
                return <p key={idx}>{err}</p>
              })}
              {errors.length > 5 && <p>...and {errors.length - 5} more</p>}
            </div>
          )}

          <div className="import-controls">
            <div className="filter-buttons">
              <button className={'filter-btn' + (filterStatus === 'all' ? ' active' : '')} onClick={function() { setFilterStatus('all') }}>
                All ({parsedClients.length})
              </button>
              <button className={'filter-btn' + (filterStatus === 'active' ? ' active' : '')} onClick={function() { setFilterStatus('active') }}>
                Active ({activeCount})
              </button>
              <button className={'filter-btn' + (filterStatus === 'inactive' ? ' active' : '')} onClick={function() { setFilterStatus('inactive') }}>
                Inactive ({inactiveCount})
              </button>
            </div>

            <div className="import-actions">
              <span className="selected-count">{getSelectedCount()} clients selected ({getSelectedPetCount()} pets)</span>
              <button className="import-btn cancel-btn" onClick={resetImport}>Cancel</button>
              <button className="import-btn primary-btn" onClick={doImport} disabled={getSelectedCount() === 0}>
                Import {getSelectedCount()} Clients
              </button>
            </div>
          </div>

          <div className="import-table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={selectAll} onChange={handleSelectAll} /></th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Pets</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Last Service</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredClients().map(function(client) {
                  var origIdx = client._origIndex
                  var isSelected = selectedRows[origIdx] || false
                  var isDNB = (client.notes || '').toLowerCase().indexOf('do not book') >= 0
                  return (
                    <tr key={origIdx} className={isDNB ? 'row-dnb' : (client.status === 'inactive' ? 'row-inactive' : '')}>
                      <td><input type="checkbox" checked={isSelected} onChange={function() { toggleRow(origIdx) }} /></td>
                      <td className="name-cell">
                        <strong>{client.first_name} {client.last_name}</strong>
                        {isDNB && <span className="dnb-badge">DO NOT BOOK</span>}
                      </td>
                      <td>{client.phone}</td>
                      <td>
                        {client.pets.map(function(pet, pi) {
                          return <span key={pi} className="pet-badge">{pet.name} <small>({pet.breed || '?'})</small></span>
                        })}
                        {client.pets.length === 0 && <span className="no-pets">No pets listed</span>}
                      </td>
                      <td>
                        <span className={'status-badge status-' + client.status}>{client.status}</span>
                      </td>
                      <td className="notes-cell">{client.notes || client.booking_notes || '-'}</td>
                      <td className="date-cell">{client.last_service ? client.last_service.split(' ')[0] : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IMPORTING STEP */}
      {step === 'importing' && (
        <div className="import-content">
          <div className="import-card import-progress-card">
            <h2>Importing Clients...</h2>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: progress + '%' }}></div>
            </div>
            <p className="progress-text">{progress}% complete</p>
            <p className="progress-hint">Please don't close this page</p>
          </div>
        </div>
      )}

      {/* DONE STEP */}
      {step === 'done' && importStats && (
        <div className="import-content">
          <div className="import-card import-done-card">
            <div className="done-icon">✅</div>
            <h2>Import Complete!</h2>

            <div className="done-stats">
              <div className="done-stat">
                <span className="done-number">{importStats.clients}</span>
                <span className="done-label">New Clients Added</span>
              </div>
              <div className="done-stat">
                <span className="done-number">{importStats.pets}</span>
                <span className="done-label">Pets Added</span>
              </div>
              {importStats.skipped > 0 && (
                <div className="done-stat">
                  <span className="done-number">{importStats.skipped}</span>
                  <span className="done-label">Already Existed (Skipped)</span>
                </div>
              )}
              {importStats.errors > 0 && (
                <div className="done-stat done-stat-error">
                  <span className="done-number">{importStats.errors}</span>
                  <span className="done-label">Errors</span>
                </div>
              )}
            </div>

            {errors.length > 0 && (
              <div className="import-warnings">
                <h3>Import Errors:</h3>
                {errors.map(function(err, idx) {
                  return <p key={idx}>{err}</p>
                })}
              </div>
            )}

            <div className="done-actions">
              <button className="import-btn primary-btn" onClick={function() { window.location.href = '/clients' }}>
                View Clients
              </button>
              <button className="import-btn cancel-btn" onClick={resetImport}>
                Import More
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
