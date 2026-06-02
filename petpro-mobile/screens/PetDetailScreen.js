import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { formatPetAge } from '../lib/petAge';
import { colors } from '../lib/theme';

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('-').map((n) => parseInt(n, 10));
  if (!y) return s;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}
// Mirrors the website's vax status badge
function vaxStatus(pet) {
  if (!pet || !pet.vaccination_expiry) return { label: 'Vax Unknown', color: '#6b7280', bg: '#f3f4f6' };
  const exp = new Date(pet.vaccination_expiry);
  const now = new Date(new Date().toDateString());
  if (exp < now) return { label: 'Vax Expired', color: '#b91c1c', bg: '#fee2e2' };
  const soon = new Date(now); soon.setDate(soon.getDate() + 30);
  if (exp <= soon) return { label: 'Vax Expiring', color: '#b45309', bg: '#fef3c7' };
  return { label: 'Vax Current', color: '#15803d', bg: '#dcfce7' };
}

// One label/value row inside a card
function InfoRow({ label, value, color }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, color && { color, fontWeight: '700' }]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

export default function PetDetailScreen({ route, navigation }) {
  const { petId, name } = route.params;
  const [loading, setLoading] = useState(true);
  const [pet, setPet] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('pets')
        .select('*')
        .eq('id', petId)
        .maybeSingle();
      if (error) throw error;
      setPet(data);
    } catch (e) {
      setErr(e.message || 'Could not load this pet.');
    } finally {
      setLoading(false);
    }
  }

  const vax = vaxStatus(pet);
  const tags = Array.isArray(pet?.behavior_tags) ? pet.behavior_tags.filter(Boolean) : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.headRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(pet?.name || name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{pet?.name || name || 'Pet'}</Text>
            {pet?.breed ? <Text style={styles.sub}>{pet.breed}</Text> : null}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : !pet ? (
        <Text style={styles.err}>Pet not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Quick pills + vax status */}
          <View style={styles.pills}>
            {pet.weight ? <View style={styles.pill}><Text style={styles.pillText}>{pet.weight} lbs</Text></View> : null}
            {pet.age ? <View style={styles.pill}><Text style={styles.pillText}>{formatPetAge(pet.age)}</Text></View> : null}
            {pet.sex ? <View style={styles.pill}><Text style={styles.pillText}>{cap(pet.sex)}</Text></View> : null}
            {pet.is_spayed_neutered ? (
              <View style={[styles.pill, styles.pillGreen]}><Text style={[styles.pillText, { color: '#15803d' }]}>Fixed</Text></View>
            ) : pet.sex ? (
              <View style={[styles.pill, styles.pillAmber]}><Text style={[styles.pillText, { color: '#b45309' }]}>Intact</Text></View>
            ) : null}
            {pet.coat_type ? <View style={styles.pill}><Text style={styles.pillText}>{pet.coat_type}</Text></View> : null}
            <View style={[styles.pill, { backgroundColor: vax.bg }]}><Text style={[styles.pillText, { color: vax.color }]}>{vax.label}</Text></View>
          </View>

          {/* Behavior tags */}
          {tags.length > 0 ? (
            <View style={styles.pills}>
              {tags.map((t, i) => (
                <View key={i} style={[styles.pill, styles.pillTag]}><Text style={[styles.pillText, { color: colors.primaryDark }]}>{t}</Text></View>
              ))}
            </View>
          ) : null}

          {/* Basic Info */}
          <View style={styles.card}>
            <View style={styles.cardHead}><Ionicons name="clipboard-outline" size={16} color={colors.primary} /><Text style={styles.cardTitle}>Basic Info</Text></View>
            <InfoRow label="Name" value={pet.name || '—'} />
            <InfoRow label="Breed" value={pet.breed || '—'} />
            <InfoRow label="Weight" value={pet.weight ? `${pet.weight} lbs` : '—'} />
            <InfoRow label="Age" value={formatPetAge(pet.age) || '—'} />
            <InfoRow label="Sex" value={pet.sex ? cap(pet.sex) : '—'} />
            <InfoRow label="Spayed/Neutered" value={pet.is_spayed_neutered ? 'Yes' : 'No'} />
            <InfoRow label="Coat Type" value={pet.coat_type || '—'} />
            <InfoRow label="Microchip" value={pet.microchip_id || '—'} />
          </View>

          {/* Health & Vet */}
          <View style={styles.card}>
            <View style={styles.cardHead}><Ionicons name="medkit-outline" size={16} color={colors.primary} /><Text style={styles.cardTitle}>Health & Vet</Text></View>
            <InfoRow label="Allergies" value={pet.allergies || 'None noted'} color={pet.allergies ? '#b91c1c' : undefined} />
            <InfoRow label="Medications" value={pet.medications || 'None'} color={pet.medications ? '#1d4ed8' : undefined} />
            <InfoRow label="Vaccination Expiry" value={pet.vaccination_expiry ? fmtDate(pet.vaccination_expiry) : '—'} />
            <InfoRow label="Vet Name" value={pet.vet_name || '—'} />
            <InfoRow label="Vet Phone" value={pet.vet_phone || '—'} />
          </View>

          {/* Temperament & Handling */}
          <View style={styles.card}>
            <View style={styles.cardHead}><Ionicons name="happy-outline" size={16} color={colors.primary} /><Text style={styles.cardTitle}>Temperament & Handling</Text></View>
            <InfoRow label="Temperament" value={pet.temperament || 'Not noted'} />
            <InfoRow label="Special Handling" value={pet.behavior_notes || pet.special_handling || 'None needed'} color={(pet.behavior_notes || pet.special_handling) ? '#b45309' : undefined} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 14, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  pillGreen: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  pillAmber: { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
  pillTag: { backgroundColor: colors.primaryLight, borderColor: '#ddd6fe' },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  infoLabel: { fontSize: 14, color: colors.textMute, flexShrink: 0 },
  infoValue: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
