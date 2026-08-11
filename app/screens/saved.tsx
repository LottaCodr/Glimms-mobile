/**
 * Saved designs — GET /api/designs/saved with All / Favorites tabs,
 * optimistic favorite toggles, tap-through to detail, swipe-free actions.
 */
import React from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, RefreshControl, ActivityIndicator, Alert, Share,
} from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { AppIcon, Icons } from '@/components/ui/Icon'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  flattenSaved,
  useDeleteSavedDesign,
  useSavedDesigns,
  useToggleFavorite,
} from '@/hooks/useDesigns'
import { ApiError } from '@/services/api.client'
import { toast } from '@/store/toast.store'
import type { SavedDesign } from '@/types/api'

const TABS = ['All', 'Favorites'] as const
type Tab = (typeof TABS)[number]

function DesignCard({ design }: { design: SavedDesign }) {
  const router = useRouter()
  const favorite = useToggleFavorite()
  const del = useDeleteSavedDesign()

  const onDelete = () =>
    Alert.alert('Delete this look?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          del.mutate(design.id, {
            onSuccess: () => toast.success('Look deleted'),
            onError: () => toast.error('Delete failed — please try again'),
          }),
      },
    ])

  const onShare = () => {
    const parts = [design.title, design.explanation, ...(design.tips ?? [])]
      .filter(Boolean)
      .map(String)
    Share.share({ message: parts.join('\n\n') || 'Check out this Glimms look' })
      .catch(() => {})
  }

  const itemLabels = (design.items ?? [])
    .map((it: any) => it?.label ?? it?.name)
    .filter(Boolean)
    .slice(0, 4)
    .map(String)

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.92}
      onPress={() => router.push(`/saved/${design.id}` as any)}
      accessibilityRole="button"
      accessibilityLabel={design.title ?? 'Saved look'}
    >
      {!!design.mockupUrl && (
        <Image source={{ uri: design.mockupUrl }} style={styles.mockup} contentFit="cover" transition={180} />
      )}
      <View style={{ padding: Spacing.md }}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {design.title ?? 'Saved look'}
          </Text>
          {design.score > 0 && (
            <View style={styles.scorePill}>
              <AppIcon name={Icons.sparkle} size={10} color={Colors.gold} style={{ marginRight: 3 }} />
              <Text style={styles.scoreText}>{Math.round(design.score * 100)}%</Text>
            </View>
          )}
        </View>

        {!!design.explanation && (
          <Text style={styles.explanation} numberOfLines={2}>{design.explanation}</Text>
        )}

        {!!itemLabels.length && (
          <View style={styles.chipsRow}>
            {itemLabels.map((l, i) => (
              <Chip key={i} label={l} small />
            ))}
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => favorite.mutate(design.id)}
            disabled={favorite.isPending}
            accessibilityRole="button"
            accessibilityLabel={design.isFavorite ? 'Unfavorite' : 'Favorite'}
          >
            <AppIcon
              name={design.isFavorite ? Icons.heart : Icons.heartOutline}
              size={14}
              color={design.isFavorite ? Colors.gold : Colors.mid}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.actionBtnText, design.isFavorite && { color: Colors.gold }]}>
              {design.isFavorite ? 'Favorited' : 'Favorite'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onShare} accessibilityLabel="Share look">
            <AppIcon name={Icons.share} size={14} color={Colors.mid} style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={onDelete}
            disabled={del.isPending}
            accessibilityLabel="Delete look"
          >
            <AppIcon name={Icons.trash} size={14} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function NewSavedScreen() {
  const [tab, setTab] = React.useState<Tab>('All')
  const query = useSavedDesigns(tab === 'Favorites')
  const designs = flattenSaved(query.data)
  const total = query.data?.pages[0]?.total ?? designs.length

  const errorMessage =
    query.error instanceof ApiError
      ? query.error.isNetworkError
        ? 'Can’t reach the server — pull down to retry.'
        : query.error.message
      : query.isError
        ? 'Something went wrong — pull down to retry.'
        : null

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved Outfits</Text>
        <Text style={styles.subtitle}>{total} look{total === 1 ? '' : 's'} saved</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <Chip
            key={t}
            label={t}
            selected={tab === t}
            icon={t === 'Favorites' ? (tab === t ? Icons.heart : Icons.heartOutline) : undefined}
            onPress={() => setTab(t)}
          />
        ))}
      </View>

      <FlatList
        data={designs}
        keyExtractor={(d) => d.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage()
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
            tintColor={Colors.gold}
          />
        }
        renderItem={({ item }) => <DesignCard design={item} />}
        ListEmptyComponent={
          query.isLoading ? (
            <View style={{ paddingTop: 20 }}>
              {[0, 1].map((i) => (
                <Skeleton key={i} height={180} borderRadius={Radius.lg} style={{ marginBottom: 14 }} />
              ))}
            </View>
          ) : errorMessage ? (
            <EmptyState
              icon={Icons.wifiOff}
              title="Saved looks unavailable"
              subtitle={errorMessage}
              actionLabel="Retry"
              onAction={() => void query.refetch()}
            />
          ) : (
            <EmptyState
              icon={tab === 'Favorites' ? Icons.heartOutline : Icons.sparkle}
              title={tab === 'Favorites' ? 'No favorites yet' : 'Nothing saved yet'}
              subtitle={
                tab === 'Favorites'
                  ? 'Tap the heart on any saved look to pin it here.'
                  : 'Scan your wardrobe and save the designs you love.'
              }
            />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <ActivityIndicator color={Colors.gold} style={{ marginVertical: 16 }} />
          ) : null
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  title: { fontSize: 22, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.mid, marginTop: 2 },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 120 },
  card: {
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, overflow: 'hidden', marginBottom: 16,
  },
  mockup: { width: '100%', aspectRatio: 4 / 3, backgroundColor: Colors.card2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: Typography.serif, fontWeight: '600', color: Colors.text },
  scorePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.goldGlow,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(191,146,69,0.25)',
  },
  scoreText: { color: Colors.gold, fontWeight: '700', fontSize: 11 },
  explanation: { color: Colors.mid, fontSize: 13, lineHeight: 19, marginTop: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, height: 38, backgroundColor: Colors.card2,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: Colors.mid },
  deleteBtn: {
    width: 38, height: 38,
    backgroundColor: 'rgba(192,64,64,0.12)',
    borderWidth: 1, borderColor: 'rgba(192,64,64,0.25)',
    borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center',
  },
})
