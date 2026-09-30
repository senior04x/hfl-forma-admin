export function getYouTubeScheduledStartTime(match) {
  const date = String(match.match_date || '').trim();
  const time = String(match.match_time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(time)) {
    throw new Error("O'yinning sanasi yoki boshlanish vaqti noto'g'ri. Schedule sahifasida tuzating.");
  }

  // Match times use Tashkent time, regardless of the browser's timezone.
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const start = new Date(`${date}T${normalizedTime}+05:00`);
  const calendarDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) {
    throw new Error("O'yinning sanasi yoki boshlanish vaqti noto'g'ri. Schedule sahifasida tuzating.");
  }
  return start.toISOString();
}
