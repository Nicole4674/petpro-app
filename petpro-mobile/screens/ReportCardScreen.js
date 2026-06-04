import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const BEHAVIOR = [
  { key: 'great', label: 'Great', desc: 'A dream to work with', color: '#16a34a', bg: '#dcfce7' },
  { key: 'good', label: 'Good', desc: 'Minor wiggles, easy', color: '#65a30d', bg: '#ecfccb' },
  { key: 'okay', label: 'Okay', desc: 'Needed some patience', color: '#ca8a04', bg: '#fef9c3' },
  { key: 'anxious', label: 'Anxious', desc: 'Scared, took extra time', color: '#ea580c', bg: '#ffedd5' },
  { key: 'difficult', label: 'Difficult', desc: 'Special handling needed', color: '#dc2626', bg: '#fee2e2' },
];
const WEEKS = [2, 4, 6, 8, 12];

function base64ToBytes(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = {}; for (let i = 0; i < chars.length; i++) lookup[chars[i]] = i;
  const clean = b64.replace(/=+$/, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let p = 0, buf = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) { buf = (buf << 6) | lookup[clean[i]]; bits += 6; if (bits >= 8) { bits -= 8; bytes[p++] = (buf >> bits) & 0xff; } }
  return bytes;
}

export default function ReportCardScreen({ session, route, navigation }) {
  const { appointmentId, clientId, pets = [], groomer } = route.params;
  const [petId, setPetId] = useState(pets[0] ? pets[0].id : null);
  const [services, setServices] = useState('');
  const [products, setProducts] = useState('');
  const [coat, setCoat] = useState('');
  const [behavior, setBehavior] = useState('');
  const [behaviorNotes, setBehaviorNotes] = useState('');
  const [recs, setRecs] = useState('');
  const [weeks, setWeeks] = useState(null);
  const [groomerName, setGroomerName] = useState(groomer || '');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function addPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
      if (res.canceled) return;
      const a = res.assets[0];
      setUploading(true); setErr('');
      const ext = (a.mimeType && a.mimeType.split('/')[1]) || 'jpg';
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('vax-certs').upload(path, base64ToBytes(a.base64), { contentType: a.mimeType || 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('vax-certs').getPublicUrl(path);
      setPhotos((ph) => [...ph, data.publicUrl]);
    } catch (e) { setErr('Photo upload failed: ' + (e.message || e)); } finally { setUploading(false); }
  }

  async function save() {
    if (!petId) { setErr('Pick which pet this is for.'); return; }
    if (!services.trim()) { setErr('Add what services were performed.'); return; }
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('report_cards').insert({
        groomer_id: session.user.id,
        pet_id: petId,
        client_id: clientId,
        appointment_id: appointmentId || null,
        service_type: 'grooming',
        services_performed: services.trim() || null,
        products_used: products.trim() || null,
        coat_condition: coat.trim() || null,
        behavior_rating: behavior || null,
        behavior_notes: behaviorNotes.trim() || null,
        recommendations: recs.trim() || null,
        next_visit_weeks: weeks || null,
        photo_urls: photos,
        groomer_name: groomerName.trim() || null,
      });
      if (error) throw error;
      navigation.goBack();
    } catch (e) { setErr(e.message || 'Could not save report card.'); } finally { setSaving(false); }
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>New Report Card</Text>
      </GradientHeader>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {pets.length > 1 ? (
          <>
            <Text style={styles.label}>Pet</Text>
            <View style={styles.chips}>
              {pets.map((p) => (
                <Pressable key={p.id} style={[styles.chip, petId === p.id && styles.chipSel]} onPress={() => setPetId(p.id)}>
                  <Text style={[styles.chipText, petId === p.id && styles.chipTextSel]}>{p.name || 'Pet'}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>Services performed *</Text>
        <TextInput style={[styles.input, styles.multi]} value={services} onChangeText={setServices} placeholder="Full groom, dematting, dremel, ear cleaning…" placeholderTextColor={colors.textFaint} multiline />

        <Text style={styles.label}>Products used</Text>
        <TextInput style={[styles.input, styles.multi]} value={products} onChangeText={setProducts} placeholder="Oatmeal shampoo, conditioning rinse…" placeholderTextColor={colors.textFaint} multiline />

        <Text style={styles.label}>Coat condition</Text>
        <TextInput style={[styles.input, styles.multi]} value={coat} onChangeText={setCoat} placeholder="Mild matting behind ears, healthy coat…" placeholderTextColor={colors.textFaint} multiline />

        <Text style={styles.label}>How they did</Text>
        {BEHAVIOR.map((b) => (
          <Pressable key={b.key} style={[styles.behavior, behavior === b.key && { backgroundColor: b.bg, borderColor: b.color }]} onPress={() => setBehavior(behavior === b.key ? '' : b.key)}>
            <Text style={[styles.behaviorLabel, behavior === b.key && { color: b.color }]}>{b.label}</Text>
            <Text style={styles.behaviorDesc}>{b.desc}</Text>
          </Pressable>
        ))}

        <Text style={styles.label}>Behavior notes</Text>
        <TextInput style={[styles.input, styles.multi]} value={behaviorNotes} onChangeText={setBehaviorNotes} placeholder="Got nervous during dryer, did better slowly…" placeholderTextColor={colors.textFaint} multiline />

        <Text style={styles.label}>Recommendations</Text>
        <TextInput style={[styles.input, styles.multi]} value={recs} onChangeText={setRecs} placeholder="Brush twice a week, use a slip-on harness…" placeholderTextColor={colors.textFaint} multiline />

        <Text style={styles.label}>See you next</Text>
        <View style={styles.chips}>
          {WEEKS.map((w) => (
            <Pressable key={w} style={[styles.chip, weeks === w && styles.chipSel]} onPress={() => setWeeks(weeks === w ? null : w)}>
              <Text style={[styles.chipText, weeks === w && styles.chipTextSel]}>{w} wks</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Groomer (your name)</Text>
        <TextInput style={styles.input} value={groomerName} onChangeText={setGroomerName} placeholder="Your name" placeholderTextColor={colors.textFaint} autoCapitalize="words" />

        <Text style={styles.label}>Photos</Text>
        <View style={styles.photoRow}>
          {photos.map((u, i) => <Image key={i} source={{ uri: u }} style={styles.photo} />)}
          <Pressable style={styles.addPhoto} onPress={addPhoto} disabled={uploading}>
            {uploading ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="camera-outline" size={22} color={colors.primary} /><Text style={styles.addPhotoText}>Add</Text></>}
          </Pressable>
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}
        <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Report Card</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  scroll: { padding: 20, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMute, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  multi: { minHeight: 60, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#374151', fontWeight: '700' },
  chipTextSel: { color: '#fff' },
  behavior: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  behaviorLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  behaviorDesc: { fontSize: 12, color: colors.textMute, marginTop: 1 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 72, height: 72, borderRadius: 10 },
  addPhoto: { width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  addPhotoText: { fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 2 },
  saveBtn: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  err: { color: '#b91c1c', fontSize: 14, marginTop: 16, textAlign: 'center' },
});
