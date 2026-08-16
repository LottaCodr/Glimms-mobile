/**
 * Style context — picked before a scan: occasion + vibe + colour mood.
 * Saves into the shared context store; the scan flow then attaches these to the
 * v1 design-session request (`occasion`, `preferences.styles`) so designs match
 * the moment — guide §8A inputContext.
 */
import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { AppIcon, IoniconName } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { PrimaryButton } from '@/components/ui/PrimaryButton'
import { useContextStore } from '@/store/context.store'
import type { Vertical } from '@/types/api'

const OCCASIONS: { id: string; label: string; desc: string; icon: IoniconName }[] = [
  { id: 'work',   label: 'Work',      desc: 'Office, meetings, professional', icon: 'briefcase-outline' },
  { id: 'casual', label: 'Casual',    desc: 'Everyday, relaxed, comfortable', icon: 'sunny-outline' },
  { id: 'events', label: 'Events',    desc: 'Dinners, parties, occasions',    icon: 'moon-outline' },
  { id: 'travel', label: 'Travel',    desc: 'Flights, exploring, on the move', icon: 'airplane-outline' },
]

const VIBES: { id: string; label: string; colors: string[] }[] = [
  { id: 'minimal', label: 'Minimal', colors: ['#E8E4DC', '#C8C4BC', '#A8A4A0'] },
  { id: 'classic', label: 'Classic', colors: ['#1C2E50', '#F0EDE5', '#BF9245'] },
  { id: 'street',  label: 'Streetwear', colors: ['#141414', '#D4B478', '#4A6080'] },
  { id: 'bold',    label: 'Bold', colors: ['#8B1E3A', '#D46A1A', '#1A6B8B'] },
]

const COLOR_MOODS: { id: string; label: string; hex: string }[] = [
  { id: 'neutral', label: 'Neutral', hex: '#D9D9D9' },
  { id: 'cool',    label: 'Cool',    hex: '#4F8DFD' },
  { id: 'warm',    label: 'Warm',    hex: '#C48A64' },
  { id: 'bright',  label: 'Bright',  hex: '#F3C54B' },
  { id: 'mono',    label: 'Mono',    hex: '#242424' },
]

const VERTICALS: { id: Vertical; label: string; icon: IoniconName }[] = [
  { id: 'wardrobe', label: 'Wardrobe', icon: 'shirt-outline' },
  { id: 'room',     label: 'Room',     icon: 'bed-outline' },
  { id: 'garden',   label: 'Garden',   icon: 'leaf-outline' },
]

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

