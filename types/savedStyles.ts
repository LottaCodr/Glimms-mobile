export interface SavedStyle {
    id: string;
    title: string;
    image: string;
    category: "work" | "evening" | "casual";
    createdAt: string;
    liked: boolean;
}