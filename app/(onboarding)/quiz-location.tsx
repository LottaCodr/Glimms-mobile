import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { BackButton, GoldButton, ProgressDots } from '@/components/buttons'

const CITIES = ['Lagos, Nigeria','London, UK','New York, USA','Dubai, UAE','Nairobi, Kenya','Toronto, Canada']

export default function QuizLocationScreen() {
  const router = useRouter()
  const [city, setCity] = useState('')

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <BackButton onPress={() => router.back()} />
          <ProgressDots current={2} total={3} />
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.label}>3 OF 3</Text>
        <Text style={styles.title}>Where are{'\n'}<Text style={styles.accent}>you based?</Text></Text>
        <Text style={styles.sub}>For climate-aware styling recommendations</Text>

        <View style={styles.inputRow}>
          <Text style={{ fontSize: 16, color: Colors.mid }}>📍</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Enter your city…"
            placeholderTextColor={Colors.mid}
            style={styles.input}
          />
        </View>

        <Text style={styles.cityLabel}>POPULAR CITIES</Text>
        <View style={styles.cityChips}>
          {CITIES.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setCity(c)}
              style={[styles.chip, city === c && styles.chipActive]}
            >
              <Text style={[styles.chipText, city === c && { color: Colors.gold }]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <GoldButton label="Create My Style Profile ✦" onPress={() => router.push('/(onboarding)/sign-up')} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  label: { fontSize: 11, letterSpacing: 2, color: Colors.gold, marginBottom: 6 },
  title: { fontSize: 30, fontFamily: Typography.serif, fontWeight: '300', color: Colors.text, lineHeight: 38, marginBottom: 6 },
  accent: { fontStyle: 'italic', color: Colors.gold },
  sub: { fontSize: 13, color: Colors.mid, marginBottom: Spacing.xl },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.md,
  },
  input: { flex: 1, height: 50, color: Colors.text, fontSize: 14 },
  cityLabel: { fontSize: 11, color: Colors.mid, letterSpacing: 1.5, marginBottom: 10 },
  cityChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.xs, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipActive: { borderColor: Colors.gold, backgroundColor: 'rgba(191,146,69,0.1)' },
  chipText: { fontSize: 12, color: Colors.mid },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
})
