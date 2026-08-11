import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons, MaterialIcons, Feather } from "@expo/vector-icons";
import { useTheme } from "@/provider/ThemeProvider";
import { useRouter } from "expo-router";
import NewProfileScreen from "../screens/profile";

// Explicitly type the user object to avoid circular type references
interface UserType {
  name: string;
  email: string;
  avatar: string;
  isPremium: boolean;
}

const user: UserType = {
  name: "Alex Thompson",
  email: "alex.thompson@glimms.app",
  avatar: "https://randomuser.me/api/portraits/men/32.jpg",
  isPremium: true,
};

// UX improvement: navigation helpers now show loading for transitions and route push/replace uses correct types.
function navigateTo(route: string, router: ReturnType<typeof useRouter>, setLoading: (l: boolean) => void) {
  setLoading(true);
  // simple 300ms delay for demo loading effect
  setTimeout(() => {
    // @ts-ignore - dynamic routing
    router.push(route as any);
    setLoading(false);
  }, 300);
}

const ProfileHeader = ({
  user,
  onAvatarPress,
  isLoadingAvatar,
}: {
  user: UserType;
  onAvatarPress: () => void;
  isLoadingAvatar: boolean;
}) => {
  const theme = useTheme();

  return (
    <View style={styles.headerContainer}>
      <TouchableOpacity style={{ position: "relative" }} onPress={onAvatarPress} activeOpacity={0.8}>
        <Image
          source={{ uri: user.avatar }}
          style={[
            styles.avatar,
            { borderColor: "#eaeaea", opacity: isLoadingAvatar ? 0.4 : 1 },
          ]}
        />
        <TouchableOpacity style={styles.editIconButton} onPress={onAvatarPress} activeOpacity={0.7}>
          <Feather name="edit-2" size={16} color="#fff" />
        </TouchableOpacity>
        {isLoadingAvatar && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#2666ff" />
          </View>
        )}
      </TouchableOpacity>
      <Text style={[theme.typography.h2, { marginTop: 12, fontWeight: "700" }]}>{user.name}</Text>
      <View style={styles.emailRow}>
        <Ionicons name="mail-outline" size={16} color={theme.colors.neutral[400]} style={{ marginRight: 4, top: 2 }} />
        <Text style={[theme.typography.caption, { color: theme.colors.neutral[500], marginBottom: 8 }]}>
          {user.email}
        </Text>
      </View>
      {user.isPremium && (
        <View style={styles.premiumBadge}>
          <Text style={[theme.typography.caption, { color: "#2666ff", fontWeight: "700" }]}>PREMIUM MEMBER</Text>
        </View>
      )}
    </View>
  );
};

type SectionItem = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  color?: string;
  info?: string; // Add optional quick info subtitle
  disabled?: boolean;
};

