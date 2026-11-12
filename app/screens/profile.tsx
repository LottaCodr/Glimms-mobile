/**
 * Profile/Settings — real user, subscription status, usage stats (guide §16.8).
 * - Edit name (PATCH /api/users/me) via modal
 * - Preferences editor (/preferences) ↔ PUT on /api/users/me/preferences
 * - Subscription card → paywall
 * - Sign out (POST /api/auth/logout + token/device cleanup)
 * - Delete account (DELETE /api/users/me, permanent, double-confirm)
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { CountUp, Enter, Pop, Touchable } from '@/components/motion'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { AppIcon, Icons, IoniconName } from '@/components/ui/Icon'
import { useAuthStore } from '@/store/auth.store'
import { useAnalyticsSummary } from '@/hooks/useDesigns'
import { useSubscription } from '@/hooks/useSubscription'
import { userService } from '@/services/user.service'
import { toast } from '@/store/toast.store'
import { ApiError } from '@/services/api.client'
import { resendVerification } from '@/services/auth.services'

const TIER_LABEL: Record<string, string> = { free: 'FREE', premium: 'PREMIUM', pro: 'PRO' }

type MenuItem = {
  icon: IoniconName
  label: string
  info?: string
  danger?: boolean
  onPress: () => void
}

export default function NewProfileScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, logout, setUser, deleteAccount, refreshUser } = useAuthStore()
  const analytics = useAnalyticsSummary()
  const { subscription, manageBilling, loading: billingLoading, error: billingError } = useSubscription()

  const [loggingOut, setLoggingOut] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const prefs = useQuery({
    queryKey: ['preferences', 'me'],
    queryFn: () => userService.getPreferences(),
    staleTime: 60_000,
  })
  const prefsData = prefs.data && 'id' in prefs.data ? prefs.data : null

  const openEdit = () => {
    setNameDraft(user?.name ?? '')
    setEditOpen(true)
  }

  const saveName = async () => {
    const name = nameDraft.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const updated = await userService.update({ name })
      setUser(updated)
      setEditOpen(false)
      toast.success('Profile updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed — please try again')
    } finally {
      setSaving(false)
    }
  }

  const onLogout = () =>
    Alert.alert('Sign out', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true)
          await logout()
          router.replace('/(onboarding)/welcome')
        },
      },
    ])

  const [deleting, setDeleting] = useState(false)

  const deleteNow = async () => {
    setDeleting(true)
    try {
      await deleteAccount()
      router.replace('/(onboarding)/welcome')
    } catch (e) {
      setDeleting(false)
      // Nothing was deleted: say so, and keep the user signed in.
      const billing = e instanceof ApiError && e.code === 'BILLING_UNAVAILABLE'
      Alert.alert(
        'Account not deleted',
        billing
          ? "We couldn't cancel your subscription just now, so nothing was deleted. Please try again in a few minutes."
          : e instanceof ApiError && e.isNetworkError
            ? "We couldn't reach the server, so nothing was deleted. Check your connection and try again."
            : 'Something went wrong and nothing was deleted. Please try again.',
      )
    }
  }

  const onDeleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account, photos, wardrobe, saved looks and preferences, and cancels any subscription. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Delete everything?', 'This is your last chance to keep your account.', [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete forever', style: 'destructive', onPress: () => void deleteNow() },
            ]),
        },
      ],
    )

  const [resending, setResending] = useState(false)
  const onResendVerification = async () => {
    if (resending) return
    setResending(true)
    try {
      const { alreadyVerified } = await resendVerification()
      if (alreadyVerified) {
        await refreshUser().catch(() => {})
        toast.success('Your email is already confirmed')
      } else {
        toast.success('Confirmation email sent — check your inbox')
      }
    } catch (e) {
      toast.error(e instanceof ApiError && e.status === 429
        ? 'Please wait a few minutes before asking again'
        : "Couldn't send the email — please try again")
    } finally {
      setResending(false)
    }
  }

  const initial = (user?.name ?? user?.email ?? 'G').charAt(0).toUpperCase()
  const cityCountry = prefsData?.location
    ? [prefsData.location.city, prefsData.location.country].filter(Boolean).join(', ')
    : null

  const tier = user?.tier ?? 'free'
  /** A naira pass bought through Credo: fixed period, no renewal, no Stripe portal. */
  const isPass = subscription?.provider === 'credo'
  const styleChips = [...(prefsData?.styleGoals ?? []), ...(prefsData?.occasions ?? [])].slice(0, 3)

  const MENU: MenuItem[] = [
    { icon: 'person-outline', label: 'Edit Profile', onPress: openEdit },
    {
      icon: 'color-palette-outline',
      label: 'Style Preferences',
      onPress: () => router.push('/preferences' as any),
      info: prefsData
        ? `${prefsData.styleGoals?.length ?? 0} goals · ${prefsData.occasions?.length ?? 0} occasions`
        : undefined,
    },
    { icon: 'time-outline', label: 'Design Activity', onPress: () => router.push('/activity' as any) },
    {
      icon: 'notifications-outline',
      label: 'Notifications',
      info: 'Design-ready alerts',
      onPress: () =>
        Alert.alert('Notifications', 'Design-ready alerts are managed by your system settings.'),
    },
  ]

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
      >

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Pop>
              <View style={styles.avatar}>
                <Text style={styles.avatarLetter}>{initial}</Text>
              </View>
            </Pop>
          )}
          <Text style={styles.name}>{user?.name ?? 'Glimms user'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.badgesRow}>
            <View style={[styles.tierBadge, tier !== 'free' && styles.tierBadgePaid]}>
              {tier !== 'free' && (
                <AppIcon name="diamond" size={9} color={Colors.gold} style={{ marginRight: 4 }} />
              )}
              <Text style={styles.tierBadgeText}>{TIER_LABEL[tier]}</Text>
            </View>
            {!!styleChips.length && (
              <View style={styles.styleBadge}>
                <AppIcon name={Icons.sparkle} size={10} color={Colors.gold} style={{ marginRight: 4 }} />
                <Text style={styles.styleBadgeText}>{styleChips.join(' · ')}</Text>
              </View>
            )}
            {!!cityCountry && (
              <View style={styles.styleBadge}>
                <AppIcon name={Icons.location} size={10} color={Colors.mid} style={{ marginRight: 4 }} />
                <Text style={[styles.styleBadgeText, { color: Colors.mid }]}>{cityCountry}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Unconfirmed email */}
        {!!user && user.emailVerifiedAt === null && (
          <Enter index={1}>
            <Touchable
              style={styles.verifyCard}
              onPress={onResendVerification}
              disabled={resending}
              accessibilityRole="button"
              accessibilityLabel="Confirm your email. Resend the confirmation email."
            >
              <AppIcon name="mail-unread-outline" size={18} color={Colors.gold} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.verifyTitle}>Confirm your email</Text>
                <Text style={styles.verifySub}>
                  {resending ? 'Sending…' : 'We sent a link to your inbox. Tap to send it again.'}
                </Text>
              </View>
            </Touchable>
          </Enter>
        )}

        {/* Stats (GET /api/analytics/me) */}
        <View style={styles.statsRow}>
          {([
            { l: 'Scans today', v: analytics.data?.scansToday, icon: 'camera-outline' as IoniconName },
            { l: 'Items', v: analytics.data?.catalogCount, icon: Icons.wardrobe as IoniconName },
            { l: 'Saved', v: analytics.data?.savedCount, icon: 'heart-outline' as IoniconName },
          ]).map((s) => (
            <View key={s.l} style={styles.stat}>
              <AppIcon name={s.icon} size={15} color={Colors.gold} />
              {s.v === undefined ? (
                <ActivityIndicator size="small" color={Colors.gold} style={{ marginVertical: 4 }} />
              ) : (
                <CountUp value={s.v} style={styles.statValue} />
              )}
              <Text style={styles.statLabel}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* Subscription */}
        <Touchable
          style={tier === 'free' ? styles.upgradeCard : styles.subCard}
          activeOpacity={0.85}
          // Free users pick a plan; card subscribers manage theirs in the Stripe
          // portal; a naira pass is extended by buying another.
          onPress={() => (tier === 'free' || isPass ? router.push('/paywall' as any) : void manageBilling())}
          disabled={billingLoading}
          accessibilityRole="button"
          accessibilityLabel={tier === 'free' ? 'Upgrade your plan' : isPass ? 'Extend your plan' : 'Manage billing'}
        >
          <View style={styles.subIconWrap}>
            <AppIcon name="diamond-outline" size={20} color={tier === 'free' ? Colors.gold : Colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeTitle}>
              {tier === 'free' ? 'Upgrade your plan' : `${TIER_LABEL[tier]} · ${subscription?.status ?? 'active'}`}
            </Text>
            <Text style={styles.upgradeSub}>
              {tier === 'free'
                ? 'More scans · Priority AI styling'
                : billingError
                  ? billingError
                  : subscription?.currentPeriodEnd
                  ? `${subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${new Date(subscription.currentPeriodEnd).toLocaleDateString()} · ${isPass ? 'Extend' : 'Manage billing'}`
                  : 'Manage billing'}
            </Text>
          </View>
          <AppIcon name="chevron-forward" size={18} color={Colors.gold} />
        </Touchable>

        {/* Menu */}
        <View style={styles.menu}>
          {MENU.map((item, enterIdx) => (
            <Touchable
              key={item.label} enterIndex={enterIdx}
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={item.onPress}
              accessibilityRole="button"
            >
              <View style={styles.menuIconWrap}>
                <AppIcon name={item.icon} size={17} color={Colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                {item.info ? <Text style={styles.menuInfo}>{item.info}</Text> : null}
              </View>
              <AppIcon name="chevron-forward" size={16} color={Colors.mid} />
            </Touchable>
          ))}
          <Touchable
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={onLogout}
            disabled={loggingOut}
            accessibilityRole="button"
          >
            <View style={[styles.menuIconWrap, styles.menuIconDanger]}>
              <AppIcon name="log-out-outline" size={17} color={Colors.error} />
            </View>
            <Text style={[styles.menuLabel, { color: Colors.error, flex: 1 }]}>
              {loggingOut ? 'Signing out…' : 'Sign Out'}
            </Text>
          </Touchable>
          <Touchable style={styles.menuItem} activeOpacity={0.7} onPress={onDeleteAccount} disabled={deleting} accessibilityRole="button">
            <View style={[styles.menuIconWrap, styles.menuIconDanger]}>
              <AppIcon name="alert-circle-outline" size={17} color={Colors.error} />
            </View>
            <Text style={[styles.menuLabel, { color: Colors.error, flex: 1 }]}>{deleting ? 'Deleting…' : 'Delete account'}</Text>
          </Touchable>
        </View>
      </ScrollView>

      {/* Edit-name modal */}
      <Modal visible={editOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit profile</Text>
            <TextInput
              style={styles.modalInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Your name"
              placeholderTextColor={Colors.dim}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Touchable
                style={[styles.modalBtn, { backgroundColor: Colors.card2 }]}
                onPress={() => setEditOpen(false)}
              >
                <Text style={{ color: Colors.mid, fontWeight: '600' }}>Cancel</Text>
              </Touchable>
              <Touchable
                style={[styles.modalBtn, { backgroundColor: Colors.gold }]}
                onPress={saveName}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.black} size="small" />
                ) : (
                  <Text style={{ color: Colors.black, fontWeight: '700' }}>Save</Text>
                )}
              </Touchable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingBottom: 120 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  title: { fontSize: 22, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  avatarSection: { alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  avatar: {
    width: 84, height: 84, backgroundColor: Colors.gold,
    borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 10,
  },
  avatarImg: { width: 84, height: 84, borderRadius: 30, marginBottom: 12 },
  avatarLetter: { fontSize: 32, fontFamily: Typography.serif, fontWeight: '700', color: Colors.black },
  name: { fontSize: 20, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  email: { fontSize: 12, color: Colors.mid, marginTop: 2, marginBottom: 12 },
  badgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card2,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.xs, paddingHorizontal: 12, paddingVertical: 4,
  },
  tierBadgePaid: { backgroundColor: 'rgba(191,146,69,0.15)', borderColor: Colors.gold },
  tierBadgeText: { fontSize: 10, letterSpacing: 1.5, fontWeight: '800', color: Colors.text },
  styleBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(191,146,69,0.1)',
    borderWidth: 1, borderColor: 'rgba(191,146,69,0.28)',
    borderRadius: Radius.xs, paddingHorizontal: 12, paddingVertical: 4,
  },
  styleBadgeText: { fontSize: 11, color: Colors.gold },
  statsRow: { flexDirection: 'row', gap: 8, marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  stat: {
    flex: 1, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, alignItems: 'center', paddingVertical: 14, gap: 4,
  },
  statValue: { fontSize: 18, fontFamily: Typography.serif, fontWeight: '700', color: Colors.gold },
  statLabel: { fontSize: 10, color: Colors.mid },
  upgradeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(191,146,69,0.09)',
    borderWidth: 1, borderColor: 'rgba(191,146,69,0.3)',
    borderRadius: Radius.md, padding: 16,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  subCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: 16,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  subIconWrap: {
    width: 42, height: 42, borderRadius: Radius.md,
    backgroundColor: Colors.goldGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  upgradeTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  upgradeSub: { fontSize: 11, color: Colors.mid, marginTop: 2 },
  menu: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.md, height: 56,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  menuIconWrap: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.card2,
    alignItems: 'center', justifyContent: 'center',
  },
  menuIconDanger: { backgroundColor: 'rgba(192,64,64,0.12)' },
  menuLabel: { fontSize: 14, fontWeight: '500', color: Colors.text },
  menuInfo: { fontSize: 11, color: Colors.mid, marginTop: 1 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.lg,
  },
  modalCard: {
    width: '100%', backgroundColor: Colors.card,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
  },
  modalTitle: { fontSize: 17, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text, marginBottom: 12 },
  modalInput: {
    height: 48, backgroundColor: Colors.card2,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, color: Colors.text, fontSize: 14,
  },
  modalBtn: { flex: 1, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  verifyCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gold, backgroundColor: 'rgba(191,146,69,0.08)',
  },
  verifyTitle: { color: Colors.text, fontWeight: '700', fontSize: 14 },
  verifySub: { color: Colors.mid, fontSize: 12, marginTop: 2 },
})
