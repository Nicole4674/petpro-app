import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Linking, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { formatPetAge } from '../lib/petAge';
import { statusStyle, effectiveStatus } from '../lib/apptStatus';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

function callNumber(p) { if (p) Linking.openURL(`tel:${p.replace(/[^0-9+]/g, '')}`); }
function textNumber(p) { if (p) Linking.openURL(`sms:${p.replace(/[^0-9+]/g, '')}`); }
function openMaps(a) { if (a) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`); }
function isoToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtDate(s) { if (!s) return ''; const [y, m, d] = s.split('-').map((n) => parseInt(n, 10)); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtShort(s) { if (!s) return ''; const [y, m, d] = s.split('-').map((n) => parseInt(n, 10)); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtT(t) { if (!t) return ''; const [h, m] = String(t).split(':'); const hh = parseInt(h, 10); return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`; }
function money(v) { const n = parseFloat(v); return `$${(isNaN(n) ? 0 : n).toFixed(2)}`; }
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function apptTotal(a) {
  if (a.final_price != null) return num(a.final_price);
  const aps = a.appointment_pets || [];
  if (aps.length) {
    return aps.reduce((s, ap) => s + num(ap.quoted_price) + (ap.appointment_pet_addons || []).reduce((s2, ad) => s2 + num(ad.quoted_price), 0), 0);
  }
  return num(a.quoted_price);
}
function petServiceLines(a) {
  const aps = a.appointment_pets || [];
  if (aps.length) {
    return aps.map((ap) => `${(ap.pets && ap.pets.name) || 'Pet'} · ${(ap.services && ap.services.service_name) || 'Service'}`);
  }
  return [`${(a.pets && a.pets.name) || 'Pet'} · ${(a.services && a.services.service_name) || 'Service'}`];
}

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'grooming', label: 'Grooming' },
  { key: 'boarding', label: 'Boarding' },
  { key: 'payments', label: 'Payments' },
  { key: 'notes', label: 'Notes' },
];

