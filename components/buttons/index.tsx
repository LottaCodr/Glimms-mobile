// src/components/index.tsx
import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native'
import { Colors, Radius, Spacing, Typography } from '@/theme'

// ─── GoldButton ──────────────────────────────────────────────────────────────
interface GoldButtonProps {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}
export const GoldButton: React.FC<GoldButtonProps> = ({
  label, onPress, disabled, loading, style,
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.85}
    style={[styles.goldBtn, disabled && { opacity: 0.4 }, style]}
  >
    {loading
      ? <ActivityIndicator color={Colors.black} />
      : <Text style={styles.goldBtnText}>{label}</Text>}
  </TouchableOpacity>
)

// ─── OutlineButton ───────────────────────────────────────────────────────────
interface OutlineButtonProps {
  label: string
  onPress: () => void
  style?: ViewStyle
}
export const OutlineButton: React.FC<OutlineButtonProps> = ({ label, onPress, style }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.outlineBtn, style]}>
    <Text style={styles.outlineBtnText}>{label}</Text>
  </TouchableOpacity>
)

// ─── BackButton ──────────────────────────────────────────────────────────────
export const BackButton: React.FC<{ onPress: () => void }> = ({ onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.backBtn} activeOpacity={0.7} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
    <Text style={styles.backArrow}>‹</Text>
  </TouchableOpacity>
)

// ─── ProgressDots ────────────────────────────────────────────────────────────
interface ProgressDotsProps { current: number; total: number }
export const ProgressDots: React.FC<ProgressDotsProps> = ({ current, total }) => (
  <View style={styles.dotsRow}>
    {Array.from({ length: total }).map((_, i) => (
      <View
        key={i}
        style={[
          styles.dot,
          i === current ? styles.dotActive : styles.dotInactive,
        ]}
      />
    ))}
  </View>
)

// ─── SectionLabel ────────────────────────────────────────────────────────────
export const SectionLabel: React.FC<{ label: string; style?: TextStyle }> = ({ label, style }) => (
  <Text style={[styles.sectionLabel, style]}>{label.toUpperCase()}</Text>
)