function Section({ title, items }: { title: string; items: SectionItem[] }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text
        style={[
          theme.typography.body,
          { color: theme.colors.neutral[800], marginBottom: 10, fontWeight: "bold", fontSize: 17 },
        ]}
      >
        {title}
      </Text>
      <View style={styles.sectionCard}>
        {items.map((item, idx) => (
          <TouchableOpacity
            onPress={item.disabled ? undefined : item.onPress}
            style={[
              styles.listItem,
              idx < items.length - 1 ? styles.listItemBorder : null,
              item.disabled ? { opacity: 0.6 } : {},
            ]}
            activeOpacity={item.disabled ? 1 : 0.7}
            key={item.label}
            testID={`profile-setting-${item.label.replace(/ /g, "-").toLowerCase()}`}
            accessibilityLabel={item.label}
            accessibilityRole="button"
            disabled={item.disabled}
          >
            <View style={styles.iconLabelRow}>
              {item.icon}
              <View>
                <Text
                  style={[
                    styles.listItemText,
                    item.color ? { color: item.color, fontWeight: "700" } : null,
                  ]}
                >
                  {item.label}
                </Text>
                {/* UX: add optional info/subtitle */}
                {item.info && (
                  <Text style={styles.itemSubtitle}>{item.info}</Text>
                )}
              </View>
            </View>
            <Ionicons
              name={item.disabled ? "lock-closed-outline" : "chevron-forward"}
              size={18}
              color={item.disabled ? "#dedede" : "#bbb"}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const ProfileScreen = () => {
  const router = useRouter();
  const theme = useTheme();

  // Instead of theme.colors.primary[400], use theme.colors.brand.primary or fallback to "#2666ff"
  const primaryColor =
    (theme.colors?.brand?.primary as string) || "#2666ff";

  // UX: add loading + pull to refresh
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  // All functionalities - their handlers:
  const onNotifications = useCallback(() => {
    Alert.alert(
      "Notifications",
      "Notification preferences and controls will be available soon.",
      [{ text: "Close", style: "cancel" }]
    );
  }, []);

  const onPrivacySecurity = useCallback(() => {
    Alert.alert(
      "Privacy & Security",
      "Privacy and security settings screen coming soon.",
      [{ text: "OK" }]
    );
    // Usually: router.push({ pathname: "/screens/privacy" });
  }, []);

  const onSubscriptions = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      // @ts-ignore
      router.push("/screens/subscriptions" as any);
      setLoading(false);
    }, 400);
  }, [router]);

  const onHelpCenter = useCallback(() => {
    setLoading(true);
    Linking.openURL("https://glimms.app/help")
      .catch(() => Alert.alert("Error", "Could not open Help Center URL."))
      .finally(() => setLoading(false));
  }, []);

  const onLogout = useCallback(() => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: () => {
            setLoading(true);
            setTimeout(() => {
              // @ts-ignore
              router.replace("/auth/login" as any);
              setLoading(false);
            }, 400);
          },
        },
      ],
      { cancelable: true }
    );
  }, [router]);

  // New: handle edit avatar/profile directly, with a fake delay
  const onEditProfile = useCallback(() => {
    setAvatarLoading(true);
    setTimeout(() => {
      setAvatarLoading(false);
      Alert.alert(
        "Edit Profile",
        "Profile editing screen coming soon."
      );
    }, 640);
  }, []);

  // UX: Demo quick info for setting rows
  const settings: SectionItem[] = [
    {
      icon: <Ionicons name="notifications-outline" size={22} color="#2666ff" />,
      label: "Notifications",
      onPress: onNotifications,
      info: "Manage push alerts",
    },
    {
      icon: <Feather name="lock" size={20} color="#3dab6f" />,
      label: "Privacy & Security",
      onPress: onPrivacySecurity,
      info: "Control your privacy",
    },
    {
      icon: <MaterialIcons name="payment" size={22} color="#00b4d8" />,
      label: "Subscriptions",
      onPress: onSubscriptions,
      info: "Upgrade or manage plan",
    },
  ];

  const support: SectionItem[] = [
    {
      icon: <Feather name="help-circle" size={20} color="#999" />,
      label: "Help Center",
      onPress: onHelpCenter,
      color: "#1a1a1a",
      info: "FAQs & support",
    },
    {
      icon: <Ionicons name="log-out-outline" size={20} color="#ee444a" />,
      label: "Logout",
      onPress: onLogout,
      color: "#ee444a",
      info: "Sign out of your account",
    },
  ];

  // UX improvement: Pull to refresh simulation
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 650);
  }, []);

  return (
    <NewProfileScreen />
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    alignItems: "center",
    marginBottom: 30,
    position: "relative",
  },
  avatar: {
    width: 94,
    height: 94,
    borderRadius: 48,
    borderWidth: 4,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 94,
    height: 94,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
    zIndex: 2,
  },
  editIconButton: {
    position: "absolute",
    right: 0,
    bottom: 0,
    backgroundColor: "#2666ff",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 3,
    shadowColor: "#2666ff",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 2,
    elevation: 2,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  premiumBadge: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "#e8f0fe",
    alignSelf: "center",
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 30,
  },
  sectionCard: {
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ededed",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: "space-between",
    backgroundColor: "transparent",
  },
  listItemBorder: {
    borderBottomWidth: 1,
    borderColor: "#ececec",
  },
  iconLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  listItemText: {
    marginLeft: 13,
    fontSize: 16,
    fontWeight: "500",
    color: "#191919",
  },
  itemSubtitle: {
    marginLeft: 13,
    marginTop: 3,
    color: "#929292",
    fontSize: 13,
    fontWeight: "400",
  },
  absoluteLoadingOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(255,255,255,0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
});

export default ProfileScreen;