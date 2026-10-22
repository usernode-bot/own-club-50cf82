// The match schedule: four kick-offs a day at 12 am, 6 am, 12 pm and 6 pm on
// the manager's own clock, played by the server when they fall due.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_SLOTS, MATCHES_PER_DAY, validTimeZone, localClock, slotLabel,
  slotAfter, firstSlotOfDay, upcomingSlots, playDueMatches, repairCareer,
  buildInitialState,
} from '../public/engine.js';

const LONDON = 'Europe/London';
// October is British Summer Time: London is UTC+1.
const london = (iso) => new Date(iso + 'Z');

test('the slots are 12 am, 6 am, 12 pm and 6 pm', () => {
  assert.deepEqual(MATCH_SLOTS, [0, 6, 12, 18]);
  assert.equal(MATCHES_PER_DAY, 4);
  assert.equal(slotLabel(0), '12 am');
  assert.equal(slotLabel(6), '6 am');
  assert.equal(slotLabel(12), '12 pm');
  assert.equal(slotLabel(18), '6 pm');
});

test('slotAfter finds the next kick-off', () => {
  assert.equal(slotAfter(london('2026-10-22T07:00:00'), LONDON).toISOString(), '2026-10-22T11:00:00.000Z');
  assert.equal(slotAfter(london('2026-10-22T11:00:00'), LONDON).toISOString(), '2026-10-22T17:00:00.000Z');
  assert.equal(slotAfter(london('2026-10-22T20:30:00'), LONDON).toISOString(), '2026-10-22T23:00:00.000Z');
});

test('a kick-off keeps its wall-clock time across the clocks going back', () => {
  // London leaves BST in the early hours of 25 Oct 2026, so 6 am that day is 06:00 UTC.
  const slot = slotAfter(london('2026-10-25T02:00:00'), LONDON);
  assert.equal(slot.toISOString(), '2026-10-25T06:00:00.000Z');
  assert.equal(localClock(slot, LONDON).hour, 6);
});

test('the same instant is a different day and slot elsewhere', () => {
  const instant = london('2026-10-22T22:30:00'); // 21:30 UTC
  assert.equal(localClock(instant, 'Asia/Jakarta').day, '2026-10-23');
  assert.equal(localClock(instant, 'Asia/Jakarta').hour, 5);
  assert.equal(localClock(instant, 'America/New_York').hour, 18);
  // After London's clocks go back the two zones sit on different sides of a
  // six-hour slot, so the next kick-off is not the same instant.
  assert.notEqual(slotAfter(london('2026-10-25T02:00:00'), 'Asia/Jakarta').toISOString(),
    slotAfter(london('2026-10-25T02:00:00'), LONDON).toISOString());
  assert.notEqual(slotAfter(london('2026-10-22T07:00:00'), 'America/New_York').toISOString(),
    slotAfter(london('2026-10-22T07:00:00'), LONDON).toISOString());
});

test('firstSlotOfDay and upcomingSlots walk every kick-off', () => {
  assert.equal(firstSlotOfDay(london('2026-10-22T12:00:00'), LONDON).toISOString(), '2026-10-21T23:00:00.000Z');
  const slots = upcomingSlots('2026-10-21T23:00:00.000Z', 5, LONDON).map((d) => d.toISOString());
  assert.deepEqual(slots, [
    '2026-10-21T23:00:00.000Z',
    '2026-10-22T05:00:00.000Z',
    '2026-10-22T11:00:00.000Z',
    '2026-10-22T17:00:00.000Z',
    '2026-10-22T23:00:00.000Z',
  ]);
});

function careerWithSchedule() {
  const state = buildInitialState('harbourside', 'Test manager', 7);
  state.nextMatchAt = '2026-10-21T23:00:00.000Z';
  return state;
}

test('nothing due plays nothing, and one slot due plays one match', () => {
  const state = careerWithSchedule();
  assert.equal(playDueMatches(state, london('2026-10-21T22:59:00'), LONDON), 0);
  assert.equal(state.matchday, 0);
  assert.equal(playDueMatches(state, london('2026-10-21T23:05:00'), LONDON), 1);
  assert.equal(state.matchday, 1);
  assert.deepEqual(state.plays, ['2026-10-21T23:00:00.000Z']);
  assert.equal(state.nextMatchAt, '2026-10-22T05:00:00.000Z');
});

test('two days away plays eight matches, four a day', () => {
  const state = careerWithSchedule();
  // 23 Oct 22:00 London = 21:00 UTC: the 22nd's four and the 23rd's four.
  assert.equal(playDueMatches(state, london('2026-10-23T21:00:00'), LONDON), 8);
  assert.equal(state.matchday, 8);
  assert.equal(state.plays.length, 4);
});

test('a near-finished season stops at its last fixture', () => {
  const state = careerWithSchedule();
  while (state.fixtures.length - state.matchday > 2) state.matchday++;
  state.results = [];
  // Play up to the last fixture, then the schedule stops.
  const played = playDueMatches(state, london('2026-10-30T22:00:00'), LONDON);
  assert.equal(played, 2);
  assert.equal(state.finished, true);
  assert.equal(state.nextMatchAt, null);
  assert.equal(playDueMatches(state, london('2026-11-30T22:00:00'), LONDON), 0);
});

test('an injured starter still lets the match play, with the best eleven', () => {
  const state = careerWithSchedule();
  const starter = state.squads[state.clubId].find((p) => state.lineup.includes(p.id));
  starter.injury = 2;
  const before = state.lineup.slice();
  assert.equal(playDueMatches(state, london('2026-10-21T23:05:00'), LONDON), 1);
  assert.notDeepEqual(state.lineup, before);
  assert.equal(state.lineup.includes(starter.id), false);
});

test('repairCareer fills plays, filters junk, keeps the last four and the schedule', () => {
  const base = buildInitialState('harbourside', 'Test manager', 7);
  assert.deepEqual(repairCareer(base).plays, []);
  const one = '2026-10-21T23:00:00.000Z';
  const two = '2026-10-22T05:00:00.000Z';
  const three = '2026-10-22T11:00:00.000Z';
  const four = '2026-10-22T17:00:00.000Z';
  const five = '2026-10-22T23:00:00.000Z';
  assert.deepEqual(repairCareer({ ...base, plays: [one, 'nonsense', 5, null, two] }).plays, [one, two]);
  assert.deepEqual(repairCareer({ ...base, plays: [one, two, three, four, five] }).plays, [two, three, four, five]);
  assert.deepEqual(repairCareer({ ...base, plays: 'junk' }).plays, []);
  assert.equal(repairCareer({ ...base, nextMatchAt: two }).nextMatchAt, two);
  assert.equal(repairCareer({ ...base, nextMatchAt: null }).nextMatchAt, null);
  assert.equal('nextMatchAt' in repairCareer({ ...base, nextMatchAt: 'junk' }), false);
});

test('an unusable zone reads as UTC', () => {
  assert.equal(validTimeZone('Europe/London'), true);
  assert.equal(validTimeZone('Not/AZone'), false);
  assert.equal(validTimeZone(''), false);
  const clock = localClock(new Date('2026-10-22T07:59:00Z'), 'Not/AZone');
  assert.deepEqual(clock, { day: '2026-10-22', hour: 7, minute: 59 });
});
