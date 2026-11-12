/**
 * Test doubles for native modules that have no JS implementation under Jest.
 * Everything here is device plumbing; app logic is exercised for real.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
    require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@react-native-community/netinfo", () => ({
    __esModule: true,
    default: {
        fetch: jest.fn(async () => ({ isConnected: true })),
        addEventListener: jest.fn(() => jest.fn()),
    },
}));

jest.mock("expo-secure-store", () => {
    const values = new Map<string, string>();
    return {
        __reset: () => values.clear(),
        getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
        setItemAsync: jest.fn(async (key: string, value: string) => void values.set(key, value)),
        deleteItemAsync: jest.fn(async (key: string) => void values.delete(key)),
    };
});

jest.mock("expo-web-browser", () => ({
    openBrowserAsync: jest.fn(async () => ({ type: "opened" })),
    openAuthSessionAsync: jest.fn(async () => ({ type: "dismiss" })),
    maybeCompleteAuthSession: jest.fn(),
}));

// Icon fonts load asynchronously on a device; in tests an icon is just its name.
jest.mock("@expo/vector-icons", () => {
    const { Text } = require("react-native");
    const icon = ({ name }: { name?: string }) => require("react").createElement(Text, null, name ?? "");
    return new Proxy({ __esModule: true }, { get: (target: any, key) => (key in target ? target[key] : icon) });
});

jest.mock("react-native-safe-area-context", () =>
    require("react-native-safe-area-context/jest/mock").default,
);

// Animations run on a native thread; under Jest they resolve instantly.
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
    ...require("react-native-reanimated/mock"),
    useReducedMotion: () => false,
}));

jest.mock("expo-haptics", () => ({
    impactAsync: jest.fn(async () => {}),
    notificationAsync: jest.fn(async () => {}),
    selectionAsync: jest.fn(async () => {}),
    ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
    NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));
