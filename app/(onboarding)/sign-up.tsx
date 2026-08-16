import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, TextInput, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { BackButton, GoldButton, Divider } from '@/components/buttons'
import { useAuthStore } from '@/store/auth.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import { userService } from '@/services/user.service'
import { ApiError } from '@/services/api.client'
import { AppIcon, IoniconName } from '@/components/ui/Icon'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignUpScreen() {
  const router = useRouter()
  const register = useAuthStore((s) => s.register)
  const { answers, reset } = useOnboardingStore()

  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const email = form.email.trim()
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address')
    if (form.password.length < 8) return setError('Password must be at least 8 characters')

    setLoading(true)
    setError('')
    try {
      await register(email, form.password, form.name.trim() || undefined)

      // Persist the quiz answers as preferences (PUT is an upsert — §7).
      try {
        await userService.savePreferences({
          ...(answers.styleGoal ? { styleGoals: [answers.styleGoal] } : {}),
          ...(answers.occasions.length ? { occasions: answers.occasions } : {}),
          // Omit `location` without real coordinates — the backend then
          // falls back to a neutral default climate (guide §7).
          ...(answers.location ? { location: answers.location } : {}),
        })
      } catch {
        // Preferences are nice-to-have — never block account creation on them.
      }

      reset()
      router.replace('/(tabs)/home')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 || err.code === 'DUPLICATE_KEY') {
          setError('That email is already registered — try signing in instead.')
        } else if (err.status === 429) {
          setError('Too many attempts — please wait about 15 minutes and try again.')
        } else if (err.code === 'VALIDATION_ERROR') {
          setError(err.fieldError() ?? 'Please check the highlighted fields.')
        } else if (err.isNetworkError) {
          setError("Can't reach the server — check your connection and try again.")
        } else {
          setError(err.message)
        }
      } else {
        setError('Registration failed — please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const notAvailable = () => Alert.alert('Coming soon', 'Social sign-in will be available in a future update.')

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => router.back()} />

        <View style={styles.copy}>
          <Text style={styles.label}>ALMOST THERE</Text>
          <Text style={styles.title}>Join{'\n'}<Text style={styles.accent}>Glimms</Text></Text>
          <Text style={styles.sub}>Save your style profile and outfits</Text>
        </View>

        <View style={styles.socialBtns}>
          {[
            { label: 'Continue with Google', icon: 'logo-google' as IoniconName },
            { label: 'Continue with Apple', icon: 'logo-apple' as IoniconName },
          ].map((btn) => (
            <TouchableOpacity key={btn.label} style={styles.socialBtn} activeOpacity={0.8} onPress={notAvailable}>
              <AppIcon name={btn.icon} size={18} color={Colors.text} style={{ marginRight: 8 }} />
              <Text style={styles.socialBtnText}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Divider label="or use email" />

        <View style={styles.fields}>
          <TextInput
            placeholder="Name (optional)"
            placeholderTextColor={Colors.mid}
            autoCapitalize="words"
            style={styles.field}
            value={form.name}
            onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
          />
          <TextInput
            placeholder="Email address"
            placeholderTextColor={Colors.mid}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.field}
            value={form.email}
            onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
          />
          <TextInput
            placeholder="Password (min 8 characters)"
            placeholderTextColor={Colors.mid}
            secureTextEntry
            autoCapitalize="none"
            style={styles.field}
            value={form.password}
            onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
          />
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <GoldButton label="Create Account" onPress={submit} loading={loading} />

        <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={{ marginTop: 14 }}>
          <Text style={[styles.legal, { color: Colors.gold }]}>Already have an account? Sign in</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          By continuing you agree to our{' '}
          <Text style={{ color: Colors.gold }} onPress={() => router.push('/legal/terms')}>Terms</Text> &amp;{' '}
          <Text style={{ color: Colors.gold }} onPress={() => router.push('/legal/privacy')}>Privacy Policy</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  copy: { marginTop: Spacing.xl, marginBottom: Spacing.xl },
  label: { fontSize: 11, letterSpacing: 2, color: Colors.gold, marginBottom: 6 },
  title: { fontSize: 34, fontFamily: Typography.serif, fontWeight: '300', color: Colors.text, lineHeight: 42 },
  accent: { fontStyle: 'italic', color: Colors.gold },
  sub: { fontSize: 13, color: Colors.mid, marginTop: 6 },
  socialBtns: { gap: 10, marginBottom: Spacing.md },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 50, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
  },
  socialBtnText: { fontSize: 14, fontWeight: '500', color: Colors.text },
  fields: { gap: 10, marginBottom: Spacing.md },
  field: {
    height: 50, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, color: Colors.text, fontSize: 14,
  },
  error: {
    color: Colors.error, fontSize: 13, textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  legal: { fontSize: 11, color: Colors.mid, textAlign: 'center', lineHeight: 18, marginTop: 14 },
})
