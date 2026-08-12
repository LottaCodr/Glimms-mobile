/**
 * Home dashboard (guide §16.3): greeting + tier badge, Today's Pick from the
 * newest saved design, real stat pills (GET /api/analytics/me), recent catalog
 * items, and recent design activity.
 */
import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { AppIcon, Icons } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatBox } from '@/components/buttons'
import { useAuthStore } from '@/store/auth.store'
import { useAnalyticsSummary, useJobs, useSavedDesigns } from '@/hooks/useDesigns'
import { useCatalog, flattenCatalog } from '@/hooks/useCatalog'
import { ENV } from '@/config/env'
import type { DesignJob } from '@/types/api'

const SCAN_LIMITS = ENV.SCAN_LIMITS as Record<string, number>
const TIER_LABEL: Record<string, string> = { free: 'FREE', premium: 'PREMIUM', pro: 'PRO' }

function greetingForHour() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const JOB_STATUS_META: Record<DesignJob['status'], { icon: string; color: string }> = {
  completed: { icon: Icons.checkCircle, color: '#5DBB7D' },
  failed: { icon: Icons.alert, color: Colors.error },
  pending: { icon: Icons.clock, color: Colors.mid },
  processing: { icon: Icons.refresh, color: Colors.gold },
}

export default function NewHomeScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const analytics = useAnalyticsSummary()
  const saved = useSavedDesigns()
  const latestSaved = saved.data?.pages[0]?.designs[0] ?? null
  const catalog = useCatalog({ vertical: 'wardrobe', includeUrls: true })
  const catalogItems = flattenCatalog(catalog.data).slice(0, 8)
  const jobs = useJobs(3)
  const recentJobs = jobs.data?.pages[0]?.jobs.slice(0, 3) ?? []

  const tier = user?.tier ?? 'free'
  const limit = SCAN_LIMITS[tier] ?? 10
  const scansToday = analytics.data?.scansToday
  const anyLoading = analytics.isLoading && saved.isLoading && catalog.isLoading && jobs.isLoading

  const refreshing = !!(analytics.isRefetching || saved.isRefetching || catalog.isRefetching)
  const onRefresh = () => {
    void analytics.refetch()
    void saved.refetch()
    void catalog.refetch()
    void jobs.refetch()
  }

  const firstName = (user?.name ?? '').split(' ')[0] || 'Stylist'
  const itemLabels = (latestSaved?.items ?? [])
    .map((it: any) => it?.label ?? it?.name)
    .filter(Boolean)
    .slice(0, 4)
    .map(String)

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greetingForHour()}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.userName}>{firstName}</Text>
              <AppIcon name={Icons.sparkle} size={16} color={Colors.gold} />
            </View>
          </View>
          <View style={styles.headerIcons}>
            <IconButton
              icon="time-outline"
              accessibilityLabel="Design activity"
              onPress={() => router.push('/activity' as any)}
            />
            <IconButton
              icon={tier === 'free' ? 'diamond-outline' : 'shield-checkmark'}
              color={tier === 'free' ? Colors.text : Colors.gold}
              accessibilityLabel={tier === 'free' ? 'Upgrade plan' : `${TIER_LABEL[tier]} member`}
              onPress={() => tier === 'free' && router.push('/paywall' as any)}
              style={tier !== 'free' ? { borderColor: Colors.gold } : undefined}
            />
          </View>
        </View>

        {/* Style me CTA */}
        <TouchableOpacity
          onPress={() => router.push('/screens/scan' as any)}
          activeOpacity={0.85}
          style={styles.styleMeCta}
          accessibilityRole="button"
        >
          <View style={styles.ctaIcon}>
            <AppIcon name={Icons.sparkle} size={20} color={Colors.black} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitle}>Style me today</Text>
            <Text style={styles.ctaSub}>
              {scansToday !== undefined && limit !== Infinity
                ? `${scansToday}/${limit} scans used today`
                : 'Scan items or pick from wardrobe'}
            </Text>
          </View>
          <AppIcon name="chevron-forward" size={18} color={Colors.gold} />
        </TouchableOpacity>

        {/* Today's Pick — newest saved design */}
        <View style={styles.section}>
          <SectionHeader
            title="Today's Pick"
            actionLabel="See saved"
            onAction={() => router.push('/(tabs)/saved' as any)}
          />
          {saved.isLoading ? (
            <Skeleton height={210} borderRadius={Radius.lg} />
          ) : latestSaved ? (
            <TouchableOpacity
              onPress={() => router.push(`/saved/${latestSaved.id}` as any)}
              activeOpacity={0.92}
              accessibilityRole="button"
            >
              <View style={styles.heroCard}>
                {latestSaved.mockupUrl ? (
                  <Image source={{ uri: latestSaved.mockupUrl }} style={styles.heroImg} contentFit="cover" transition={180} />
                ) : (
                  <View style={[styles.heroImg, styles.heroFallback]}>
                    <AppIcon name={Icons.sparkle} size={34} color={Colors.gold} />
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.82)']}
                  style={styles.heroGradient}
                />
                <View style={styles.heroContent}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroTitle} numberOfLines={1}>
                      {latestSaved.title ?? 'Saved look'}
                    </Text>
                    {!!itemLabels.length && (
                      <Text style={styles.heroSub} numberOfLines={1}>
                        {itemLabels.join(' · ')}
                      </Text>
                    )}
                  </View>
                  {latestSaved.score > 0 && (
                    <View style={styles.scorePill}>
                      <Text style={styles.scorePillText}>{Math.round(latestSaved.score * 100)}%</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyHero}>
              <EmptyState
                compact
                icon={Icons.sparkle}
                title="No saved looks yet"
                subtitle="Scan your wardrobe and let Glimms design for you"
              />
            </View>
          )}
        </View>

        {/* Stats (guide §14 dashboard pills) */}
        <View style={styles.statsRow}>
          <StatBox label="Scans today" value={String(analytics.data?.scansToday ?? '—')} icon="camera-outline" />
          <StatBox label="Items" value={String(analytics.data?.catalogCount ?? '—')} icon={Icons.wardrobe} />
          <StatBox label="Saved" value={String(analytics.data?.savedCount ?? '—')} icon="heart-outline" />
        </View>

        {/* Recent Items (catalog) */}
        <View style={styles.section}>
          <SectionHeader
            title="Recent Items"
            actionLabel="View wardrobe"
            onAction={() => router.push('/(tabs)/closet' as any)}
          />
          {catalog.isLoading ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width={80} height={110} borderRadius={Radius.md} />
              ))}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {catalogItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.recentTile}
                  onPress={() => router.push(`/catalog/${item.id}` as any)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <View style={[styles.recentTileImg, { backgroundColor: item.color?.dominant?.hex ?? Colors.card2 }]}>
                    {item.imageUrl ? (
                      <Image
                        source={{ uri: item.imageUrl, cacheKey: item.imageKey }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={120}
                      />
                    ) : (
                      <AppIcon name={Icons.wardrobe} size={22} color={Colors.mid} />
                    )}
                  </View>
                  <Text style={styles.recentTileName} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => router.push('/screens/scan' as any)}
                style={styles.addTile}
                accessibilityRole="button"
                accessibilityLabel="Scan new items"
              >
                <AppIcon name="add" size={22} color={Colors.dim} />
              </TouchableOpacity>
              {!catalogItems.length && (
                <Text style={styles.recentEmpty}>Scan items to fill your wardrobe</Text>
              )}
            </ScrollView>
          )}
        </View>

        {/* Recent design activity */}
        {(jobs.isLoading || !!recentJobs.length) && (
          <View style={styles.section}>
            <SectionHeader
              title="Recent activity"
              actionLabel="View all"
              onAction={() => router.push('/activity' as any)}
            />
            {jobs.isLoading
              ? [0, 1].map((i) => <Skeleton key={i} height={58} borderRadius={Radius.md} style={{ marginBottom: 8 }} />)
              : recentJobs.map((j) => {
                  const meta = JOB_STATUS_META[j.status]
                  return (
                    <TouchableOpacity
                      key={j.id}
                      style={styles.jobRow}
                      onPress={() =>
                        router.push(
                          (j.status === 'completed' || j.status === 'failed' ? `/jobs/${j.id}` : `/jobs/${j.id}`) as any,
                        )
                      }
                      activeOpacity={0.8}
                      accessibilityRole="button"
                    >
                      <View style={[styles.jobIcon, { backgroundColor: `${meta.color}1F` }]}>
                        <AppIcon name={meta.icon} size={16} color={meta.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.jobTitle}>{j.vertical} design</Text>
                        <Text style={styles.jobSub}>
                          {j.status} · {new Date(j.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <AppIcon name="chevron-forward" size={16} color={Colors.mid} />
                    </TouchableOpacity>
                  )
                })}
          </View>
        )}

        {anyLoading && <View style={{ height: Spacing.lg }} />}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingBottom: 120 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md,
  },
  greeting: { fontSize: 13, color: Colors.mid },
  userName: { fontSize: 22, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  headerIcons: { flexDirection: 'row', gap: 8 },
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
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  statsRow: { flexDirection: 'row', gap: 10, marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  heroCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  heroImg: { width: '100%', aspectRatio: 4 / 3, backgroundColor: Colors.card2 },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  heroGradient: { ...StyleSheet.absoluteFill, top: '35%' },
  heroContent: {
    position: 'absolute', left: 14, right: 14, bottom: 12,
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
  },
  heroTitle: {
    fontSize: 18, fontFamily: Typography.serif, fontWeight: '700', color: '#fff',
  },
  heroSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  scorePill: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5,
  },
  scorePillText: { color: Colors.black, fontWeight: '800', fontSize: 12 },
  emptyHero: {
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg,
  },
  recentTile: { width: 80, alignItems: 'center' },
  recentTileImg: {
    width: 80, height: 90, borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 5,
    overflow: 'hidden',
  },
  recentTileName: { fontSize: 10, color: Colors.mid, textAlign: 'center' },
  recentEmpty: { fontSize: 11, color: Colors.mid, alignSelf: 'center', marginHorizontal: 12 },
  addTile: {
    width: 80, height: 90, borderRadius: Radius.md,
    borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  jobRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: 12, marginBottom: 8,
  },
  jobIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  jobTitle: { fontSize: 13, fontWeight: '600', color: Colors.text, textTransform: 'capitalize' },
  jobSub: { fontSize: 11, color: Colors.mid, marginTop: 1 },
})
