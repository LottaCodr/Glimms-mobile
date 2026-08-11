import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, FlatList,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { OutfitCard, StatBox } from '@/components/buttons'

const WARDROBE = [
  { id: 1,  name: 'White Oxford',   cat: 'Tops',      c1: '#F0EDE5', c2: '#E0DDD5' },
  { id: 2,  name: 'Navy Blazer',    cat: 'Outerwear', c1: '#1C2E50', c2: '#243660' },
  { id: 3,  name: 'Black Jeans',    cat: 'Bottoms',   c1: '#141414', c2: '#1E1E1E' },
  { id: 4,  name: 'Camel Coat',     cat: 'Outerwear', c1: '#BF8C3A', c2: '#CFA050' },
  { id: 5,  name: 'Cream Trousers', cat: 'Bottoms',   c1: '#E8DCC8', c2: '#D8CCB8' },
]

const TODAY_OUTFIT = {
  id: 1, name: 'The Sharp Casual', occasion: 'Work', score: 94,
  items: ['White Oxford', 'Navy Blazer', 'Black Jeans', 'White Sneakers'],
  colors: ['#F0EDE5', '#1C2E50', '#141414', '#ECEAE4'],
}

const MORE_OUTFITS = [
  { id: 2, name: 'Weekend Edit',      occasion: 'Casual',  score: 88, items: ['Olive Crewneck', 'Khaki Chinos', 'White Sneakers'], colors: ['#434C3A', '#806E4E', '#ECEAE4'] },
  { id: 3, name: 'The Elevated Look', occasion: 'Evening', score: 92, items: ['White Oxford', 'Camel Coat', 'Cream Trousers'],     colors: ['#F0EDE5', '#BF8C3A', '#E8DCC8'] },
]

const CAT_EMOJI: Record<string, string> = { Tops: '👕', Bottoms: '👖', Shoes: '👟', Outerwear: '🧥' }

export default function NewHomeScreen() {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning</Text>
            <Text style={styles.userName}>Lotanna ✦</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn}>
              <Text>🔍</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}>
              <Text>🔔</Text>
              <View style={styles.notifDot} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Style me CTA */}
        <TouchableOpacity
          onPress={() => router.push('/upload' as any)}
          activeOpacity={0.85}
          style={styles.styleMeCta}
        >
          <View style={styles.ctaIcon}>
            <Text style={{ fontSize: 18 }}>✦</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitle}>Style me today</Text>
            <Text style={styles.ctaSub}>Scan items or pick from wardrobe</Text>
          </View>
          <Text style={[styles.ctaSub, { color: Colors.gold, fontSize: 18 }]}>›</Text>
        </TouchableOpacity>

        {/* Today's Pick */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Today's Pick</Text>
            <TouchableOpacity onPress={() => router.push('/screens/results' as any)}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => router.push('/screens/results' as any)} activeOpacity={0.9}>
            <OutfitCard outfit={TODAY_OUTFIT} />
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatBox label="Items"   value="23" emoji="👗" />
          <StatBox label="Outfits" value="47" emoji="✨" />
          <StatBox label="Saved"   value="8"  emoji="❤️" />
        </View>

       

        {/* Recent Items */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recent Items</Text>
            <TouchableOpacity onPress={() => router.push('/screens/wardrobe' as any)}>
              <Text style={styles.seeAll}>View wardrobe</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            horizontal
            data={[...WARDROBE, { id: 0, name: '+', cat: 'add', c1: '', c2: '' }]}
            keyExtractor={(item) => item.id.toString()}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => {
              if (item.cat === 'add') {
                return (
                  <TouchableOpacity
                    onPress={() => router.push('/upload' as any)}
                    style={styles.addTile}
                  >
                    <Text style={{ color: Colors.dim, fontSize: 24 }}>+</Text>
                  </TouchableOpacity>
                )
              }
              return (
                <View style={styles.recentTile}>
                  <View style={[styles.recentTileImg, { backgroundColor: item.c1 }]}>
                    <Text style={{ fontSize: 22 }}>{CAT_EMOJI[item.cat]}</Text>
                  </View>
                  <Text style={styles.recentTileName} numberOfLines={1}>{item.name}</Text>
                </View>
              )
            }}
          />
        </View>

        {/* More Outfits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More Outfits</Text>
          {MORE_OUTFITS.map((o) => (
            <View key={o.id} style={{ marginBottom: 10 }}>
              <OutfitCard outfit={o} compact />
            </View>
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
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md,
  },
  greeting: { fontSize: 13, color: Colors.mid },
  userName: { fontSize: 22, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 38, height: 38, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  notifDot: {
    position: 'absolute', top: 9, right: 9,
    width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gold,
  },
  styleMeCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    backgroundColor: 'rgba(191,146,69,0.08)',
    borderWidth: 1, borderColor: 'rgba(191,146,69,0.28)',
    borderRadius: Radius.lg, padding: Spacing.md,
  },
  ctaIcon: {
    width: 44, height: 44, backgroundColor: Colors.gold,
    borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  ctaTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  ctaSub: { fontSize: 11, color: Colors.mid, marginTop: 2 },
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  seeAll: { fontSize: 11, color: Colors.gold },
  statsRow: { flexDirection: 'row', gap: 10, marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  recentTile: { width: 80, alignItems: 'center' },
  recentTileImg: {
    width: 80, height: 90, borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 5,
  },
  recentTileName: { fontSize: 10, color: Colors.mid, textAlign: 'center' },
  addTile: {
    width: 80, height: 90, borderRadius: Radius.md,
    borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
})
