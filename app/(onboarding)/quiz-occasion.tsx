import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { BackButton, GoldButton, ProgressDots } from '@/components/buttons'

const OCCASIONS = [
  { id: 'work',   label: 'Work',      desc: 'Office, meetings, professional', emoji: '💼' },
  { id: 'casual', label: 'Casual',    desc: 'Everyday, relaxed, comfortable', emoji: '☀️' },
  { id: 'events', label: 'Events',    desc: 'Dinners, parties, occasions',    emoji: '🌙' },
  { id: 'mix',    label: 'All of it', desc: 'I dress for everything',         emoji: '⚡' },
]

export default function QuizOccasionScreen() {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <BackButton onPress={() => router.back()} />
          <ProgressDots current={1} total={3} />
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.label}>2 OF 3</Text>
        <Text style={styles.title}>Where do you{'\n'}<Text style={styles.accent}>dress most?</Text></Text>

        {OCCASIONS.map((o) => {
          const active = selected === o.id
          return (
            <TouchableOpacity
              key={o.id}
              onPress={() => setSelected(o.id)}
              activeOpacity={0.8}
              style={[styles.row, active && styles.rowActive]}
            >
              <Text style={{ fontSize: 22, width: 32 }}>{o.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{o.label}</Text>
                <Text style={styles.rowDesc}>{o.desc}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <Text style={{ color: Colors.black, fontSize: 10 }}>✓</Text>}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={styles.footer}>
        <GoldButton
          label="Continue"
          onPress={() => router.push('/(onboarding)/quiz-location')}
          disabled={!selected}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, padding: Spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  label: { fontSize: 11, letterSpacing: 2, color: Colors.gold, marginBottom: 6 },
  title: { fontSize: 30, fontFamily: Typography.serif, fontWeight: '300', color: Colors.text, lineHeight: 38, marginBottom: Spacing.xl },
  accent: { fontStyle: 'italic', color: Colors.gold },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, marginBottom: 10,
  },
  rowActive: { borderColor: Colors.gold, backgroundColor: 'rgba(191,146,69,0.08)' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rowDesc: { fontSize: 12, color: Colors.mid },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.gold, backgroundColor: Colors.gold },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
})
