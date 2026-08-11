import { FloatingAIButton } from "@/components/buttons/FloatingButton";
import { CategoryTabs } from "@/components/closet/CategoryTabs";
import { SearchBar } from "@/components/closet/SearchBar";
import { Screen } from "@/components/layout/Screen";
import { useTheme } from "@/provider/ThemeProvider";
import { FlatList, Text, View } from "react-native";
import { useMemo } from "react";

import { useClosetStore } from "@/store/closet.store";
import type { ClosetItem } from "@/types/closet.types";
import { ClosetItemCard } from "@/components/closet/ClosetIemCard";
import WardrobeScreen from "../screens/wardrobe";

const MOCK_ITEMS: ClosetItem[] = [
    {
        id: "1",
        name: "White T-Shirt",
        tag: "casual",
        category: "tops",
        image:
            "https://images.pexels.com/photos/428340/pexels-photo-428340.jpeg?auto=compress&w=600",
        aiEnhanced: true,
    },
    {
        id: "2",
        name: "Blue Oxford Shirt",
        tag: "formal",
        category: "tops",
        image:
            "https://images.pexels.com/photos/532220/pexels-photo-532220.jpeg?auto=compress&w=600",
        aiEnhanced: false,
    },
    {
        id: "3",
        name: "Slim Fit Jeans",
        tag: "denim",
        category: "bottoms",
        image:
            "https://images.pexels.com/photos/1598507/pexels-photo-1598507.jpeg?auto=compress&w=600",
        aiEnhanced: false,
    },
    {
        id: "4",
        name: "Black Cargo Pants",
        tag: "street",
        category: "bottoms",
        image:
            "https://images.pexels.com/photos/6311392/pexels-photo-6311392.jpeg?auto=compress&w=600",
        aiEnhanced: true,
    },
    {
        id: "5",
        name: "Minimal Sneakers",
        tag: "shoes",
        category: "shoes",
        image:
            "https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg?auto=compress&w=600",
        aiEnhanced: false,
    },
    {
        id: "6",
        name: "Classic Leather Jacket",
        tag: "outerwear",
        category: "outerwear",
        image:
            "https://images.pexels.com/photos/1040945/pexels-photo-1040945.jpeg?auto=compress&w=600",
        aiEnhanced: true,
    },
];

const ClosetScreen = () => {
    const theme = useTheme();
    const { items, activeCategory } = useClosetStore();

    // Use store items if available, otherwise fallback to mock
    const dataSource = items.length > 0 ? items : MOCK_ITEMS;

    const filtered = useMemo(() => {
        if (!activeCategory) return dataSource;

        return dataSource.filter(
            (item) => item.category === activeCategory
        );
    }, [dataSource, activeCategory]);

    return (
        <WardrobeScreen/>
    );
};

export default ClosetScreen;
