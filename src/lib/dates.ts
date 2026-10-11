// Date helpers anchored to the app's display timezone.
//
// Everything user-facing in the app is rendered in Europe/London (see the
// `timeZone` options passed to toLocaleDateString throughout the screens), so
// "today" has to be worked out in that zone too — otherwise a device set to a
// timezone behind/ahead of London rolls an event over at the wrong moment.

export const APP_TIME_ZONE = 'Europe/London';

// How far `date` is offset from UTC in the given zone, in milliseconds.
const zoneOffsetMs = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - date.getTime();
};

// The instant at which the current day began in Europe/London — i.e. the
// midnight just passed. An event stays "current" until this moves past it,
// so Friday's event remains today's event all the way through Friday night
// and is only replaced once Saturday 00:00 has hit.
export const startOfTodayIso = (now: Date = new Date()) => {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const midnightAsUtc = Date.parse(`${ymd}T00:00:00Z`);
  // London midnight is 00:00Z in winter and 23:00Z the previous day in
  // summer; subtracting the offset in effect at that moment gives the real
  // instant. (London's DST switch happens at 01:00, never at midnight, so
  // sampling the offset at the UTC guess is safe.)
  const offset = zoneOffsetMs(new Date(midnightAsUtc), APP_TIME_ZONE);
  return new Date(midnightAsUtc - offset).toISOString();
};
