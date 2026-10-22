// The daily match allowance: three matchdays a day, at 9 am, 3 pm and 9 pm on
// the manager's own clock, checked on the page and again by the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_SLOTS, MATCHES_PER_DAY, validTimeZone, localClock, slotLabel,
  matchAllowance, matchLimitError, repairCareer, buildInitialState,
} from '../public/engine.js';

const LONDON = 'Europe/London';
// October is British Summer Time: London is UTC+1.
const london = (iso) => new Date(iso + 'Z');

test('the slots are 9 am, 3 pm and 9 pm', () => {
  assert.deepEqual(MATCH_SLOTS, [9, 15, 21]);
  assert.equal(MATCHES_PER_DAY, 3);
  assert.equal(slotLabel(9), '9 am');
  assert.equal(slotLabel(15), '3 pm');
  assert.equal(slotLabel(21), '9 pm');
});

test('before 9 am nothing is open', () => {
  const allowance = matchAllowance([], london('2026-10-22T07:59:00'), LONDON);
  assert.equal(allowance.open, 0);
  assert.equal(allowance.canPlay, false);
  assert.deepEqual(allowance.nextSlot, { hour: 9, tomorrow: false });
});

test('at 9 am one match is open, then the next is 3 pm', () => {
  const at9 = london('2026-10-22T08:00:00');
  const fresh = matchAllowance([], at9, LONDON);
  assert.equal(fresh.open, 1);
  assert.equal(fresh.canPlay, true);
  const played = matchAllowance([at9.toISOString()], at9, LONDON);
  assert.equal(played.playedToday, 1);
  assert.equal(played.canPlay, false);
  assert.deepEqual(played.nextSlot, { hour: 15, tomorrow: false });
});

test('at 10:30 pm three are open and a fourth is refused', () => {
  const at = london('2026-10-22T21:30:00');
  let plays = [];
  const stored = { matchday: 5, season: 1, plays };
  for (let i = 0; i < 3; i++) {
    const result = matchLimitError(stored, { matchday: 6 + i, season: 1 }, at, LONDON);
    assert.equal(result.message, null);
    plays = result.plays;
    stored.matchday = 6 + i;
    stored.plays = plays;
  }
  assert.equal(plays.length, 3);
  const fourth = matchLimitError(stored, { matchday: 9, season: 1 }, at, LONDON);
  assert.match(fourth.message, /9 am tomorrow/);
  assert.equal(fourth.plays.length, 3);
});

test("yesterday's plays do not count today", () => {
  const allowance = matchAllowance([london('2026-10-21T20:00:00').toISOString()], london('2026-10-22T08:30:00'), LONDON);
  assert.equal(allowance.playedToday, 0);
  assert.equal(allowance.canPlay, true);
});

test('the same instant is a different day and slot elsewhere', () => {
  const instant = london('2026-10-22T22:30:00'); // 21:30 UTC
  assert.equal(localClock(instant, 'Asia/Jakarta').day, '2026-10-23');
  assert.equal(localClock(instant, 'Asia/Jakarta').hour, 5);
  assert.equal(localClock(instant, 'America/New_York').day, '2026-10-22');
  assert.equal(localClock(instant, 'America/New_York').hour, 18);
  assert.equal(matchAllowance([], instant, 'Asia/Jakarta').open, 0);
  assert.equal(matchAllowance([], instant, 'America/New_York').open, 2);
});

test('a save within the allowance records the play', () => {
  const at = london('2026-10-22T10:00:00');
  const result = matchLimitError({ matchday: 3, season: 1, plays: [] }, { matchday: 4 }, at, LONDON);
  assert.equal(result.message, null);
  assert.deepEqual(result.plays, [at.toISOString()]);
});

test('a save past the open slots is refused, naming the slot', () => {
  const at = london('2026-10-22T10:00:00');
  const play = at.toISOString();
  const result = matchLimitError({ matchday: 3, season: 1, plays: [play] }, { matchday: 4 }, at, LONDON);
  assert.equal(result.message, 'The 3 pm match is not open yet.');
});

test('starting next season does not spend a match', () => {
  const at = london('2026-10-22T08:30:00');
  const result = matchLimitError(
    { matchday: 34, season: 1, plays: [london('2026-10-21T20:00:00').toISOString()] },
    { matchday: 0, season: 2 },
    at, LONDON
  );
  assert.equal(result.message, null);
  assert.deepEqual(result.plays, [london('2026-10-21T20:00:00').toISOString()]);
});

test('repairCareer fills plays, filters junk and keeps the last three', () => {
  const base = buildInitialState('harbourside', 'Test manager', 7);
  assert.deepEqual(repairCareer(base).plays, []);
  const one = '2026-10-22T08:00:00.000Z';
  const two = '2026-10-22T14:00:00.000Z';
  const three = '2026-10-22T20:00:00.000Z';
  const four = '2026-10-22T20:30:00.000Z';
  assert.deepEqual(repairCareer({ ...base, plays: [one, 'nonsense', 5, null, two] }).plays, [one, two]);
  assert.deepEqual(repairCareer({ ...base, plays: [one, two, three, four] }).plays, [two, three, four]);
  assert.deepEqual(repairCareer({ ...base, plays: 'junk' }).plays, []);
});

test('an unusable zone reads as UTC', () => {
  assert.equal(validTimeZone('Europe/London'), true);
  assert.equal(validTimeZone('Not/AZone'), false);
  assert.equal(validTimeZone(''), false);
  const clock = localClock(new Date('2026-10-22T07:59:00Z'), 'Not/AZone');
  assert.deepEqual(clock, { day: '2026-10-22', hour: 7, minute: 59 });
});
