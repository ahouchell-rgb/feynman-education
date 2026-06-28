
/* ─── Weekly Boundaries (Mon-Sun) ─── */
export function getWeekBounds(weeksAgo = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(now); thisMonday.setHours(0,0,0,0); thisMonday.setDate(now.getDate() + mondayOffset);
  const targetMonday = new Date(thisMonday); targetMonday.setDate(thisMonday.getDate() - (weeksAgo * 7));
  const targetSunday = new Date(targetMonday); targetSunday.setDate(targetMonday.getDate() + 7); targetSunday.setMilliseconds(-1);
  return { start: targetMonday, end: targetSunday };
}

export const WEEKLY_TARGET = 50;
export const STAR_INTERVAL = 25; // bonus star every 25 over target
