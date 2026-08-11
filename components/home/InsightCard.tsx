import { View, Text } from 'react-native'
import React from 'react'
import { ItemCard } from '../cards/ItemCard'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from "@/provider/ThemeProvider";


export default function InsightCard() {
    const theme = useTheme();

  return (
      <View style={{ marginTop: theme.spacing[6], paddingHorizontal: theme.spacing[4] }}>
          <ItemCard>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Ionicons name="analytics-outline" size={22} />
                  <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "600" }}>
                          Color Psychology Insight
                      </Text>
                      <Text style={{ marginTop: 4, fontSize: 13 }}>
                          Wearing darker tones like navy and charcoal for today’s review
                          will project authority and stability, increasing confidence by
                          an estimated <Text style={{ color: theme.colors.brand.primary }}>14%</Text>.
                      </Text>
                  </View>
              </View>
          </ItemCard>
      </View>
  )
}