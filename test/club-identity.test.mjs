// Checks for the clubs' fictional identities: unique names, three-letter
// codes, cities, kit colours from the design tokens, unique stadium names,
// and the deny-list that keeps real football out of the game. Run with
// `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLUBS, CLUB_COUNT, GROUPS, clubToGroup, buildInitialState,
  normalizeClubName, REAL_CLUB_DENYLIST, REAL_STADIUM_DENYLIST,
} from '../public/engine.js';

// Every club's formation, exactly as the pyramid dealt them before identity
// fields were added. Adding fields and re-wording stadiums must not shift a
// single draw of the generation stream. The league grew to twelve Division 3
// groups (306 clubs), so the pin carries the 144 clubs that pass appended,
// in order, after the original 162, whose draws are unchanged.
const FORMATIONS_PIN = 'harbourside:4-3-3|redvale:4-2-3-1|kingsmoor:4-3-3|northmoor:4-4-2|baymouth:4-4-2|saltmarsh:3-5-2|cliffton:5-3-2|marrow:4-3-3|gullport:4-4-2|kestrel:5-3-2|redmoss-town:3-5-2|thornleigh-athletic:4-3-3|overton-rovers:4-4-2|kirkstone-town:4-3-3|wexley-town:4-3-3|barrowden-rovers:4-3-3|ashcombe-fc:5-3-2|valebrook-rovers:4-4-2|rosemarket-rovers:4-4-2|dunmore-fc:4-2-3-1|northgate-city:4-3-3|redmoss-athletic:4-2-3-1|pinewood-athletic:4-3-3|saltby-wanderers:5-3-2|yarrow-united:5-3-2|overton-town:3-5-2|underhill-united:5-3-2|yarrow-town:4-2-3-1|mossley-town:3-5-2|hollins-town:4-2-3-1|lowmere-city:5-3-2|larkspur-athletic:4-4-2|wexley-rovers:4-3-3|longmarsh-athletic:4-3-3|ivybridge-town:4-4-2|coldharbour-wanderers:4-2-3-1|ingleby-fc:4-2-3-1|millbrook-fc:4-4-2|yewdale-rovers:4-2-3-1|glenross-city:4-4-2|coldharbour-fc:4-3-3|underhill-wanderers:3-5-2|ostrey-town:3-5-2|yarrow-rovers:4-4-2|torcross-town:5-3-2|valebrook-united:3-5-2|ostrey-rovers:3-5-2|redmoss-united:4-3-3|longmarsh-rovers:4-3-3|hartwell-rovers:4-2-3-1|pellow-athletic:3-5-2|pinewood-city:4-3-3|lowmere-rovers:4-3-3|thornleigh-wanderers:4-2-3-1|rosemarket-fc:4-2-3-1|tarnbrook-athletic:4-4-2|pellow-town:4-4-2|mossley-wanderers:4-2-3-1|kirkstone-fc:4-4-2|ostrey-wanderers:4-3-3|yarrow-fc:4-2-3-1|quarrydale-wanderers:4-4-2|pellow-united:3-5-2|valebrook-fc:4-2-3-1|aldermere-rovers:5-3-2|ingleby-town:4-2-3-1|aldermere-town:4-4-2|marwick-town:3-5-2|pinewood-wanderers:3-5-2|hollins-wanderers:3-5-2|bracken-fc:4-3-3|uppermill-rovers:3-5-2|aldermere-athletic:3-5-2|stonebury-wanderers:4-2-3-1|millbrook-wanderers:3-5-2|eastgate-fc:4-2-3-1|northgate-athletic:5-3-2|barrowden-town:4-2-3-1|pellow-fc:3-5-2|millbrook-city:3-5-2|longmarsh-city:4-2-3-1|fenwick-town:3-5-2|uppermill-town:4-3-3|kelbrook-town:4-3-3|mossley-rovers:4-2-3-1|northgate-rovers:5-3-2|dunmore-united:4-3-3|torcross-athletic:4-4-2|torcross-united:4-3-3|jarrow-athletic:4-4-2|hartwell-fc:4-2-3-1|wrenfield-wanderers:5-3-2|netherby-wanderers:4-3-3|torcross-rovers:4-4-2|marwick-city:4-4-2|northgate-united:4-3-3|briarwood-city:5-3-2|jarrow-united:4-3-3|bracken-united:4-2-3-1|thornleigh-city:3-5-2|ostrey-fc:3-5-2|torcross-city:4-2-3-1|yarrow-athletic:4-4-2|saltby-athletic:4-3-3|saltby-city:4-2-3-1|wrenfield-rovers:4-4-2|larkspur-city:3-5-2|northgate-town:4-4-2|marwick-rovers:4-2-3-1|ivybridge-athletic:5-3-2|pellow-rovers:3-5-2|wrenfield-town:5-3-2|fairholt-rovers:3-5-2|overton-athletic:3-5-2|pinewood-rovers:3-5-2|northgate-fc:4-2-3-1|hollins-united:5-3-2|quarrydale-town:4-3-3|fenwick-fc:4-4-2|valebrook-wanderers:5-3-2|jarrow-city:5-3-2|rosemarket-town:4-3-3|marwick-united:5-3-2|aldermere-united:4-2-3-1|kirkstone-united:5-3-2|kirkstone-athletic:3-5-2|stonebury-rovers:4-3-3|yewdale-town:4-2-3-1|westhaven-town:4-2-3-1|penrose-rovers:4-3-3|mossley-city:4-2-3-1|uppermill-city:4-3-3|kelbrook-fc:3-5-2|ashcombe-united:4-2-3-1|bracken-rovers:4-3-3|fairholt-athletic:5-3-2|fenwick-wanderers:5-3-2|kirkstone-rovers:4-2-3-1|rosemarket-united:3-5-2|wexley-athletic:4-2-3-1|wexley-united:3-5-2|fairholt-fc:3-5-2|ashcombe-city:5-3-2|eastgate-city:4-4-2|barrowden-fc:4-4-2|mossley-athletic:3-5-2|marwick-athletic:4-4-2|yewdale-athletic:4-4-2|westhaven-athletic:4-2-3-1|ingleby-athletic:4-4-2|uppermill-united:4-4-2|ingleby-rovers:5-3-2|uppermill-athletic:5-3-2|ingleby-united:5-3-2|fairholt-city:4-4-2|tarnbrook-fc:3-5-2|netherby-city:5-3-2|kelbrook-wanderers:5-3-2|redmoss-rovers:4-2-3-1|kelbrook-rovers:5-3-2|underhill-fc:5-3-2|penrose-town:4-4-2|lowmere-united:4-4-2|eastgate-rovers:4-2-3-1|barrowden-city:5-3-2|quarrydale-rovers:3-5-2|barrowden-athletic:3-5-2|westhaven-fc:4-3-3|valebrook-town:4-4-2|hartwell-athletic:3-5-2|kelbrook-city:4-2-3-1|marwick-wanderers:5-3-2|dunmore-athletic:4-2-3-1|glenross-town:4-4-2|ashcombe-wanderers:5-3-2|jarrow-rovers:4-4-2|stonebury-fc:5-3-2|aldermere-city:4-3-3|briarwood-athletic:4-4-2|hartwell-city:5-3-2|underhill-rovers:4-3-3|barrowden-united:4-3-3|ostrey-united:3-5-2|uppermill-fc:4-4-2|netherby-athletic:3-5-2|wrenfield-athletic:4-4-2|pinewood-town:4-2-3-1|aldermere-fc:3-5-2|ingleby-city:5-3-2|kirkstone-wanderers:4-3-3|jarrow-wanderers:4-2-3-1|mossley-united:4-2-3-1|pellow-city:5-3-2|bracken-wanderers:4-3-3|stonebury-city:4-4-2|westhaven-united:4-4-2|dunmore-town:4-3-3|wrenfield-city:4-4-2|westhaven-rovers:3-5-2|saltby-fc:4-3-3|longmarsh-fc:4-2-3-1|marwick-fc:4-4-2|torcross-fc:4-3-3|stonebury-united:5-3-2|fairholt-wanderers:3-5-2|briarwood-rovers:4-4-2|briarwood-wanderers:5-3-2|wexley-wanderers:5-3-2|ivybridge-wanderers:5-3-2|penrose-city:3-5-2|millbrook-united:4-4-2|overton-united:4-3-3|hartwell-united:5-3-2|hartwell-town:4-4-2|rosemarket-wanderers:4-3-3|coldharbour-town:4-3-3|yewdale-wanderers:4-3-3|ostrey-city:4-4-2|larkspur-fc:4-4-2|northgate-wanderers:4-4-2|tarnbrook-town:3-5-2|larkspur-wanderers:3-5-2|thornleigh-united:3-5-2|saltby-rovers:4-4-2|larkspur-united:4-2-3-1|rosemarket-city:4-2-3-1|stonebury-athletic:3-5-2|netherby-town:4-4-2|westhaven-city:4-3-3|tarnbrook-wanderers:4-3-3|briarwood-united:4-3-3|penrose-wanderers:3-5-2|eastgate-town:4-2-3-1|pinewood-fc:4-4-2|yewdale-fc:4-4-2|yarrow-wanderers:5-3-2|wrenfield-united:4-4-2|fairholt-united:5-3-2|wrenfield-fc:3-5-2|eastgate-wanderers:5-3-2|ashcombe-athletic:5-3-2|torcross-wanderers:5-3-2|oakhurst-wanderers:3-5-2|ashcombe-rovers:3-5-2|glenross-rovers:4-3-3|thornleigh-town:4-2-3-1|pinewood-united:4-2-3-1|lowmere-athletic:3-5-2|oakhurst-athletic:4-2-3-1|netherby-fc:5-3-2|stonebury-town:4-3-3|coldharbour-united:4-4-2|underhill-town:5-3-2|quarrydale-city:4-4-2|oakhurst-fc:3-5-2|tarnbrook-rovers:4-2-3-1|hollins-city:4-4-2|briarwood-fc:4-3-3|underhill-athletic:4-4-2|ingleby-wanderers:4-4-2|tarnbrook-united:4-3-3|quarrydale-united:3-5-2|redmoss-city:4-2-3-1|fenwick-united:4-3-3|bracken-city:4-4-2|eastgate-united:5-3-2|oakhurst-united:4-4-2|fairholt-town:4-4-2|thornleigh-rovers:3-5-2|valebrook-athletic:4-4-2|barrowden-wanderers:4-2-3-1|hollins-fc:4-3-3|overton-fc:4-2-3-1|thornleigh-fc:5-3-2|aldermere-wanderers:4-2-3-1|kelbrook-athletic:4-2-3-1|wexley-city:3-5-2|larkspur-rovers:4-4-2|overton-city:4-2-3-1|dunmore-rovers:5-3-2|coldharbour-athletic:4-4-2|ivybridge-city:5-3-2|lowmere-wanderers:4-4-2|yarrow-city:5-3-2|jarrow-town:3-5-2|redmoss-fc:3-5-2|netherby-united:4-2-3-1|oakhurst-town:5-3-2|westhaven-wanderers:4-4-2|ivybridge-fc:4-4-2|overton-wanderers:4-3-3|ivybridge-rovers:3-5-2|tarnbrook-city:3-5-2|fenwick-city:4-4-2|longmarsh-wanderers:5-3-2|yewdale-city:3-5-2|bracken-town:4-3-3|yewdale-united:4-2-3-1|wexley-fc:4-3-3|briarwood-town:4-3-3|penrose-united:5-3-2|redmoss-wanderers:3-5-2|jarrow-fc:4-3-3|dunmore-city:3-5-2|saltby-town:4-3-3|ashcombe-town:4-2-3-1';

