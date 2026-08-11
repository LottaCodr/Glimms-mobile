import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/provider/ThemeProvider";
import { useClosetStore } from "@/store/closet.store";

const categories = [
    { key: "tops", label: "Tops" },
    { key: "bottoms", label: "Bottoms" },
    { key: "shoes", label: "Shoes" },
    { key: "outerwear", label: "Outerwear" },
];

export function CategoryTabs() {
    const theme = useTheme();
    const { activeCategory, setCategory } = useClosetStore();

    return (
        <View
            style={{
                flexDirection: "row",
                gap: theme.spacing[4],
                paddingHorizontal: theme.spacing[4],
            }}
        >
            {categories.map((cat) => {
                const active = activeCategory === cat.key;

                return (
                    <Pressable key={cat.key} onPress={() => setCategory(cat.key as any)}>
                        <Text
                            style={{
                                ...theme.typography.bodyMedium,
                                color: active
                                    ? theme.colors.brand.primary
                                    : theme.colors.neutral[500],
                            }}
                        >
                            {cat.label}
                        </Text>

                        {active && (
                            <View
                                style={{
                                    height: 2,
                                    backgroundColor: theme.colors.brand.primary,
                                    marginTop: theme.spacing[1],
                                }}
                            />
                        )}
                    </Pressable>
                );
            })}
        </View>
    );
}
