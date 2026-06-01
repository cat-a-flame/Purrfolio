import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Dimensions,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import type { Category } from '@/lib/types';
import BottomModal from './BottomModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  categories: Category[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const PANEL_HEIGHT = Dimensions.get('window').height * 0.52;

export default function CategoryPickerModal({ visible, onClose, categories, selectedId, onSelect }: Props) {
  const colors = useTheme();

  const [selectedParent, setSelectedParent] = useState<Category | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [search, setSearch] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const subScrollRef = useRef<ScrollView>(null);

  const roots = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;

  const searchResults = isSearching
    ? categories.filter((c) => c.name.toLowerCase().includes(query))
    : [];

  function openParent(cat: Category) {
    const children = childrenOf(cat.id);
    if (children.length === 0) {
      onSelect(cat.id);
      handleClose();
      return;
    }
    setSelectedParent(cat);
    subScrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  function goBack() {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setSelectedParent(null));
  }

  function handleClose() {
    slideAnim.setValue(0);
    setSelectedParent(null);
    setSearch('');
    onClose();
  }

  function selectItem(id: string) {
    onSelect(id);
    handleClose();
  }

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -containerWidth],
  });

  return (
    <BottomModal visible={visible} onClose={handleClose} title="Select category">
      {/* Search input */}
      <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search categories…"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      {isSearching ? (
        /* ── Flat search results ── */
        <ScrollView style={{ height: PANEL_HEIGHT }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {searchResults.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>No categories found</Text>
          ) : (
            searchResults.map((cat) => {
              const isSelected = selectedId === cat.id;
              const parent = cat.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.row, { borderBottomColor: colors.border }, isSelected && { backgroundColor: colors.accent + '11' }]}
                  onPress={() => selectItem(cat.id)}
                >
                  {cat.icon ? (
                    <Text style={styles.rowIcon}>{cat.icon}</Text>
                  ) : parent?.icon ? (
                    <Text style={styles.rowIcon}>{parent.icon}</Text>
                  ) : (
                    <View style={{ width: 28 }} />
                  )}
                  <View style={{ flex: 1 }}>
                    {parent && (
                      <Text style={[styles.parentLabel, { color: colors.muted }]}>{parent.name}</Text>
                    )}
                    <Text style={[styles.rowText, { color: isSelected ? colors.accent : colors.text }]}>{cat.name}</Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      ) : (
        /* ── Two-panel browse view ── */
        <View
          style={[styles.clipper, { height: PANEL_HEIGHT }]}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[
              styles.slider,
              containerWidth > 0 && { width: containerWidth * 2, transform: [{ translateX }] },
            ]}
          >
            {/* Left panel: parent categories */}
            <ScrollView
              style={{ width: containerWidth || '50%' }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }, !selectedId && { backgroundColor: colors.accent + '11' }]}
                onPress={() => selectItem('')}
              >
                <Text style={[styles.rowText, { color: !selectedId ? colors.accent : colors.text }]}>— None</Text>
                {!selectedId && <Ionicons name="checkmark" size={18} color={colors.accent} />}
              </TouchableOpacity>

              {roots.map((cat) => {
                const hasChildren = childrenOf(cat.id).length > 0;
                const isSelected = selectedId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.row, { borderBottomColor: colors.border }, isSelected && { backgroundColor: colors.accent + '11' }]}
                    onPress={() => openParent(cat)}
                  >
                    {cat.icon ? <Text style={styles.rowIcon}>{cat.icon}</Text> : <View style={{ width: 28 }} />}
                    <Text style={[styles.rowText, { color: isSelected ? colors.accent : colors.text }]}>{cat.name}</Text>
                    {isSelected && !hasChildren && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                    {hasChildren && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Right panel: sub-categories */}
            <View style={{ width: containerWidth || '50%' }}>
              <View style={[styles.subHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={goBack} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={20} color={colors.accent} />
                </TouchableOpacity>
                <View style={styles.subHeaderTitle}>
                  {selectedParent?.icon ? <Text style={styles.rowIcon}>{selectedParent.icon}</Text> : null}
                  <Text style={[styles.subHeaderText, { color: colors.text }]}>{selectedParent?.name}</Text>
                </View>
              </View>

              <ScrollView
                ref={subScrollRef}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {(selectedParent ? childrenOf(selectedParent.id) : []).map((child) => {
                  const isSelected = selectedId === child.id;
                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[styles.row, { borderBottomColor: colors.border }, isSelected && { backgroundColor: colors.accent + '11' }]}
                      onPress={() => selectItem(child.id)}
                    >
                      {child.icon ? <Text style={styles.rowIcon}>{child.icon}</Text> : <View style={{ width: 28 }} />}
                      <Text style={[styles.rowText, { color: isSelected ? colors.accent : colors.text }]}>{child.name}</Text>
                      {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      )}
    </BottomModal>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  clipper: {
    overflow: 'hidden',
  },
  slider: {
    flexDirection: 'row',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowText: { flex: 1, fontSize: 15 },
  parentLabel: { fontSize: 11, marginBottom: 1 },
  emptyText: { textAlign: 'center', marginTop: 32, fontSize: 14 },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginBottom: 4,
  },
  backBtn: { padding: 2 },
  subHeaderTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  subHeaderText: { fontSize: 16, fontFamily: 'Figtree_700Bold' },
});
