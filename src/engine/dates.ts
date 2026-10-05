/** Local-date helpers. Dates are 'YYYY-MM-DD' strings; weeks start Monday. */
export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(k: string, n: number): string {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}
/** Mon=0 .. Sun=6 */
export function weekday(k: string): number {
  return (parseKey(k).getDay() + 6) % 7;
}
export function weekStart(k: string): string {
  return addDays(k, -weekday(k));
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseKey(a).getTime() - parseKey(b).getTime()) / 86400000);
}
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export function todayKey(): string {
  return toKey(new Date());
}
/** default well-spaced training days for n sessions */
export function defaultDays(n: number): number[] {
  switch (n) {
    case 2: return [0, 3];
    case 3: return [0, 2, 4];
    case 4: return [0, 1, 3, 4];
    case 5: return [0, 1, 2, 4, 5];
    default: return [0, 2, 4];
  }
}
