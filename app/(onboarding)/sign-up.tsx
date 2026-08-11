import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { BackButton, GoldButton, Divider } from '@/components/buttons'

export default function SignUpScreen() {
  const router = useRouter()

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
          {[{ label: 'Continue with Google', icon: 'G' }, { label: 'Continue with Apple', icon: '' }].map((btn) => (
            <TouchableOpacity key={btn.label} style={styles.socialBtn} activeOpacity={0.8}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>{btn.icon}</Text>
              <Text style={styles.socialBtnText}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Divider label="or use email" />

        <View style={styles.fields}>
          <TextInput placeholder="Email address" placeholderTextColor={Colors.mid} keyboardType="email-address" autoCapitalize="none" style={styles.field} />
          <TextInput placeholder="Password" placeholderTextColor={Colors.mid} secureTextEntry style={styles.field} />
        </View>

        <GoldButton label="Create Account" onPress={() => router.replace('/(tabs)/upload')} />

        <Text style={styles.legal}>
          By continuing you agree to our{' '}
          <Text style={{ color: Colors.gold }}>Terms</Text> &amp;{' '}
          <Text style={{ color: Colors.gold }}>Privacy Policy</Text>
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
  legal: { fontSize: 11, color: Colors.mid, textAlign: 'center', lineHeight: 18, marginTop: 14 },
})