// ─── OutfitCard ──────────────────────────────────────────────────────────────
interface Outfit {
  id: number
  name: string
  occasion: string
  score: number
  items: string[]
  colors: string[]
}
interface OutfitCardProps { outfit: Outfit; compact?: boolean }
export const OutfitCard: React.FC<OutfitCardProps> = ({ outfit, compact }) => (
  <View style={[styles.outfitCard, compact && styles.outfitCardCompact]}>
    {/* Colour palette */}
    <View style={styles.palette}>
      {outfit.colors.map((col, i) => (
        <View key={i} style={[styles.paletteStrip, { backgroundColor: col }]} />
      ))}
    </View>
    <View style={styles.outfitBody}>
      <View style={styles.outfitRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.outfitName, compact && { fontSize: 14 }]}>{outfit.name}</Text>
          <View style={styles.occasionChip}>
            <Text style={styles.occasionText}>⚡ {outfit.occasion}</Text>
          </View>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreValue}>{outfit.score}%</Text>
          <Text style={styles.scoreLabel}>match</Text>
        </View>
      </View>
      {!compact && (
        <View style={styles.itemTags}>
          {outfit.items.map((item, i) => (
            <View key={i} style={styles.itemTag}>
              <Text style={styles.itemTagText}>{item}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  </View>
)

// ─── WardrobeItemTile ────────────────────────────────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  Tops: '👕', Bottoms: '👖', Shoes: '👟', Outerwear: '🧥',
}
interface WardrobeItem { id: number; name: string; cat: string; c1: string; c2: string }
export const WardrobeItemTile: React.FC<{ item: WardrobeItem }> = ({ item }) => (
  <View style={styles.tile}>
    <View style={[styles.tileImage, { backgroundColor: item.c1 }]}>
      <Text style={styles.tileEmoji}>{CAT_EMOJI[item.cat]}</Text>
    </View>
    <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
  </View>
)

// ─── StatBox ─────────────────────────────────────────────────────────────────
export const StatBox: React.FC<{ label: string; value: string; emoji: string }> = ({ label, value, emoji }) => (
  <View style={styles.statBox}>
    <Text style={{ fontSize: 18 }}>{emoji}</Text>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
)

// ─── Divider ─────────────────────────────────────────────────────────────────
export const Divider: React.FC<{ label?: string }> = ({ label }) => (
  <View style={styles.dividerRow}>
    <View style={styles.dividerLine} />
    {label && <Text style={styles.dividerLabel}>{label}</Text>}
    <View style={styles.dividerLine} />
  </View>
)

// ─── UpgradeCard ─────────────────────────────────────────────────────────────
export const UpgradeCard: React.FC<{ onPress: () => void }> = ({ onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.upgradeCard}>
    <Text style={{ fontSize: 22 }}>👑</Text>
    <View style={{ flex: 1, marginLeft: Spacing.md }}>
      <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
      <Text style={styles.upgradeSub}>Unlimited scans · Climate intelligence</Text>
    </View>
    <Text style={[styles.upgradeTitle, { color: Colors.gold }]}>›</Text>
  </TouchableOpacity>
)

// ─── StyleSheet ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // GoldButton
  goldBtn: {
    width: '100%', height: 54,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  goldBtnText: {
    fontSize: 15, fontWeight: '600',
    color: Colors.black, fontFamily: Typography.sans,
  },

  // OutlineButton
  outlineBtn: {
    width: '100%', height: 50,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  outlineBtnText: {
    fontSize: 14, fontWeight: '500',
    color: Colors.text, fontFamily: Typography.sans,
  },

  // BackButton
  backBtn: {
    width: 36, height: 36,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 24, color: Colors.mid, lineHeight: 28, marginTop: -2 },

  // Progress Dots
  dotsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { height: 4, borderRadius: 2 },
  dotActive: { width: 24, backgroundColor: Colors.gold },
  dotInactive: { width: 7, backgroundColor: Colors.dim },

  // SectionLabel
  sectionLabel: {
    fontSize: 11, letterSpacing: 2,
    color: Colors.gold, fontFamily: Typography.sans,
  },

  // OutfitCard
  outfitCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  outfitCardCompact: {},
  palette: { flexDirection: 'row', height: 88 },
  paletteStrip: { flex: 1 },
  outfitBody: { padding: Spacing.md },
  outfitRow: { flexDirection: 'row', alignItems: 'flex-start' },
  outfitName: {
    fontSize: 16, fontFamily: Typography.serif,
    fontWeight: '600', color: Colors.text, marginBottom: 6,
  },
  occasionChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.card2,
    borderRadius: Radius.xs, paddingHorizontal: 8, paddingVertical: 2,
  },
  occasionText: { fontSize: 10, color: Colors.mid },
  scoreBox: { alignItems: 'flex-end' },
  scoreValue: {
    fontSize: 22, fontFamily: Typography.serif,
    fontWeight: '600', color: Colors.gold,
  },
  scoreLabel: { fontSize: 9, color: Colors.mid },
  itemTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  itemTag: { backgroundColor: Colors.card2, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  itemTagText: { fontSize: 10, color: Colors.mid },

  // WardrobeItemTile
  tile: { alignItems: 'center' },
  tileImage: {
    width: '100%', aspectRatio: 3/4,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 5,
  },
  tileEmoji: { fontSize: 24 },
  tileName: { fontSize: 10, fontWeight: '500', color: Colors.text, textAlign: 'center' },

  // StatBox
  statBox: {
    flex: 1, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: 12,
    alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 18, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.mid },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerLabel: { fontSize: 12, color: Colors.mid },

  // UpgradeCard
  upgradeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(191,146,69,0.08)',
    borderWidth: 1, borderColor: 'rgba(191,146,69,0.28)',
    borderRadius: Radius.lg, padding: Spacing.md,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  upgradeTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  upgradeSub: { fontSize: 11, color: Colors.mid, marginTop: 2 },
})