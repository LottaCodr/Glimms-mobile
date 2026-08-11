import { register } from "@/services/auth.services";
import { useAuthStore } from "@/store/auth.store";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useNavigation, useTheme } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Register() {
    const setUser = useAuthStore((s) => s.setUser);
    const navigation = useNavigation();
    const { colors } = useTheme();

    const [form, setForm] = useState({ email: "", password: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleInput = (field: string, value: string) => {
        setForm({ ...form, [field]: value });
    };

    const handleSubmit = async () => {
        if (!form.email || !form.password) {
            setError("Please fill in all fields");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const user = await register(form);
            await setUser(user);
            router.replace("/(tabs)/home")
        } catch (err: any) {
            setError(err?.message || "Registration failed");
        }

        setLoading(false);
    };

    // Fake handlers for Google/Apple sign up
    const handleGoogle = () => { };
    const handleApple = () => { };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f6f8" }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContainer}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.formBox}>
                        {/* Icon */}
                        <View style={styles.logoIconWrap}>
                            <View style={styles.iconBackground}>
                                <Ionicons name="star" size={30} color="#2A7BF6" />
                            </View>
                        </View>

                        {/* Headings */}
                        <Text style={styles.header}>Create your account</Text>
                        <Text style={styles.subhead}>Sign up to start styling</Text>

                        {/* Email Input */}
                        <View style={{ marginTop: 24 }}>
                            <Text style={styles.inputLabel}>Email Address</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Enter your email"
                                placeholderTextColor="#B7B7B7"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={form.email}
                                onChangeText={(t) => handleInput("email", t)}
                                autoCorrect={false}
                                returnKeyType="next"
                            />
                        </View>

                        {/* Password Input */}
                        <View style={{ marginTop: 18 }}>
                            <View style={styles.pwRow}>
                                <Text style={styles.inputLabel}>Password</Text>
                            </View>
                            <View>
                                <TextInput
                                    style={[styles.textInput, { paddingRight: 38 }]}
                                    placeholder="Enter your password"
                                    placeholderTextColor="#B7B7B7"
                                    secureTextEntry={!showPassword}
                                    autoCapitalize="none"
                                    value={form.password}
                                    onChangeText={(t) => handleInput("password", t)}
                                    autoCorrect={false}
                                    returnKeyType="done"
                                    onSubmitEditing={handleSubmit}
                                />
                                <TouchableOpacity
                                    onPress={() => setShowPassword((v) => !v)}
                                    style={styles.pwIcon}
                                    hitSlop={10}
                                >
                                    <Ionicons
                                        name={showPassword ? "eye-off" : "eye"}
                                        size={22}
                                        color="#B7B7B7"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Error */}
                        {error ? (
                            <Text style={styles.errorText}>{error}</Text>
                        ) : null}

                        {/* Primary Sign up button */}
                        <TouchableOpacity
                            style={[
                                styles.signInButton,
                                loading && { opacity: 0.7 }
                            ]}
                            onPress={handleSubmit}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.signInButtonText}>Sign Up</Text>
                            )}
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.orDividerBlock}>
                            <View style={styles.orDivider} />
                            <Text style={styles.orText}>OR</Text>
                            <View style={styles.orDivider} />
                        </View>

                        {/* Social buttons */}
                        <TouchableOpacity
                            style={styles.socialButton}
                            activeOpacity={0.85}
                            onPress={handleGoogle}
                        >
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%" }}>
                                <FontAwesome name="google" size={22} style={{ marginRight: 10 }} color="#EA4335" />
                                <Text style={styles.socialText}>Continue with Google</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.socialButton, styles.appleButton]}
                            activeOpacity={0.85}
                            onPress={handleApple}
                        >
                            <View style={styles.socialInnerWrap}>
                                <Ionicons name="logo-apple" size={23} color="#fff" style={{ marginRight: 10 }} />
                                <Text style={[styles.socialText, { color: "#fff" }]}>Continue with Apple</Text>
                            </View>
                        </TouchableOpacity>

                        {/* Bottom: Already have an account */}
                        <View style={styles.bottomRow}>
                            <Text style={styles.bottomText}>Already have an account?</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    router.replace("/login")
                                }}
                            >
                                <Text style={styles.createAccountLink}> Log In</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// Only keep purely layout-related or static styles in StyleSheet
const styles = StyleSheet.create({
    scrollContainer: {
        flexGrow: 1,
        justifyContent: "center",
        backgroundColor: "#f5f6f8",
        paddingVertical: 20,
    },
    formBox: {
        paddingVertical: 38,
        paddingHorizontal: 22,
        backgroundColor: "#fff",
        borderRadius: 13,
        marginHorizontal: 14,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
        alignItems: "stretch",
    },
    logoIconWrap: {
        alignItems: "center",
        marginBottom: 15,
    },
    iconBackground: {
        width: 46,
        height: 46,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ecf3fd",
        marginBottom: 0,
    },
    header: {
        fontSize: 23,
        fontWeight: "700",
        textAlign: "center",
        marginTop: 4,
        color: "#101828",
    },
    subhead: {
        fontSize: 13,
        color: "#7D8592",
        marginTop: 7,
        textAlign: "center",
        fontWeight: "500",
        marginBottom: 8,
    },
    inputLabel: {
        fontSize: 13,
        color: "#232A3D",
        fontWeight: "500",
        marginBottom: 5,
        marginLeft: 1,
    },
    textInput: {
        borderColor: "#E5E7EB",
        borderWidth: 1,
        borderRadius: 7,
        backgroundColor: "#F9FAFB",
        fontSize: 15,
        paddingVertical: 12,
        paddingHorizontal: 13,
        color: "#232A3D",
        marginBottom: 0,
    },
    pwRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
    },
    pwIcon: {
        position: "absolute",
        right: 10,
        top: 13,
    },
    errorText: {
        color: "#E03232",
        textAlign: "center",
        marginTop: 10,
        marginBottom: 0,
        fontSize: 13,
    },
    signInButton: {
        marginTop: 22,
        backgroundColor: "#297AF6",
        borderRadius: 7,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 13,
        shadowColor: "#1e90ff",
        shadowOpacity: 0.07,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 1 },
    },
    signInButtonText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 16,
        letterSpacing: 0.2,
    },
    orDividerBlock: {
        flexDirection: "row",
        alignItems: "center",
        marginVertical: 23,
    },
    orDivider: {
        flex: 1,
        height: 1,
        backgroundColor: "#E5E7EB",
    },
    orText: {
        marginHorizontal: 14,
        color: "#B7B7B7",
        fontWeight: "600",
        fontSize: 13,
    },
    socialButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 7,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#e5e7eb",
        marginBottom: 12,
    },
    appleButton: {
        backgroundColor: "#111212",
        borderWidth: 0,
        marginBottom: 0,
    },
    socialInnerWrap: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
    },
    socialText: {
        color: "#232A3D",
        fontWeight: "600",
        fontSize: 15,
        textAlign: "center",
    },
    bottomRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 24,
        borderTopWidth: 1,
        borderColor: "#f2f3f5",
        paddingTop: 15,
    },
    bottomText: {
        color: "#A7ABB3",
        fontSize: 13,
        fontWeight: "500",
    },
    createAccountLink: {
        fontWeight: "600",
        fontSize: 13,
        color: "#297AF6",
    },
});