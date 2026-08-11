import { PrimaryButton } from '@/components/buttons/PrimaryButton'
import ColorPreference from '@/components/StyleSetup/ColorPreference'
import OccasionSelector from '@/components/StyleSetup/OccasionSelector'
import StyleVibe from '@/components/StyleSetup/StyleVibe'
import WeatherCard from '@/components/StyleSetup/WeatherCard'
import { useTheme } from '@/provider/ThemeProvider'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { StatusBar, Text, View } from 'react-native'

export default function StyleSetupScreen() {
    const theme = useTheme()

    // Collect details from each component
    const [weather, setWeather] = useState<any>(null)
    const [occasion, setOccasion] = useState<string | null>(null)
    const [colorPreference, setColorPreference] = useState<string[] | null>(null)
    const [styleVibe, setStyleVibe] = useState<string[] | null>(null)

    const handleGenerate = () => {
        const details = {
            weather,
            occasion,
            colorPreference,
            styleVibe,
        }
        // For now, log all details - replace with next steps as needed
        console.log('Collected Details:', details)
        router.push('/screens/processing')
        // Do something with collected details (e.g., navigate to next screen, call API, etc.)
    }

    return (
        <View style={{ flex: 1, padding: theme.spacing[4] }}>
            <StatusBar barStyle={theme.mode === "light" ? "dark-content" : "light-content"} />
            <Text style={theme.typography.h3}>Style Setup</Text>

            {/* Pass value and handler to collect weather details */}
            <WeatherCard value={weather} onChange={setWeather} />
            {/* Pass handler to collect occasion selection */}
            <OccasionSelector value={occasion} onChange={setOccasion} />
            {/* Pass handler to collect color preference */}
            <ColorPreference value={colorPreference} onChange={setColorPreference} />
            {/* Pass handler to collect style vibe */}
            <StyleVibe value={styleVibe} onChange={setStyleVibe} />

            <View style={{ marginTop: "auto" }}>
                <PrimaryButton onPress={handleGenerate}>
                    <Text style={{ color: "#fff", flexDirection: "row", alignItems: "center" }}>
                        Generate Styles{" "}
                    </Text>
                </PrimaryButton>
            </View>
        </View>
    )
}