export default function ClientDetailScreen({ session, route, navigation }) {
  const { clientId, name } = route.params;
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [client, setClient] = useState(null);
  const [pets, setPets] = useState([]);
  const [appts, setAppts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [grooming, setGrooming] = useState([]);
  const [boarding, setBoarding] = useState([]);
  const [payments, setPayments] = useState([]);
  const [owed, setOwed] = useState(0);
  const [clientNotes, setClientNotes] = useState([]);
  const [groomNotes, setGroomNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);
  useEffect(() => { const unsub = navigation.addListener('focus', () => load()); return unsub; }, [navigation]);
  useEffect(() => {
    if (tab === 'grooming' && grooming.length === 0) loadGrooming();
    if (tab === 'boarding' && boarding.length === 0) loadBoarding();
    if (tab === 'payments' && payments.length === 0) loadPayments();
    if (tab === 'notes') loadNotes();
  }, [tab]);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data: c, error: cErr } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
      if (cErr) throw cErr;
      setClient(c);
      const { data: p } = await supabase.from('pets').select('id, name, breed, weight, age, sex')
        .eq('client_id', clientId).or('is_archived.is.null,is_archived.eq.false').or('is_memorial.is.null,is_memorial.eq.false')
        .order('created_at', { ascending: true });
      setPets(p || []);
      const { data: ap } = await supabase.from('appointments')
        .select('id, appointment_date, start_time, status, checked_in_at, checked_out_at, pets:pet_id(name), services:service_id(service_name)')
        .eq('client_id', clientId).gte('appointment_date', isoToday()).neq('status', 'cancelled')
        .order('appointment_date', { ascending: true }).order('start_time', { ascending: true });
      setAppts(ap || []);
      const { data: ct } = await supabase.from('client_contacts').select('*').eq('client_id', clientId)
        .order('is_emergency', { ascending: false }).order('can_pickup', { ascending: false });
      setContacts(ct || []);
    } catch (e) { setErr(e.message || 'Could not load this client.'); } finally { setLoading(false); }
  }

  async function loadGrooming() {
    setTabLoading(true);
    const { data } = await supabase.from('appointments')
      .select('id, appointment_date, status, checked_out_at, final_price, quoted_price, pets(name), services(service_name), appointment_pets(quoted_price, pets:pet_id(name), services:service_id(service_name), appointment_pet_addons(quoted_price))')
      .eq('client_id', clientId).order('appointment_date', { ascending: false });
    const closed = ['cancelled', 'no_show', 'completed', 'checked_out'];
    setGrooming((data || []).filter((a) => a.checked_out_at != null || closed.includes(a.status)));
    setTabLoading(false);
  }
  async function loadBoarding() {
    setTabLoading(true);
    const { data } = await supabase.from('boarding_reservations')
      .select('id, start_date, end_date, status, total_price, kennels(name), boarding_reservation_pets(pets:pet_id(name))')
      .eq('client_id', clientId).order('start_date', { ascending: false });
    setBoarding(data || []);
    setTabLoading(false);
  }
  async function loadPayments() {
    setTabLoading(true);
    const { data } = await supabase.from('payments')
      .select('*, appointments:appointment_id(appointment_date, pets:pet_id(name), services:service_id(service_name)), boarding_reservations:boarding_reservation_id(start_date, end_date)')
      .eq('client_id', clientId).order('created_at', { ascending: false });
    setPayments(data || []);
    // outstanding = checked-out appt totals minus payments
    const { data: ca } = await supabase.from('appointments')
      .select('id, final_price, quoted_price, discount_amount').eq('client_id', clientId).not('checked_out_at', 'is', null);
    const paid = {};
    (data || []).forEach((p) => { if (p.appointment_id) paid[p.appointment_id] = (paid[p.appointment_id] || 0) + num(p.amount); });
    let total = 0;
    (ca || []).forEach((a) => {
      const due = num(a.final_price != null ? a.final_price : a.quoted_price) - num(a.discount_amount);
      const bal = due - (paid[a.id] || 0);
      if (bal > 0.01) total += bal;
    });
    setOwed(total);
    setTabLoading(false);
  }

  async function loadNotes() {
    setTabLoading(true);
    try {
      const { data: nd } = await supabase.from('notes').select('*')
        .eq('client_id', clientId).is('appointment_id', null).order('created_at', { ascending: false });
      const all = nd || [];
      setClientNotes(all.filter((n) => n.note_type === 'client' || (!n.pet_id && n.note_type !== 'grooming')));
      const legacyGroom = all.filter((n) => n.note_type === 'grooming' || (n.pet_id && n.note_type !== 'client'));
      const { data: cn } = await supabase.from('client_notes').select('*').eq('client_id', clientId).eq('note_type', 'grooming').order('created_at', { ascending: false });
      const unified = (cn || []).map((n) => ({ ...n, content: n.note }));
      setGroomNotes([...unified, ...legacyGroom].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (e) { /* notes are non-critical */ } finally { setTabLoading(false); }
  }

  async function addClientNote() {
    const txt = newNote.trim();
    if (!txt) return;
    setSavingNote(true); setErr('');
    try {
      const { error } = await supabase.from('notes').insert({
        client_id: clientId, pet_id: null, appointment_id: null,
        groomer_id: session.user.id, note_type: 'client', content: txt,
      });
      if (error) throw error;
      setNewNote('');
      await loadNotes();
    } catch (e) { setErr(e.message || 'Could not save note.'); } finally { setSavingNote(false); }
  }

  async function toggleInactive() {
    const makeInactive = client.is_active !== false;
    const { error } = await supabase.from('clients').update({ is_active: !makeInactive }).eq('id', clientId);
    if (error) setErr(error.message); else load();
  }

  function confirmDelete() {
    Alert.alert(
      `Delete ${fullName}?`,
      'Permanently erases this client, their pets, all appointments, payments, notes & contacts. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert('Are you absolutely sure?', 'There is no undo.', [
            { text: 'Keep client', style: 'cancel' },
            {
              text: 'Yes, delete forever',
              style: 'destructive',
              onPress: async () => {
                const { error } = await supabase.rpc('delete_client_and_auth', { p_client_id: clientId });
                if (error) setErr(error.message); else navigation.goBack();
              },
            },
          ]),
        },
      ],
    );
  }

  const fullName = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : name || 'Client';
  const isInactive = client && client.is_active === false;

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Clients</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{fullName}{isInactive ? '  (inactive)' : ''}</Text>
        </View>
        {client ? (
          <View style={styles.headActions}>
            <Pressable style={styles.headBtn} onPress={() => navigation.navigate('AddClient', { clientId })}>
              <Ionicons name="create-outline" size={15} color={colors.primaryDark} /><Text style={styles.headBtnText}>Edit</Text>
            </Pressable>
            <Pressable style={styles.headBtn} onPress={toggleInactive}>
              <Ionicons name={isInactive ? 'refresh' : 'moon-outline'} size={15} color={colors.primaryDark} /><Text style={styles.headBtnText}>{isInactive ? 'Reactivate' : 'Mark Inactive'}</Text>
            </Pressable>
          </View>
        ) : null}
        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={tab === t.key ? styles.tabTextActive : styles.tabText}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {tab === 'overview' ? (
            <>
              {/* Contact */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Contact</Text>
                {client?.phone ? <View style={styles.line}><Ionicons name="call-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{client.phone}</Text></View> : null}
                {client?.email ? <View style={styles.line}><Ionicons name="mail-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{client.email}</Text></View> : null}
                {client?.address ? <View style={styles.line}><Ionicons name="location-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{client.address}</Text></View> : null}
                {(client?.phone || client?.address) ? (
                  <View style={styles.actions}>
                    {client?.phone ? <Pressable style={styles.actionBtn} onPress={() => callNumber(client.phone)}><Ionicons name="call" size={16} color={colors.primaryDark} /><Text style={styles.actionText}>Call</Text></Pressable> : null}
                    {client?.phone ? <Pressable style={styles.actionBtn} onPress={() => textNumber(client.phone)}><Ionicons name="chatbubble" size={16} color={colors.primaryDark} /><Text style={styles.actionText}>Text</Text></Pressable> : null}
                    {client?.address ? <Pressable style={styles.actionBtn} onPress={() => openMaps(client.address)}><Ionicons name="navigate" size={16} color={colors.primaryDark} /><Text style={styles.actionText}>Directions</Text></Pressable> : null}
                  </View>
                ) : null}
              </View>

              {/* Extra contacts */}
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>Additional Contacts</Text>
                  <Pressable style={styles.manageBtn} onPress={() => navigation.navigate('ClientContacts', { clientId, clientName: fullName })}>
                    <Text style={styles.manageText}>Manage</Text>
                  </Pressable>
                </View>
                {contacts.length === 0 ? <Text style={styles.muted}>None yet — tap Manage to add.</Text> : (
                  contacts.map((c) => (
                    <View key={c.id} style={styles.contactRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.contactName}>
                          {`${c.first_name || ''} ${c.last_name || ''}`.trim()}
                          {c.relationship ? <Text style={styles.contactRel}>  · {c.relationship}</Text> : null}
                        </Text>
                        {c.phone ? <Text style={styles.contactPhone} onPress={() => callNumber(c.phone)}>{c.phone}</Text> : null}
                        <View style={styles.contactTags}>
                          {c.is_emergency ? <View style={[styles.cTag, { backgroundColor: '#fee2e2' }]}><Text style={[styles.cTagText, { color: '#b91c1c' }]}>Emergency</Text></View> : null}
                          {c.can_pickup ? <View style={[styles.cTag, { backgroundColor: '#dcfce7' }]}><Text style={[styles.cTagText, { color: '#166534' }]}>Can pick up</Text></View> : null}
                        </View>
                      </View>
                    </View>
                  )))}
                </View>

              {/* Pets */}
              <View style={styles.sectionRow}>
                <Text style={styles.section}>Pets ({pets.length})</Text>
                <Pressable style={({ pressed }) => [styles.addPetBtn, pressed && { opacity: 0.7 }]} onPress={() => navigation.navigate('AddPet', { clientId, clientName: fullName })}>
                  <Ionicons name="add" size={16} color={colors.primaryDark} /><Text style={styles.addPetText}>Add Pet</Text>
                </Pressable>
              </View>
              {pets.length === 0 ? <Text style={styles.muted}>No pets added yet.</Text> : pets.map((pet) => {
                const meta = [pet.breed, pet.weight ? `${pet.weight} lbs` : null, formatPetAge(pet.age), pet.sex].filter(Boolean).join(' · ');
                return (
                  <Pressable key={pet.id} style={({ pressed }) => [styles.petCard, pressed && { opacity: 0.6 }]} onPress={() => navigation.navigate('PetDetail', { petId: pet.id, name: pet.name })}>
                    <View style={styles.petIcon}><Ionicons name="paw" size={18} color={colors.primary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.petName}>{pet.name || 'Unnamed pet'}</Text>
                      {meta ? <Text style={styles.petMeta}>{meta}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
                  </Pressable>
                );
              })}

              <Pressable style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.85 }]} onPress={() => navigation.navigate('AddAppointment', { clientId, clientName: fullName })}>
                <Ionicons name="add-circle-outline" size={18} color="#fff" /><Text style={styles.bookText}>Book Appointment</Text>
              </Pressable>

              <Text style={styles.section}>Upcoming ({appts.length})</Text>
              {appts.length === 0 ? <Text style={styles.muted}>None scheduled.</Text> : appts.map((a) => {
                const ss = statusStyle(effectiveStatus(a));
                return (
                  <Pressable key={a.id} style={({ pressed }) => [styles.apptCard, pressed && { opacity: 0.6 }]} onPress={() => navigation.navigate('AppointmentDetail', { apptId: a.id })}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.apptDate}>{fmtShort(a.appointment_date)} · {fmtT(a.start_time)}</Text>
                      <Text style={styles.apptInfo}>{(a.pets && a.pets.name) || 'Pet'}{a.services && a.services.service_name ? ` · ${a.services.service_name}` : ''}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: ss.bg }]}><Text style={[styles.badgeText, { color: ss.color }]}>{(ss.label || '').toUpperCase()}</Text></View>
                  </Pressable>
                );
              })}

              {/* Danger zone */}
              <View style={styles.danger}>
                <Text style={styles.dangerTitle}>Manage</Text>
                <View style={styles.dangerRow}>
                  <Pressable style={styles.mergeBtn} onPress={() => navigation.navigate('MergeClient', { clientId, clientName: fullName })}>
                    <Ionicons name="git-merge-outline" size={16} color={colors.primaryDark} /><Text style={styles.mergeText}>Merge</Text>
                  </Pressable>
                  <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
                    <Ionicons name="trash-outline" size={16} color="#b91c1c" /><Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : tabLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : tab === 'grooming' ? (
            grooming.length === 0 ? <Text style={styles.muted}>No past grooming.</Text> : grooming.map((a) => {
              const ss = statusStyle(effectiveStatus(a));
              return (
                <Pressable key={a.id} style={({ pressed }) => [styles.histCard, pressed && { opacity: 0.6 }]} onPress={() => navigation.navigate('AppointmentDetail', { apptId: a.id })}>
                  <View style={styles.histTop}>
                    <Text style={styles.histDate}>{fmtDate(a.appointment_date)}</Text>
                    <Text style={styles.histPrice}>{money(apptTotal(a))}</Text>
                  </View>
                  {petServiceLines(a).map((l, i) => <Text key={i} style={styles.histLine}>{l}</Text>)}
                  <View style={[styles.badge, { backgroundColor: ss.bg, alignSelf: 'flex-start', marginTop: 6 }]}><Text style={[styles.badgeText, { color: ss.color }]}>{(ss.label || '').toUpperCase()}</Text></View>
                </Pressable>
              );
            })
          ) : tab === 'boarding' ? (
            boarding.length === 0 ? <Text style={styles.muted}>No boarding history.</Text> : boarding.map((b) => {
              const petsTxt = (b.boarding_reservation_pets || []).map((bp) => bp.pets && bp.pets.name).filter(Boolean).join(', ');
              return (
                <Pressable key={b.id} style={({ pressed }) => [styles.histCard, pressed && { opacity: 0.6 }]} onPress={() => navigation.navigate('Boarding', {})}>
                  <View style={styles.histTop}>
                    <Text style={styles.histDate}>{fmtShort(b.start_date)} → {fmtShort(b.end_date)}</Text>
                    <Text style={styles.histPrice}>{money(b.total_price)}</Text>
                  </View>
                  <Text style={styles.histLine}>{(b.kennels && b.kennels.name) || 'Kennel'}{petsTxt ? ` · ${petsTxt}` : ''}</Text>
                </Pressable>
              );
            })
          ) : tab === 'payments' ? (
            // payments
            <>
              <View style={[styles.balCard, owed > 0 ? styles.balOwed : styles.balClear]}>
                <Text style={styles.balLabel}>Outstanding balance</Text>
                <Text style={[styles.balValue, { color: owed > 0 ? '#b91c1c' : colors.green }]}>{money(owed)}</Text>
              </View>
              {payments.length === 0 ? <Text style={styles.muted}>No payments recorded.</Text> : payments.map((p) => {
                let label = p.method || 'Payment';
                if (p.appointments) label = `${(p.appointments.services && p.appointments.services.service_name) || 'Grooming'} · ${(p.appointments.pets && p.appointments.pets.name) || ''}`;
                else if (p.boarding_reservations) label = `Boarding ${fmtShort(p.boarding_reservations.start_date)}→${fmtShort(p.boarding_reservations.end_date)}`;
                return (
                  <View key={p.id} style={styles.payCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payLabel}>{label}</Text>
                      <Text style={styles.payMeta}>{(p.method || '').charAt(0).toUpperCase() + (p.method || '').slice(1)} · {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                    </View>
                    <Text style={styles.payAmt}>{money(num(p.amount) + num(p.tip_amount))}</Text>
                  </View>
                );
              })}
            </>
          ) : (
            // notes
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Add a client note</Text>
                <TextInput
                  style={styles.noteInput}
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder="Note about this client (gate code, preferences, etc.)…"
                  placeholderTextColor={colors.textFaint}
                  multiline
                />
                <Pressable style={[styles.noteSave, savingNote && { opacity: 0.6 }]} onPress={addClientNote} disabled={savingNote}>
                  {savingNote ? <ActivityIndicator color="#fff" /> : <Text style={styles.noteSaveText}>Save note</Text>}
                </Pressable>
              </View>

              <Text style={styles.section}>Client Notes ({clientNotes.length})</Text>
              {clientNotes.length === 0 ? <Text style={styles.muted}>No client notes yet.</Text> : clientNotes.map((n) => (
                <View key={n.id} style={styles.noteCard}>
                  <Text style={styles.noteText}>{n.content || n.note}</Text>
                  <Text style={styles.noteDate}>{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                </View>
              ))}

              <Text style={[styles.section, { marginTop: 18 }]}>Grooming Notes ({groomNotes.length})</Text>
              {groomNotes.length === 0 ? <Text style={styles.muted}>No grooming notes yet.</Text> : groomNotes.map((n) => (
                <View key={n.id} style={styles.noteCard}>
                  <Text style={styles.noteText}>{n.content || n.note}</Text>
                  <Text style={styles.noteDate}>{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 12, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  headActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  headBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12 },
  headBtnText: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
  tabs: { gap: 6, marginTop: 14, paddingRight: 20 },
  tab: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: '#ede9fe', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  scroll: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 16, ...shadow },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  manageBtn: { backgroundColor: colors.primaryLight, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12, marginBottom: 8 },
  manageText: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lineText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  actionText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  contactRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  contactName: { fontSize: 15, fontWeight: '800', color: colors.text },
  contactRel: { fontSize: 13, fontWeight: '600', color: colors.textMute },
  contactPhone: { fontSize: 14, color: colors.primary, fontWeight: '700', marginTop: 2 },
  contactTags: { flexDirection: 'row', gap: 6, marginTop: 6 },
  cTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  cTagText: { fontSize: 11, fontWeight: '800' },
  section: { fontSize: 13, fontWeight: '800', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginLeft: 4 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addPetBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.primaryLight, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 10 },
  addPetText: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
  petCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 10, ...shadow },
  petIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: 16, fontWeight: '800', color: colors.text },
  petMeta: { fontSize: 13, color: colors.textMute, marginTop: 3 },
  muted: { color: colors.textFaint, fontSize: 14, marginLeft: 4 },
  apptCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 10, ...shadow },
  apptDate: { fontSize: 14, fontWeight: '800', color: colors.primary },
  apptInfo: { fontSize: 14, color: colors.text, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  bookBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.green, borderRadius: 12, paddingVertical: 14, marginTop: 4, marginBottom: 16 },
  bookText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  histCard: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 10, ...shadow },
  histTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  histDate: { fontSize: 14, fontWeight: '800', color: colors.primary },
  histPrice: { fontSize: 15, fontWeight: '800', color: colors.green },
  histLine: { fontSize: 14, color: colors.text, marginTop: 2 },
  balCard: { borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'center', borderWidth: 1 },
  balOwed: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  balClear: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  balLabel: { fontSize: 13, fontWeight: '800', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
  balValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  payCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 10, ...shadow },
  payLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  payMeta: { fontSize: 12, color: colors.textMute, marginTop: 2 },
  payAmt: { fontSize: 16, fontWeight: '800', color: colors.green },
  noteInput: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 70, textAlignVertical: 'top' },
  noteSave: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  noteSaveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  noteCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, ...shadow },
  noteText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  noteDate: { fontSize: 12, color: colors.textFaint, marginTop: 6 },
  danger: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  dangerTitle: { fontSize: 13, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  dangerRow: { flexDirection: 'row', gap: 10 },
  mergeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: colors.border },
  mergeText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fef2f2', borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: '#fecaca' },
  deleteText: { color: '#b91c1c', fontWeight: '800', fontSize: 14 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
