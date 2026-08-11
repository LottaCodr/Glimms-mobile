import * as Calendar from "expo-calendar";

export async function getNextEvent() {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") return null;

    const calendar = await Calendar.getCalendarsAsync();
    const primary = calendar.find(c => c.allowsModifications)

    const now = new Date();
    const end = new Date();

    const events = await Calendar.getEventsAsync(
        [primary!.id],
        now,
        end
    );

    return events[0] ?? null;
}