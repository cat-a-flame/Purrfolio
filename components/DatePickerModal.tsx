import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import BottomModal from './BottomModal';

interface Props {
  visible: boolean;
  value: string; // YYYY-MM-DD
  onConfirm: (date: string) => void;
  onClose: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr ? dateStr.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()];
  return { year: y || new Date().getFullYear(), month: m || new Date().getMonth() + 1, day: d || new Date().getDate() };
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

function Column({ items, selected, onSelect }: { items: (string | number)[]; selected: number; onSelect: (i: number) => void }) {
  const colors = useTheme();
  const scrollRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selected * ITEM_HEIGHT, animated: false });
  }, [selected]);

  return (
    <View style={styles.column}>
      <View style={[styles.selectionOverlay, { borderColor: colors.accent }]} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
          onSelect(Math.max(0, Math.min(index, items.length - 1)));
        }}
      >
        {items.map((item, i) => (
          <TouchableOpacity key={i} style={styles.item} onPress={() => {
            onSelect(i);
            scrollRef.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true });
          }}>
            <Text style={[styles.itemText, { color: i === selected ? colors.accent : colors.text }, i === selected && styles.itemTextSelected]}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function DatePickerModal({ visible, value, onConfirm, onClose }: Props) {
  const colors = useTheme();
  const parsed = parseDate(value);

  const [year, setYear] = useState(parsed.year);
  const [month, setMonth] = useState(parsed.month);
  const [day, setDay] = useState(parsed.day);

  useEffect(() => {
    if (visible) {
      const p = parseDate(value);
      setYear(p.year);
      setMonth(p.month);
      setDay(p.day);
    }
  }, [visible, value]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  const maxDay = daysInMonth(year, month);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  const clampedDay = Math.min(day, maxDay);

  function handleConfirm() {
    const d = Math.min(day, maxDay);
    const m = String(month).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onConfirm(`${year}-${m}-${dd}`);
    onClose();
  }

  return (
    <BottomModal visible={visible} onClose={onClose} title="Select date">
      <View style={styles.picker}>
        <Column
          items={days}
          selected={clampedDay - 1}
          onSelect={(i) => setDay(i + 1)}
        />
        <Column
          items={MONTHS}
          selected={month - 1}
          onSelect={(i) => setMonth(i + 1)}
        />
        <Column
          items={years}
          selected={years.indexOf(year) >= 0 ? years.indexOf(year) : 5}
          onSelect={(i) => setYear(years[i])}
        />
      </View>
      <TouchableOpacity
        style={[styles.confirmBtn, { backgroundColor: colors.accent }]}
        onPress={handleConfirm}
      >
        <Text style={styles.confirmText}>Confirm</Text>
      </TouchableOpacity>
    </BottomModal>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    overflow: 'hidden',
  },
  column: {
    flex: 1,
    height: PICKER_HEIGHT,
    overflow: 'hidden',
  },
  selectionOverlay: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 4,
    right: 4,
    height: ITEM_HEIGHT,
    borderRadius: 8,
    borderWidth: 1.5,
    zIndex: 1,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 16,
  },
  itemTextSelected: {
    fontFamily: 'Figtree_700Bold',
    fontSize: 17,
  },
  confirmBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Figtree_700Bold',
  },
});
