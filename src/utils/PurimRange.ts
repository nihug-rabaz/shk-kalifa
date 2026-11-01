import { HDate } from '@hebcal/core';

const ADAR = 12;
const ADAR_II = 13;

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function toYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getPurimRange(refDate: Date = new Date()): { start: string; end: string } {
  const h = new HDate(refDate);
  const year = h.getFullYear();
  const isLeap = HDate.isLeapYear(year);
  const startGreg = new HDate(1, ADAR, year).greg();
  const endMonth = isLeap ? ADAR_II : ADAR;
  const endGreg = new HDate(15, endMonth, year).greg();
  return { start: toYYYYMMDD(startGreg), end: toYYYYMMDD(endGreg) };
}
