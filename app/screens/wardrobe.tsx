/**
 * Wardrobe — GET /api/catalog with infinite scroll, server-side category/tag
 * filters and tap-through to the item detail screen (guide §11/§16.6).
 * Presigned image URLs expire after 900s; on image error we fetch a fresh one.
 */
import React, { useCallback, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, RefreshControl, TextInput,
} from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors, Radius, Spacing, Typography } from '@/theme'
import { AppIcon, Icons } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { TileGridSkeleton } from '@/components/ui/Skeleton'
import { flattenCatalog, useCatalog } from '@/hooks/useCatalog'
import { catalogService } from '@/services/catalog.service'
import { ApiError } from '@/services/api.client'
import { analyticsService } from '@/services/analytics.service'
import type { CatalogItem } from '@/types/api'

const CATEGORIES = ['All', 'top', 'bottom', 'outerwear', 'shoes', 'accessory'] as const
type CategoryFilter = (typeof CATEGORIES)[number]

function CatalogTile({ item }: { item: CatalogItem }) {
  const router = useRouter()
  const [imageUri, setImageUri] = useState<string | null>(item.imageUrl ?? item.thumbnailUrl ?? null)
  const [retrying, setRetrying] = useState(false)

  // Presigned URLs expire (900s) — on image error fetch a fresh one (guide §19).
  const onImageError = useCallback(async () => {
    if (retrying) return
    setRetrying(true)
    try {
      setImageUri(await catalogService.getImageUrl(item.id))
    } catch {
      /* keep placeholder */
    } finally {
      setRetrying(false)
    }
  }, [item.id, retrying])

  return (
    <TouchableOpacity
      style={styles.tileWrap}
      onPress={() => router.push(`/catalog/${item.id}` as any)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View style={[styles.tileImg, { backgroundColor: item.color?.dominant?.hex ?? Colors.card2 }]}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri, cacheKey: item.imageKey }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onError={onImageError}
            transition={150}
          />
        ) : (
          <AppIcon name={Icons.wardrobe} size={26} color={Colors.mid} />
        )}
        {item.confidence > 0 && item.confidence < 0.6 && (
          <View style={styles.lowConf}>
            <AppIcon name={Icons.alert} size={10} color="#F59E0B" />
          </View>
        )}
      </View>
      <Text style={styles.tileName} numberOfLines={1}>{item.label}</Text>
      {!!item.category && <Text style={styles.tileCat} numberOfLines={1}>{item.category}</Text>}
    </TouchableOpacity>
  )
}

export default function WardrobeScreen() {
  const router = useRouter()
  const [category, setCategory] = useState<CategoryFilter>('All')
  const [search, setSearch] = useState('')

  const query = useCatalog({
    vertical: 'wardrobe',
    category: category === 'All' ? undefined : category,
    tag: search.trim() || undefined,
    includeUrls: true,
  })
  const items = useMemo(() => flattenCatalog(query.data), [query.data])

  // Analytics: fire once per successful filtered result (guide §14).
  const lastTracked = React.useRef('')
  React.useEffect(() => {
    if (!query.data || query.isFetching) return
    const key = `${category}|${search.trim()}`
    if (key !== lastTracked.current) {
      lastTracked.current = key
      if (category !== 'All' || search.trim()) {
        analyticsService.track('catalog_filtered', {
          vertical: 'wardrobe',
          category: category === 'All' ? undefined : category,
          tag: search.trim() || undefined,
        })
      }
    }
  }, [query.data, query.isFetching, category, search])
  const total = query.data?.pages[0]?.total ?? items.length

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
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My Wardrobe</Text>
          <Text style={styles.subtitle}>{total} item{total === 1 ? '' : 's'}</Text>
        </View>
        <IconButton
          icon="add"
          accessibilityLabel="Scan new items"
          boxSize={38}
          style={{ backgroundColor: Colors.gold, borderWidth: 0 }}
          color={Colors.black}
          onPress={() => router.push('/screens/scan' as any)}
        />
      </View>

      {/* Search (server side: tag filter) */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <AppIcon name={Icons.search} size={16} color={Colors.mid} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by tag — e.g. cotton"
            placeholderTextColor={Colors.dim}
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
              <AppIcon name="close-circle" size={16} color={Colors.mid} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category chips */}
      <View>
        <FlatList
          horizontal
          data={CATEGORIES as unknown as string[]}
          keyExtractor={(c) => c}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          renderItem={({ item: cat }) => (
            <Chip
              label={cat === 'All' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              selected={category === cat}
              onPress={() => setCategory(cat as CategoryFilter)}
            />
          )}
        />
      </View>

      {/* Items grid */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: 10 }}
        showsVerticalScrollIndicator={false}
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
        ListEmptyComponent={
          query.isLoading ? (
            <TileGridSkeleton count={6} />
          ) : errorMessage ? (
            <EmptyState
              icon={Icons.wifiOff}
              title="Wardrobe unavailable"
              subtitle={errorMessage}
              actionLabel="Retry"
              onAction={() => void query.refetch()}
            />
          ) : (
            <EmptyState
              icon={Icons.wardrobe}
              title={search ? 'No matches' : 'Your wardrobe is empty'}
              subtitle={
                search
                  ? `Nothing tagged “${search}” — try another term.`
                  : 'Scan your clothes and the AI will tag, colour-match and file them here.'
              }
              actionLabel={search ? undefined : 'Scan items'}
              onAction={search ? undefined : () => router.push('/screens/scan' as any)}
            />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <TileGridSkeleton count={3} />
            </View>
          ) : items.length ? (
            <TouchableOpacity
              style={styles.addTile}
              onPress={() => router.push('/screens/scan' as any)}
              accessibilityRole="button"
              accessibilityLabel="Add more items"
            >
              <AppIcon name="add" size={20} color={Colors.dim} />
              <Text style={styles.addTileText}>Add more</Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) => <CatalogTile item={item} />}
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
  searchRow: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13, height: '100%' },
  tabs: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: 8 },
  grid: { paddingHorizontal: Spacing.lg, paddingBottom: 120, gap: 10 },
  tileWrap: { width: '31%', flexGrow: 1, alignItems: 'center', marginBottom: 8 },
  tileImg: {
    width: '100%', aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 5,
    overflow: 'hidden',
  },
  lowConf: {
    position: 'absolute', top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  tileName: { fontSize: 10.5, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  tileCat: { fontSize: 9, color: Colors.dim, textAlign: 'center', textTransform: 'capitalize' },
  footerLoader: { marginTop: 10 },
  addTile: {
    height: 64, borderRadius: Radius.md, marginTop: 10,
    borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
  },
  addTileText: { color: Colors.dim, fontSize: 12, fontWeight: '500' },
})