const stemOf = (name) => name.split(' ')[0];

test('every club has a unique name, code, city, kit and stadium', () => {
  assert.equal(CLUBS.length, CLUB_COUNT);
  const uniq = (key) => {
    const values = CLUBS.map((c) => c[key]);
    const dupes = values.filter((v, i) => values.indexOf(v) !== i);
    assert.deepEqual(dupes, [], 'duplicate ' + key);
  };
  for (const key of ['id', 'name', 'short', 'code', 'ground']) uniq(key);
  for (const c of CLUBS) {
    assert.match(c.code, /^[A-Z]{3}$/, c.name + ' code');
    assert.ok(c.city.length > 0, c.name + ' city');
    assert.ok(c.city === stemOf(c.name), c.name + ' city is its stem');
    assert.ok(Number.isInteger(c.kit) && c.kit >= 0 && c.kit <= 16, c.name + ' kit');
  }
  // The monogram and the code are different things: the badge keeps the
  // initials, the pill carries the code.
  for (const c of CLUBS) assert.notEqual(c.code, c.short, c.name);
});

test('no club name, stadium or league name copies real football', () => {
  assert.ok(REAL_CLUB_DENYLIST.length >= 100, 'the deny-list is populated');
  const denied = new Set(REAL_CLUB_DENYLIST.map(normalizeClubName));
  const stadiums = new Set(REAL_STADIUM_DENYLIST.map(normalizeClubName));
  assert.ok(stadiums.size >= 20, 'the stadium deny-list is populated');
  for (const c of CLUBS) {
    assert.ok(!denied.has(normalizeClubName(c.name)), 'real club name: ' + c.name);
    assert.ok(!stadiums.has(normalizeClubName(c.ground)), 'real stadium name: ' + c.ground);
  }
  // The normaliser: case, accents and spacing never hide a match.
  assert.equal(normalizeClubName('Paris Saint-Germain'), 'paris saint germain');
  assert.equal(normalizeClubName('  Fenerbahçe  SK '), 'fenerbahce sk');
  assert.equal(normalizeClubName('Wolverhampton   Wanderers'), 'wolverhampton wanderers');
});

