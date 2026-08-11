import { useTheme } from '@/provider/ThemeProvider';
import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const vibes = [
    { key: "minimal", label: "Minimal", icon: "filter-none" as const },
    { key: "bold", label: "Bold", icon: "bolt" as const },
    { key: "classic", label: "Classic", icon: "library-books" as const },
    { key: "streetwear", label: "Streetwear", icon: "directions-run" as const },
    { key: "vintage", label: "Vintage", icon: "watch-later" as const }
];

type StyleVibeProps = {
    value: string[] | null;
    onChange: (vibes: string[] | null) => void;
};

export default function StyleVibe({ value, onChange }: StyleVibeProps) {
    const theme = useTheme();

    const handleToggle = (vibeKey: string) => {
        if (!value) {
            onChange([vibeKey]);
        } else if (value.includes(vibeKey)) {
            const next = value.filter((k) => k !== vibeKey);
            onChange(next.length === 0 ? null : next);
        } else {
            onChange([...value, vibeKey]);
        }
    };

    return (
        <View style={{ marginBottom: 24 }}>
            <Text style={[theme.typography.h4, { marginBottom: 10 }]}>
                Style Vibe
            </Text>
            <View
                style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 14,
                }}
            >
                {vibes.map((v) => {
                    const isActive = value?.includes(v.key) ?? false;
                    return (
                        <Pressable
                            key={v.key}
                            onPress={() => handleToggle(v.key)}
                            style={[
                                styles.chip,
                                {
                                    backgroundColor: isActive
                                        ? theme.colors.brand.primary
                                        : theme.colors.neutral[100],
                                    borderWidth: isActive ? 2 : 1,
                                    borderColor: isActive
                                        ? theme.colors.brand.primary
                                        : theme.colors.neutral[300],
                                    shadowColor: "#000",
                                    shadowOffset: { width: 0, height: isActive ? 2 : 0 },
                                    shadowOpacity: isActive ? 0.15 : 0,
                                    shadowRadius: isActive ? 3 : 0,
                                    elevation: isActive ? 2 : 0,
                                }
                            ]}
                        >
                            <MaterialIcons
                                name={v.icon}
                                size={20}
                                color={isActive ? "#fff" : theme.colors.neutral[700]}
                                style={{ marginRight: 6 }}
                            />
                            <Text
                                style={[
                                    {
                                        color: isActive
                                            ? "#fff"
                                            : theme.colors.neutral[800],
                                        fontWeight: isActive ? "700" : "500",
                                        letterSpacing: 0.5,
                                        textTransform: "capitalize",
                                    },
                                ]}
                            >
                                {v.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
            <Text style={{ color: theme.colors.neutral[500], marginTop: 12, fontSize: 13 }}>
                Pick one or more vibes that fit your style personality.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        marginBottom: 6,
        minWidth: 85,
        justifyContent: "center"
    },
});
