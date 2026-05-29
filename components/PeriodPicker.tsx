import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  ScrollView, TextInput, SafeAreaView, Pressable,
} from 'react-native';
import { useTheme } from '@/lib/theme';

export type PeriodTab = 'months' | 'weeks' | 'years' | 'custom';

export interface PeriodValue {
  from: string;
  to: string;
  label: string;
  tab: PeriodTab;
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_SHORT   = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function weekStart(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const y1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - y1.getTime()) / 86400000 + 1) / 7);
}

function weeksForMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const start = new Date(first);
  start.setDate(1 - (dow === 0 ? 6 : dow - 1));
  const rows: { start: Date; end: Date }[] = [];
  for (let i = 0; i < 6; i++) {
    const ws = new Date(start);
    ws.setDate(start.getDate() + i * 7);
    if (ws.getMonth() > month && ws.getFullYear() >= year && i >= 4) break;
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    rows.push({ start: ws, end: we });
  }
  return rows;
}

interface Props {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
}

export default function PeriodPicker({ value, onChange }: Props) {
  const colors = useTheme();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PeriodTab>(value.tab);

  const [viewYear, setViewYear]       = useState(now.getFullYear());
  const [decadeStart, setDecadeStart] = useState(Math.floor(now.getFullYear() / 10) * 10);
  const [wkYear, setWkYear]           = useState(now.getFullYear());
  const [wkMonth, setWkMonth]         = useState(now.getMonth());
  const [cfrom, setCfrom]             = useState(value.from);
  const [cto, setCto]                 = useState(value.to);

  function emit(from: string, to: string, label: string, t: PeriodTab) {
    onChange({ from, to, label, tab: t });
    setOpen(false);
  }

  function selectMonth(y: number, m: number) {
    const f = isoDate(new Date(y, m, 1));
    const t = isoDate(new Date(y, m + 1, 0));
    const isThis = y === now.getFullYear() && m === now.getMonth();
    emit(f, t, isThis ? 'This month' : `${MONTH_LONG[m]} ${y}`, 'months');
  }

  function selectYear(y: number) {
    const isThis = y === now.getFullYear();
    emit(`${y}-01-01`, `${y}-12-31`, isThis ? 'This year' : String(y), 'years');
  }

  function selectWeek(ws: Date) {
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    const thisWS = weekStart(now);
    const isThis = isoDate(ws) === isoDate(thisWS);
    const wk = getISOWeek(ws);
    emit(isoDate(ws), isoDate(we), isThis ? 'This week' : `Week ${wk}, ${ws.getFullYear()}`, 'weeks');
  }

  function navigate(dir: -1 | 1) {
    const f = value.from ? new Date(value.from + 'T12:00:00') : now;
    if (value.tab === 'years') {
      selectYear(f.getFullYear() + dir);
    } else if (value.tab === 'weeks') {
      const ws = new Date(f);
      ws.setDate(f.getDate() + dir * 7);
      selectWeek(weekStart(ws));
    } else if (value.tab === 'months') {
      let m = f.getMonth() + dir, y = f.getFullYear();
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      selectMonth(y, m);
      setViewYear(y);
    }
  }

  const isMonthSel = (y: number, m: number) =>
    value.from === isoDate(new Date(y, m, 1)) && value.to === isoDate(new Date(y, m + 1, 0));
  const isYearSel = (y: number) =>
    value.from === `${y}-01-01` && value.to === `${y}-12-31`;
  const isWeekSel = (ws: Date) => value.from === isoDate(ws);

  const years = Array.from({ length: 12 }, (_, i) => decadeStart + i);

  const tabs: { key: PeriodTab; label: string }[] = [
    { key: 'months', label: 'Months' },
    { key: 'weeks',  label: 'Weeks'  },
    { key: 'years',  label: 'Years'  },
    { key: 'custom', label: 'Custom' },
  ];

  const s = makeStyles(colors);

  return (
    <>
      {/* Trigger row */}
      <View style={s.trigger}>
        <TouchableOpacity onPress={() => navigate(-1)} style={s.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.navArrow}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setOpen(true)} style={s.labelBtn}>
          <Text style={s.labelText}>{value.label}</Text>
          <Text style={s.caret}> ⌄</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigate(1)} style={s.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Picker modal */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>

            {/* Tabs */}
            <View style={[s.tabs, { borderBottomColor: colors.border }]}>
              {tabs.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[s.tabBtn, tab === t.key && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
                  onPress={() => setTab(t.key)}
                >
                  <Text style={[s.tabText, { color: tab === t.key ? colors.accent : colors.muted }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Months panel */}
            {tab === 'months' && (
              <View style={s.panel}>
                <View style={s.panelNav}>
                  <TouchableOpacity onPress={() => setViewYear(y => y - 1)}>
                    <Text style={[s.panelNavArrow, { color: colors.text }]}>‹</Text>
                  </TouchableOpacity>
                  <Text style={[s.panelNavLabel, { color: colors.text }]}>{viewYear}</Text>
                  <TouchableOpacity onPress={() => setViewYear(y => y + 1)}>
                    <Text style={[s.panelNavArrow, { color: colors.text }]}>›</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.grid}>
                  {MONTH_SHORT.map((m, i) => {
                    const sel = isMonthSel(viewYear, i);
                    const cur = !sel && viewYear === now.getFullYear() && i === now.getMonth();
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[
                          s.cell,
                          sel && { backgroundColor: colors.accent },
                          cur && { borderColor: colors.accent, borderWidth: 1 },
                        ]}
                        onPress={() => selectMonth(viewYear, i)}
                      >
                        <Text style={[s.cellText, { color: sel ? '#fff' : colors.text }]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Weeks panel */}
            {tab === 'weeks' && (
              <View style={s.panel}>
                <View style={s.panelNav}>
                  <TouchableOpacity onPress={() => {
                    let m = wkMonth - 1, y = wkYear;
                    if (m < 0) { m = 11; y--; }
                    setWkMonth(m); setWkYear(y);
                  }}>
                    <Text style={[s.panelNavArrow, { color: colors.text }]}>‹</Text>
                  </TouchableOpacity>
                  <Text style={[s.panelNavLabel, { color: colors.text }]}>{MONTH_SHORT[wkMonth]} {wkYear}</Text>
                  <TouchableOpacity onPress={() => {
                    let m = wkMonth + 1, y = wkYear;
                    if (m > 11) { m = 0; y++; }
                    setWkMonth(m); setWkYear(y);
                  }}>
                    <Text style={[s.panelNavArrow, { color: colors.text }]}>›</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.weekDayHeaders}>
                  {DAY_SHORT.map(d => (
                    <Text key={d} style={[s.weekDayLabel, { color: colors.muted }]}>{d}</Text>
                  ))}
                </View>
                {weeksForMonth(wkYear, wkMonth).map(({ start: ws }, i) => {
                  const sel = isWeekSel(ws);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[s.weekRow, sel && { backgroundColor: colors.accent + '33' }]}
                      onPress={() => selectWeek(ws)}
                    >
                      {Array.from({ length: 7 }, (_, d) => {
                        const day = new Date(ws);
                        day.setDate(ws.getDate() + d);
                        const out = day.getMonth() !== wkMonth;
                        const today = isoDate(day) === isoDate(now);
                        return (
                          <View key={d} style={[s.weekDay, today && { backgroundColor: colors.accent }]}>
                            <Text style={[
                              s.weekDayText,
                              { color: today ? '#fff' : out ? colors.muted : colors.text },
                            ]}>
                              {day.getDate()}
                            </Text>
                          </View>
                        );
                      })}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Years panel */}
            {tab === 'years' && (
              <View style={s.panel}>
                <View style={s.panelNav}>
                  <TouchableOpacity onPress={() => setDecadeStart(d => d - 12)}>
                    <Text style={[s.panelNavArrow, { color: colors.text }]}>‹</Text>
                  </TouchableOpacity>
                  <Text style={[s.panelNavLabel, { color: colors.text }]}>{decadeStart}–{decadeStart + 11}</Text>
                  <TouchableOpacity onPress={() => setDecadeStart(d => d + 12)}>
                    <Text style={[s.panelNavArrow, { color: colors.text }]}>›</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.grid}>
                  {years.map(y => {
                    const sel = isYearSel(y);
                    const cur = !sel && y === now.getFullYear();
                    return (
                      <TouchableOpacity
                        key={y}
                        style={[
                          s.cell,
                          sel && { backgroundColor: colors.accent },
                          cur && { borderColor: colors.accent, borderWidth: 1 },
                        ]}
                        onPress={() => selectYear(y)}
                      >
                        <Text style={[s.cellText, { color: sel ? '#fff' : colors.text }]}>{y}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Custom panel */}
            {tab === 'custom' && (
              <View style={s.panel}>
                <Text style={[s.customHint, { color: colors.muted }]}>Enter dates as YYYY-MM-DD</Text>
                <View style={s.customFields}>
                  <View style={s.customField}>
                    <Text style={[s.customLabel, { color: colors.muted }]}>From</Text>
                    <TextInput
                      style={[s.customInput, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                      value={cfrom}
                      onChangeText={setCfrom}
                      placeholder="2026-01-01"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                      maxLength={10}
                    />
                  </View>
                  <View style={s.customField}>
                    <Text style={[s.customLabel, { color: colors.muted }]}>To</Text>
                    <TextInput
                      style={[s.customInput, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                      value={cto}
                      onChangeText={setCto}
                      placeholder="2026-01-31"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                      maxLength={10}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.applyBtn, { backgroundColor: colors.accent }, (!cfrom || !cto) && { opacity: 0.4 }]}
                  onPress={() => { if (cfrom && cto) emit(cfrom, cto, `${cfrom} – ${cto}`, 'custom'); }}
                  disabled={!cfrom || !cto}
                >
                  <Text style={s.applyBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>
            )}

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(colors: any) {
  return StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    navBtn: { padding: 4 },
    navArrow: { fontSize: 22, color: colors.text, lineHeight: 26 },
    labelBtn: { flexDirection: 'row', alignItems: 'center' },
    labelText: { fontSize: 15, fontWeight: '600', color: colors.text },
    caret: { fontSize: 13, color: colors.muted },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 32,
    },

    tabs: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tabBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabText: { fontSize: 13, fontWeight: '600' },

    panel: { padding: 16, gap: 12 },
    panelNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    panelNavArrow: { fontSize: 22, paddingHorizontal: 8, lineHeight: 26 },
    panelNavLabel: { fontSize: 15, fontWeight: '600' },

    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    cell: {
      width: '30%',
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
    },
    cellText: { fontSize: 14, fontWeight: '500' },

    weekDayHeaders: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    weekDayLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
    },
    weekRow: {
      flexDirection: 'row',
      borderRadius: 8,
      paddingVertical: 4,
    },
    weekDay: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: 16,
    },
    weekDayText: { fontSize: 13 },

    customHint: { fontSize: 12, marginBottom: 4 },
    customFields: { flexDirection: 'row', gap: 12 },
    customField: { flex: 1, gap: 6 },
    customLabel: { fontSize: 12, fontWeight: '600' },
    customInput: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
    },
    applyBtn: {
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 4,
    },
    applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
