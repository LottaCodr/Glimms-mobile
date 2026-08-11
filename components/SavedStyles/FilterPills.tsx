import { useTheme } from '@/provider/ThemeProvider';
import { useSavedStylesStore } from '@/store/saveStyles';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from 'react-native-reanimated';

export default function FilterPills() {
    const theme = useTheme();
    const { filter, setFilter } = useSavedStylesStore();
    const filters = ["all", "work", "evening"];

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.container}
        >
            {filters.map((f) => {
                const isActive = filter === f;
                const scale = useSharedValue(1);

                const animatedStyle = useAnimatedStyle(() => ({
                    transform: [{ scale: scale.value }],
                    backgroundColor: withTiming(
                        isActive ? theme.colors.brand.primary : theme.colors.neutral[800],
                        { duration: 200 }
                    ),
                }));

                return (
                    <Pressable
                        key={f}
                        onPress={() => {
                            setFilter(f as any);
                        }}
                        onPressIn={() => { scale.value = withTiming(0.95, { duration: 100 }); }}
                        onPressOut={() => { scale.value = withTiming(1, { duration: 100 }); }}
                        style={{ marginRight: 12 }}
                    >
                        <Animated.View style={[styles.pill, animatedStyle]}>
                            <Text style={[
                                styles.pillText,
                                { color: isActive ? '#fff' : theme.colors.neutral[400] }
                            ]}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </Text>
                        </Animated.View>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    pill: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 999,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
    pillText: {
        fontWeight: '600',
        fontSize: 14,
        letterSpacing: 0.5,
    },
});
