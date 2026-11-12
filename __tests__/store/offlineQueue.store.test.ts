import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { uploadService } from "@/services/upload.service";
import { useOfflineQueueStore } from "@/store/offlineQueue.store";

jest.mock("@/services/upload.service", () => ({
    uploadService: { uploadQueued: jest.fn() },
}));

const uploadQueued = uploadService.uploadQueued as jest.Mock;
const STORAGE_KEY = "glimms:offline_queue";
const scan = (uri: string) => ({ uris: [uri], vertical: "wardrobe" as const, options: { occasion: "work" } });
const stored = async () => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
const queue = () => useOfflineQueueStore.getState();

beforeEach(async () => {
    await AsyncStorage.clear();
    useOfflineQueueStore.setState({ items: [], hydrated: false });
    uploadQueued.mockResolvedValue({ kind: "session", sessionId: "s" });
});

it("persists queued scans so they survive an app restart", async () => {
    await queue().enqueue(scan("file:///a.jpg"));
    await queue().enqueue(scan("file:///b.jpg"));

    expect((await stored()).map((i: any) => i.uris[0])).toEqual(["file:///a.jpg", "file:///b.jpg"]);

    useOfflineQueueStore.setState({ items: [], hydrated: false }); // "restart"
    await queue().hydrate();
    expect(queue().items).toHaveLength(2);
    expect(queue().hydrated).toBe(true);
});

it("starts empty when the stored queue is unreadable", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "{not json");
    await queue().hydrate();
    expect(queue()).toMatchObject({ items: [], hydrated: true });
});

it("uploads queued scans in order and empties the queue", async () => {
    await queue().enqueue(scan("file:///a.jpg"));
    await queue().enqueue(scan("file:///b.jpg"));

    await queue().flush();

    expect(uploadQueued.mock.calls.map((c) => c[0][0])).toEqual(["file:///a.jpg", "file:///b.jpg"]);
    expect(uploadQueued).toHaveBeenCalledWith(["file:///a.jpg"], "wardrobe", { occasion: "work" });
    expect(queue().items).toEqual([]);
    expect(await stored()).toEqual([]);
});

const serverError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const offline = () => Object.assign(new Error("Network Error"), { status: 0, isNetworkError: true });

it("keeps a scan the server failed on and still sends the rest", async () => {
    await queue().enqueue(scan("file:///a.jpg"));
    await queue().enqueue(scan("file:///b.jpg"));
    uploadQueued.mockRejectedValueOnce(serverError(503));

    await queue().flush();

    expect(queue().items.map((i) => i.uris[0])).toEqual(["file:///a.jpg"]);
    expect((await stored()).map((i: any) => [i.uris[0], i.attempts])).toEqual([["file:///a.jpg", 1]]);
});

it("stops, keeping everything, when the connection drops mid-flush", async () => {
    await queue().enqueue(scan("file:///a.jpg"));
    await queue().enqueue(scan("file:///b.jpg"));
    uploadQueued.mockRejectedValueOnce(offline());

    await queue().flush();

    expect(uploadQueued).toHaveBeenCalledTimes(1);
    expect(queue().items.map((i) => [i.uris[0], i.attempts])).toEqual([["file:///a.jpg", 0], ["file:///b.jpg", 0]]);
});

it("gives up on a scan after five failed uploads instead of retrying forever", async () => {
    await queue().enqueue(scan("file:///a.jpg"));
    uploadQueued.mockRejectedValue(serverError(500));

    for (let i = 0; i < 4; i++) await queue().flush();
    expect(queue().items).toHaveLength(1);

    await queue().flush();
    expect(queue().items).toEqual([]);
    expect(await stored()).toEqual([]);
    expect(uploadQueued).toHaveBeenCalledTimes(5);
});

it.each([400, 403, 413, 422])("drops a scan the server refuses with %i straight away", async (status) => {
    await queue().enqueue(scan("file:///bad.jpg"));
    await queue().enqueue(scan("file:///good.jpg"));
    uploadQueued.mockRejectedValueOnce(serverError(status));

    await queue().flush();

    expect(queue().items).toEqual([]);
    expect(uploadQueued).toHaveBeenCalledTimes(2);
});

it("keeps only the newest twenty scans", async () => {
    for (let i = 0; i < 23; i++) await queue().enqueue(scan(`file:///${i}.jpg`));
    expect(queue().items).toHaveLength(20);
    expect(queue().items[0].uris[0]).toBe("file:///3.jpg");
});

it("ignores stored entries that are not usable scans", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([null, { id: "x" }, { id: "ok", uris: ["file:///a.jpg"], vertical: "wardrobe", options: {} }]));
    await queue().hydrate();
    expect(queue().items.map((i) => i.id)).toEqual(["ok"]);

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));
    useOfflineQueueStore.setState({ items: [], hydrated: false });
    await queue().hydrate();
    expect(queue().items).toEqual([]);
});

it("does not upload the same scan twice when flushes overlap", async () => {
    await queue().enqueue(scan("file:///a.jpg"));

    await Promise.all([queue().flush(), queue().flush()]);

    expect(uploadQueued).toHaveBeenCalledTimes(1);
});

it("flushes when connectivity returns, and only when there is something queued", async () => {
    const addListener = NetInfo.addEventListener as jest.Mock;
    const unsubscribe = jest.fn();
    addListener.mockReturnValue(unsubscribe);

    const stop = queue().startAutoFlush();
    const onChange = addListener.mock.calls[0][0];

    onChange({ isConnected: true });
    expect(uploadQueued).not.toHaveBeenCalled();

    await queue().enqueue(scan("file:///a.jpg"));
    onChange({ isConnected: false });
    expect(uploadQueued).not.toHaveBeenCalled();

    onChange({ isConnected: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(uploadQueued).toHaveBeenCalledTimes(1);

    stop();
    expect(unsubscribe).toHaveBeenCalled();
});
