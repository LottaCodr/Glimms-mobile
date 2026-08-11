import { useTheme } from '@/provider/ThemeProvider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type OccasionSelectorProps = {
    value: string | null;
    onChange: (k: string) => void;
};

const occasions = [
    { key: "work", label: "Work", icon: "briefcase-outline" as React.ComponentProps<typeof MaterialCommunityIcons>["name"] },
    { key: "casual", label: "Casual", icon: "tshirt-crew-outline" as React.ComponentProps<typeof MaterialCommunityIcons>["name"] },
    { key: "event", label: "Event", icon: "party-popper" as React.ComponentProps<typeof MaterialCommunityIcons>["name"] },
];

export default function OccasionSelector({ value, onChange }: OccasionSelectorProps) {
    const theme = useTheme();

    return (
        <View style={{ marginBottom: 24 }}>
            <Text style={[theme.typography.h4, { marginBottom: 8 }]}>
                What's the occasion?
            </Text>
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 14,
                    marginVertical: 12,
                }}
            >
                {occasions.map((o) => {
                    const isActive = value === o.key;
                    return (
                        <Pressable
                            key={o.key}
                            onPress={() => onChange(o.key)}
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
                                    shadowOpacity: isActive ? 0.12 : 0,
                                    shadowRadius: isActive ? 4 : 0,
                                    elevation: isActive ? 1 : 0,
                                    flex: 1,
                                }
                            ]}
                        >
                            <MaterialCommunityIcons
                                name={o.icon}
                                size={22}
                                color={isActive ? "#fff" : theme.colors.neutral[700]}
                                style={{ marginBottom: 4 }}
                            />
                            <Text
                                style={{
                                    color: isActive ? "#fff" : theme.colors.neutral[700],
                                    textAlign: "center",
                                    fontSize: 15,
                                    fontWeight: isActive ? "700" : "500",
                                }}
                            >
                                {o.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    chip: {
        alignItems: "center",
        paddingVertical: 18,
        paddingHorizontal: 8,
        borderRadius: 14,
        minWidth: 80,
        flexDirection: "column",
    },
});