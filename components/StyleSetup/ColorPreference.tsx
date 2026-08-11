import { useTheme } from '@/provider/ThemeProvider'
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// Color palette definitions and friendly names
const COLOR_PRESETS: {
    key: string
    name: string
    color: string
    icon: React.ComponentProps<typeof Ionicons>['name']
}[] = [
    { key: "neutral", name: "Neutral", color: "#D9D9D9", icon: "ellipse-outline" },
    { key: "cool",    name: "Cool",    color: "#4F8DFD", icon: "water-outline"  },
    { key: "earthy",  name: "Earthy",  color: "#C48A64", icon: "leaf-outline" },
    { key: "bright",  name: "Bright",  color: "#F3C54B", icon: "sunny-outline"  },
    { key: "mono",    name: "Mono",    color: "#141414", icon: "contrast-outline"  },
];

type ColorPreferenceProps = {
    value: string[] | null
    onChange: (colors: string[] | null) => void
};

export default function ColorPreference({ value, onChange }: ColorPreferenceProps) {
    const theme = useTheme();

    // Fallback secondaryTextColor for themes not supporting theme.colors.text.secondary
    const secondaryTextColor =
        (theme.colors as any).text && typeof (theme.colors as any).text.secondary === "string"
            ? (theme.colors as any).text.secondary
            : ((theme.colors as any).neutral?.["600"] || "#888");

    const handleToggle = (colorKey: string) => {
        if (!value) {
            onChange([colorKey]);
        } else if (value.includes(colorKey)) {
            const next = value.filter((k) => k !== colorKey);
            onChange(next.length === 0 ? null : next);
        } else {
            onChange([...value, colorKey]);
        }
    };

    return (
        <View>
            <Text style={[theme.typography.h4, { marginBottom: theme.spacing[2] }]}>Color Preference</Text>
            <Text style={[
                theme.typography.caption,
                { color: secondaryTextColor, marginBottom: 8 }
            ]}>
                Pick your preferred palette
            </Text>
            <View style={{ flexDirection: "row", gap: 18, marginVertical: 12, paddingVertical: 2, justifyContent: "center" }}>
                {COLOR_PRESETS.map((preset) => {
                    const isSelected = value ? value.includes(preset.key) : false;
                    return (
                        <Pressable
                            key={preset.key}
                            onPress={() => handleToggle(preset.key)}
                            style={[
                                {
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                },
                                isSelected && {
                                    // Add extra effect for selection (lift)
                                    transform: [{ scale: 1.12 }],
                                },
                            ]}
                        >
                            <View
                                style={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: 26,
                                    borderWidth: isSelected ? 3 : 1.5,
                                    borderColor: isSelected
                                        ? theme.colors.brand.primary
                                        : "#DDD",
                                    backgroundColor: "#FFF",
                                    shadowColor: "#000",
                                    shadowOffset: { width: 0, height: isSelected ? 4 : 2 },
                                    shadowOpacity: isSelected ? 0.15 : 0.07,
                                    shadowRadius: isSelected ? 6 : 4,
                                    elevation: isSelected ? 4 : 2,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <View
                                    style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: 15,
                                        backgroundColor: preset.color,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Ionicons
                                        name={preset.icon}
                                        color={preset.key === "mono" ? "#fff" : "#222"}
                                        size={19}
                                        style={{
                                            opacity: preset.key === "mono" ? 0.85 : 0.35,
                                            position: "absolute",
                                            left: 2,
                                            top: 2
                                        }}
                                    />
                                </View>
                                {isSelected && (
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={21}
                                        color={theme.colors.brand.primary}
                                        style={{
                                            position: "absolute",
                                            bottom: -9,
                                            right: -10,
                                            backgroundColor: "#fff",
                                            borderRadius: 13,
                                        }}
                                    />
                                )}
                            </View>
                            <Text
                                style={{
                                    marginTop: 6,
                                    fontSize: 13,
                                    color: isSelected
                                        ? theme.colors.brand.primary
                                        : secondaryTextColor,
                                    fontWeight: isSelected ? "600" : "400",
                                    textAlign: 'center',
                                }}
                            >
                                {preset.name}
                            </Text>
                        </Pressable>
                    )
                })}
            </View>
        </View>
    )
}