export default function StyleSetupScreen() {
  const params = useLocalSearchParams<{ vertical?: string }>()
  const insets = useSafeAreaInsets()
  const { context, setOccasion, setStyles } = useContextStore()

  const [vertical, setVertical] = useState<Vertical>((params.vertical as Vertical) ?? 'wardrobe')
  const [occasion, _setOccasion] = useState(context.occasion)
  const [vibes, setVibes] = useState<string[]>(context.styles)
  const [colorMood, setColorMood] = useState<string | null>(null)

  const onContinue = () => {
    setOccasion(occasion)
    setStyles(colorMood ? [...vibes, `tone:${colorMood}`] : vibes)
    router.push({ pathname: '/screens/scan' as any, params: { vertical } })
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Style Setup</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>BEFORE YOU SCAN</Text>
        <Text style={styles.title}>
          Set the stage for{'\n'}<Text style={styles.accent}>your looks</Text>
        </Text>
        <Text style={styles.sub}>Context steers the AI — occasion, vibe and climate all matter.</Text>

        {/* Vertical */}
        <Text style={styles.sectionLabel}>WHAT ARE WE STYLING?</Text>
        <View style={styles.verticalRow}>
          {VERTICALS.map((v) => {
            const active = vertical === v.id
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => setVertical(v.id)}
                style={[styles.verticalCard, active && styles.verticalCardActive]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <AppIcon name={v.icon} size={22} color={active ? Colors.gold : Colors.mid} />
                <Text style={[styles.verticalLabel, active && { color: Colors.gold }]}>{v.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Occasion */}
        <Text style={styles.sectionLabel}>OCCASION</Text>
        <View style={{ gap: 10 }}>
          {OCCASIONS.map((o) => {
            const active = occasion === o.id
            return (
              <TouchableOpacity
                key={o.id}
                onPress={() => _setOccasion(o.id)}
                style={[styles.row, active && styles.rowActive]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
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

        {/* Vibe */}
        <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>VIBE</Text>
        <View style={styles.vibeGrid}>
          {VIBES.map((v) => {
            const active = vibes.includes(v.id)
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => setVibes((l) => toggle(l, v.id))}
                style={[styles.vibeCard, active && styles.vibeCardActive]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.swatchRow}>
                  {v.colors.map((c) => (
                    <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
                  ))}
                </View>
                <Text style={styles.vibeLabel}>{v.label}</Text>
                {active && (
                  <View style={styles.vibeCheck}>
                    <AppIcon name="checkmark" size={10} color={Colors.black} />
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Colour mood */}
        <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>COLOUR MOOD</Text>
        <View style={styles.chipsWrap}>
          {COLOR_MOODS.map((m) => (
            <View key={m.id} style={{ alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => setColorMood(colorMood === m.id ? null : m.id)}
                style={[
                  styles.colorDot,
                  { backgroundColor: m.hex },
                  colorMood === m.id && styles.colorDotActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${m.label} colour mood`}
              >
                {colorMood === m.id && <AppIcon name="checkmark" size={14} color={m.id === 'mono' ? Colors.gold : Colors.black} />}
              </TouchableOpacity>
              <Text style={[styles.colorLabel, colorMood === m.id && { color: Colors.gold }]}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
        <PrimaryButton
          label={`Continue to ${vertical} scan`}
          icon="camera-outline"
          onPress={onContinue}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  headerTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  label: { fontSize: 11, letterSpacing: 2, color: Colors.gold, marginBottom: 6 },
  title: { fontSize: 28, fontFamily: Typography.serif, fontWeight: '300', color: Colors.text, lineHeight: 36, marginBottom: 6 },
  accent: { fontStyle: 'italic', color: Colors.gold },
  sub: { fontSize: 13, color: Colors.mid, lineHeight: 19, marginBottom: Spacing.lg },
  sectionLabel: { fontSize: 10, letterSpacing: 1.6, color: Colors.mid, fontWeight: '700', marginBottom: 10 },
  verticalRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
  verticalCard: {
    flex: 1, alignItems: 'center', gap: 8,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingVertical: 16,
  },
  verticalCardActive: { borderColor: Colors.gold, backgroundColor: 'rgba(191,146,69,0.08)' },
  verticalLabel: { fontSize: 12, fontWeight: '600', color: Colors.mid },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  rowActive: { borderColor: Colors.gold, backgroundColor: 'rgba(191,146,69,0.08)' },
  iconWrap: {
    width: 40, height: 40, borderRadius: Radius.sm,
    backgroundColor: Colors.card2, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: 'rgba(191,146,69,0.15)', borderColor: Colors.gold },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rowDesc: { fontSize: 12, color: Colors.mid, marginTop: 1 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.gold, backgroundColor: Colors.gold },
  vibeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  vibeCard: {
    width: '48%', flexGrow: 1,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md,
  },
  vibeCardActive: { borderColor: Colors.gold, backgroundColor: 'rgba(191,146,69,0.08)' },
  swatchRow: { flexDirection: 'row', gap: 5, marginBottom: 10 },
  swatch: { width: 16, height: 16, borderRadius: 4 },
  vibeLabel: { fontSize: 15, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  vibeCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  chipsWrap: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  colorDot: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  colorDotActive: { borderColor: Colors.gold },
  colorLabel: { fontSize: 11, color: Colors.mid, fontWeight: '600' },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
})
