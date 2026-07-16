import { DatePicker, Segmented } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { TrendQuery } from '../services/api';

const { RangePicker } = DatePicker;

export type RangePreset = '7d' | '30d' | 'all' | 'custom';

export type TrendRangeValue = {
  preset: RangePreset;
  /** custom only */
  range?: [Dayjs, Dayjs] | null;
};

type TrendRangeControlProps = {
  value: TrendRangeValue;
  onChange: (next: TrendRangeValue) => void;
};

export function toTrendQuery(value: TrendRangeValue): TrendQuery {
  if (value.preset === '7d') return { days: 7 };
  if (value.preset === '30d') return { days: 30 };
  if (value.preset === 'all') return { all: true };
  if (value.range?.[0] && value.range?.[1]) {
    return {
      startDate: value.range[0].format('YYYY-MM-DD'),
      endDate: value.range[1].format('YYYY-MM-DD'),
    };
  }
  return { days: 7 };
}

export function rangeLabel(value: TrendRangeValue): string {
  if (value.preset === '7d') return '近 7 日';
  if (value.preset === '30d') return '近 1 个月';
  if (value.preset === 'all') return '全部';
  if (value.range?.[0] && value.range?.[1]) {
    return `${value.range[0].format('MM-DD')} ~ ${value.range[1].format('MM-DD')}`;
  }
  return '自定义';
}

export default function TrendRangeControl({
  value,
  onChange,
}: TrendRangeControlProps) {
  return (
    <div className="trend-range-control" onClick={(e) => e.stopPropagation()}>
      <Segmented
        size="small"
        value={value.preset}
        options={[
          { label: '近 7 天', value: '7d' },
          { label: '近 1 个月', value: '30d' },
          { label: '全部', value: 'all' },
          { label: '自定义', value: 'custom' },
        ]}
        onChange={(preset) => {
          const next = preset as RangePreset;
          if (next === 'custom') {
            onChange({
              preset: 'custom',
              range:
                value.range ??
                ([dayjs().subtract(13, 'day'), dayjs()] as [Dayjs, Dayjs]),
            });
          } else {
            onChange({ preset: next, range: null });
          }
        }}
      />
      {value.preset === 'custom' && (
        <RangePicker
          size="small"
          allowClear={false}
          value={value.range}
          disabledDate={(current) =>
            !!current && current.isAfter(dayjs().endOf('day'))
          }
          onChange={(dates) => {
            if (dates?.[0] && dates?.[1]) {
              onChange({
                preset: 'custom',
                range: [dates[0], dates[1]],
              });
            }
          }}
        />
      )}
    </div>
  );
}
