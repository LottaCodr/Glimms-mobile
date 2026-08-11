import { HeroRecommendationCard } from "@/components/home/HeroRecommendationCard";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HeroRecommendationCarousel } from "@/components/home/RecommendationCarousel";
import TrendingCard from "@/components/home/TrendingCard";
import { Screen } from "@/components/layout/Screen";
import { useTheme } from "@/provider/ThemeProvider";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NewHomeScreen from "../screens/home";

export default function HomeScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    const HEADER_HEIGHT = 40 + insets.top;

    return (

        <NewHomeScreen/>
        
        // <Screen padded={false}>
        //     {/* FIXED HEADER */}
        //     {/* <HomeHeader /> */}

        //     {/* SCROLLABLE CONTENT */}
        //     {/* <ScrollView
        //         showsVerticalScrollIndicator={false}
        //         bounces
        //         contentContainerStyle={{
        //             paddingTop: HEADER_HEIGHT,
        //             // prevents content hiding under header
        //             paddingBottom: theme.spacing[10],
        //         }}
        //     > */}
                
                   
                
        //     {/* </ScrollView> */}
        // </Screen>
    );
}
