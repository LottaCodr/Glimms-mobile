

export type ClosetCategory = "tops" | "bottoms" | "shoes" | "outerwear";

export type ClosetItem = {
    id: string;
    name: string;
    tag: string;
    image: string;
    category: ClosetCategory;
    aiEnhanced?: boolean;
};