import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { BackButton, GoldButton, ProgressDots } from '@/components/buttons'
import { useOnboardingStore } from '@/store/onboarding.store'
import { AppIcon } from '@/components/ui/Icon'

const STYLES = [
  { id: 'minimal',  label: 'Minimal',    desc: 'Clean, quiet, intentional',   colors: ['#E8E4DC','#C8C4BC','#A8A4A0'] },
  { id: 'classic',  label: 'Classic',    desc: 'Timeless, polished, refined',  colors: ['#1C2E50','#F0EDE5','#BF9245'] },
  { id: 'street',   label: 'Streetwear', desc: 'Bold, urban, expressive',      colors: ['#141414','#D4B478','#4A6080'] },
  { id: 'bold',     label: 'Bold',       desc: 'Statement, colourful, daring', colors: ['#8B1E3A','#D46A1A','#1A6B8B'] },
]

export default function QuizStyleScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const selected = useOnboardingStore((s) => s.answers.styleGoal)
  const setSelected = useOnboardingStore((s) => s.setStyleGoal)

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <BackButton onPress={() => router.back()} />
          <ProgressDots current={0} total={3} />
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.label}>1 OF 3</Text>
        <Text style={styles.title}>What’s your{'\n'}<Text style={styles.accent}>personal vibe?</Text></Text>

        <View style={styles.grid}>
          {STYLES.map((opt) => {
            const active = selected === opt.id
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                activeOpacity={0.8}
                style={[styles.optCard, active && styles.optCardActive]}
              >
                <View style={styles.swatchRow}>
                  {opt.colors.map((c) => (
                    <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
                  ))}
                </View>
                <Text style={styles.optLabel}>{opt.label}</Text>
                <Text style={styles.optDesc}>{opt.desc}</Text>
                {active && (
                  <View style={styles.checkCircle}>
                    <AppIcon name="checkmark" size={11} color={Colors.black} />
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
        <GoldButton
          label="Continue"
          onPress={() => router.push('/(onboarding)/quiz-occasion')}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optCard: {
    width: '48%', backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md,
  },
  optCardActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(191,146,69,0.08)',
  },
  swatchRow: { flexDirection: 'row', gap: 5, marginBottom: 10 },
  swatch: { width: 16, height: 16, borderRadius: 4 },
  optLabel: { fontSize: 15, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text, marginBottom: 3 },
  optDesc: { fontSize: 11, color: Colors.mid, lineHeight: 16 },
  checkCircle: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 10,
  },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
})
