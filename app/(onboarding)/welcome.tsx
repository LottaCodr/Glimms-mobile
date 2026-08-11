import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { GoldButton } from '@/components/buttons'

export default function WelcomeScreen() {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>

        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLetter}>G</Text>
          </View>
          <Text style={styles.wordmark}>Glimms</Text>
          <Text style={styles.tagline}>STYLE INTELLIGENCE</Text>
        </View>

        {/* Headline */}
        <View style={styles.copy}>
          <Text style={styles.headline}>
            You already own{'\n'}
            <Text style={styles.headlineAccent}>your dream wardrobe</Text>
          </Text>
          <Text style={styles.sub}>
            AI-powered styling with what you already have — no shopping required
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <GoldButton label="Get Started →" onPress={() => router.push('/(onboarding)/how-it-works' as any)} />
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login' as any)}
            style={styles.signInBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.signInText}>
              Already have an account?{' '}
              <Text style={{ color: Colors.gold }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, paddingHorizontal: Spacing.lg, justifyContent: 'space-between', paddingBottom: Spacing.lg },
  logoWrap: { alignItems: 'center', paddingTop: 60 },
  logoBox: {
    width: 80, height: 80,
    backgroundColor: Colors.gold,
    borderRadius: Radius.xxl,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 30,
    elevation: 12,
  },
  logoLetter: { fontSize: 38, fontFamily: Typography.serif, fontWeight: '700', color: Colors.black },
  wordmark: { fontSize: 44, fontFamily: Typography.serif, fontStyle: 'italic', fontWeight: '300', color: Colors.text, letterSpacing: -0.5 },
  tagline: { fontSize: 11, letterSpacing: 3, color: Colors.mid, marginTop: 4 },
  copy: { alignItems: 'center' },
  headline: { fontSize: 32, fontFamily: Typography.serif, fontWeight: '300', color: Colors.cream, textAlign: 'center', lineHeight: 40, marginBottom: 14 },
  headlineAccent: { fontStyle: 'italic', color: Colors.gold },
  sub: { fontSize: 14, color: Colors.mid, textAlign: 'center', lineHeight: 22, maxWidth: 260 },
  actions: { gap: Spacing.sm },
  signInBtn: { alignItems: 'center', paddingVertical: 12 },
  signInText: { fontSize: 14, color: Colors.mid, fontFamily: Typography.sans },
})
