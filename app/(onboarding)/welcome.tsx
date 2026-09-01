import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors, Spacing, Typography } from '@/theme'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { GoldButton } from '@/components/buttons'

export default function WelcomeScreen() {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.inner}>

        {/* Logo */}
        <View style={styles.logoWrap}>
          <BrandLogo variant="compact" width={132} />
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
          <GoldButton label="Get Started" onPress={() => router.push('/(onboarding)/how-it-works' as any)} />
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
  logoWrap: {
    alignItems: 'center',
    paddingTop: 42,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },
  tagline: { fontSize: 10, letterSpacing: 3, color: Colors.mid, marginTop: 10 },
  copy: { alignItems: 'center' },
  headline: { fontSize: 32, fontFamily: Typography.serif, fontWeight: '300', color: Colors.cream, textAlign: 'center', lineHeight: 40, marginBottom: 14 },
  headlineAccent: { fontStyle: 'italic', color: Colors.gold },
  sub: { fontSize: 14, color: Colors.mid, textAlign: 'center', lineHeight: 22, maxWidth: 260 },
  actions: { gap: Spacing.sm },
  signInBtn: { alignItems: 'center', paddingVertical: 12 },
  signInText: { fontSize: 14, color: Colors.mid, fontFamily: Typography.sans },
})
