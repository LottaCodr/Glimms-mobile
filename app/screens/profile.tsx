import React from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, ScrollView,
} from 'react-native'
import { Colors, Radius, Spacing, Typography } from '@/theme'

const MENU_ITEMS = [
  { emoji: '👤', label: 'Edit Profile'       },
  { emoji: '🎨', label: 'Style Preferences'  },
  { emoji: '📍', label: 'Location & Climate' },
  { emoji: '🔔', label: 'Notifications'      },
  { emoji: '🔒', label: 'Privacy & Security' },
  { emoji: '❓', label: 'Help & Support'     },
  { emoji: '🚪', label: 'Sign Out', danger: true },
] as const

export default function NewProfileScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <TouchableOpacity style={styles.settingsBtn}>
            <Text>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>L</Text>
          </View>
          <Text style={styles.name}>Lotanna</Text>
          <Text style={styles.location}>Lagos, Nigeria</Text>
          <View style={styles.styleBadge}>
            <Text style={styles.styleBadgeText}>✦ Classic · Work · Lagos</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {([
            { l: 'Items',   v: '23' },
            { l: 'Outfits', v: '47' },
            { l: 'Saved',   v: '8'  },
            { l: 'Streak',  v: '7d' },
          ] as const).map(s => (
            <View key={s.l} style={styles.stat}>
              <Text style={styles.statValue}>{s.v}</Text>
              <Text style={styles.statLabel}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* Upgrade Card */}
        <TouchableOpacity style={styles.upgradeCard} activeOpacity={0.85}>
          <Text style={{ fontSize: 22 }}>👑</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
            <Text style={styles.upgradeSub}>Unlimited scans · Climate intelligence</Text>
          </View>
          <Text style={[styles.upgradeTitle, { color: Colors.gold }]}>›</Text>
        </TouchableOpacity>

        {/* Menu */}
        <View style={styles.menu}>
          {MENU_ITEMS.map(item => (
            <TouchableOpacity key={item.label} style={styles.menuItem} activeOpacity={0.7}>
              <Text style={{ fontSize: 16, width: 28 }}>{item.emoji}</Text>
              <Text style={[styles.menuLabel, 'danger' in item && item.danger && { color: Colors.error }]}>{item.label}</Text>
              {'danger' in item && item.danger
                ? null
                : <Text style={{ color: Colors.mid, fontSize: 16 }}>›</Text>
              }
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingBottom: 32 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  title: { fontSize: 22, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  settingsBtn: {
    width: 36, height: 36, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarSection: { alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  avatar: {
    width: 80, height: 80, backgroundColor: Colors.gold,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 10,
  },
  avatarLetter: { fontSize: 32, fontFamily: Typography.serif, fontWeight: '700', color: Colors.black },
  name: { fontSize: 20, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  location: { fontSize: 12, color: Colors.mid, marginTop: 2, marginBottom: 12 },
  styleBadge: {
    backgroundColor: 'rgba(191,146,69,0.1)',
    borderWidth: 1, borderColor: 'rgba(191,146,69,0.28)',
    borderRadius: Radius.xs, paddingHorizontal: 14, paddingVertical: 4,
  },
  styleBadgeText: { fontSize: 11, color: Colors.gold },
  statsRow: {
    flexDirection: 'row', gap: 8,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  stat: {
    flex: 1, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: 10, alignItems: 'center',
  },
  statValue: { fontSize: 16, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  statLabel: { fontSize: 9, color: Colors.mid },
  upgradeCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    backgroundColor: 'rgba(191,146,69,0.08)',
    borderWidth: 1, borderColor: 'rgba(191,146,69,0.28)',
    borderRadius: Radius.lg, padding: Spacing.md,
  },
  upgradeTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  upgradeSub: { fontSize: 11, color: Colors.mid, marginTop: 2 },
  menu: { marginHorizontal: Spacing.lg, gap: 2 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, marginBottom: 2,
  },
  menuLabel: { flex: 1, fontSize: 14, color: Colors.text },
})
