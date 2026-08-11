import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, FlatList,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing, Typography } from '@/theme'

const ALL_ITEMS = [
  { id: 1,  name: 'White Oxford',    cat: 'Tops',      c1: '#F0EDE5', c2: '#E0DDD5' },
  { id: 2,  name: 'Navy Blazer',     cat: 'Outerwear', c1: '#1C2E50', c2: '#243660' },
  { id: 3,  name: 'Black Jeans',     cat: 'Bottoms',   c1: '#141414', c2: '#1E1E1E' },
  { id: 4,  name: 'Camel Coat',      cat: 'Outerwear', c1: '#BF8C3A', c2: '#CFA050' },
  { id: 5,  name: 'Cream Trousers',  cat: 'Bottoms',   c1: '#E8DCC8', c2: '#D8CCB8' },
  { id: 6,  name: 'Olive Crewneck',  cat: 'Tops',      c1: '#434C3A', c2: '#535C4A' },
  { id: 7,  name: 'White Sneakers',  cat: 'Shoes',     c1: '#ECEAE4', c2: '#DCDAD4' },
  { id: 8,  name: 'Denim Jacket',    cat: 'Outerwear', c1: '#3A506E', c2: '#4A607E' },
  { id: 9,  name: 'Burgundy Shirt',  cat: 'Tops',      c1: '#5E1A28', c2: '#6E2A38' },
  { id: 10, name: 'Grey Knit',       cat: 'Tops',      c1: '#686868', c2: '#787878' },
  { id: 11, name: 'Khaki Chinos',    cat: 'Bottoms',   c1: '#806E4E', c2: '#907E5E' },
  { id: 12, name: 'Chelsea Boots',   cat: 'Shoes',     c1: '#1A1210', c2: '#241A18' },
]

const CATS = ['All', 'Tops', 'Bottoms', 'Outerwear', 'Shoes']
const CAT_EMOJI: Record<string, string> = { Tops: '👕', Bottoms: '👖', Shoes: '👟', Outerwear: '🧥' }

export default function WardrobeScreen() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('All')
  const items = activeTab === 'All' ? ALL_ITEMS : ALL_ITEMS.filter(i => i.cat === activeTab)

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Wardrobe</Text>
          <Text style={styles.subtitle}>{ALL_ITEMS.length} items · 47 possible outfits</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/upload' as any)}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Category tabs */}
      <FlatList
        horizontal
        data={CATS}
        keyExtractor={(c) => c}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            onPress={() => setActiveTab(cat)}
            style={[styles.tab, activeTab === cat && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === cat && styles.tabTextActive]}>{cat}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Items grid */}
      <FlatList
        data={[...items, { id: 0, name: '+', cat: 'add', c1: '', c2: '' }]}
        keyExtractor={(i) => i.id.toString()}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: 10 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item.cat === 'add') {
            return (
              <TouchableOpacity style={styles.addTile} onPress={() => router.push('/upload' as any)}>
                <Text style={{ color: Colors.dim, fontSize: 26 }}>+</Text>
              </TouchableOpacity>
            )
          }
          return (
            <View style={styles.tileWrap}>
              <View style={[styles.tileImg, { backgroundColor: item.c1 }]}>
                <Text style={{ fontSize: 24 }}>{CAT_EMOJI[item.cat]}</Text>
              </View>
              <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
            </View>
          )
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  title: { fontSize: 22, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.mid, marginTop: 2 },
  addBtn: {
    paddingHorizontal: 14, height: 36,
    backgroundColor: Colors.gold, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { fontSize: 12, fontWeight: '600', color: Colors.black },
  tabs: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: 6 },
  tab: {
    paddingHorizontal: 12, height: 30, borderRadius: Radius.xs,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  tabActive: { backgroundColor: Colors.gold, borderColor: 'transparent' },
  tabText: { fontSize: 12, fontWeight: '500', color: Colors.mid },
  tabTextActive: { color: Colors.black },
  grid: { paddingHorizontal: Spacing.lg, paddingBottom: 32, gap: 10 },
  tileWrap: { flex: 1, alignItems: 'center' },
  tileImg: {
    width: '100%', aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 5,
  },
  tileName: { fontSize: 10, fontWeight: '500', color: Colors.text, textAlign: 'center' },
  addTile: {
    flex: 1, aspectRatio: 3 / 4, borderRadius: Radius.md,
    borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
})
