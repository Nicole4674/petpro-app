import { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function AddClientScreen({ session, navigation }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    if (!firstName.trim() && !lastName.trim()) {
      setErr('Please enter at least a first or last name.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('clients').insert({
        groomer_id: session.user.id,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
      });
      if (error) throw error;
      navigation.goBack(); // list refetches on focus
    } catch (e) {
      setErr(e.message || 'Could not save the client.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ Clients</Text>
        </Pressable>
        <Text style={styles.title}>Add Client</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>First name</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#9ca3af" />

          <Text style={styles.label}>Last name</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#9ca3af" />

          <Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor="#9ca3af" keyboardType="phone-pad" />

          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#9ca3af" autoCapitalize="none" keyboardType="email-address" />

          <Text style={styles.label}>Address</Text>
          <TextInput style={[styles.input, { height: 70 }]} value={address} onChangeText={setAddress} placeholder="Street, City, State ZIP" placeholderTextColor="#9ca3af" multiline />

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Client</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f5f3ff' },
  header: { backgroundColor: '#5b21b6', paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  scroll: { padding: 20, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: '#1f2937', borderWidth: 1, borderColor: '#e5e7eb' },
  err: { color: '#b91c1c', fontSize: 14, marginTop: 14, textAlign: 'center' },
  saveBtn: { backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
