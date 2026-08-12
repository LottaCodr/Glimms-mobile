/**
 * Preferences editor (guide §7/§16.8): occupation, style goals, occasions,
 * cultural context and location — saved with PUT /api/users/me/preferences
 * (upsert + merge, safe to call repeatedly).
 */
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { Colors, Radius, Spacing } from "@/theme";
import { Chip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { userService } from "@/services/user.service";
import { toast } from "@/store/toast.store";
import type { UserLocation } from "@/types/api";

const OCCUPATIONS = ["designer", "student", "professional", "creative", "entrepreneur", "other"];
const STYLE_GOALS = ["minimalist", "professional", "comfortable", "bold", "classic", "streetwear"];
const OCCASIONS = ["work", "casual", "events", "wedding", "travel", "gym"];
const CULTURES = [
    { id: "west_africa", label: "West Africa" },
    { id: "south_asian", label: "South Asian" },
    { id: "east_asian", label: "East Asian" },
    { id: "european", label: "European" },
    { id: "global", label: "Global" },
];

function toggle(list: string[], v: string) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function PreferencesScreen() {
    const router = useRouter();
    const qc = useQueryClient();

    const prefsQuery = useQuery({
        queryKey: ["preferences", "me"],
        queryFn: () => userService.getPreferences(),
    });

    const [occupation, setOccupation] = useState<string | null>(null);
    const [styleGoals, setStyleGoals] = useState<string[]>([]);
    const [occasions, setOccasions] = useState<string[]>([]);
    const [culture, setCulture] = useState<string | null>(null);
    const [location, setLocation] = useState<UserLocation | null>(null);
    const [cityDraft, setCityDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [locating, setLocating] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    // Seed local form state from the fetched preferences exactly once.
    useEffect(() => {
        const d = prefsQuery.data;
        if (d && "id" in d && !hydrated) {
            queueMicrotask(() => {
                setOccupation(d.occupation);
                setStyleGoals(d.styleGoals ?? []);
                setOccasions(d.occasions ?? []);
                setCulture(d.culturalCtx);
                setLocation(d.location ?? null);
                setCityDraft(d.location?.city ?? "");
                setHydrated(true);
            });
        }
    }, [prefsQuery.data, hydrated]);

    const useCurrentLocation = async () => {
        setLocating(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                toast.warning("Location permission denied — recommendations will use a neutral climate");
                return;
            }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            let city = cityDraft;
            let country: string | undefined;
            try {
                const [place] = await Location.reverseGeocodeAsync({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                });
                city = place?.city ?? city;
                country = place?.country ?? undefined;
            } catch {
                /* reverse geocode is best-effort */
            }
            setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: city || undefined, country });
            if (city) setCityDraft(city);
            toast.success("Location updated");
        } catch {
            toast.error("Couldn't get your location");
        } finally {
            setLocating(false);
        }
    };

    const save = async () => {
        if (saving) return;
        setSaving(true);
        try {
            await userService.savePreferences({
                occupation,
                styleGoals,
                occasions,
                culturalCtx: culture,
                // Omit location entirely if never granted — backend climate fallback applies.
                ...(location ? { location } : {}),
            });
            await qc.invalidateQueries({ queryKey: ["preferences", "me"] });
            toast.success("Preferences saved");
            router.back();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't save — please try again");
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            {/* Header */}
            <View style={styles.header}>
                <IconButton icon="close" accessibilityLabel="Close" onPress={() => router.back()} />
                <Text style={styles.headerTitle}>Style Preferences</Text>
                <View style={{ width: 38 }} />
            </View>

            {prefsQuery.isLoading ? (
                <View style={{ padding: Spacing.lg, gap: 14 }}>
                    {[40, 64, 120, 120, 90].map((h, i) => (
                        <Skeleton key={i} height={h} borderRadius={Radius.md} />
                    ))}
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Occupation */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>OCCUPATION</Text>
                        <View style={styles.chips}>
                            {OCCUPATIONS.map((o) => (
                                <Chip
                                    key={o}
                                    label={o.charAt(0).toUpperCase() + o.slice(1)}
                                    selected={occupation === o}
                                    onPress={() => setOccupation(occupation === o ? null : o)}
                                />
                            ))}
                        </View>
                    </View>

                    {/* Style goals */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>STYLE GOALS</Text>
                        <View style={styles.chips}>
                            {STYLE_GOALS.map((s) => (
                                <Chip
                                    key={s}
                                    label={s.charAt(0).toUpperCase() + s.slice(1)}
                                    selected={styleGoals.includes(s)}
                                    onPress={() => setStyleGoals((l) => toggle(l, s))}
                                />
                            ))}
                        </View>
                    </View>

                    {/* Occasions */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>OCCASIONS</Text>
                        <View style={styles.chips}>
                            {OCCASIONS.map((o) => (
                                <Chip
                                    key={o}
                                    label={o.charAt(0).toUpperCase() + o.slice(1)}
                                    selected={occasions.includes(o)}
                                    onPress={() => setOccasions((l) => toggle(l, o))}
                                />
                            ))}
                        </View>
                    </View>

                    {/* Cultural context */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>CULTURAL CONTEXT</Text>
                        <View style={styles.chips}>
                            {CULTURES.map((c) => (
                                <Chip
                                    key={c.id}
                                    label={c.label}
                                    selected={culture === c.id}
                                    onPress={() => setCulture(culture === c.id ? null : c.id)}
                                />
                            ))}
                        </View>
                    </View>

                    {/* Location */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>LOCATION — CLIMATE-AWARE STYLING</Text>
                        <View style={styles.locRow}>
                            <TextInput
                                value={cityDraft}
                                onChangeText={setCityDraft}
                                onBlur={async () => {
                                    const v = cityDraft.trim();
                                    if (!v) return;
                                    try {
                                        const [hit] = await Location.geocodeAsync(v);
                                        if (hit) {
                                            const parts = v.split(",");
                                            setLocation({
                                                lat: hit.latitude,
                                                lon: hit.longitude,
                                                city: parts[0]?.trim() || undefined,
                                                country: parts[1]?.trim() || undefined,
                                            });
                                        }
                                    } catch {
                                        /* keep typing */
                                    }
                                }}
                                placeholder="City — e.g. Lagos, Nigeria"
                                placeholderTextColor={Colors.dim}
                                style={styles.locInput}
                                autoCapitalize="words"
                                returnKeyType="done"
                            />
                            <IconButton
                                icon={locating ? "sync-outline" : "navigate-outline"}
                                accessibilityLabel="Use current location"
                                onPress={useCurrentLocation}
                                style={{ backgroundColor: Colors.goldGlow, borderColor: "rgba(191,146,69,0.3)" }}
                                color={Colors.gold}
                            />
                        </View>
                        {location && (
                            <Text style={styles.locMeta}>
                                {Math.abs(location.lat).toFixed(2)}°{location.lat >= 0 ? "N" : "S"},{" "}
                                {Math.abs(location.lon).toFixed(2)}°{location.lon >= 0 ? "E" : "W"}
                                {location.city ? ` · ${location.city}` : ""}
                            </Text>
                        )}
                    </View>

                    <PrimaryButton
                        label={saving ? "Saving…" : "Save preferences"}
                        onPress={save}
                        loading={saving}
                        icon="checkmark"
                        style={{ marginTop: Spacing.lg }}
                    />
                    {saving && <ActivityIndicator color={Colors.gold} style={{ marginTop: 10 }} />}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    headerTitle: { fontSize: 15, fontWeight: "600", color: Colors.text },
    scroll: { padding: Spacing.lg, paddingBottom: 60 },
    section: { marginBottom: Spacing.lg },
    sectionLabel: {
        fontSize: 10,
        letterSpacing: 1.6,
        color: Colors.mid,
        fontWeight: "700",
        marginBottom: 10,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    locRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    locInput: {
        flex: 1,
        height: 46,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.md,
        color: Colors.text,
        fontSize: 14,
    },
    locMeta: { color: Colors.dim, fontSize: 11, marginTop: 8 },
});
