/**
 * 首页欢迎区日历摘要：公历 / 完整农历+节气 / 下一法定节假日 / 年余倒计时。
 * 依赖 lunar-typescript（法定节假日含调休数据）。
 */
import { HolidayUtil, LunarMonth, Solar } from 'lunar-typescript';

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export interface NextHolidayInfo {
  /** 节日名，如「中秋节」 */
  name: string;
  /** 放假日 YYYY-MM-DD */
  date: string;
  /** 距今天数；0 = 今天就是该假日 */
  daysLeft: number;
}

/**
 * 今天所在的法定假期。
 * ⚠️ HolidayUtil 对整段放假的**每一天**都返回节日名（中秋放 3 天，三天都叫「中秋节」），
 * 节日正日要看 `getTarget()`——不区分的话八月十六也会显示「今天是中秋节」（2026-09-26 已踩）。
 */
export interface TodayHolidayInfo {
  name: string;
  /** 今天就是节日正日（如八月十五），而不只是假期中的某一天 */
  isFestivalDay: boolean;
  /** 本段假期的第几天（从 1 起） */
  dayIndex: number;
}

export interface NextJieQiInfo {
  name: string;
  /** 距节气的整天数（未到时刻按日历日差） */
  daysLeft: number;
  /** 是否已过本日节气时刻但仍在同一天 */
  isToday: boolean;
}

export interface CalendarBrief {
  solarText: string;
  /** 如：丙午年 六月小 廿八 丙辰日 */
  lunarText: string;
  nextJieQi: NextJieQiInfo | null;
  yearLeftDays: number;
  /** 不足一天部分：时 / 分 / 秒（相对本年最后一刻） */
  yearLeftHours: number;
  yearLeftMinutes: number;
  yearLeftSeconds: number;
  year: number;
  /** 下一个法定假期（今天正在放假时，跳过当前这段假期） */
  nextHoliday: NextHolidayInfo | null;
  /** 今天所在的法定假期（不在假期为 null） */
  todayHoliday: TodayHolidayInfo | null;
}

/** 某天是法定休息日（非调休上班）就返回该 Holiday */
function restHolidayOf(s: Solar) {
  const h = HolidayUtil.getHoliday(s.getYear(), s.getMonth(), s.getDay());
  return h && !h.isWork() ? h : null;
}

function startOfToday(date: Date): Solar {
  return Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** 向后查找下一个法定休息日（跳过调休上班日，以及 skipTarget 所指的当前这段假期） */
function findNextHoliday(from: Solar, skipTarget: string | null): NextHolidayInfo | null {
  let cur = from;
  for (let i = 0; i < 400; i++) {
    const h = restHolidayOf(cur);
    if (h && h.getTarget() !== skipTarget) {
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

function buildNextJieQi(solar: Solar, now: Date): NextJieQiInfo | null {
  const jq = solar.getLunar().getNextJieQi();
  if (!jq) return null;
  const js = jq.getSolar();
  const jqDate = new Date(
    js.getYear(),
    js.getMonth() - 1,
    js.getDay(),
    js.getHour(),
    js.getMinute(),
    js.getSecond(),
  );
  const sameDay =
    now.getFullYear() === js.getYear()
    && now.getMonth() + 1 === js.getMonth()
    && now.getDate() === js.getDay();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const jqDayStart = new Date(js.getYear(), js.getMonth() - 1, js.getDay());
  const daysLeft = Math.max(
    0,
    Math.round((jqDayStart.getTime() - dayStart.getTime()) / 86_400_000),
  );
  // 若节气时刻已过但仍是同一天，仍算「今天」
  if (sameDay && jqDate.getTime() <= now.getTime()) {
    return { name: jq.getName(), daysLeft: 0, isToday: true };
  }
  return { name: jq.getName(), daysLeft, isToday: sameDay };
}

export function getCalendarBrief(date = new Date()): CalendarBrief {
  const solar = startOfToday(date);
  const lunar = solar.getLunar();
  const year = solar.getYear();

  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  const msLeft = Math.max(0, yearEnd.getTime() - date.getTime());
  const yearLeftDays = Math.floor(msLeft / 86_400_000);
  const remSec = Math.floor((msLeft % 86_400_000) / 1000);
  const yearLeftHours = Math.floor(remSec / 3600);
  const yearLeftMinutes = Math.floor((remSec % 3600) / 60);
  const yearLeftSeconds = remSec % 60;

  const week = WEEK_LABELS[solar.getWeek()] ?? solar.getWeekInChinese();
  const solarText = `${year}年${solar.getMonth()}月${solar.getDay()}日 星期${week}`;

  const lm = LunarMonth.fromYm(lunar.getYear(), lunar.getMonth());
  const monthSize = lm && lm.getDayCount() >= 30 ? '大' : '小';
  const lunarText = `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${monthSize} ${lunar.getDayInChinese()} ${lunar.getDayInGanZhi()}日`;

  const todayH = restHolidayOf(solar);
  let todayHoliday: TodayHolidayInfo | null = null;
  if (todayH) {
    // 往前数同一段假期（同一个 target）连着放了几天，得出「第几天」
    let dayIndex = 1;
    let prev = solar.next(-1);
    while (restHolidayOf(prev)?.getTarget() === todayH.getTarget() && dayIndex < 30) {
      dayIndex++;
      prev = prev.next(-1);
    }
    todayHoliday = {
      name: todayH.getName(),
      isFestivalDay: todayH.getTarget() === todayH.getDay(),
      dayIndex,
    };
  }

  return {
    solarText,
    lunarText,
    nextJieQi: buildNextJieQi(solar, date),
    yearLeftDays,
    yearLeftHours,
    yearLeftMinutes,
    yearLeftSeconds,
    year,
    nextHoliday: findNextHoliday(solar, todayH ? todayH.getTarget() : null),
    todayHoliday,
  };
}
