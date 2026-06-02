import { useState } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

export default function AddPetScreen({ session, route, navigation }) {
  const { clientId, clientName } = route.params;
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [ageUnit, setAgeUnit] = useState('years'); // years | months
  const [sex, setSex] = useState('female');
  const [fixed, setFixed] = useState(false);
  const [coatType, setCoatType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');
  const [specialHandling, setSpecialHandling] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    if (!name.trim()) { setErr('Enter a name.'); return; }
    // Match the website: weight + age are required (Suds needs them to quote prices)
    if (!weight || Number(weight) <= 0) { setErr('Weight is required (lbs).'); return; }
    if (age === '' || Number(age) < 0) { setErr('Age is required.'); return; }

    setSaving(true);
    try {
      const ageNum = parseFloat(age);
      const ageYears = ageUnit === 'months' ? ageNum / 12 : ageNum;
      const { error } = await supabase.from('pets').insert({
        client_id: clientId,
        groomer_id: session.user.id,
        name: name.trim(),
        species: 'dog',
        breed: breed.trim() || null,
        weight: Number(weight),
        age: ageYears,
        sex,
        is_spayed_neutered: fixed,
        coat_type: coatType.trim() || null,
        allergies: allergies.trim() || null,
        medications: medications.trim() || null,
        behavior_notes: specialHandling.trim() || null,
      });
      if (error) throw error;
      navigation.goBack(); // ClientDetail refetches on focus
    } catch (e) {
      setErr(e.message || 'Could not add the pet.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Add Pet</Text>
        {clientName ? <Text style={styles.sub}>for {clientName}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Pet's name" placeholderTextColor={colors.textFaint} autoCapitalize="words" />

        <Text style={styles.label}>Breed</Text>
        <TextInput style={styles.input} value={breed} onChangeText={setBreed} placeholder="e.g. Labradoodle" placeholderTextColor={colors.textFaint} autoCapitalize="words" />

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Weight (lbs) *</Text>
            <TextInput style={styles.input} value={weight} onChangeText={setWeight} placeholder="0" placeholderTextColor={colors.textFaint} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Age *</Text>
            <TextInput style={styles.input} value={age} onChangeText={setAge} placeholder="0" placeholderTextColor={colors.textFaint} keyboardType="numeric" />
          </View>
        </View>

        {/* years / months toggle */}
        <View style={styles.chips}>
          {['years', 'months'].map((u) => (
            <Pressable key={u} style={[styles.chip, ageUnit === u && styles.chipSel]} onPress={() => setAgeUnit(u)}>
              <Text style={[styles.chipText, ageUnit === u && styles.chipTextSel]}>{u}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Sex</Text>
        <View style={styles.chips}>
          {['female', 'male'].map((s) => (
            <Pressable key={s} style={[styles.chip, sex === s && styles.chipSel]} onPress={() => setSex(s)}>
              <Text style={[styles.chipText, sex === s && styles.chipTextSel]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Spayed / Neutered</Text>
          <Switch value={fixed} onValueChange={setFixed} trackColor={{ true: colors.primary }} thumbColor="#fff" />
        </View>

        <Text style={styles.label}>Coat type</Text>
        <TextInput style={styles.input} value={coatType} onChangeText={setCoatType} placeholder="e.g. curly, double, smooth" placeholderTextColor={colors.textFaint} autoCapitalize="none" />

        <Text style={styles.label}>Allergies</Text>
        <TextInput style={[styles.input, styles.multiline]} value={allergies} onChangeText={setAllergies} placeholder="None if blank" placeholderTextColor={colors.textFaint} multiline />

        <Text style={styles.label}>Medications</Text>
        <TextInput style={[styles.input, styles.multiline]} value={medications} onChangeText={setMedications} placeholder="None if blank" placeholderTextColor={colors.textFaint} multiline />

        <Text style={styles.label}>Special handling</Text>
        <TextInput style={[styles.input, styles.multiline]} value={specialHandling} onChangeText={setSpecialHandling} placeholder="Muzzle, anxious, etc." placeholderTextColor={colors.textFaint} multiline />

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Pet</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 14, marginTop: 2 },
  scroll: { padding: 20, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMute, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: colors.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  multiline: { minHeight: 46, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chip: { backgroundColor: colors.card, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#374151', fontWeight: '700' },
  chipTextSel: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, marginTop: 16 },
  switchLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  err: { color: '#b91c1c', fontSize: 14, marginTop: 16, textAlign: 'center' },
  saveBtn: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
