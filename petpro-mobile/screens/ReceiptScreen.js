import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';
import { buildReceiptModel, receiptHtml, smsSummary, money } from '../lib/receipt';

function toE164(raw) {
  const d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  if (String(raw || '').trim().startsWith('+')) return String(raw).trim();
  return d ? '+' + d : '';
}

export default function ReceiptScreen({ session, route, navigation }) {
  const { kind, id } = route.params; // kind: 'appointment' | 'boarding' | 'sale'
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');       // 'email' | 'sms' | 'print'
  const [msg, setMsg] = useState(null);       // { ok, text }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const gid = session.user.id;
      const { data: shop } = await supabase.from('shop_settings').select('shop_name, address, phone, email').eq('groomer_id', gid).maybeSingle();

      let row = null, payments = [];
      if (kind === 'appointment') {
        const { data, error } = await supabase.from('appointments')
          .select('id, appointment_date, start_time, discount_amount, discount_reason, quoted_price, final_price, clients:client_id(first_name, last_name, email, phone), pets:pet_id(name), services:service_id(service_name, price), appointment_pets(quoted_price, pets:pet_id(name), services:service_id(service_name, price), appointment_pet_addons(quoted_price, services:service_id(service_name, price)))')
          .eq('id', id).single();
        if (error) throw error;
        row = data;
        const { data: pays } = await supabase.from('payments').select('*').eq('appointment_id', id).order('created_at', { ascending: true });
        payments = pays || [];
      } else if (kind === 'boarding') {
        const { data, error } = await supabase.from('boarding_reservations')
          .select('id, start_date, end_date, total_price, clients:client_id(first_name, last_name, email, phone), boarding_reservation_pets(pets:pet_id(name)), boarding_addons(addon_type, description, price)')
          .eq('id', id).single();
        if (error) throw error;
        row = data;
        const { data: pays } = await supabase.from('payments').select('*').eq('boarding_reservation_id', id).order('created_at', { ascending: true });
        payments = pays || [];
      } else {
        const { data, error } = await supabase.from('sales')
          .select('id, created_at, subtotal, discount_amount, discount_reason, tax_amount, tip_amount, total, payment_method, payment_status, clients:client_id(first_name, last_name, email, phone), sale_items(qty, unit_price, line_total, custom_name, products(name))')
          .eq('id', id).single();
        if (error) throw error;
        row = data;
      }

      setModel(buildReceiptModel({ kind, row, payments, shop: shop || {} }));
    } catch (e) { setErr(e.message || 'Could not load this receipt.'); } finally { setLoading(false); }
  }

  async function emailReceipt() {
    if (!model) return;
    if (!model.clientEmail || !model.clientEmail.includes('@')) { setMsg({ ok: false, text: "This client has no email on file. Add one in their profile first." }); return; }
    setBusy('email'); setMsg(null);
    try {
      const fn = kind === 'sale' ? 'email-sale-receipt' : 'email-receipt';
      const body = kind === 'sale' ? { sale_id: id } : kind === 'boarding' ? { reservation_id: id } : { appointment_id: id };
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      setMsg({ ok: true, text: `Emailed to ${(data && data.sent_to) || model.clientEmail}` });
    } catch (e) { setMsg({ ok: false, text: e.message || 'Could not send email.' }); } finally { setBusy(''); }
  }

  async function textReceipt() {
    if (!model) return;
    const to = toE164(model.clientPhone);
    if (!to) { setMsg({ ok: false, text: 'This client has no phone number on file.' }); return; }
    Alert.alert('Text receipt?', `Send a receipt summary to ${model.clientPhone}? This uses one text credit.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send text', onPress: async () => {
        setBusy('sms'); setMsg(null);
        try {
          const { data, error } = await supabase.functions.invoke('send-sms', { body: { to, message: smsSummary(model), groomer_id: session.user.id, sms_type: 'receipt' } });
          if (error) throw error;
          if (data && data.success === false) throw new Error(data.error || 'Text not sent (out of credits?).');
          setMsg({ ok: true, text: `Texted to ${model.clientPhone}` });
        } catch (e) { setMsg({ ok: false, text: e.message || 'Could not send text.' }); } finally { setBusy(''); }
      } },
    ]);
  }

  async function printReceipt() {
    if (!model) return;
    setBusy('print'); setMsg(null);
    try {
      await Print.printAsync({ html: receiptHtml(model) });
    } catch (e) {
      if (!/cancel/i.test(e.message || '')) setMsg({ ok: false, text: e.message || 'Could not open print.' });
    } finally { setBusy(''); }
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.titleWrap}><Ionicons name="receipt" size={20} color="#fff" /><Text style={styles.title}>Receipt</Text></View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : !model ? (
        <Text style={styles.err}>Receipt not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            {/* Shop header */}
            <View style={styles.shopBlock}>
              <Text style={styles.shopName}>{model.shopName}</Text>
              {model.shopAddress ? <Text style={styles.shopMeta}>{model.shopAddress}</Text> : null}
              {(model.shopPhone || model.shopEmail) ? <Text style={styles.shopMeta}>{[model.shopPhone, model.shopEmail].filter(Boolean).join(' · ')}</Text> : null}
            </View>

            {/* Receipt # + date */}
            <View style={styles.metaRow}>
              <Text style={styles.metaText}><Text style={styles.bold}>Receipt #</Text> {model.receiptNo}</Text>
              <Text style={styles.metaText}>{model.dateLabel}{model.timeLabel ? ` · ${model.timeLabel}` : ''}</Text>
            </View>

            {/* Client + pets */}
            <View style={styles.clientBox}>
              <Text style={styles.clientText}><Text style={styles.bold}>Client:</Text> {model.clientName || '—'}</Text>
              {model.petsList ? <Text style={styles.clientText}><Text style={styles.bold}>Pet{model.petsList.includes(',') ? 's' : ''}:</Text> {model.petsList}</Text> : null}
            </View>

            {/* Line items */}
            <View style={styles.itemsHead}>
              <Text style={styles.itemsHeadText}>Item</Text>
              <Text style={styles.itemsHeadText}>Price</Text>
            </View>
            {model.lineItems.length === 0 ? (
              <Text style={styles.noItems}>No services recorded.</Text>
            ) : model.lineItems.map((li, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={styles.itemLabel}>
                  {li.indent ? <Text style={styles.indent}>↳ </Text> : null}{li.label}
                  {li.petName ? <Text style={styles.itemPet}>  ({li.petName})</Text> : null}
                </Text>
                <Text style={styles.itemPrice}>{money(li.price)}</Text>
              </View>
            ))}

            {/* Totals */}
            <View style={styles.totals}>
              <Row label="Subtotal" value={money(model.subtotal)} />
              {model.discount > 0 ? <Row label={`Discount${model.discReason ? ' — ' + model.discReason : ''}`} value={`-${money(model.discount)}`} color="#dc2626" /> : null}
              <Row label="Total" value={money(model.total)} bold />
              {model.tipPaid > 0 ? <Row label="Tip" value={money(model.tipPaid)} color={colors.green} /> : null}
              {model.tipPaid > 0 ? <Row label="Grand Total" value={money(model.grandTotal)} bold /> : null}
            </View>

            {/* Payments */}
            {model.payments.length > 0 ? (
              <View style={styles.payBlock}>
                <Text style={styles.payTitle}>💳 Payment{model.payments.length > 1 ? 's' : ''}</Text>
                {model.payments.map((p, i) => {
                  const net = Math.max(0, (parseFloat(p.amount) || 0) - (parseFloat(p.refunded_amount) || 0));
                  const tip = parseFloat(p.tip_amount) || 0;
                  const dt = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                  return (
                    <View key={i} style={styles.payRow}>
                      <Text style={styles.payMethod}>{String(p.method || 'paid').toUpperCase()}{tip > 0 ? ` (+${money(tip)} tip)` : ''}{dt ? ` · ${dt}` : ''}</Text>
                      <Text style={styles.payAmt}>{money(net + tip)}</Text>
                    </View>
                  );
                })}
                <View style={styles.payTotalRow}>
                  <Text style={styles.payTotalLabel}>Total Paid</Text>
                  <Text style={styles.payTotalLabel}>{money(model.amountPaid + model.tipPaid)}</Text>
                </View>
              </View>
            ) : null}

            {/* Balance */}
            {model.balance > 0.01 ? (
              <View style={styles.balanceBox}>
                <Text style={styles.balanceText}>Balance Due</Text>
                <Text style={styles.balanceText}>{money(model.balance)}</Text>
              </View>
            ) : null}

            <Text style={styles.thanks}>Thank you for your business! 🐾</Text>
          </View>

          {/* Status message */}
          {msg ? (
            <View style={[styles.msg, msg.ok ? styles.msgOk : styles.msgErr]}>
              <Ionicons name={msg.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={msg.ok ? '#166534' : '#b91c1c'} />
              <Text style={[styles.msgText, { color: msg.ok ? '#166534' : '#b91c1c' }]}>{msg.text}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={[styles.action, busy && busy !== 'email' && { opacity: 0.5 }]} onPress={emailReceipt} disabled={!!busy}>
              {busy === 'email' ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="mail-outline" size={20} color={colors.primary} /><Text style={styles.actionText}>Email</Text></>}
            </Pressable>
            <Pressable style={[styles.action, busy && busy !== 'sms' && { opacity: 0.5 }]} onPress={textReceipt} disabled={!!busy}>
              {busy === 'sms' ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="chatbubble-outline" size={20} color={colors.primary} /><Text style={styles.actionText}>Text</Text></>}
            </Pressable>
            <Pressable style={[styles.action, busy && busy !== 'print' && { opacity: 0.5 }]} onPress={printReceipt} disabled={!!busy}>
              {busy === 'print' ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="print-outline" size={20} color={colors.primary} /><Text style={styles.actionText}>Print</Text></>}
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, value, color, bold }) {
  return (
    <View style={styles.totRow}>
      <Text style={[styles.totLabel, color && { color }, bold && styles.totBold]}>{label}</Text>
      <Text style={[styles.totVal, color && { color }, bold && styles.totBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24, paddingHorizontal: 20 },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 20, ...shadow },
  shopBlock: { alignItems: 'center', paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: colors.primary, marginBottom: 14 },
  shopName: { fontSize: 22, fontWeight: '800', color: colors.primary },
  shopMeta: { fontSize: 12, color: colors.textMute, marginTop: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 4 },
  metaText: { fontSize: 12, color: colors.textMute },
  bold: { fontWeight: '800', color: colors.text },
  clientBox: { backgroundColor: '#f9fafb', padding: 12, borderRadius: 10, marginBottom: 14 },
  clientText: { fontSize: 13, color: colors.text, marginBottom: 2 },
  itemsHead: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginBottom: 4 },
  itemsHeadText: { fontSize: 10, fontWeight: '800', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
  noItems: { color: colors.textFaint, fontStyle: 'italic', paddingVertical: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  itemLabel: { flex: 1, fontSize: 13, color: colors.text },
  indent: { color: colors.textFaint },
  itemPet: { color: colors.textFaint, fontSize: 11 },
  itemPrice: { fontSize: 13, color: colors.text, fontWeight: '600' },
  totals: { borderTopWidth: 2, borderTopColor: colors.text, paddingTop: 10, marginTop: 6 },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totLabel: { fontSize: 13, color: colors.text },
  totVal: { fontSize: 13, color: colors.text },
  totBold: { fontWeight: '800' },
  payBlock: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 10, marginTop: 14 },
  payTitle: { fontWeight: '800', color: '#166534', marginBottom: 6, fontSize: 13 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, gap: 8 },
  payMethod: { fontSize: 12, color: colors.text, flexShrink: 1 },
  payAmt: { fontSize: 12, fontWeight: '700', color: colors.text },
  payTotalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#bbf7d0', marginTop: 6, paddingTop: 6 },
  payTotalLabel: { fontWeight: '800', fontSize: 13, color: '#166534' },
  balanceBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fef2f2', padding: 12, borderRadius: 10, marginTop: 10 },
  balanceText: { fontWeight: '800', color: '#dc2626', fontSize: 14 },
  thanks: { textAlign: 'center', color: colors.textFaint, fontSize: 12, marginTop: 18, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12 },
  msg: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 12, marginTop: 14 },
  msgOk: { backgroundColor: '#ecfdf5' },
  msgErr: { backgroundColor: '#fef2f2' },
  msgText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  action: { flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 16, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, ...shadow },
  actionText: { fontSize: 13, fontWeight: '800', color: colors.primary },
});
