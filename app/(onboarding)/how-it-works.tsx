import React from 'react'
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { GoldButton, BackButton } from '@/components/buttons'
import { AppIcon, IoniconName } from '@/components/ui/Icon'

const STEPS: { step: string; title: string; icon: IoniconName; desc: string }[] = [
  { step: '01', title: 'Scan your clothes',  icon: 'camera-outline',   desc: 'Photograph any item. AI identifies colour, category and style instantly.' },
  { step: '02', title: 'Set your context',   icon: 'options-outline',  desc: 'Choose the occasion, your location and the vibe you\'re going for.' },
  { step: '03', title: 'Get styled',         icon: 'sparkles-outline', desc: 'Receive personalised outfit combinations built around you.' },
]

export default function HowItWorksScreen() {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} />
        </View>

        <Text style={styles.label}>HOW IT WORKS</Text>
        <Text style={styles.title}>
          Three steps to your{'\n'}
          <Text style={styles.accent}>perfect outfit</Text>
        </Text>

        {STEPS.map((s) => (
          <View key={s.step} style={styles.stepCard}>
            <View style={styles.stepIcon}>
              <AppIcon name={s.icon} size={22} color={Colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepNum}>{s.step}</Text>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepDesc}>{s.desc}</Text>
            </View>
          </View>
        ))}

        {/* Mini preview */}
        <View style={styles.previewCard}>
          <View style={styles.previewPalette}>
            {['#F0EDE5','#1C2E50','#141414','#BF8C3A'].map((c) => (
              <View key={c} style={[styles.previewSwatch, { backgroundColor: c }]} />
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.previewName}>The Sharp Casual</Text>
            <Text style={styles.previewMeta}>Work · 94% match</Text>
          </View>
          <View style={styles.aiBadge}>
            <AppIcon name="sparkles-outline" size={11} color={Colors.gold} />
            <Text style={[styles.aiBadgeText, { marginLeft: 4 }]}>AI</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <GoldButton label="Build My Style Profile" onPress={() => router.push('/(onboarding)/quiz-style')} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  header: { marginBottom: Spacing.lg },
  label: { fontSize: 11, letterSpacing: 2, color: Colors.gold, marginBottom: 6 },
  title: { fontSize: 30, fontFamily: Typography.serif, fontWeight: '300', color: Colors.text, lineHeight: 38, marginBottom: Spacing.xl },
  accent: { fontStyle: 'italic', color: Colors.gold },
  stepCard: {
    flexDirection: 'row', gap: 14, marginBottom: 12,
    padding: Spacing.md, backgroundColor: Colors.card,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
  },
  stepIcon: {
    width: 44, height: 44, flexShrink: 0,
    backgroundColor: Colors.card2, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { fontSize: 10, color: Colors.gold, letterSpacing: 1.5, marginBottom: 2 },
  stepTitle: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  stepDesc: { fontSize: 12, color: Colors.mid, lineHeight: 18 },
  previewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 14,
    marginTop: Spacing.md,
  },
  previewPalette: { flexDirection: 'row', gap: 4 },
  previewSwatch: { width: 24, height: 30, borderRadius: 6 },
  previewName: { fontSize: 13, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  previewMeta: { fontSize: 10, color: Colors.mid },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(191,146,69,0.12)',
    borderWidth: 1, borderColor: Colors.gold,
    borderRadius: Radius.xs, paddingHorizontal: 8, paddingVertical: 2,
  },
  aiBadgeText: { fontSize: 11, color: Colors.gold, fontWeight: '600' },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
})
