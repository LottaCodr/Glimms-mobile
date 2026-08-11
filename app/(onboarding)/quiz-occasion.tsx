import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { BackButton, GoldButton, ProgressDots } from '@/components/buttons'
import { useOnboardingStore } from '@/store/onboarding.store'
import { AppIcon } from '@/components/ui/Icon'

const OCCASIONS = [
  { id: 'work',   label: 'Work',      desc: 'Office, meetings, professional', icon: 'briefcase-outline' },
  { id: 'casual', label: 'Casual',    desc: 'Everyday, relaxed, comfortable', icon: 'sunny-outline' },
  { id: 'events', label: 'Events',    desc: 'Dinners, parties, occasions',    icon: 'moon-outline' },
  { id: 'mix',    label: 'All of it', desc: 'I dress for everything',         icon: 'flash-outline' },
]

export default function QuizOccasionScreen() {
  const router = useRouter()
  // The quiz supports one primary occasion for MVP; stored as a list per API shape.
  const selected = useOnboardingStore((s) => s.answers.occasions[0] ?? null)
  const setOccasions = useOnboardingStore((s) => s.setOccasions)
  const setSelected = (id: string) => setOccasions(id === 'mix' ? ['work', 'casual', 'events'] : [id])

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
              <View style={[qoStyles.iconWrap, active && qoStyles.iconWrapActive]}>
                <AppIcon name={o.icon} size={20} color={active ? Colors.gold : Colors.mid} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{o.label}</Text>
                <Text style={styles.rowDesc}>{o.desc}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <AppIcon name="checkmark" size={11} color={Colors.black} />}
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

const qoStyles = StyleSheet.create({
  iconWrap: {
    width: 40, height: 40, borderRadius: Radius.sm,
    backgroundColor: Colors.card2,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: 'rgba(191,146,69,0.15)', borderColor: Colors.gold },
})
