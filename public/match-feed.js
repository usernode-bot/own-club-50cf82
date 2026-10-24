// The match you can watch: a saved report turned into a minute-by-minute feed.
// Pure and DOM-free, so the same report always gives the same timeline, and
// Play and Skip to full time both end on this exact list.

import { CLUB_BY_ID, FAN_CAP, clubTier, creditsForResult, homeCrowd } from './engine.js';

const EN = '–';

// The clubs' short codes as the header shows them.
function sideCode(report, side) {
  return (report[side] && report[side].short) || '';
}
function scoreLine(report, score) {
  return sideCode(report, 'home') + ' ' + score[0] + EN + score[1] + ' ' + sideCode(report, 'away');
}
function homeName(report) {
  return (report.home && report.home.name) || 'The home side';
}

// One event, with the running score it leaves behind.
function event(minute, kind, label, text, extra) {
  return Object.assign({ minute, kind, label, player: '', code: '', side: '', text, score: null }, extra);
}

export function buildTimeline(report, clubById = CLUB_BY_ID) {
  if (!report || !Array.isArray(report.moments)) return [];
  const events = [];
  const score = [0, 0];
  const left = { home: 11, away: 11 };
  const ground = (clubById[report.home.id] || {}).ground;

  // A kick-off always starts the feed, so a quiet match is still a match.
  events.push(event(0, 'kickoff', 'Kick-off',
    ground ? homeName(report) + ' get the match under way at ' + ground + '.' : 'The match is under way.',
    { score: score.slice() }));

  const moments = report.moments.slice();
  let halfDone = false;
  const pushHalf = () => {
    if (halfDone) return;
    halfDone = true;
    events.push(event(45, 'half', 'Half-time', 'Half-time: ' + scoreLine(report, score) + '.', { score: score.slice() }));
  };

  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];
    const minute = Number(m.minute) || 0;
    if (minute > 45) pushHalf();
    const side = m.side === 'away' ? 'away' : 'home';
    const code = sideCode(report, side) || ((clubById[(report[side] || {}).id] || {}).short || '');
    const name = m.playerName || '';
    let player = name;

    if (m.type === 'goal') {
      score[side === 'home' ? 0 : 1] += 1;
      const text = m.assistName
        ? m.assistName + ' picks out ' + name + ': ' + scoreLine(report, score) + '.'
        : name + ' goes it alone and scores: ' + scoreLine(report, score) + '.';
      events.push(event(minute, 'goal', 'Goal', text, { player, code, side, score: score.slice() }));
      continue;
    }

    if (m.type === 'yellow') {
      const foulOn = /Foul on (.+)$/.exec(m.detail || '');
      const text = foulOn
        ? name + ' goes into the book for a foul on ' + foulOn[1] + '.'
        : name + ' goes into the book.';
      events.push(event(minute, 'yellow', 'Yellow card', text, { player, code, side, score: score.slice() }));
      continue;
    }

    if (m.type === 'red') {
      // A second yellow can be saved without the player's name: take it from
      // the yellow card that sent him off.
      if (!player) {
        const earlier = moments.find((x) => x.type === 'yellow' && x.side === m.side
          && x.playerId && x.playerId === m.playerId && x.playerName);
        player = earlier ? earlier.playerName : '';
      }
      left[side] = Math.max(1, left[side] - 1);
      const down = ', and ' + code + ' are down to ' + left[side] + ' players.';
      const text = /second yellow/i.test(m.detail || '')
        ? 'A second yellow for ' + player + down
        : player + ' is sent off' + down;
      events.push(event(minute, 'red', 'Red card', text, { player, code, side, score: score.slice() }));
      continue;
    }

    if (m.type === 'injury') {
      const next = moments[i + 1];
      const sub = next && next.type === 'sub' && next.side === m.side && next.minute === m.minute
        && next.playerOutName === name ? next : null;
      if (sub) i += 1;
      const replacement = sub ? sub.playerName : '';
      if (!replacement) left[side] = Math.max(1, left[side] - 1);
      const text = replacement
        ? name + ' cannot carry on, and ' + replacement + ' comes on.'
        : name + ' cannot carry on, and ' + code + ' have no one left to bring on.';
      events.push(event(minute, 'injury', 'Injury', text, {
        player, code, side, replacement, score: score.slice(),
      }));
      continue;
    }

    if (m.type === 'sub') {
      const out = m.playerOutName || 'a tiring player';
      events.push(event(minute, 'sub', 'Substitution',
        name + ' comes on for a tiring ' + out + '.', { player, code, side, score: score.slice() }));
    }
  }
  pushHalf();

  // Full time is the recorded result, whatever the running count says, so the
  // scoreline always matches the Competition table.
  const finalScore = [Number(report.homeGoals) || 0, Number(report.awayGoals) || 0];
  const goals = moments.filter((m) => m.type === 'goal').length;
  const yellows = moments.filter((m) => m.type === 'yellow').length;
  const reds = moments.filter((m) => m.type === 'red').length;
  let text;
  if (!goals && !yellows && !reds) {
    const shots = report.stats && Array.isArray(report.stats.shots)
      ? (Number(report.stats.shots[0]) || 0) + (Number(report.stats.shots[1]) || 0) : 0;
    text = 'A quiet match: no goals, no cards and ' + shots + ' shots between the two sides.';
  } else if (!goals && (yellows || reds)) {
    const parts = [];
    if (yellows) parts.push(yellows + (yellows === 1 ? ' yellow card' : ' yellow cards'));
    if (reds) parts.push(reds + (reds === 1 ? ' red card' : ' red cards'));
    text = 'Goalless, with ' + parts.join(' and ') + ' shown.';
  } else {
    text = 'Full time: ' + scoreLine(report, finalScore) + '.';
  }
  events.push(event(90, 'full', 'Full time', text, { score: finalScore.slice() }));
  return events;
}

// The crowd at the match. A home match has the figure the gate took in; an
// away match estimates the home club's crowd from the division's limit and
// the home club's reputation, and says it is an estimate.
export function matchCrowd(report, career, clubById = CLUB_BY_ID) {
  if (!report || !career) return { attendance: 0, estimate: false };
  const ownHome = report.home && report.home.id === career.clubId;
  const tier = clubTier(career);
  const cap = FAN_CAP[tier] || FAN_CAP[3];
  if (ownHome) {
    const fin = report.finance;
    if (fin && Number.isFinite(fin.attendance)) return { attendance: fin.attendance, estimate: false };
    const fans = Number.isFinite(career.fans) ? career.fans : 0;
    return { attendance: homeCrowd(career, fans, cap).attendance, estimate: false };
  }
  const home = clubById[(report.home || {}).id] || {};
  const rep = Math.max(1, Math.min(5, Number(home.rep) || 1));
  const share = Math.min(1, 0.3 + 0.12 * rep);
  return { attendance: Math.min(cap, Math.round((cap * share) / 10) * 10), estimate: true };
}

// The one line at full time naming what the result paid. A report saved
// before match finances existed has none.
export function creditsLine(finance) {
  if (!finance) return null;
  const paid = creditsForResult(
    finance.result === 'win' ? 1 : 0,
    finance.result === 'loss' ? 1 : 0,
  );
  const what = finance.result === 'win' ? 'A win' : finance.result === 'loss' ? 'A loss' : 'A draw';
  const net = Number(finance.net) || 0;
  const signedNet = (net > 0 ? '+' : net < 0 ? '−' : '') + Math.abs(net).toLocaleString('en-US');
  return what + ': ' + paid + ' Club credits for the result. This matchday\'s net, '
    + signedNet + ', is on the ';
}
