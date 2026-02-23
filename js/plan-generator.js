import { LONG_FROM_END, DAYS_FULL } from './constants.js';
import { parseTimeSecs, dStr, parseDate, uid } from './utils.js';
import { state } from './state.js';

// wFE = weeksFromEnd (0 = race week, 1 = last training week, …)
export function isCutbackWFE(wFE) {
  return wFE === 2 || wFE === 5 || (wFE >= 9 && (wFE - 9) % 4 === 0);
}
export function isTempoWFE(wFE) {
  if (wFE <= 3 || isCutbackWFE(wFE)) return false;
  if (wFE === 4 || wFE === 6 || wFE === 8 || wFE === 11) return true;
  return wFE >= 12 && wFE % 3 === 2;
}

export function calcPaces(fiveKSecs, tenKSecs) {
  let refPace;
  if (fiveKSecs && tenKSecs) {
    const p5  = fiveKSecs / 3.1;
    const p5e = (tenKSecs * Math.pow(3.1/6.2, 1.06)) / 3.1;
    refPace = p5 * 0.45 + p5e * 0.55;
  } else if (fiveKSecs) {
    refPace = fiveKSecs / 3.1;
  } else if (tenKSecs) {
    refPace = (tenKSecs * Math.pow(3.1/6.2, 1.06)) / 3.1;
  } else {
    refPace = 9 * 60; // 9:00/mi default
  }
  return {
    easy:     refPace + 90,
    tempo:    refPace + 18,
    long:     refPace + 90,
    recovery: refPace + 120,
    race:     refPace * 1.08,
  };
}

export function estimateHalf(fiveKSecs, tenKSecs) {
  if (!fiveKSecs && !tenKSecs) return null;
  if (fiveKSecs && tenKSecs) {
    return fiveKSecs * Math.pow(13.1/3.1, 1.06) * 0.4
         + tenKSecs  * Math.pow(13.1/6.2, 1.06) * 0.6;
  }
  if (fiveKSecs) return fiveKSecs * Math.pow(13.1/3.1, 1.06);
  return tenKSecs * Math.pow(13.1/6.2, 1.06);
}

export function calcTotalWeeks(startDateStr, raceDateStr) {
  if (!raceDateStr) return 13;
  const start = parseDate(startDateStr);
  const race  = parseDate(raceDateStr);
  const startSun = new Date(start); startSun.setDate(start.getDate() - start.getDay());
  const raceSun  = new Date(race);  raceSun.setDate(race.getDate()  - race.getDay());
  const diff = Math.round((raceSun - startSun) / (7 * 86400000));
  return Math.max(5, Math.min(20, diff + 1));
}

export function getPlanTotalWeeks() {
  return state.plan.length ? Math.max(...state.plan.map(r => r.week)) : 13;
}

export function weeksHint(startDateStr, raceDateStr) {
  if (!startDateStr || !raceDateStr) return '';
  const tw = calcTotalWeeks(startDateStr, raceDateStr);
  const training = tw - 1;
  if (training < 4)  return `⚠️ Only ${training} training weeks — consider a later start or earlier race.`;
  if (training > 16) return `⚠️ ${training} weeks is very long — consider starting closer to race day.`;
  return `${training} training weeks + race week`;
}

export function calcStartFromRace(raceDateStr) {
  const rd = parseDate(raceDateStr);
  const raceSunday = new Date(rd);
  raceSunday.setDate(rd.getDate() - rd.getDay());
  const week1Sunday = new Date(raceSunday);
  week1Sunday.setDate(raceSunday.getDate() - 84);
  return dStr(week1Sunday);
}

export function raceHint(raceDateStr) {
  const startStr = calcStartFromRace(raceDateStr);
  const start = parseDate(startStr);
  const race  = parseDate(raceDateStr);
  const weeksAway = Math.round((race - new Date()) / (7 * 24 * 3600 * 1000));
  const startLabel = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const countdown  = weeksAway > 0 ? ` · ${weeksAway} weeks away` : weeksAway === 0 ? ' · This week!' : ' · Date is in the past';
  return `Plan starts ${startLabel}${countdown}`;
}

function getOtherDays(longIdx, dpw) {
  const dayBefore = (longIdx + 6) % 7;
  const preferred = [], fb = [];
  for (let i = 0; i < 7; i++) {
    if (i === longIdx) continue;
    (i === dayBefore ? fb : preferred).push(i);
  }
  const needed = dpw - 1;
  if (needed <= preferred.length) {
    const step = preferred.length / needed;
    return Array.from({length: needed}, (_, i) =>
      preferred[Math.min(Math.floor(i * step + step / 2), preferred.length - 1)]
    ).sort((a,b) => a-b);
  }
  return [...preferred, ...fb.slice(0, needed - preferred.length)].sort((a,b) => a-b);
}