test('clubs sharing a stem in one group differ in suffix and code', () => {
  for (const g of GROUPS) {
    const byStem = {};
    for (const id of g.clubIds) {
      const c = CLUBS.find((x) => x.id === id);
      (byStem[stemOf(c.name)] = byStem[stemOf(c.name)] || []).push(c);
    }
    for (const [stem, clubs] of Object.entries(byStem)) {
      if (clubs.length < 2) continue;
      const suffixes = clubs.map((c) => c.name.slice(stem.length + 1));
      assert.equal(new Set(suffixes).size, suffixes.length, g.name + ' ' + stem + ' suffixes');
      assert.equal(new Set(clubs.map((c) => c.code)).size, clubs.length, g.name + ' ' + stem + ' codes');
    }
  }
});

test('identity never depends on the career seed', () => {
  const before = CLUBS.map((c) => [c.id, c.name, c.code, c.city, c.kit, c.ground].join('|'));
  buildInitialState(CLUBS[0].id, 'Seed A', 12345);
  buildInitialState(CLUBS[5].id, 'Seed B', 987654321);
  const after = CLUBS.map((c) => [c.id, c.name, c.code, c.city, c.kit, c.ground].join('|'));
  assert.deepEqual(after, before);
});

test('the stadium pass and new fields shift no formation', () => {
  const now = CLUBS.map((c) => c.id + ':' + c.formation).join('|');
  assert.equal(now, FORMATIONS_PIN);
});

