import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Linking, TextInput, Animated, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { formatPetAge } from '../lib/petAge';
import { statusStyle, effectiveStatus } from '../lib/apptStatus';
import { colors, shadow } from '../lib/theme';
import { loadAttached, saveAttached, markCompleted } from '../lib/attachedRetail';
import GradientHeader from '../components/GradientHeader';

// Statuses a groomer can set from the app (mirrors the website dropdown)
const STATUS_OPTIONS = ['unconfirmed', 'confirmed', 'checked_in', 'in_progress', 'completed', 'no_show', 'cancelled'];

// Pulsing "Booked by Suds" badge — shows on appointments the AI booked
function SudsBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={[styles.sudsBadge, { opacity: pulse }]}>
      <MaterialCommunityIcons name="robot-happy" size={14} color={colors.primary} />
      <Text style={styles.sudsBadgeText}>Booked by Suds</Text>
    </Animated.View>
  );
}

function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addMin(start, minutes) {
  const s = String(start || '09:00').split(':');
  const total = parseInt(s[0], 10) * 60 + parseInt(s[1] || '0', 10) + (minutes || 60);
  const h = Math.floor((total % 1440) / 60), m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}
function minutesBetween(start, end) {
  const s = String(start || '').split(':'), e = String(end || '').split(':');
  if (s.length < 2 || e.length < 2) return 60;
  const sm = parseInt(s[0], 10) * 60 + parseInt(s[1], 10);
  const em = parseInt(e[0], 10) * 60 + parseInt(e[1], 10);
  const diff = em - sm;
  return diff > 0 ? diff : 60;
}
function prettyWhen(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + '  ·  ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function daysBetween(isoA, dateObj) {
  const a = new Date(`${isoA}T00:00:00`);
  const b = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  return Math.round((b - a) / 86400000);
}
function addDaysToIso(iso, delta) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtSibDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function callNumber(p) { if (p) Linking.openURL(`tel:${p.replace(/[^0-9+]/g, '')}`); }
function textNumber(p) { if (p) Linking.openURL(`sms:${p.replace(/[^0-9+]/g, '')}`); }

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function fmtNoteDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Build a per-pet breakdown from appointment_pets (falls back to the legacy single pet/service)
function buildBreakdown(a) {
  const aps = a.appointment_pets || [];
  if (aps.length) {
    return aps.map((ap) => {
      const addons = (ap.appointment_pet_addons || []).map((ad) => ({
        name: (ad.services && ad.services.service_name) || 'Add-on',
        price: num(ad.quoted_price),
      }));
      const base = num(ap.quoted_price);
      const sub = base + addons.reduce((s, x) => s + x.price, 0);
      return {
        apId: ap.id,
        petId: ap.pet_id,
        petName: (ap.pets && ap.pets.name) || 'Pet',
        breed: ap.pets && ap.pets.breed,
        groomingNotes: (ap.pets && ap.pets.grooming_notes) || '',
        serviceName: (ap.services && ap.services.service_name) || 'Service',
        base, addons, sub,
      };
    });
  }
  // legacy single-pet
  const base = a.quoted_price != null ? num(a.quoted_price) : (a.services ? num(a.services.price) : 0);
  return [{
    apId: 'legacy',
    petId: a.pet_id,
    petName: (a.pets && a.pets.name) || 'Pet',
    breed: a.pets && a.pets.breed,
    groomingNotes: '',
    serviceName: (a.services && a.services.service_name) || 'Service',
    base, addons: [], sub: base,
  }];
}

