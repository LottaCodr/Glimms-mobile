import { useTheme } from '@/provider/ThemeProvider';
import { Text, View, Pressable } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

type WeatherOption = {
    key: string;
    label: string;
    icon: React.ComponentProps<typeof MaterialIcons>['name'] | React.ComponentProps<typeof Ionicons>['name'] | React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    iconSet?: 'MaterialIcons' | 'MaterialCommunityIcons' | 'Ionicons';
};
const weatherOptions: WeatherOption[] = [
    { key: "sunny", label: "Sunny", icon: "wb-sunny", iconSet: "MaterialIcons" },
    { key: "cloudy", label: "Cloudy", icon: "cloud", iconSet: "MaterialIcons" },
    { key: "rainy", label: "Rainy", icon: "rainy-outline", iconSet: "Ionicons" },
    { key: "snow", label: "Snow", icon: "weather-snowy", iconSet: "MaterialCommunityIcons" },
];

export type WeatherValue = string | null;

type WeatherCardProps = {
    value: WeatherValue;
    onChange: (next: WeatherValue) => void;
};

export default function WeatherCard({ value, onChange }: WeatherCardProps) {
    const theme = useTheme();
    const isDark = theme.mode !== "light";

    const cardBg = isDark
        ? theme.colors.neutral[900]
        : theme.colors.neutral[50] || "#fff";
    const accent = theme.colors.brand.primary;
    const borderColor = isDark ? theme.colors.neutral[700] : theme.colors.neutral[200];
    const captionColor = isDark ? "#fff" : accent;
    const mainTextColor = isDark ? "#fff" : "#181818";
    const bodyTextColor = isDark ? theme.colors.neutral[200] : theme.colors.neutral[800];

    const getWeatherPreview = (key: string | null) => {
        switch (key) {
            case "sunny":
                return { temp: "72°F", desc: "Sunny", preview: "Perfect for light layers today." };
            case "cloudy":
                return { temp: "67°F", desc: "Cloudy", preview: "A light jacket works well." };
            case "rainy":
                return { temp: "63°F", desc: "Rainy", preview: "Pack an umbrella or waterproof!" };
            case "snow":
                return { temp: "35°F", desc: "Snow", preview: "Bundle up—layers recommended." };
            default:
                return { temp: "--", desc: "Pick weather", preview: "Select the weather right now." };
        }
    };

    const preview = getWeatherPreview(value);

    return (
        <View
            style={{
                backgroundColor: cardBg,
                padding: theme.spacing[4],
                borderRadius: theme.radius.lg,
                marginVertical: theme.spacing[4],
                borderWidth: 1,
                borderColor: borderColor,
            }}
        >
            <Text
                style={[
                    theme.typography.caption,
                    {
                        color: captionColor,
                        letterSpacing: 1,
                        fontWeight: "700",
                        marginBottom: 2,
                    }
                ]}
            >
                LOCAL WEATHER
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                {/* Icon */}
                <View
                    style={{
                        backgroundColor: accent,
                        borderRadius: 50,
                        width: 56,
                        height: 56,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: theme.spacing[3],
                    }}
                >
                    {value
                        ? (() => {
                            const opt = weatherOptions.find(o => o.key === value);
                            if (!opt) return null;
                            if (opt.iconSet === 'MaterialIcons')
                                return <MaterialIcons name={opt.icon as any} size={32} color="#fff" />;
                            if (opt.iconSet === 'Ionicons')
                                return <Ionicons name={opt.icon as any} size={32} color="#fff" />;
                            if (opt.iconSet === 'MaterialCommunityIcons')
                                return <MaterialCommunityIcons name={opt.icon as any} size={32} color="#fff" />;
                            return null;
                        })()
                        : <MaterialIcons name="wb-sunny" size={32} color="#fff" />
                    }
                </View>
                <View style={{flex: 1}}>
                    <Text
                        style={[
                            theme.typography.h2,
                            {
                                fontWeight: '800',
                                marginBottom: 3,
                                color: mainTextColor,
                            }
                        ]}
                    >
                        {preview.temp} | {preview.desc}
                    </Text>
                    <Text
                        style={[
                            theme.typography.body,
                            { color: bodyTextColor }
                        ]}
                    >
                        {preview.preview}
                    </Text>
                </View>
            </View>
            {/* Options */}
            <View style={{
                flexDirection: 'row',
                gap: 14,
                marginTop: theme.spacing[3],
                justifyContent: 'center',
            }}>
                {weatherOptions.map(opt => {
                    const isActive = value === opt.key;
                    const activeBg = isActive ? accent : (isDark ? theme.colors.neutral[800] : theme.colors.neutral[100]);
                    const activeColor = isActive ? "#fff" : (isDark ? "#eee" : "#444");
                    return (
                        <Pressable
                            key={opt.key}
                            onPress={() => onChange(opt.key)}
                            style={{
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: activeBg,
                                borderRadius: 28,
                                width: 56,
                                height: 56,
                                borderWidth: isActive ? 2 : 1,
                                borderColor: isActive ? accent : (isDark ? theme.colors.neutral[700] : theme.colors.neutral[200]),
                                marginHorizontal: 2,
                                shadowColor: "#000",
                                shadowOffset: { width: 0, height: isActive ? 2 : 0 },
                                shadowOpacity: isActive ? 0.12 : 0,
                                shadowRadius: isActive ? 4 : 0,
                                elevation: isActive ? 1 : 0,
                            }}
                        >
                            {/* Render icon */}
                            {opt.iconSet === 'MaterialIcons' && (
                                <MaterialIcons name={opt.icon as any} size={28} color={activeColor} />
                            )}
                            {opt.iconSet === 'Ionicons' && (
                                <Ionicons name={opt.icon as any} size={28} color={activeColor} />
                            )}
                            {opt.iconSet === 'MaterialCommunityIcons' && (
                                <MaterialCommunityIcons name={opt.icon as any} size={28} color={activeColor} />
                            )}
                            <Text style={[
                                theme.typography.caption,
                                {
                                    color: activeColor,
                                    fontWeight: "600",
                                    fontSize: 14,
                                    marginTop: 2,
                                }
                            ]}>
                                {opt.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}