import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, FlatList,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing } from '@/theme'
import { OutfitCard } from '@/components/buttons'
import { AppIcon } from '@/components/ui/Icon'

const OUTFITS = [
  { id: 1, name: 'The Sharp Casual',  occasion: 'Work',    score: 94, items: ['White Oxford', 'Navy Blazer', 'Black Jeans', 'White Sneakers'],    colors: ['#F0EDE5', '#1C2E50', '#141414', '#ECEAE4'] },
  { id: 2, name: 'Weekend Edit',      occasion: 'Casual',  score: 88, items: ['Olive Crewneck', 'Khaki Chinos', 'White Sneakers'],                colors: ['#434C3A', '#806E4E', '#ECEAE4'] },
  { id: 3, name: 'The Elevated Look', occasion: 'Evening', score: 92, items: ['White Oxford', 'Camel Coat', 'Cream Trousers', 'Chelsea Boots'],    colors: ['#F0EDE5', '#BF8C3A', '#E8DCC8', '#1A1210'] },
  { id: 4, name: 'Street Refined',    occasion: 'Casual',  score: 86, items: ['Grey Knit', 'Black Jeans', 'Denim Jacket'],                        colors: ['#686868', '#141414', '#3A506E'] },
]
const FILTERS = ['All', 'Work', 'Casual', 'Evening']

export default function ResultsScreen() {
  const router = useRouter()
  const [filter, setFilter] = useState('All')
  const [saved, setSaved] = useState<number[]>([1])

  const filtered = filter === 'All' ? OUTFITS : OUTFITS.filter(o => o.occasion === filter)
  const toggleSave = (id: number) =>
    setSaved(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <AppIcon name="chevron-back" size={18} color={Colors.mid} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Your Outfits</Text>
          <Text style={styles.subtitle}>47 combinations generated</Text>
        </View>
        <View style={styles.aiBadge}>
          <AppIcon name="sparkles-outline" size={11} color={Colors.gold} />
          <Text style={[styles.aiBadgeText, { marginLeft: 4 }]}>AI</Text>
        </View>
      </View>

      {/* Filter chips */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Outfit cards */}
      <FlatList
        data={filtered}
        keyExtractor={(o) => o.id.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item: outfit }) => (
          <View style={{ marginBottom: 16 }}>
            <OutfitCard outfit={outfit} />
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={() => toggleSave(outfit.id)}
                style={[styles.actionBtn, styles.actionBtnRow, saved.includes(outfit.id) && styles.actionBtnSaved]}
              >
                <AppIcon
                  name={saved.includes(outfit.id) ? 'heart' : 'heart-outline'}
                  size={13}
                  color={saved.includes(outfit.id) ? Colors.gold : Colors.mid}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.actionBtnText, saved.includes(outfit.id) && { color: Colors.gold }]}>
                  {saved.includes(outfit.id) ? 'Saved' : 'Save'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnRow]}>
                <AppIcon name="refresh-outline" size={13} color={Colors.mid} style={{ marginRight: 5 }} />
                <Text style={styles.actionBtnText}>Remix</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn}>
                <AppIcon name="share-social-outline" size={14} color={Colors.mid} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
  },
  backBtn: {
    width: 36, height: 36, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '600', color: Colors.text },
  subtitle: { fontSize: 11, color: Colors.mid },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(191,146,69,0.1)',
    borderWidth: 1, borderColor: Colors.gold,
    borderRadius: Radius.xs, paddingHorizontal: 8, paddingVertical: 4,
  },
  aiBadgeText: { fontSize: 11, color: Colors.gold, fontWeight: '600' },
  filterList: { paddingHorizontal: Spacing.lg, paddingBottom: 12, gap: 8 },
  chip: {
    paddingHorizontal: 14, height: 30, borderRadius: Radius.xs,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: 'transparent' },
  chipText: { fontSize: 12, fontWeight: '500', color: Colors.mid },
  chipTextActive: { color: Colors.black },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 32 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    flex: 1, height: 38, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnRow: { flexDirection: 'row', gap: 0 },
  actionBtnSaved: { borderColor: Colors.gold, backgroundColor: 'rgba(191,146,69,0.08)' },
  actionBtnText: { fontSize: 12, color: Colors.mid },
  shareBtn: {
    width: 38, height: 38, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
})