/**
 * 首页欢迎区日历摘要：公历 / 农历 / 年余天数 / 下一法定节假日。
 * 依赖 lunar-typescript（法定节假日含调休数据）。
 */
import { HolidayUtil, Solar } from 'lunar-typescript';

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export interface NextHolidayInfo {
  /** 节日名，如「中秋节」 */
  name: string;
  /** 放假日 YYYY-MM-DD */
  date: string;
  /** 距今天数；0 = 今天就是该假日 */
  daysLeft: number;
}

export interface CalendarBrief {
  solarText: string;
  lunarText: string;
  yearLeftDays: number;
  year: number;
  nextHoliday: NextHolidayInfo | null;
  /** 今天若为法定休息日则返回节日名 */
  todayHolidayName: string | null;
}

function startOfToday(date = new Date()): Solar {
  return Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** 向后查找下一个法定休息日（跳过调休上班日） */
function findNextHoliday(from: Solar): NextHolidayInfo | null {
  let cur = from;
  for (let i = 0; i < 400; i++) {
    const h = HolidayUtil.getHoliday(cur.getYear(), cur.getMonth(), cur.getDay());
    if (h && !h.isWork()) {
      return {
        name: h.getName(),
        date: h.getDay(),
        daysLeft: i,
      };
    }
    cur = cur.next(1);
  }
  return null;
}

export function getCalendarBrief(date = new Date()): CalendarBrief {
  const solar = startOfToday(date);
  const lunar = solar.getLunar();
  const year = solar.getYear();
  const yearEnd = Solar.fromYmd(year, 12, 31);
  const yearLeftDays = Math.max(0, yearEnd.subtract(solar));

  const week = WEEK_LABELS[solar.getWeek()] ?? solar.getWeekInChinese();
  const solarText = `${year}年${solar.getMonth()}月${solar.getDay()}日 星期${week}`;
  const lunarText = `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;

  const todayH = HolidayUtil.getHoliday(solar.getYear(), solar.getMonth(), solar.getDay());
  const todayHolidayName = todayH && !todayH.isWork() ? todayH.getName() : null;

  return {
    solarText,
    lunarText,
    yearLeftDays,
    year,
    nextHoliday: findNextHoliday(solar),
    todayHolidayName,
  };
}