export default function AppointmentDetailScreen({ navigation, route, session }) {
  const { apptId } = route.params;
  const [loading, setLoading] = useState(true);
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickStatus, setPickStatus] = useState(false); // status chooser open?
  const [editTime, setEditTime] = useState(false);      // reschedule open?
  const [siblings, setSiblings] = useState([]);          // recurring series instances
  const [rescheduleScope, setRescheduleScope] = useState('one'); // 'one'|'following'|'all-client'
  const [when, setWhen] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsMsg, setSmsMsg] = useState('');
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [clientPets, setClientPets] = useState([]);
  const [editPet, setEditPet] = useState(null);     // apId currently choosing a service
  const [addonFor, setAddonFor] = useState(null);   // apId currently adding an add-on
  const [pickGroomer, setPickGroomer] = useState(false);
  const [addingPet, setAddingPet] = useState(false); // add-pet chooser open
  const [newPetId, setNewPetId] = useState(null);
  const [payments, setPayments] = useState([]);
  const [payMethod, setPayMethod] = useState('cash');
  const [payAmount, setPayAmount] = useState('');
  const [payTip, setPayTip] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [recording, setRecording] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [noteEdits, setNoteEdits] = useState({}); // petId -> draft text
  const [savingNoteFor, setSavingNoteFor] = useState(null);
  const [groomNotesByPet, setGroomNotesByPet] = useState({}); // petId -> client_notes[] (note_type 'grooming')
  const [clientNotes, setClientNotes] = useState([]);          // client_notes[] (note_type 'client')
  const [addGroomFor, setAddGroomFor] = useState(null);        // petId currently adding a grooming note
  const [groomNoteText, setGroomNoteText] = useState('');
  const [savingGroomNote, setSavingGroomNote] = useState(false);
  const [addClientNote, setAddClientNote] = useState(false);
  const [clientNoteText, setClientNoteText] = useState('');
  const [savingClientNote, setSavingClientNote] = useState(false);
  const [editNoteId, setEditNoteId] = useState(null);   // client_notes id being edited
  const [editNoteText, setEditNoteText] = useState('');
  const [savingEditNote, setSavingEditNote] = useState(false);
  const [products, setProducts] = useState([]);
  const [retailSale, setRetailSale] = useState(null); // parked sale id
  const [retailItems, setRetailItems] = useState([]);
  const [showRetail, setShowRetail] = useState(false);
  const [savingRetail, setSavingRetail] = useState(false);

  useEffect(() => { load(); }, []);

  async function loadLists(clientId) {
    const [{ data: s }, { data: st }, { data: cp }, { data: pr }] = await Promise.all([
      supabase.from('services').select('id, service_name, price, time_block_minutes').eq('groomer_id', session.user.id).order('service_name'),
      supabase.from('staff_members').select('id, first_name, last_name').eq('groomer_id', session.user.id).eq('status', 'active').order('first_name'),
      clientId
        ? supabase.from('pets').select('id, name').eq('client_id', clientId).or('is_archived.is.null,is_archived.eq.false').or('is_memorial.is.null,is_memorial.eq.false')
        : Promise.resolve({ data: [] }),
      supabase.from('products').select('id, name, price, qty_on_hand').eq('groomer_id', session.user.id).eq('is_active', true).order('name'),
    ]);
    setServices(s || []);
    setStaff(st || []);
    setClientPets(cp || []);
    setProducts(pr || []);
  }

  async function loadRetail() {
    const { sale, items } = await loadAttached({ appointmentId: apptId, groomerId: session.user.id });
    setRetailSale(sale ? sale.id : null);
    setRetailItems(items || []);
  }

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, start_time, end_time, status, checked_in_at, checked_out_at, staff_id, booked_via,
          quoted_price, final_price, service_notes, groomer_id, client_id, pet_id, service_id,
          recurring_series_id, recurring_sequence,
          recurring_series:recurring_series_id(interval_weeks, total_count, start_date, status),
          pets:pet_id(name, breed, weight, age),
          clients:client_id(first_name, last_name, phone),
          services:service_id(id, service_name, price, time_block_minutes),
          staff_members:staff_id(first_name, last_name),
          appointment_pets(
            id, quoted_price, service_id, pet_id,
            pets:pet_id(name, breed, grooming_notes),
            services:service_id(id, service_name, price, time_block_minutes),
            appointment_pet_addons(id, quoted_price, services:service_id(id, service_name, price))
          )
        `)
        .eq('id', apptId)
        .maybeSingle();
      if (error) throw error;

      // Auto-heal: app-booked (legacy single-pet) appointments have no
      // appointment_pets rows. Create one so add-ons / add-pet work uniformly.
      if (data && data.pet_id && (!data.appointment_pets || data.appointment_pets.length === 0)) {
        await supabase.from('appointment_pets').insert({
          appointment_id: data.id,
          pet_id: data.pet_id,
          service_id: data.service_id || null,
          quoted_price: data.quoted_price != null ? data.quoted_price : (data.services ? data.services.price : null),
          groomer_id: data.groomer_id,
        });
        return load(); // re-fetch with the healed row
      }

      setA(data);
      loadLists(data.client_id);
      loadNotes(data);
      // seed the reschedule picker from the saved date/time
      if (data && data.appointment_date) {
        const [y, m, d] = data.appointment_date.split('-').map((n) => parseInt(n, 10));
        const [hh, mm] = String(data.start_time || '09:00').split(':').map((n) => parseInt(n, 10));
        setWhen(new Date(y, m - 1, d, hh || 9, mm || 0, 0, 0));
      }
      setNotes((data && data.service_notes) || '');
      if (data && data.recurring_series_id) {
        const { data: sibs } = await supabase.from('appointments')
          .select('id, appointment_date, start_time, status, recurring_sequence')
          .eq('recurring_series_id', data.recurring_series_id)
          .order('recurring_sequence', { ascending: true });
        setSiblings(sibs || []);
      } else { setSiblings([]); }
      loadPayments();
      loadRetail();
    } catch (e) {
      setErr(e.message || 'Could not load this appointment.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPayments() {
    const { data } = await supabase.from('payments')
      .select('id, amount, tip_amount, method, notes, created_at')
      .eq('appointment_id', apptId)
      .order('created_at', { ascending: true });
    setPayments(data || []);
  }

  async function recordPayment(balanceDue) {
    const amt = parseFloat(payAmount || balanceDue || 0);
    const tip = parseFloat(payTip || 0);
    if (!(amt > 0 || tip > 0)) { setErr('Enter an amount.'); return; }
    setRecording(true); setErr('');
    try {
      const { error } = await supabase.from('payments').insert({
        appointment_id: apptId,
        client_id: a.client_id,
        groomer_id: a.groomer_id || session.user.id,
        amount: amt,
        tip_amount: tip,
        method: payMethod,
        notes: payNotes || null,
      });
      if (error) throw error;
      // If this payment settles the bill and there's parked retail, complete it
      // (flips sale to paid + decrements inventory) — same as the website.
      const newPaid = payments.reduce((s, p) => s + num(p.amount), 0) + amt;
      if (retailSale && newPaid >= grandTotal - 0.005) {
        try { await markCompleted({ saleId: retailSale, paymentMethod: payMethod, userId: a.groomer_id || session.user.id }); } catch (e2) { /* non-fatal */ }
      }
      setPayAmount(''); setPayTip(''); setPayNotes(''); setShowPay(false);
      await loadPayments();
      await loadRetail();
    } catch (e) { setErr(e.message || 'Could not record payment.'); } finally { setRecording(false); }
  }

  async function persistRetail(items) {
    setSavingRetail(true); setErr('');
    try {
      await saveAttached({ appointmentId: apptId, groomerId: a.groomer_id || session.user.id, clientId: a.client_id, items });
      await loadRetail();
    } catch (e) { setErr(e.message || 'Could not save retail.'); } finally { setSavingRetail(false); }
  }
  function addRetail(prod) {
    const existing = retailItems.find((x) => x.product_id === prod.id);
    let next;
    if (existing) {
      next = retailItems.map((x) => x.product_id === prod.id
        ? { ...x, qty: x.qty + 1, line_total: (x.qty + 1) * x.unit_price } : x);
    } else {
      const price = num(prod.price);
      next = [...retailItems, { product_id: prod.id, name: prod.name, qty: 1, unit_price: price, line_total: price }];
    }
    persistRetail(next);
  }
  function removeRetail(productId) {
    persistRetail(retailItems.filter((x) => x.product_id !== productId));
  }

  async function saveGroomingNote(petId) {
    if (!petId) return;
    setSavingNoteFor(petId); setErr('');
    try {
      const text = (noteEdits[petId] ?? '').trim();
      const { error } = await supabase.from('pets').update({ grooming_notes: text || null }).eq('id', petId);
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || 'Could not save note.'); } finally { setSavingNoteFor(null); }
  }

  // Load the grooming-note timeline (per pet) + client notes from client_notes,
  // matching the website's appointment popup. Notes added here sync with the site.
  async function loadNotes(appt) {
    try {
      const petIds = [];
      if (appt.pet_id) petIds.push(appt.pet_id);
      (appt.appointment_pets || []).forEach((ap) => { if (ap.pet_id && petIds.indexOf(ap.pet_id) === -1) petIds.push(ap.pet_id); });
      if (petIds.length) {
        const { data: gn } = await supabase.from('client_notes').select('*')
          .in('pet_id', petIds).eq('note_type', 'grooming').order('created_at', { ascending: false });
        const map = {};
        (gn || []).forEach((n) => { (map[n.pet_id] = map[n.pet_id] || []).push(n); });
        setGroomNotesByPet(map);
      } else { setGroomNotesByPet({}); }
      if (appt.client_id) {
        const { data: cn } = await supabase.from('client_notes').select('*')
          .eq('client_id', appt.client_id).eq('note_type', 'client').order('created_at', { ascending: false }).limit(5);
        setClientNotes(cn || []);
      } else { setClientNotes([]); }
    } catch (e) { /* notes are non-critical; ignore */ }
  }

  async function addGroomingNote(petId) {
    const text = groomNoteText.trim();
    if (!petId || !text) return;
    setSavingGroomNote(true); setErr('');
    try {
      const { error } = await supabase.from('client_notes').insert({ pet_id: petId, client_id: a.client_id, note_type: 'grooming', note: text });
      if (error) throw error;
      setGroomNoteText(''); setAddGroomFor(null);
      if (a) await loadNotes(a);
    } catch (e) { setErr(e.message || 'Could not save grooming note.'); } finally { setSavingGroomNote(false); }
  }

  async function addClientNoteSave() {
    const text = clientNoteText.trim();
    if (!text || !a || !a.client_id) return;
    setSavingClientNote(true); setErr('');
    try {
      const { error } = await supabase.from('client_notes').insert({ client_id: a.client_id, note_type: 'client', note: text });
      if (error) throw error;
      setClientNoteText(''); setAddClientNote(false);
      await loadNotes(a);
    } catch (e) { setErr(e.message || 'Could not save client note.'); } finally { setSavingClientNote(false); }
  }

  // Edit/delete works for both grooming + client notes (same client_notes table).
  async function saveNoteEdit(noteId) {
    const text = editNoteText.trim();
    if (!text || !noteId) return;
    setSavingEditNote(true); setErr('');
    try {
      const { error } = await supabase.from('client_notes').update({ note: text }).eq('id', noteId);
      if (error) throw error;
      setEditNoteId(null); setEditNoteText('');
      if (a) await loadNotes(a);
    } catch (e) { setErr(e.message || 'Could not save note.'); } finally { setSavingEditNote(false); }
  }

  function deleteNote(noteId) {
    if (!noteId) return;
    Alert.alert('Delete this note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setErr('');
        try {
          const { error } = await supabase.from('client_notes').delete().eq('id', noteId);
          if (error) throw error;
          if (editNoteId === noteId) { setEditNoteId(null); setEditNoteText(''); }
          if (a) await loadNotes(a);
        } catch (e) { setErr(e.message || 'Could not delete note.'); }
      } },
    ]);
  }

  function renderNote(n) {
    const editing = editNoteId === n.id;
    return (
      <View key={n.id} style={styles.groomNoteItem}>
        {editing ? (
          <>
            <TextInput style={styles.petNoteInput} value={editNoteText} onChangeText={setEditNoteText} multiline autoFocus />
            <View style={styles.noteEditRow}>
              <Pressable style={[styles.noteSave, { flex: 1, marginTop: 0 }, savingEditNote && { opacity: 0.6 }]} onPress={() => saveNoteEdit(n.id)} disabled={savingEditNote}>
                {savingEditNote ? <ActivityIndicator color="#fff" /> : <Text style={styles.noteSaveText}>Save</Text>}
              </Pressable>
              <Pressable style={styles.noteCancel} onPress={() => { setEditNoteId(null); setEditNoteText(''); }}>
                <Text style={styles.noteCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.groomNoteText}>{n.note}</Text>
            <View style={styles.noteMetaRow}>
              <Text style={styles.groomNoteDate}>{fmtNoteDate(n.created_at)}</Text>
              <View style={styles.noteActions}>
                <Pressable onPress={() => { setEditNoteId(n.id); setEditNoteText(n.note || ''); }} hitSlop={6}><Text style={styles.noteEditLink}>Edit</Text></Pressable>
                <Pressable onPress={() => deleteNote(n.id)} hitSlop={6}><Text style={styles.noteDelLink}>Delete</Text></Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    );
  }

  async function saveNotes() {
    setSavingNotes(true); setErr('');
    try {
      const { error } = await supabase.from('appointments')
        .update({ service_notes: notes.trim() || null }).eq('id', apptId);
      if (error) throw error;
    } catch (e) { setErr(e.message || 'Could not save notes.'); } finally { setSavingNotes(false); }
  }

  async function sendSms(phone) {
    const msg = smsText.trim();
    if (!msg) return;
    setSendingSms(true); setSmsMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { to: phone, message: msg, groomer_id: session.user.id, sms_type: 'manual' },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Send failed');
      setSmsText('');
      setSmsMsg('Text sent ✓');
    } catch (e) { setSmsMsg(e.message || 'Could not send.'); } finally { setSendingSms(false); }
  }

  async function changeGroomer(staffId) {
    setPickGroomer(false);
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('appointments').update({ staff_id: staffId }).eq('id', apptId);
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || 'Could not change groomer.'); } finally { setSaving(false); }
  }

  // Re-sum the appointment total + recompute end_time from all pets' services/add-ons
  async function recalcTotals() {
    const { data: aps } = await supabase.from('appointment_pets')
      .select('quoted_price, services:service_id(time_block_minutes), appointment_pet_addons(quoted_price, services:service_id(time_block_minutes))')
      .eq('appointment_id', apptId);
    let total = 0, minutes = 0;
    (aps || []).forEach((ap) => {
      total += num(ap.quoted_price);
      minutes += (ap.services && ap.services.time_block_minutes) || 0;
      (ap.appointment_pet_addons || []).forEach((ad) => {
        total += num(ad.quoted_price);
        minutes += (ad.services && ad.services.time_block_minutes) || 0;
      });
    });
    await supabase.from('appointments')
      .update({ quoted_price: total, end_time: addMin(a.start_time, minutes || 60) })
      .eq('id', apptId);
  }

  async function addAddon(apId, svc) {
    setAddonFor(null);
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('appointment_pet_addons').insert({
        appointment_pet_id: apId,
        service_id: svc.id,
        quoted_price: num(svc.price),
        groomer_id: a.groomer_id || session.user.id,
      });
      if (error) throw error;
      await recalcTotals();
      await load();
    } catch (e) { setErr(e.message || 'Could not add the service.'); } finally { setSaving(false); }
  }

  async function addPetToAppt(svc) {
    if (!newPetId) { setErr('Pick a pet first.'); return; }
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('appointment_pets').insert({
        appointment_id: apptId,
        pet_id: newPetId,
        service_id: svc.id,
        quoted_price: num(svc.price),
        groomer_id: a.groomer_id || session.user.id,
      });
      if (error) throw error;
      await recalcTotals();
      setAddingPet(false); setNewPetId(null);
      await load();
    } catch (e) { setErr(e.message || 'Could not add the pet.'); } finally { setSaving(false); }
  }

  async function removePet(apId) {
    setSaving(true); setErr('');
    try {
      const remaining = (a.appointment_pets || []).length - 1;
      const { error } = await supabase.from('appointment_pets').delete().eq('id', apId);
      if (error) throw error;
      if (remaining <= 0) {
        // Removing the only pet cancels the appointment (matches website)
        await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', apptId);
        navigation.goBack();
        return;
      }
      await recalcTotals();
      await load();
    } catch (e) { setErr(e.message || 'Could not remove the pet.'); } finally { setSaving(false); }
  }

  async function changeService(apId, svc) {
    setEditPet(null);
    setSaving(true); setErr('');
    try {
      if (apId === 'legacy') {
        await supabase.from('appointments').update({
          service_id: svc.id,
          quoted_price: num(svc.price),
          end_time: addMin(a.start_time, svc.time_block_minutes || 60),
        }).eq('id', apptId);
      } else {
        const { error } = await supabase.from('appointment_pets')
          .update({ service_id: svc.id, quoted_price: num(svc.price) }).eq('id', apId);
        if (error) throw error;
        await recalcTotals();
      }
      await load();
    } catch (e) { setErr(e.message || 'Could not change service.'); } finally { setSaving(false); }
  }

  async function updateStatus(next) {
    setPickStatus(false);
    setSaving(true); setErr('');
    try {
      const patch = { status: next };
      if (next === 'checked_in' && !a.checked_in_at) patch.checked_in_at = new Date().toISOString();
      const { error } = await supabase.from('appointments').update(patch).eq('id', apptId);
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || 'Could not update status.'); } finally { setSaving(false); }
  }

  async function saveReschedule() {
    setSaving(true); setErr('');
    try {
      const dur = minutesBetween(a.start_time, a.end_time);
      const endD = new Date(when.getTime() + dur * 60000);
      const newDate = isoDate(when), newStart = hhmm(when), newEnd = hhmm(endD);

      if (!a.recurring_series_id || rescheduleScope === 'one') {
        const { error } = await supabase.from('appointments')
          .update({ appointment_date: newDate, start_time: newStart, end_time: newEnd }).eq('id', apptId);
        if (error) throw error;
      } else {
        const delta = daysBetween(a.appointment_date, when);
        const todayStr = isoDate(new Date());
        let targets = [];
        if (rescheduleScope === 'following') {
          const { data } = await supabase.from('appointments').select('id, appointment_date')
            .eq('recurring_series_id', a.recurring_series_id).gte('appointment_date', a.appointment_date)
            .is('checked_out_at', null).not('status', 'in', '(cancelled,rescheduled,completed,no_show)');
          targets = data || [];
        } else { // all-client
          const { data } = await supabase.from('appointments').select('id, appointment_date')
            .eq('client_id', a.client_id).not('recurring_series_id', 'is', null).gte('appointment_date', todayStr)
            .is('checked_out_at', null).not('status', 'in', '(cancelled,rescheduled,completed,no_show)');
          targets = data || [];
        }
        for (const t of targets) {
          if (t.id === apptId) {
            await supabase.from('appointments').update({ appointment_date: newDate, start_time: newStart, end_time: newEnd }).eq('id', t.id);
          } else {
            await supabase.from('appointments').update({ appointment_date: addDaysToIso(t.appointment_date, delta) }).eq('id', t.id);
          }
        }
      }
      setEditTime(false);
      await load();
    } catch (e) { setErr(e.message || 'Could not reschedule.'); } finally { setSaving(false); }
  }

  async function confirmAppt() {
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', apptId);
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || 'Could not confirm.'); } finally { setSaving(false); }
  }

  async function checkIn() {
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('appointments')
        .update({ checked_in_at: new Date().toISOString(), status: 'checked_in' }).eq('id', apptId);
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || 'Could not check in.'); } finally { setSaving(false); }
  }

  const client = a && a.clients;
  const ss = a ? statusStyle(effectiveStatus(a)) : null;
  const breakdown = a ? buildBreakdown(a) : [];
  const computedTotal = breakdown.reduce((s, p) => s + p.sub, 0);
  const total = a && a.final_price != null ? num(a.final_price) : computedTotal;
  const groomer = a && a.staff_members
    ? `${a.staff_members.first_name || ''} ${a.staff_members.last_name || ''}`.trim()
    : '';
  const retailTotal = retailItems.reduce((s, l) => s + num(l.line_total), 0);
  const grandTotal = total + retailTotal;
  const balanceDue = Math.max(grandTotal - payments.reduce((s, p) => s + num(p.amount), 0), 0);
  const rs = a && a.recurring_series;

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Appointment</Text>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : !a ? (
        <Text style={styles.err}>Appointment not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Status + when */}
          <View style={styles.card}>
            {a.booked_via === 'client_ai' ? <SudsBadge /> : null}
            {/* Tappable status pill → opens chooser */}
            {ss ? (
              <Pressable style={[styles.badge, { backgroundColor: ss.bg }]} onPress={() => setPickStatus((v) => !v)}>
                <Text style={[styles.badgeText, { color: ss.color }]}>{(ss.label || '').toUpperCase()}</Text>
                <Ionicons name={pickStatus ? 'chevron-up' : 'chevron-down'} size={14} color={ss.color} />
              </Pressable>
            ) : null}
            {pickStatus ? (
              <View style={styles.statusGrid}>
                {STATUS_OPTIONS.map((s) => {
                  const so = statusStyle(s);
                  const active = s === a.status;
                  return (
                    <Pressable key={s} style={[styles.statusOpt, active && { backgroundColor: so.bg, borderColor: so.color }]} onPress={() => updateStatus(s)}>
                      <Text style={[styles.statusOptText, active && { color: so.color }]}>{so.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.line}><Ionicons name="calendar-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{fmtDate(a.appointment_date)}</Text></View>
            <View style={styles.line}><Ionicons name="time-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{fmtTime(a.start_time)}{a.end_time ? ` – ${fmtTime(a.end_time)}` : ''}</Text></View>
            {groomer ? <View style={styles.line}><Ionicons name="person-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{groomer}</Text></View> : null}

            {/* Reschedule */}
            <Pressable style={styles.rescheduleBtn} onPress={() => setEditTime((v) => !v)}>
              <Ionicons name="create-outline" size={16} color={colors.primaryDark} />
              <Text style={styles.rescheduleText}>{editTime ? 'Cancel reschedule' : 'Reschedule'}</Text>
            </Pressable>
            {editTime ? (
              <View style={styles.editBox}>
                <View style={styles.whenRow}>
                  <Pressable style={styles.whenBtn} onPress={() => setShowDate(true)}>
                    <Text style={styles.whenText}>{when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                  </Pressable>
                  <Pressable style={styles.whenBtn} onPress={() => setShowTime(true)}>
                    <Text style={styles.whenText}>{when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
                  </Pressable>
                </View>
                {showDate ? <DateTimePicker value={when} mode="date" onChange={(_e, s) => { setShowDate(false); if (s) { const x = new Date(when); x.setFullYear(s.getFullYear(), s.getMonth(), s.getDate()); setWhen(x); } }} /> : null}
                {showTime ? <DateTimePicker value={when} mode="time" onChange={(_e, s) => { setShowTime(false); if (s) { const x = new Date(when); x.setHours(s.getHours(), s.getMinutes(), 0, 0); setWhen(x); } }} /> : null}

                {/* Recurring: what should change? */}
                {a.recurring_series_id ? (
                  <View style={styles.scopeBox}>
                    <Text style={styles.scopeHeading}>This is recurring — what should change?</Text>
                    {[
                      { v: 'one', t: 'Only this appointment', s: 'Just move this one.' },
                      { v: 'following', t: 'This & following', s: 'Shift this and all future in this series.' },
                      { v: 'all-client', t: 'All future recurring', s: 'Shift every future recurring for this client.' },
                    ].map((opt) => (
                      <Pressable key={opt.v} style={[styles.scopeOpt, rescheduleScope === opt.v && styles.scopeOptSel]} onPress={() => setRescheduleScope(opt.v)}>
                        <Ionicons name={rescheduleScope === opt.v ? 'radio-button-on' : 'radio-button-off'} size={18} color={rescheduleScope === opt.v ? colors.primary : colors.textFaint} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.scopeTitle}>{opt.t}</Text>
                          <Text style={styles.scopeSub}>{opt.s}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <Pressable style={[styles.saveTimeBtn, saving && { opacity: 0.6 }]} onPress={saveReschedule} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTimeText}>Save new time</Text>}
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Recurring series info */}
          {rs ? (
            <View style={[styles.card, styles.recurCard]}>
              <View style={styles.line}><Ionicons name="repeat" size={16} color={colors.primaryDark} /><Text style={styles.recurTitle}>Recurring appointment</Text></View>
              <Text style={styles.recurText}>Every {rs.interval_weeks} {rs.interval_weeks === 1 ? 'week' : 'weeks'}, {rs.total_count} times</Text>
              {a.recurring_sequence ? <Text style={styles.recurSub}>Appointment #{a.recurring_sequence} of {rs.total_count}</Text> : null}
              {siblings.length > 0 ? (
                <>
                  <Text style={styles.recurHint}>Tap a date to jump to that week</Text>
                  {siblings.map((s) => {
                    const isThis = s.id === apptId;
                    return (
                      <Pressable
                        key={s.id}
                        style={[styles.sibRow, isThis && styles.sibRowThis]}
                        onPress={() => navigation.navigate('Schedule', { screen: 'ScheduleMain', params: { jumpDate: s.appointment_date } })}
                      >
                        <Text style={styles.sibSeq}>#{s.recurring_sequence || '•'}</Text>
                        <Text style={styles.sibDate}>{fmtSibDate(s.appointment_date)}</Text>
                        {isThis ? <Text style={styles.sibThisTag}>THIS ONE</Text> : <Ionicons name="chevron-forward" size={16} color={colors.primary} />}
                      </Pressable>
                    );
                  })}
                </>
              ) : null}
            </View>
          ) : null}

          {/* Client */}
          {client ? (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Owner</Text>
                <Pressable
                  style={styles.changeBtn}
                  onPress={() => navigation.navigate('Clients', { screen: 'ClientDetail', params: { clientId: a.client_id, name: `${client.first_name || ''} ${client.last_name || ''}`.trim() } })}
                >
                  <Text style={styles.changeText}>View Profile</Text>
                </Pressable>
              </View>
              <Text style={styles.clientName}>{`${client.first_name || ''} ${client.last_name || ''}`.trim()}</Text>
              {client.phone ? <Text style={styles.clientPhone}>{client.phone}</Text> : null}
              {client.phone ? (
                <View style={styles.actions}>
                  <Pressable style={styles.actionBtn} onPress={() => callNumber(client.phone)}>
                    <Ionicons name="call" size={16} color={colors.primaryDark} /><Text style={styles.actionText}>Call</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtn} onPress={() => textNumber(client.phone)}>
                    <Ionicons name="chatbubble" size={16} color={colors.primaryDark} /><Text style={styles.actionText}>Text</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Client notes (client_notes, note_type 'client') — syncs with website */}
              <View style={styles.clientNotesWrap}>
                <View style={styles.groomNoteHead}>
                  <Text style={styles.groomNoteTitle}>🗒️ CLIENT NOTES</Text>
                  <Pressable onPress={() => { setAddClientNote((v) => !v); setClientNoteText(''); }}>
                    <Text style={styles.groomNoteAdd}>{addClientNote ? 'Cancel' : '+ Add note'}</Text>
                  </Pressable>
                </View>
                {addClientNote ? (
                  <View style={{ marginBottom: 8 }}>
                    <TextInput
                      style={styles.petNoteInput}
                      value={clientNoteText}
                      onChangeText={setClientNoteText}
                      placeholder="New note about this client…"
                      placeholderTextColor={colors.textFaint}
                      multiline
                      autoFocus
                    />
                    <Pressable style={[styles.noteSave, savingClientNote && { opacity: 0.6 }]} onPress={addClientNoteSave} disabled={savingClientNote}>
                      {savingClientNote ? <ActivityIndicator color="#fff" /> : <Text style={styles.noteSaveText}>Save client note</Text>}
                    </Pressable>
                  </View>
                ) : null}
                {clientNotes.length === 0 ? (
                  <Text style={styles.groomNoteEmpty}>No client notes yet.</Text>
                ) : (
                  clientNotes.map(renderNote)
                )}
              </View>
            </View>
          ) : null}

          {/* Groomer */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Groomer</Text>
              <Pressable onPress={() => setPickGroomer((v) => !v)} style={styles.changeBtn}>
                <Text style={styles.changeText}>{pickGroomer ? 'Close' : 'Change'}</Text>
              </Pressable>
            </View>
            <Text style={styles.groomerName}>{groomer || 'Unassigned'}</Text>
            {pickGroomer ? (
              <View style={styles.chips}>
                {staff.map((m) => {
                  const nm = `${m.first_name || ''}${m.last_name ? ' ' + m.last_name.charAt(0) + '.' : ''}`.trim() || 'Staff';
                  const active = m.id === a.staff_id;
                  return (
                    <Pressable key={m.id} style={[styles.chip, active && styles.chipActive]} onPress={() => changeGroomer(m.id)}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{nm}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Pets & services breakdown */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pets & Services</Text>
            {breakdown.map((p, i) => (
              <View key={i} style={[styles.petBlock, i > 0 && styles.petBlockBorder]}>
                <View style={styles.petTop}>
                  <View style={styles.petIcon}><Ionicons name="paw" size={15} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.petName}>{p.petName}{p.breed ? <Text style={styles.petBreed}>  ·  {p.breed}</Text> : null}</Text>
                  </View>
                  {breakdown.length > 1 && p.apId !== 'legacy' ? (
                    <Pressable onPress={() => removePet(p.apId)} hitSlop={8}>
                      <Ionicons name="close-circle" size={22} color={colors.textFaint} />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.svcRow}>
                  <Text style={styles.svcName}>{p.serviceName}</Text>
                  <Text style={styles.svcPrice}>${p.base.toFixed(2)}</Text>
                </View>
                {p.addons.map((ad, j) => (
                  <View key={j} style={styles.addonRow}>
                    <Text style={styles.addonName}>+ {ad.name}</Text>
                    <Text style={styles.addonPrice}>${ad.price.toFixed(2)}</Text>
                  </View>
                ))}
                {/* Change service */}
                <Pressable style={styles.changeSvcBtn} onPress={() => setEditPet(editPet === p.apId ? null : p.apId)}>
                  <Ionicons name="swap-horizontal" size={14} color={colors.primaryDark} />
                  <Text style={styles.changeText}>{editPet === p.apId ? 'Close' : 'Change service'}</Text>
                </Pressable>
                {editPet === p.apId ? (
                  <View style={styles.svcChooser}>
                    {services.map((sv) => (
                      <Pressable key={sv.id} style={styles.svcOpt} onPress={() => changeService(p.apId, sv)}>
                        <Text style={styles.svcOptName}>{sv.service_name}</Text>
                        <Text style={styles.svcOptPrice}>{sv.price != null ? `$${parseFloat(sv.price).toFixed(2)}` : ''}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {/* Add another service (add-on) */}
                {p.apId !== 'legacy' ? (
                  <Pressable style={styles.changeSvcBtn} onPress={() => setAddonFor(addonFor === p.apId ? null : p.apId)}>
                    <Ionicons name="add-circle-outline" size={15} color={colors.primaryDark} />
                    <Text style={styles.changeText}>{addonFor === p.apId ? 'Close' : 'Add another service'}</Text>
                  </Pressable>
                ) : null}
                {addonFor === p.apId ? (
                  <View style={styles.svcChooser}>
                    {services.map((sv) => (
                      <Pressable key={sv.id} style={styles.svcOpt} onPress={() => addAddon(p.apId, sv)}>
                        <Text style={styles.svcOptName}>{sv.service_name}</Text>
                        <Text style={styles.svcOptPrice}>{sv.price != null ? `$${parseFloat(sv.price).toFixed(2)}` : ''}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {/* Pinned pet-profile note (pets.grooming_notes) */}
                {p.petId ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>📌 Pet profile note</Text>
                    <TextInput
                      style={styles.petNoteInput}
                      value={noteEdits[p.petId] ?? p.groomingNotes}
                      onChangeText={(t) => setNoteEdits((m) => ({ ...m, [p.petId]: t }))}
                      placeholder={`Standing note for ${p.petName}…`}
                      placeholderTextColor={colors.textFaint}
                      multiline
                    />
                    {(noteEdits[p.petId] ?? p.groomingNotes) !== p.groomingNotes ? (
                      <Pressable style={[styles.noteSave, savingNoteFor === p.petId && { opacity: 0.6 }]} onPress={() => saveGroomingNote(p.petId)} disabled={savingNoteFor === p.petId}>
                        {savingNoteFor === p.petId ? <ActivityIndicator color="#fff" /> : <Text style={styles.noteSaveText}>Save note</Text>}
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {/* Grooming notes timeline (client_notes) — syncs with the website */}
                {p.petId ? (
                  <View style={styles.groomNoteBox}>
                    <View style={styles.groomNoteHead}>
                      <Text style={styles.groomNoteTitle}>📝 GROOMING NOTES</Text>
                      <Pressable onPress={() => { setAddGroomFor(addGroomFor === p.petId ? null : p.petId); setGroomNoteText(''); }}>
                        <Text style={styles.groomNoteAdd}>{addGroomFor === p.petId ? 'Cancel' : '+ Add note'}</Text>
                      </Pressable>
                    </View>
                    {addGroomFor === p.petId ? (
                      <View style={{ marginBottom: 8 }}>
                        <TextInput
                          style={styles.petNoteInput}
                          value={groomNoteText}
                          onChangeText={setGroomNoteText}
                          placeholder={`New grooming note for ${p.petName}…`}
                          placeholderTextColor={colors.textFaint}
                          multiline
                          autoFocus
                        />
                        <Pressable style={[styles.noteSave, savingGroomNote && { opacity: 0.6 }]} onPress={() => addGroomingNote(p.petId)} disabled={savingGroomNote}>
                          {savingGroomNote ? <ActivityIndicator color="#fff" /> : <Text style={styles.noteSaveText}>Save grooming note</Text>}
                        </Pressable>
                      </View>
                    ) : null}
                    {(groomNotesByPet[p.petId] || []).length === 0 ? (
                      <Text style={styles.groomNoteEmpty}>No grooming notes yet for {p.petName}.</Text>
                    ) : (
                      (groomNotesByPet[p.petId] || []).slice(0, 5).map(renderNote)
                    )}
                  </View>
                ) : null}
              </View>
            ))}

            {/* Add a pet to this appointment */}
            <Pressable style={styles.addPetBtn} onPress={() => setAddingPet((v) => !v)}>
              <Ionicons name="add" size={16} color={colors.primaryDark} />
              <Text style={styles.changeText}>{addingPet ? 'Close' : 'Add pet to appointment'}</Text>
            </Pressable>
            {addingPet ? (
              <View style={styles.addPetBox}>
                <Text style={styles.addPetLabel}>Pet</Text>
                <View style={styles.chips}>
                  {clientPets.length === 0 ? <Text style={styles.svcOptName}>No other pets on file.</Text> : null}
                  {clientPets.map((pt) => (
                    <Pressable key={pt.id} style={[styles.chip, newPetId === pt.id && styles.chipActive]} onPress={() => setNewPetId(pt.id)}>
                      <Text style={[styles.chipText, newPetId === pt.id && styles.chipTextActive]}>{pt.name || 'Pet'}</Text>
                    </Pressable>
                  ))}
                </View>
                {newPetId ? (
                  <>
                    <Text style={styles.addPetLabel}>Pick a service</Text>
                    <View style={styles.svcChooser}>
                      {services.map((sv) => (
                        <Pressable key={sv.id} style={[styles.svcOpt, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => addPetToAppt(sv)}>
                          <Text style={styles.svcOptName}>{sv.service_name}</Text>
                          <Text style={styles.svcOptPrice}>{sv.price != null ? `$${parseFloat(sv.price).toFixed(2)}` : ''}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
          </View>

          {/* Retail */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Retail</Text>
              <Pressable style={styles.changeBtn} onPress={() => setShowRetail((v) => !v)}>
                <Text style={styles.changeText}>{showRetail ? 'Close' : 'Add retail'}</Text>
              </Pressable>
            </View>
            {retailItems.length === 0 ? (
              <Text style={styles.payNone}>No retail on this bill.</Text>
            ) : (
              retailItems.map((li) => (
                <View key={li.product_id} style={styles.retailRow}>
                  <Text style={styles.retailName}>{li.name}{li.qty > 1 ? `  ×${li.qty}` : ''}</Text>
                  <Text style={styles.retailPrice}>${num(li.line_total).toFixed(2)}</Text>
                  <Pressable onPress={() => removeRetail(li.product_id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                  </Pressable>
                </View>
              ))
            )}
            {showRetail ? (
              <View style={styles.svcChooser}>
                {savingRetail ? <ActivityIndicator color={colors.primary} /> : null}
                {products.length === 0 ? <Text style={styles.payNone}>No products set up.</Text> : null}
                {products.map((pr) => (
                  <Pressable key={pr.id} style={styles.svcOpt} onPress={() => addRetail(pr)}>
                    <Text style={styles.svcOptName}>{pr.name}{pr.qty_on_hand != null ? `  ·  ${pr.qty_on_hand} in stock` : ''}</Text>
                    <Text style={styles.svcOptPrice}>{pr.price != null ? `$${parseFloat(pr.price).toFixed(2)}` : ''}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* Payment */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Payment</Text>
              <Pressable style={styles.changeBtn} onPress={() => { setShowPay((v) => !v); setPayAmount(balanceDue ? String(balanceDue.toFixed(2)) : ''); }}>
                <Text style={styles.changeText}>{showPay ? 'Close' : 'Take Payment'}</Text>
              </Pressable>
            </View>

            {payments.length === 0 ? (
              <Text style={styles.payNone}>No payments recorded yet.</Text>
            ) : (
              payments.map((pm) => (
                <View key={pm.id} style={styles.payRow}>
                  <Text style={styles.payMethod}>{(pm.method || '').charAt(0).toUpperCase() + (pm.method || '').slice(1)}{pm.tip_amount ? `  (+$${num(pm.tip_amount).toFixed(2)} tip)` : ''}</Text>
                  <Text style={styles.payAmt}>${num(pm.amount).toFixed(2)}</Text>
                </View>
              ))
            )}
            {retailTotal > 0 ? (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Bill total (services + retail)</Text>
                <Text style={styles.billValue}>${grandTotal.toFixed(2)}</Text>
              </View>
            ) : null}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{balanceDue > 0 ? 'Balance due' : 'Paid in full'}</Text>
              <Text style={[styles.totalValue, balanceDue > 0 ? { color: '#b91c1c' } : { color: colors.green }]}>${balanceDue.toFixed(2)}</Text>
            </View>

            {showPay ? (
              <View style={styles.payForm}>
                <Text style={styles.addPetLabel}>Method</Text>
                <View style={styles.chips}>
                  {[{ label: 'Cash', value: 'cash' }, { label: 'Zelle', value: 'zelle' }, { label: 'Venmo', value: 'venmo' }].map((mth) => (
                    <Pressable key={mth.value} style={[styles.chip, payMethod === mth.value && styles.chipActive]} onPress={() => setPayMethod(mth.value)}>
                      <Text style={[styles.chipText, payMethod === mth.value && styles.chipTextActive]}>{mth.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.payInputs}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addPetLabel}>Amount</Text>
                    <TextInput style={styles.payInput} value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textFaint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addPetLabel}>Tip (optional)</Text>
                    <TextInput style={styles.payInput} value={payTip} onChangeText={setPayTip} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textFaint} />
                  </View>
                </View>
                <TextInput style={[styles.payInput, { marginTop: 10 }]} value={payNotes} onChangeText={setPayNotes} placeholder="Notes (optional)" placeholderTextColor={colors.textFaint} />
                <Pressable style={[styles.payBtn, recording && { opacity: 0.6 }]} onPress={() => recordPayment(balanceDue)} disabled={recording}>
                  {recording ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>Record payment</Text>}
                </Pressable>
                <Text style={styles.payHint}>Card / Tap to Pay coming soon — use the website for card payments for now.</Text>
              </View>
            ) : null}
          </View>

          {/* Confirm — only while unconfirmed */}
          {a.status === 'unconfirmed' ? (
            <Pressable style={[styles.confirmBtn, saving && { opacity: 0.6 }]} onPress={confirmAppt} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={styles.confirmText}>Confirm appointment</Text></>}
            </Pressable>
          ) : null}

          {/* Check in */}
          {a.checked_in_at ? (
            <View style={styles.checkedIn}>
              <Ionicons name="checkmark-circle" size={18} color="#166534" />
              <Text style={styles.checkedInText}>Checked in at {fmtTime(new Date(a.checked_in_at).toTimeString().slice(0, 8))}</Text>
            </View>
          ) : (
            <Pressable style={[styles.checkInBtn, saving && { opacity: 0.6 }]} onPress={checkIn} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="log-in-outline" size={18} color="#fff" /><Text style={styles.checkInText}>Check In</Text></>}
            </Pressable>
          )}

          {/* Report card */}
          <Pressable
            style={styles.reportBtn}
            onPress={() => navigation.navigate('ReportCard', {
              appointmentId: apptId,
              clientId: a.client_id,
              pets: breakdown.filter((p) => p.petId && p.petId !== 'legacy').map((p) => ({ id: p.petId, name: p.petName })),
              groomer,
            })}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.reportText}>New report card</Text>
          </Pressable>

          {/* Receipt */}
          <Pressable
            style={styles.reportBtn}
            onPress={() => navigation.navigate('Receipt', { kind: 'appointment', id: apptId })}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.reportText}>Receipt</Text>
          </Pressable>

          {/* Appointment notes (editable) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Appointment Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note for this appointment…"
              placeholderTextColor={colors.textFaint}
              multiline
            />
            <Pressable style={[styles.notesSave, savingNotes && { opacity: 0.6 }]} onPress={saveNotes} disabled={savingNotes}>
              {savingNotes ? <ActivityIndicator color="#fff" /> : <Text style={styles.notesSaveText}>Save note</Text>}
            </Pressable>
          </View>

          {/* Send SMS */}
          {client && client.phone ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Send Text</Text>
              <Text style={styles.smsHint}>Texts {client.first_name || 'the client'} via SMS — counts against your monthly quota.</Text>
              <TextInput
                style={styles.notesInput}
                value={smsText}
                onChangeText={setSmsText}
                placeholder="Type a message…"
                placeholderTextColor={colors.textFaint}
                multiline
              />
              {smsMsg ? <Text style={[styles.smsMsg, smsMsg.includes('✓') && { color: colors.green }]}>{smsMsg}</Text> : null}
              <Pressable
                style={[styles.smsSend, (sendingSms || !smsText.trim()) && { opacity: 0.5 }]}
                onPress={() => sendSms(client.phone)}
                disabled={sendingSms || !smsText.trim()}
              >
                {sendingSms ? <ActivityIndicator color="#fff" /> : <><Ionicons name="send" size={16} color="#fff" /><Text style={styles.smsSendText}>Send text</Text></>}
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 14, ...shadow },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeBtn: { backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 12, marginBottom: 8 },
  changeText: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
  groomerName: { fontSize: 16, fontWeight: '700', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#374151', fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  changeSvcBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginLeft: 38, marginTop: 8 },
  svcChooser: { marginLeft: 38, marginTop: 8, gap: 6 },
  svcOpt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  svcOptName: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1 },
  svcOptPrice: { fontSize: 14, color: colors.green, fontWeight: '700' },
  addPetBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 12, backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  addPetBox: { marginTop: 12 },
  addPetLabel: { fontSize: 12, fontWeight: '800', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 6 },
  recurCard: { backgroundColor: colors.primaryLight, borderColor: '#ddd6fe' },
  recurTitle: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },
  recurText: { fontSize: 15, color: colors.text, fontWeight: '700', marginTop: 8 },
  recurSub: { fontSize: 13, color: colors.textMute, marginTop: 2 },
  recurHint: { fontSize: 12, color: colors.primaryDark, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  sibRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  sibRowThis: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  sibSeq: { fontSize: 13, fontWeight: '800', color: colors.primary, width: 28 },
  sibDate: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  sibThisTag: { fontSize: 11, fontWeight: '800', color: colors.primaryDark, backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  scopeBox: { marginTop: 14, backgroundColor: '#faf5ff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e9d5ff' },
  scopeHeading: { fontSize: 13, fontWeight: '800', color: colors.primaryDark, marginBottom: 8 },
  scopeOpt: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  scopeOptSel: { borderColor: colors.primary },
  scopeTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  scopeSub: { fontSize: 12, color: colors.textMute, marginTop: 1 },
  noteBox: { marginLeft: 38, marginTop: 10 },
  noteLabel: { fontSize: 12, fontWeight: '800', color: colors.textMute, marginBottom: 5 },
  petNoteInput: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 44, textAlignVertical: 'top' },
  noteSave: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginTop: 8 },
  noteSaveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  groomNoteBox: { marginLeft: 38, marginTop: 10, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, padding: 10 },
  groomNoteHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  groomNoteTitle: { fontSize: 11, fontWeight: '800', color: '#166534', letterSpacing: 0.3 },
  groomNoteAdd: { fontSize: 12, fontWeight: '800', color: '#15803d' },
  groomNoteEmpty: { fontSize: 13, color: colors.textFaint, fontStyle: 'italic' },
  groomNoteItem: { borderTopWidth: 1, borderTopColor: '#dcfce7', paddingTop: 6, marginTop: 6 },
  groomNoteText: { fontSize: 14, color: colors.text, lineHeight: 19 },
  groomNoteDate: { fontSize: 11, color: colors.textFaint },
  noteMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  noteActions: { flexDirection: 'row', gap: 14 },
  noteEditLink: { fontSize: 12, fontWeight: '800', color: colors.primaryDark },
  noteDelLink: { fontSize: 12, fontWeight: '800', color: '#dc2626' },
  noteEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  noteCancel: { paddingVertical: 9, paddingHorizontal: 14 },
  noteCancelText: { fontSize: 14, fontWeight: '800', color: colors.textMute },
  clientNotesWrap: { marginTop: 12, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, padding: 10 },
  payNone: { fontSize: 14, color: colors.textMute },
  retailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  retailName: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1 },
  retailPrice: { fontSize: 14, color: colors.green, fontWeight: '700' },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  billLabel: { fontSize: 13, color: colors.textMute },
  billValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  payMethod: { fontSize: 14, color: colors.text, fontWeight: '600' },
  payAmt: { fontSize: 14, color: colors.green, fontWeight: '700' },
  payForm: { marginTop: 12 },
  payInputs: { flexDirection: 'row', gap: 12 },
  payInput: { backgroundColor: '#f9fafb', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  payBtn: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  payBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  payHint: { fontSize: 12, color: colors.textFaint, marginTop: 8, textAlign: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 },
  badgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  sudsBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, backgroundColor: colors.primaryLight, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 10 },
  sudsBadgeText: { fontSize: 12, fontWeight: '800', color: colors.primaryDark },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  statusOpt: { borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  statusOptText: { fontSize: 13, fontWeight: '700', color: colors.textMute },
  rescheduleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 14, backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  rescheduleText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  editBox: { marginTop: 12 },
  whenRow: { flexDirection: 'row', gap: 10 },
  whenBtn: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  whenText: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  saveTimeBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  saveTimeText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  lineText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  clientName: { fontSize: 18, fontWeight: '800', color: colors.text },
  clientPhone: { fontSize: 14, color: colors.textMute, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  actionText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  petBlock: { paddingVertical: 10 },
  petBlockBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  petTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  petIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: 16, fontWeight: '800', color: colors.text },
  petBreed: { fontSize: 13, fontWeight: '600', color: colors.textMute },
  svcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 38 },
  svcName: { fontSize: 14, color: '#374151', fontWeight: '600', flex: 1 },
  svcPrice: { fontSize: 14, fontWeight: '700', color: colors.text },
  addonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 38, marginTop: 4 },
  addonName: { fontSize: 13, color: colors.textMute, flex: 1 },
  addonPrice: { fontSize: 13, color: colors.textMute },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10, paddingTop: 12 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.green },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 15, marginBottom: 12 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  checkInBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.green, borderRadius: 12, paddingVertical: 15, marginBottom: 14 },
  checkInText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  checkedIn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#dcfce7', borderRadius: 12, paddingVertical: 14, marginBottom: 14, borderWidth: 1, borderColor: '#86efac' },
  checkedInText: { color: '#166534', fontSize: 15, fontWeight: '800' },
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primaryLight, borderRadius: 12, paddingVertical: 14, marginBottom: 14 },
  reportText: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  notesInput: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 64, textAlignVertical: 'top' },
  notesSave: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  notesSaveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  smsHint: { fontSize: 12, color: colors.textMute, marginBottom: 10, lineHeight: 17 },
  smsMsg: { fontSize: 13, color: '#b91c1c', marginTop: 8, fontWeight: '600' },
  smsSend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  smsSendText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
