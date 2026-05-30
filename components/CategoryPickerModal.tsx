import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import type { Category } from '@/lib/types';
import BottomModal from './BottomModal';
import AppButton from './AppButton';

interface Props {
  visible: boolean;
  onClose: () => void;
  categories: Category[];   // all categories (parents + children) already filtered by type
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function CategoryPickerModal({ visible, onClose, categories, selectedId, onSelect }: Props) {
  const colors = useTheme();

  const [selectedParent, setSelectedParent] = useState<Category | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const roots = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  function openParent(cat: Category) {
    const children = childrenOf(cat.id);
    if (children.length === 0) {
      onSelect(cat.id);
      onClose();
      return;
    }
    setSelectedParent(cat);
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
    // reset state when closing
    slideAnim.setValue(0);
    setSelectedParent(null);
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
    <BottomModal visible={visible} onClose={handleClose} title="">
      {/* Clip container so the sliding panel stays inside */}
      <View
        style={styles.clipper}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            styles.slider,
            containerWidth > 0 && { width: containerWidth * 2, transform: [{ translateX }] },
          ]}
        >
          {/* ── Left panel: parent categories ── */}
          <View style={[styles.panel, { width: containerWidth || '50%' }]}>
            {/* None row */}
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
          </View>

          {/* ── Right panel: sub-categories ── */}
          <View style={[styles.panel, { width: containerWidth || '50%' }]}>
            {/* Header with back button */}
            <View style={[styles.subHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={goBack} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color={colors.accent} />
              </TouchableOpacity>
              <View style={styles.subHeaderTitle}>
                {selectedParent?.icon ? <Text style={styles.rowIcon}>{selectedParent.icon}</Text> : null}
                <Text style={[styles.subHeaderText, { color: colors.text }]}>{selectedParent?.name}</Text>
              </View>
            </View>

            {/* Parent itself as first option */}
            {selectedParent && (() => {
              const isSelected = selectedId === selectedParent.id;
              return (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: colors.border }, isSelected && { backgroundColor: colors.accent + '11' }]}
                  onPress={() => selectItem(selectedParent.id)}
                >
                  <Text style={[styles.rowText, { color: isSelected ? colors.accent : colors.text }]}>
                    {selectedParent.name} (general)
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </TouchableOpacity>
              );
            })()}

            {/* Children */}
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
          </View>
        </Animated.View>
      </View>
    </BottomModal>
  );
}

const styles = StyleSheet.create({
  clipper: {
    overflow: 'hidden',
  },
  slider: {
    flexDirection: 'row',
  },
  panel: {
    flexShrink: 0,
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
  subHeaderText: { fontSize: 16, fontWeight: '700' },
});
