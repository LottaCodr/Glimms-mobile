import React from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, FlatList,
} from 'react-native'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { OutfitCard } from '@/components/buttons'

const SAVED_OUTFITS = [
  { id: 1, name: 'The Sharp Casual',  occasion: 'Work',    score: 94, items: ['White Oxford', 'Navy Blazer', 'Black Jeans'],       colors: ['#F0EDE5', '#1C2E50', '#141414', '#ECEAE4'] },
  { id: 3, name: 'The Elevated Look', occasion: 'Evening', score: 92, items: ['White Oxford', 'Camel Coat', 'Cream Trousers'],      colors: ['#F0EDE5', '#BF8C3A', '#E8DCC8', '#1A1210'] },
]

export default function NewSavedScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved Outfits</Text>
        <Text style={styles.subtitle}>{SAVED_OUTFITS.length} looks saved</Text>
      </View>
      <FlatList
        data={SAVED_OUTFITS}
        keyExtractor={(o) => o.id.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListFooterComponent={() => (
          <View style={styles.empty}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>✨</Text>
            <Text style={styles.emptyTitle}>Find your next look</Text>
            <Text style={styles.emptyDesc}>Scan clothes and save the outfits you love</Text>
          </View>
        )}
        renderItem={({ item: outfit }) => (
          <View style={{ marginBottom: 16 }}>
            <OutfitCard outfit={outfit} />
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>🔄 Remix</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>↗ Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn}>
                <Text style={{ color: Colors.error, fontSize: 14 }}>✕</Text>
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
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  title: { fontSize: 22, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.mid, marginTop: 2 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 32 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    flex: 1, height: 36, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnText: { fontSize: 12, color: Colors.mid },
  deleteBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(160,40,40,0.1)',
    borderWidth: 1, borderColor: 'rgba(160,40,40,0.2)',
    borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center',
  },
  empty: {
    backgroundColor: Colors.card,
    borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: Radius.xl, padding: 32, alignItems: 'center', marginTop: 8,
  },
  emptyTitle: { fontSize: 15, fontFamily: Typography.serif, color: Colors.text, marginBottom: 5 },
  emptyDesc: { fontSize: 12, color: Colors.mid, textAlign: 'center' },
})
