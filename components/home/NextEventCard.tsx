import { View, Text } from 'react-native'
import React from 'react'
import { useTheme } from "@/provider/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { ItemCard } from '../cards/ItemCard';

export default function NextEventCard() {
    const theme = useTheme();

  return (
      <View style={{ marginTop: theme.spacing[5], paddingHorizontal: theme.spacing[4] }}>
          <ItemCard>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Ionicons name="calendar-outline" size={22} />
                  <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: theme.colors.brand.primary }}>
                          NEXT EVENT
                      </Text>
                      <Text style={{ fontWeight: "600" }}>
                          2:00 PM • Quarterly Review
                      </Text>
                  </View>
                  <Ionicons name="chevron-forward" />
              </View>
          </ItemCard>
      </View>

  )
}