function tempoIdx(otherDays, longIdx) {
  let best = 0, score = Infinity;
  otherDays.forEach((d, i) => {
    const before = (longIdx - d + 7) % 7;
    const s = Math.abs(before - 3);
    if (before >= 2 && s < score) { score = s; best = i; }
  });
  return best;
}

export function generatePlan(profile) {
  const fiveKSecs  = parseTimeSecs(profile.fiveKTime);
  const tenKSecs   = parseTimeSecs(profile.tenKTime);
  const paces      = calcPaces(fiveKSecs, tenKSecs);
  const dpw        = Math.max(3, Math.min(6, parseInt(profile.daysPerWeek, 10)));
  const longTable  = LONG_FROM_END[dpw];
  const longIdx    = DAYS_FULL.indexOf(profile.longRunDay);
  const otherDays  = getOtherDays(longIdx, dpw);
  const tIdx       = tempoIdx(otherDays, longIdx);
  const totalWeeks = profile.totalWeeks || calcTotalWeeks(profile.startDate, profile.raceDate);
  const runs = [];

  const startDate = parseDate(profile.startDate);
  const startDow  = startDate.getDay();

  for (let week = 1; week <= totalWeeks; week++) {
    const isRace = week === totalWeeks;
    const wFE      = totalWeeks - week;
    const isCut    = !isRace && isCutbackWFE(wFE);
    const isTempo  = !isRace && !isCut && isTempoWFE(wFE);
    const tableIdx = Math.min(wFE - 1, longTable.length - 1);
    const longDist = isRace ? 13.1 : longTable[Math.max(0, tableIdx)];

    const weekOffset = (week - 1) * 7;
    const sunday = new Date(startDate);
    sunday.setDate(startDate.getDate() + weekOffset - startDow);

    const mkDate = (dayIdx) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + dayIdx);
      return dStr(d);
    };

    if (isRace) {
      const exactRaceDate = profile.raceDate || mkDate(longIdx);
      const raceDow = parseDate(exactRaceDate).getDay();
      otherDays
        .filter(d => d < raceDow)
        .slice(0, 2)
        .forEach((di) => {
          runs.push({
            id: uid(), date: mkDate(di), type: 'easy',
            distance: 3, estimatedPace: paces.easy,
            completed: false, skipped: false, notes: '',
            week, label: 'Easy Run', wFE: 0, planGenerated: true,
          });
        });
      runs.push({
        id: uid(), date: exactRaceDate, type: 'race',
        distance: 13.1, estimatedPace: paces.race,
        completed: false, skipped: false, notes: '',
        week, label: 'RACE DAY!', wFE: 0, planGenerated: true,
      });
    } else {
      runs.push({
        id: uid(), date: mkDate(longIdx), type: 'long',
        distance: longDist, estimatedPace: paces.long,
        completed: false, skipped: false, notes: '',
        week, label: 'Long Run', wFE, planGenerated: true,
      });

      otherDays.forEach((di, i) => {
        let type, pace, dist, label;
        if (isTempo && i === tIdx) {
          type = 'tempo'; pace = paces.tempo;
          dist = Math.max(3, Math.round(longDist * 0.38 * 2) / 2);
          label = 'Tempo Run';
        } else if (isCut) {
          type = 'recovery'; pace = paces.recovery;
          dist = Math.max(3, Math.round(longDist * 0.28 * 2) / 2);
          label = 'Recovery Run';
        } else {
          type = 'easy'; pace = paces.easy;
          dist = Math.max(3, Math.round(longDist * (i === 0 ? 0.42 : 0.32) * 2) / 2);
          label = 'Easy Run';
        }
        runs.push({
          id: uid(), date: mkDate(di), type, distance: dist,
          estimatedPace: pace, completed: false, skipped: false,
          notes: '', week, label, wFE, planGenerated: true,
        });
      });
    }
  }

  return runs.sort((a, b) => a.date.localeCompare(b.date));
}

export function getCurrentWeek() {
  if (!state.plan.length) return 1;
  const today = dStr(new Date());
  const future = state.plan
    .filter(r => !r.completed && !r.skipped && r.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date));
  if (future.length) return future[0].week;
  return state.plan[state.plan.length-1].week;
}

export function raceCountdown() {
  const rd = state.profile?.raceDate;
  if (!rd) return `Race in ${getPlanTotalWeeks() - getCurrentWeek()} weeks`;
  const race  = parseDate(rd);
  const today = new Date(); today.setHours(0,0,0,0);
  const diffMs   = race - today;
  const diffDays = Math.round(diffMs / 86400000);
  const label = race.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (diffDays < 0)  return `Race was ${label}`;
  if (diffDays === 0) return `🏅 Race day is TODAY — ${label}!`;
  if (diffDays < 7)   return `🏅 Race day in ${diffDays} day${diffDays===1?'':'s'} — ${label}`;
  const weeks = Math.floor(diffDays / 7);
  const days  = diffDays % 7;
  return `Race: ${label} · ${weeks}w ${days}d to go`;
}
