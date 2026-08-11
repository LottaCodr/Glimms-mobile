import React, { useEffect, useCallback } from 'react'
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Tabs } from 'expo-router'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Typography } from '@/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
type RegularTab = {
  name: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  iconActive: keyof typeof Ionicons.glyphMap
  special?: false
}
type ScanTab = {
  name: string
  label: string
  icon?: never
  iconActive?: never
  special: true
}
type TabItem = RegularTab | ScanTab

// ─── Tab config ───────────────────────────────────────────────────────────────
// Ionicons: filled variant for active, outline for inactive
const TAB_ITEMS: TabItem[] = [
  { name: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'closet', label: 'Closet', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'upload', label: '', special: true },
  { name: 'saved', label: 'Saved', icon: 'heart-outline', iconActive: 'heart' },
  { name: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
]

// ─── Animated tab icon + label unit ──────────────────────────────────────────
interface TabIconProps {
  tab: RegularTab
  focused: boolean
}

function TabIcon({ tab, focused }: TabIconProps) {
  const scale = useSharedValue(1)
  const labelOpacity = useSharedValue(focused ? 1 : 0.45)
  const iconColor = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    scale.value = withSpring(focused ? 1.12 : 1, { damping: 12, stiffness: 260, mass: 0.8 })
    labelOpacity.value = withTiming(focused ? 1 : 0.45, { duration: 180, easing: Easing.out(Easing.quad) })
    iconColor.value = withTiming(focused ? 1 : 0, { duration: 180 })
  }, [focused, scale, labelOpacity, iconColor])

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    color: interpolateColor(iconColor.value, [0, 1], [Colors.mid, Colors.gold]),
  }))

  return (
    <View style={tabStyles.tabInner}>
      {/* Gold dot indicator above icon */}
      <View style={tabStyles.dotWrap}>
        {focused && <View style={tabStyles.activeDot} />}
      </View>

      {/* Icon */}
      <Animated.View style={iconWrapStyle}>
        <Ionicons
          name={focused ? tab.iconActive : tab.icon}
          size={22}
          color={focused ? Colors.gold : Colors.mid}
        />
      </Animated.View>

      {/* Label */}
      <Animated.Text style={[tabStyles.tabLabel, labelStyle]}>
        {tab.label}
      </Animated.Text>
    </View>
  )
}

// ─── Scan FAB ─────────────────────────────────────────────────────────────────
interface ScanFabProps {
  onPress: () => void
}

function ScanFab({ onPress }: ScanFabProps) {
  const pressed = useSharedValue(0)

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed.value ? 0.92 : 1, { damping: 10, stiffness: 300 }) }],
  }))

  const handlePress = useCallback(() => {
    pressed.value = 1
    // Reset after press
    setTimeout(() => { pressed.value = 0 }, 120)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onPress()
  }, [onPress, pressed])

  return (
    <View style={tabStyles.fabContainer}>
      {/* Outer glow ring */}
      <View style={tabStyles.fabRing} />
      {/* FAB button */}
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        style={tabStyles.fabTouchable}
      >
        <Animated.View style={[tabStyles.fab, fabStyle]}>
          <Ionicons name="camera" size={24} color="#000" />
        </Animated.View>
      </TouchableOpacity>
    </View>
  )
}

// ─── Custom tab bar ───────────────────────────────────────────────────────────
export function GlimmsTabBar({ state, navigation }: BottomTabBarProps) {
  const handleTabPress = useCallback((routeKey: string, routeName: string, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true })
    if (!focused && !event.defaultPrevented) {
      Haptics.selectionAsync()
      navigation.navigate(routeName)
    }
  }, [navigation])

  return (
    <View style={tabStyles.barWrapper}>
      {/* Subtle top-edge gradient line */}
      <View style={tabStyles.topEdge} />

      <View style={tabStyles.bar}>
        {state.routes.map((route, index) => {
          const tab = TAB_ITEMS[index]
          const focused = state.index === index

          // ── Scan FAB ──
          if (tab.special) {
            return (
              <View key={route.key} style={tabStyles.fabSlot}>
                <ScanFab onPress={() => handleTabPress(route.key, route.name, focused)} />
              </View>
            )
          }

          // ── Regular tab ──
          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => handleTabPress(route.key, route.name, focused)}
              activeOpacity={1}
              style={tabStyles.tab}
            >
              <TabIcon tab={tab as RegularTab} focused={focused} />
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const FAB_SIZE = 56
const FAB_LIFT = 22   // how many px the FAB floats above the bar top
const BAR_HEIGHT = 80
const RING_SIZE = FAB_SIZE + 10

const tabStyles = StyleSheet.create({
  barWrapper: {
    position: 'relative',
    backgroundColor: Colors.surface,
    // Hard shadow for depth on iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
  },
  topEdge: {
    height: 1,
    backgroundColor: Colors.border,
  },
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    alignItems: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: Colors.surface,
  },

  // ── Regular tab ──
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  tabInner: {
    alignItems: 'center',
    gap: 3,
  },
  dotWrap: {
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gold,
    // Soft glow
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: Typography.sans,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // ── Scan FAB slot ──
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    // We push the FAB upward using negative bottom offset
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  fabContainer: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    marginBottom: FAB_LIFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabRing: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(191,146,69,0.22)',
    backgroundColor: 'transparent',
    // The ring creates a halo — fills the notch visually
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  fabTouchable: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    // Multi-layer shadow for a premium floating feel
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 14,
  },
})

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlimmsTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="closet" options={{ title: 'Closet' }} />
      <Tabs.Screen name="upload" options={{ title: 'Upload' }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}