test('kit primaries keep white text readable in both looks', () => {
  const css = readFileSync(new URL('../styles/tailwind-input.css', import.meta.url), 'utf8');
  const tokens = (block) => {
    const start = css.indexOf(block);
    assert.ok(start >= 0, block + ' exists');
    const end = css.indexOf('}', start);
    const section = css.slice(start, end);
    const out = {};
    for (const m of section.matchAll(/--(kit-(\d+)(s?)):\s*([\d ]+|var\(--pitch\))/g)) {
      out[m[2] + (m[3] || '')] = m[4].trim();
    }
    return out;
  };
  const light = tokens(':root');
  const dark = tokens('.dark');
  for (const [name, look, pitch] of [['light', light, '21 94 58'], ['dark', dark, '18 82 51']]) {
    assert.equal(Object.keys(look).length, 34, '17 kit pairs in ' + name);
    for (let i = 0; i <= 16; i++) {
      const parts = (look[String(i)] === 'var(--pitch)' ? pitch : look[String(i)])
        .split(/\s+/).map(Number);
      assert.equal(parts.length, 3, 'kit-' + i + ' is an RGB triplet');
      const lum = (v) => {
        const c = v.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ratio = (lum([255, 255, 255]) + 0.05) / (lum(parts) + 0.05);
      assert.ok(ratio >= 4.5, 'kit-' + i + ' white text ' + ratio.toFixed(2) + ':1');
    }
  }
  // Harbourside stays the pitch token, in both looks.
  assert.equal(light['16'], 'var(--pitch)');
  assert.equal(dark['16'], 'var(--pitch)');
});
