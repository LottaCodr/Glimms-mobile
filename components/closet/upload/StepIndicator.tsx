import React from "react";
import { View } from "react-native";
import { Colors, Radius } from "@/theme";

const STEPS = 5;

export function StepIndicator({ step }: { step: number }) {
    return (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
            {Array.from({ length: STEPS }).map((_, i) => {
                const active = i + 1 === step;
                const done = i + 1 < step;
                return (
                    <View
                        key={i}
                        style={{
                            height: 6,
                            borderRadius: Radius.full,
                            flexGrow: active ? 2 : 1,
                            backgroundColor: active ? Colors.gold : done ? Colors.goldL : Colors.card2,
                        }}
                    />
                );
            })}
        </View>
    );
}
