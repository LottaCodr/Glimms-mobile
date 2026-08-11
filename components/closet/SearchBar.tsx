import { View, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/provider/ThemeProvider";

export function SearchBar() {
    const theme = useTheme();

    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: theme.colors.neutral[100],
                borderRadius: 999,
                paddingHorizontal: theme.spacing[4],
                height: 44,
                marginHorizontal: theme.spacing[4],
            }}
        >
            <Ionicons
                name="search"
                size={18}
                color={theme.colors.neutral[500]}
            />
            <TextInput
                placeholder="Search your pieces..."
                placeholderTextColor={theme.colors.neutral[400]}
                style={{
                    marginLeft: theme.spacing[2],
                    flex: 1,
                    ...theme.typography.body,
                }}
            />
        </View>
    );
}
