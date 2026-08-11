import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";

// --- Styles ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#f1f1f1",
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    justifyContent: "space-between",
  },
  appBarBtn: {
    padding: 4,
    borderRadius: 999,
  },
  appBarTitle: {
    fontWeight: "700",
    fontSize: 18,
    marginLeft: 4,
    color: "#333",
    flex: 1,
    textAlign: "center",
  },
  imageWrapper: {
    alignSelf: "center",
    marginVertical: 26,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f3f3f3",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    width: 168,
    height: 168,
  },
  image: {
    width: 168,
    height: 168,
    borderRadius: 12,
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    marginBottom: 12,
  },
  itemName: {
    fontWeight: "700",
    fontSize: 22,
    color: "#222",
    textAlign: "center",
    marginRight: 7,
  },
  editIconBtn: {
    padding: 5,
    borderRadius: 999,
    backgroundColor: "#f5f5f5",
    marginLeft: 0,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 24,
    marginBottom: 8,
    marginTop: 4,
  },
  infoBlock: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#fafbfc",
    marginHorizontal: 2,
  },
  infoLabel: {
    fontSize: 13,
    color: "#888",
    marginBottom: 3,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#444",
    letterSpacing: 0.06,
  },
  sectionTitle: {
    fontSize: 16.5,
    fontWeight: "700",
    color: "#222",
    letterSpacing: 0.11,
  },
  outfitsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    marginHorizontal: 14,
  },
  viewAllButton: {
    paddingVertical: 2,
    paddingHorizontal: 12,
    borderRadius: 90,
    backgroundColor: "#f2f4fc",
    marginLeft: 10,
  },
  viewAllText: {
    fontSize: 12,
    color: "#3887ff",
    fontWeight: "600",
    letterSpacing: 0.07,
  },
  outfitCard: {
    width: 84,
    marginRight: 18,
    alignItems: "center",
  },
  outfitImg: {
    width: 74,
    height: 74,
    borderRadius: 14,
    marginBottom: 6,
  },
  outfitCaption: {
    fontSize: 13.3,
    color: "#222",
    fontWeight: "500",
    textAlign: "center",
    width: 76,
  },
  deleteBtn: {
    backgroundColor: "#eef0f6",
    borderRadius: 90,
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignSelf: "center",
    marginTop: 28,
    marginBottom: 18,
  },
  deleteBtnText: {
    color: "#e13939",
    fontWeight: "bold",
    fontSize: 15.5,
    letterSpacing: 0.03,
  },
});

// --- Subcomponents ---

function ItemPhoto({ uri }: { uri: string }) {
  return (
    <View style={styles.imageWrapper}>
      <Image source={{ uri }} style={styles.image} resizeMode="cover" />
    </View>
  );
}

function EditableItemName({
  name,
  onEdit,
}: {
  name: string;
  onEdit: () => void;
}) {
  return (
    <View style={styles.itemNameRow}>
      <Text style={styles.itemName}>{name}</Text>
      <TouchableOpacity onPress={onEdit} style={styles.editIconBtn}>
        <Feather name="edit-2" size={16} color="#777" />
      </TouchableOpacity>
    </View>
  );
}

function ItemInfo({
  category,
  lastWorn,
}: {
  category: string;
  lastWorn: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoBlock}>
        <Text style={styles.infoLabel}>Category</Text>
        <Text style={styles.infoValue}>{category}</Text>
      </View>
      <View style={styles.infoBlock}>
        <Text style={styles.infoLabel}>Last Worn</Text>
        <Text style={styles.infoValue}>{lastWorn}</Text>
      </View>
    </View>
  );
}

function UsedInOutfits({
  outfits,
  onViewAll,
}: {
  outfits: { key: string; label: string; image: string }[];
  onViewAll: () => void;
}) {
  return (
    <View style={{ marginTop: 28 }}>
      <View style={styles.outfitsHeader}>
        <Text style={styles.sectionTitle}>Used in outfits</Text>
        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={onViewAll}
          accessibilityRole="button"
        >
          <Text style={styles.viewAllText}>View All</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {outfits.map((outfit) => (
          <View style={styles.outfitCard} key={outfit.key}>
            <Image source={{ uri: outfit.image }} style={styles.outfitImg} />
            <Text style={styles.outfitCaption}>{outfit.label}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// --- Main Screen ---

export default function ItemDetailScreen() {
  // "Oxford White Shirt" + relevant mock data from screenshot
  const item = {
    name: "Oxford White Shirt",
    photo:
      "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=80", // substitute for shown image
    category: "Shirts",
    lastWorn: "2 days ago",
    usedInOutfits: [
      {
        key: "casualfriday",
        label: "Casual Friday",
        image:
          "https://images.unsplash.com/photo-1484517186945-2737c9cecf09?auto=format&fit=face&w=180&q=60",
      },
      {
        key: "officemeeting",
        label: "Office Meeting",
        image:
          "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=face&w=180&q=60",
      },
      {
        key: "weekend",
        label: "Weekend",
        image:
          "https://images.unsplash.com/photo-1454023492550-5696f8ff10e1?auto=format&fit=face&w=180&q=60",
      },
    ],
  };

  // Handlers
  const handleEditName = () => {
    // Normally show input/modal
    alert("Edit item name not implemented.");
  };

  const handleViewAllOutfits = () => {
    alert("View all outfits not implemented.");
  };

  const handleDelete = () => {
    alert("Delete this item? (not implemented)");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.appBar}>
        <TouchableOpacity style={styles.appBarBtn} accessible accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle} numberOfLines={1}>
          Item Detail
        </Text>
        <TouchableOpacity
          style={styles.appBarBtn}
          accessible
          accessibilityRole="button"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#555" />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ItemPhoto uri={item.photo} />
        <EditableItemName name={item.name} onEdit={handleEditName} />
        <ItemInfo category={item.category} lastWorn={item.lastWorn} />
        <UsedInOutfits
          outfits={item.usedInOutfits}
          onViewAll={handleViewAllOutfits}
        />
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDelete}
          accessibilityRole="button"
        >
          <Text style={styles.deleteBtnText}>Delete Item</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}