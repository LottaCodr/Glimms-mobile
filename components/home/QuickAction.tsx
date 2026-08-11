import { View, Text } from 'react-native'
import React from 'react'
import { useTheme } from "@/provider/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";

export default function QuickAction() {
    const theme = useTheme();

  return (
      <View
          style={{
              flexDirection: "row",
              justifyContent: "space-around",
              marginTop: theme.spacing[5],
          }}
      >
          {[
              { icon: "camera", label: "Scan" },
              { icon: "cube", label: "Space" },
              { icon: "sparkles", label: "Stylist" },
              { icon: "trending-up", label: "Trends" },
          ].map((item) => (
              <View key={item.label} style={{ alignItems: "center" }}>
                  <View
                      style={{
                          width: 56,
                          height: 56,
                          borderRadius: theme.radius.full,
                          backgroundColor: theme.colors.neutral[100],
                          alignItems: "center",
                          justifyContent: "center",
                      }}
                  >
                      <Ionicons name={item.icon as any} size={22} />
                  </View>
                  <Text style={{ marginTop: 6, fontSize: 12 }}>{item.label}</Text>
              </View>
          ))}
      </View>
  )
}