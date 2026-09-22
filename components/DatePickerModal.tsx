import { useEffect } from 'react';
import { Platform } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import BottomModal from './BottomModal';

interface Props {
  visible: boolean;
  value: string; // YYYY-MM-DD
  onConfirm: (date: string) => void;
  onClose: () => void;
}

function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DatePickerModal({ visible, value, onConfirm, onClose }: Props) {
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;

    DateTimePickerAndroid.open({
      value: parseDate(value),
      mode: 'date',
      display: 'calendar',
      onChange: (event, selectedDate) => {
        if (event.type === 'set' && selectedDate) {
          onConfirm(toIsoDate(selectedDate));
        }
        onClose();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (Platform.OS === 'android') return null;

  return (
    <BottomModal visible={visible} onClose={onClose} title="Select date">
      <DateTimePicker
        value={parseDate(value)}
        mode="date"
        display="inline"
        onChange={(event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            onConfirm(toIsoDate(selectedDate));
            onClose();
          }
        }}
      />
    </BottomModal>
  );
}
