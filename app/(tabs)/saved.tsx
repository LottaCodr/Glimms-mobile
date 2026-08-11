import { Screen } from '@/components/layout/Screen'
import FilterPills from '@/components/SavedStyles/FilterPills'
import Header from '@/components/SavedStyles/Header'
import { NewestStyleCard } from '@/components/SavedStyles/NewestStyleCard'
import RecentCollection from '@/components/SavedStyles/RecentCollection'
import { useTheme } from '@/provider/ThemeProvider'
import { useSavedStylesStore } from '@/store/saveStyles'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import React from 'react'
import { ScrollView, View } from 'react-native'
import NewSavedScreen from '../screens/saved'

const saved = () => {
    const theme = useTheme()
    const { styles } = useSavedStylesStore()
    const insets = useSafeAreaInsets()

    const HEADER_HEIGHT = 56 + insets.top

    const newest = styles[0]
    const rest = styles.slice(1)

    return (
        <NewSavedScreen/>
    )
}

export default saved
