import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import { APP_TRIAL_KEY, PLANS, WEB_DOMAIN } from '../lib/appConfig';

const HEADERS = { 'x-petpro-app-key': APP_TRIAL_KEY };

// Pull a clean { status, message } out of a supabase functions error.
async function fnError(error) {
  let status, message = error && error.message;
  try {
    status = error && error.context && error.context.status;
    if (error && error.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      if (body && body.error) message = body.error;
    }
  } catch (e) { /* ignore */ }
  return { status, message };
}

export default function SignupScreen({ onComplete, onCancel }) {
  const [tier, setTier] = useState('pro_plus');
  const [fullName, setFullName] = useState('');
  const [business, setBusiness] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    if (!fullName.trim()) { setErr('Enter your name.'); return; }
    if (!business.trim()) { setErr('Enter your business name.'); return; }
    if (!email.trim() || !email.includes('@')) { setErr('Enter a valid email.'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setBusy(true); setErr('');
    try {
      // 1. Create the account (server-side; safe + no captcha)
      const { error: suErr } = await supabase.functions.invoke('signup-groomer-app', {
        body: { email: email.trim().toLowerCase(), password, full_name: fullName.trim(), business_name: business.trim(), phone: phone.trim() },
        headers: HEADERS,
      });
      if (suErr) {
        const { status, message } = await fnError(suErr);
        if (status === 409) { setErr('That email already has an account — go back and Log In instead.'); setBusy(false); return; }
        throw new Error(message || 'Could not create your account.');
      }

      // 2. Sign in to get a session
      const { error: siErr } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (siErr) throw new Error(siErr.message || 'Account made, but sign-in failed. Try logging in.');

      // 3. Start the free trial
      const { error: trErr } = await supabase.functions.invoke('start-free-trial', { body: { tier }, headers: HEADERS });
      if (trErr) {
        const { status, message } = await fnError(trErr);
        if (status === 409) { setErr(`This account already has a plan — manage it at ${WEB_DOMAIN}.`); setBusy(false); return; }
        throw new Error(message || 'Could not start your free trial.');
      }

      // 4. Done — show the celebration, then drop them into the app
      setDone(true);
      setTimeout(() => { onComplete(); }, 1400);
    } catch (e) {
      setErr(e.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={styles.doneWrap}>
        <Text style={styles.doneEmoji}>🎉</Text>
        <Text style={styles.doneTitle}>Your 14-day free trial is live!</Text>
        <Text style={styles.doneSub}>Taking you into PetPro…</Text>
        <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.back} onPress={onCancel}><Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>Back</Text></Pressable>
        <Text style={styles.title}>Start your free trial</Text>
        <Text style={styles.sub}>14 days free — no card needed.</Text>

        <Text style={styles.label}>Choose a plan</Text>
        {PLANS.map((p) => (
          <Pressable key={p.slug} style={[styles.planCard, tier === p.slug && styles.planCardOn]} onPress={() => setTier(p.slug)}>
            <View style={{ flex: 1 }}>
              <View style={styles.planRow}>
                <Text style={[styles.planName, tier === p.slug && { color: '#fff' }]}>{p.name}</Text>
                {p.tag ? <View style={styles.planTag}><Text style={styles.planTagText}>{p.tag}</Text></View> : null}
              </View>
              <Text style={[styles.planTagline, tier === p.slug && { color: '#ede9fe' }]}>{p.tagline}</Text>
            </View>
            <Text style={[styles.planPrice, tier === p.slug && { color: '#fff' }]}>${p.price}<Text style={styles.planMo}>/mo</Text></Text>
          </Pressable>
        ))}
        <Text style={styles.afterNote}>Free for 14 days. After that, keep your plan at {WEB_DOMAIN}.</Text>

        <Text style={styles.label}>Your details</Text>
        <TextInput style={styles.input} placeholder="Your full name" placeholderTextColor={colors.textFaint} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
        <TextInput style={styles.input} placeholder="Business name" placeholderTextColor={colors.textFaint} value={business} onChangeText={setBusiness} autoCapitalize="words" />
        <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={colors.textFaint} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textFaint} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <View style={styles.pwRow}>
          <TextInput style={styles.pwInput} placeholder="Password (min 6 characters)" placeholderTextColor={colors.textFaint} value={password} onChangeText={setPassword} secureTextEntry={!showPw} autoCapitalize="none" />
          <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10} style={{ padding: 6 }}><Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.primary} /></Pressable>
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <Pressable style={[styles.submit, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Start 14-day Free Trial</Text>}
        </Pressable>
        <Text style={styles.legal}>No card required. By continuing you agree to PetPro's Terms & Privacy.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#5b21b6' },
  scroll: { padding: 22, paddingTop: 56, paddingBottom: 50 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 15, marginTop: 4, marginBottom: 8 },
  label: { color: '#c4b5fd', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 22, marginBottom: 10 },
  planCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  planCardOn: { backgroundColor: '#7c3aed', borderColor: '#fff' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { fontSize: 17, fontWeight: '800', color: colors.text },
  planTag: { backgroundColor: '#ede9fe', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  planTagText: { fontSize: 10, fontWeight: '800', color: '#6b21a8' },
  planTagline: { fontSize: 12, color: colors.textMute, marginTop: 3 },
  planPrice: { fontSize: 20, fontWeight: '800', color: colors.text },
  planMo: { fontSize: 12, fontWeight: '600', color: colors.textMute },
  afterNote: { color: '#c4b5fd', fontSize: 12, marginTop: 2, lineHeight: 17 },
  input: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, color: '#1f2937', marginBottom: 12 },
  pwRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingRight: 12, marginBottom: 12 },
  pwInput: { flex: 1, paddingVertical: 14, paddingLeft: 16, paddingRight: 8, fontSize: 16, color: '#1f2937' },
  err: { color: '#fecaca', fontSize: 14, marginBottom: 10, textAlign: 'center', fontWeight: '600' },
  submit: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#5b21b6', fontSize: 16, fontWeight: '800' },
  legal: { color: '#c4b5fd', fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 16 },
  doneWrap: { flex: 1, backgroundColor: '#5b21b6', alignItems: 'center', justifyContent: 'center', padding: 28 },
  doneEmoji: { fontSize: 64 },
  doneTitle: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  doneSub: { color: '#ddd6fe', fontSize: 15, marginTop: 8 },
});
