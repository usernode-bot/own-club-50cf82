// Own Club's football engine: everything that decides how a season and a
// match play out, with no DOM and no network. The app (public/app.js) runs it
// and saves the state it returns; the server (server.js) uses it to build the
// first version of a career and the staging demo.
//
// Everything here is deterministic: the same state and the same seed produce
// the same match, every time. Randomness comes only from mulberry32 streams
// seeded from the career seed.

// All fictional. `rep` is the board's 1 to 5 star standing, which sets the
// quality of the squad it is dealt. The pyramid itself is built below, after
// the formations, because a generated club is dealt one of them.
const COASTAL_CLUBS = [
  { id: 'harbourside', name: 'Harbourside FC', short: 'HF', color: 'rgb(var(--pitch))', rep: 4, formation: '4-3-3', objective: 'Finish in the top half', ground: 'The Quay' },
  { id: 'redvale', name: 'Redvale Athletic', short: 'RA', color: '#7a3b8f', rep: 5, formation: '4-2-3-1', objective: 'Win the league', ground: 'Redvale Park' },
  { id: 'kingsmoor', name: 'Kingsmoor United', short: 'KU', color: '#1e4fa3', rep: 5, formation: '4-3-3', objective: 'Win the league', ground: 'Kingsmoor Road' },
  { id: 'northmoor', name: 'Northmoor Town', short: 'NT', color: '#146b5a', rep: 4, formation: '4-4-2', objective: 'Finish in the top half', ground: 'Moor Lane' },
  { id: 'baymouth', name: 'Baymouth Rovers', short: 'BR', color: '#a03d1c', rep: 3, formation: '4-4-2', objective: 'Finish in the top half', ground: 'The Harbour End' },
  { id: 'saltmarsh', name: 'Saltmarsh City', short: 'SM', color: '#4a3a8a', rep: 3, formation: '3-5-2', objective: 'Finish in the top half', ground: 'Marsh Field' },
  { id: 'cliffton', name: 'Cliffton Wanderers', short: 'CW', color: '#2f4858', rep: 3, formation: '5-3-2', objective: 'Avoid finishing bottom', ground: 'Cliff Top' },
  { id: 'marrow', name: 'Marrow Bay', short: 'MB', color: '#7c2d5d', rep: 2, formation: '4-3-3', objective: 'Avoid finishing bottom', ground: 'Bay Side' },
  { id: 'gullport', name: 'Gullport United', short: 'GU', color: '#3f5a1d', rep: 2, formation: '4-4-2', objective: 'Avoid finishing bottom', ground: 'The Nest' },
  { id: 'kestrel', name: 'Kestrel Park', short: 'KP', color: '#8a4a1f', rep: 1, formation: '5-3-2', objective: 'Avoid finishing bottom', ground: 'Kestrel Lane' },
];

// ── Formations, mentalities, pressing, roles ─────────────────────────────
// A slot's coordinates are 0..1 on the drawn pitch: x across, y down from the
// opponent's goal line (the goalkeeper sits near the bottom).
export const FORMATIONS = {
  '4-4-2': {
    att: 1.0, mid: 1.0, def: 1.0,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.13, y: 0.71 }, { pos: 'CB', x: 0.38, y: 0.74 }, { pos: 'CB', x: 0.62, y: 0.74 }, { pos: 'RB', x: 0.87, y: 0.71 },
      { pos: 'LM', x: 0.13, y: 0.45 }, { pos: 'CM', x: 0.38, y: 0.47 }, { pos: 'CM', x: 0.62, y: 0.47 }, { pos: 'RM', x: 0.87, y: 0.45 },
      { pos: 'ST', x: 0.36, y: 0.18 }, { pos: 'ST', x: 0.64, y: 0.18 },
    ],
  },
  '4-3-3': {
    att: 1.08, mid: 1.02, def: 0.96,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.14, y: 0.71 }, { pos: 'CB', x: 0.38, y: 0.74 }, { pos: 'CB', x: 0.62, y: 0.74 }, { pos: 'RB', x: 0.86, y: 0.71 },
      { pos: 'CM', x: 0.28, y: 0.45 }, { pos: 'CM', x: 0.5, y: 0.47 }, { pos: 'CM', x: 0.72, y: 0.45 },
      { pos: 'LW', x: 0.17, y: 0.19 }, { pos: 'ST', x: 0.5, y: 0.15 }, { pos: 'RW', x: 0.83, y: 0.19 },
    ],
  },
  '4-2-3-1': {
    att: 1.04, mid: 1.06, def: 0.98,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.14, y: 0.71 }, { pos: 'CB', x: 0.38, y: 0.74 }, { pos: 'CB', x: 0.62, y: 0.74 }, { pos: 'RB', x: 0.86, y: 0.71 },
      { pos: 'DM', x: 0.37, y: 0.54 }, { pos: 'DM', x: 0.63, y: 0.54 },
      { pos: 'LW', x: 0.15, y: 0.31 }, { pos: 'AM', x: 0.5, y: 0.33 }, { pos: 'RW', x: 0.85, y: 0.31 },
      { pos: 'ST', x: 0.5, y: 0.14 },
    ],
  },
  '3-5-2': {
    att: 1.02, mid: 1.1, def: 0.92,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'CB', x: 0.25, y: 0.74 }, { pos: 'CB', x: 0.5, y: 0.76 }, { pos: 'CB', x: 0.75, y: 0.74 },
      { pos: 'LM', x: 0.1, y: 0.45 }, { pos: 'CM', x: 0.31, y: 0.47 }, { pos: 'CM', x: 0.5, y: 0.43 }, { pos: 'CM', x: 0.69, y: 0.47 }, { pos: 'RM', x: 0.9, y: 0.45 },
      { pos: 'ST', x: 0.36, y: 0.18 }, { pos: 'ST', x: 0.64, y: 0.18 },
    ],
  },
  '5-3-2': {
    att: 0.94, mid: 1.0, def: 1.1,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.09, y: 0.68 }, { pos: 'CB', x: 0.3, y: 0.75 }, { pos: 'CB', x: 0.5, y: 0.77 }, { pos: 'CB', x: 0.7, y: 0.75 }, { pos: 'RB', x: 0.91, y: 0.68 },
      { pos: 'CM', x: 0.27, y: 0.44 }, { pos: 'CM', x: 0.5, y: 0.46 }, { pos: 'CM', x: 0.73, y: 0.44 },
      { pos: 'ST', x: 0.36, y: 0.17 }, { pos: 'ST', x: 0.64, y: 0.17 },
    ],
  },
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

// ── The pyramid ──────────────────────────────────────────────────────────
// The Coastal League has eight divisions and 78,714 clubs. Division 1 is one
// group of 18; Division 2 has 4 groups, Division 3 twelve, Division 4
// thirty-six, and every division below that three times the groups of the one
// above it, down to Division 8's 2,916. The top two of every group are
// promoted; the bottom eight of Division 1 and the bottom six of every group
// in Divisions 2 to 7 are relegated; nobody leaves Division 8. Every group
// therefore keeps 18 clubs, which is why Division 2 has four groups: the eight
// clubs leaving Division 1 need two places in each of them.
//
// Only the manager's group is stored or played out in full. Rather than write
// 78,714 clubs by hand, a club below the 162 the flat league began with is
// generated from its place in the pyramid: the same place always gives the
// same name, badge and strength. The ten original clubs form most of
// Division 1, and a club's division sets the strength of its squad (see
// attrRange).
export const LEAGUE_NAME = 'The Coastal League';
export const DIVISION_COUNT = 8;
export const DIVISION_SIZE = 18;
export const MATCHDAYS = (DIVISION_SIZE - 1) * 2;
// The eight flat divisions a version 2 career was saved in.
export const LEGACY_DIVISION_COUNT = 8;
export const GROUP_COUNTS = [1, 4, 12, 36, 108, 324, 972, 2916];
export const GROUP_COUNT = GROUP_COUNTS.reduce((sum, n) => sum + n, 0);
export const PYRAMID_CLUB_COUNT = GROUP_COUNT * DIVISION_SIZE;
// The clubs the league had before the pyramid. They keep their ids and names.
export const LEGACY_CLUB_COUNT = 162;
// What a new manager can buy: the first four groups of the bottom division.
export const SHOP_DIVISION = DIVISION_COUNT;
export const SHOP_GROUP_COUNT = 4;

const PYRAMID_SEED = 50731;
const LEGACY_CLUBS = LEGACY_CLUB_COUNT - COASTAL_CLUBS.length;

const PLACE_POOL = [
  'Ashcombe', 'Bracken', 'Fenwick', 'Lowmere', 'Ostrey', 'Pellow', 'Marwick', 'Tarnbrook',
  'Wexley', 'Hollins', 'Ivybridge', 'Jarrow', 'Kelbrook', 'Larkspur', 'Mossley', 'Netherby',
  'Oakhurst', 'Penrose', 'Quarrydale', 'Rosemarket', 'Stonebury', 'Thornleigh', 'Underhill',
  'Valebrook', 'Westhaven', 'Yarrow', 'Aldermere', 'Briarwood', 'Coldharbour', 'Dunmore',
  'Eastgate', 'Fairholt', 'Glenross', 'Hartwell', 'Ingleby', 'Kirkstone', 'Longmarsh',
  'Millbrook', 'Northgate', 'Overton', 'Pinewood', 'Redmoss', 'Saltby', 'Torcross',
  'Uppermill', 'Wrenfield', 'Yewdale', 'Barrowden',
];
const CLUB_SUFFIXES = ['FC', 'Athletic', 'Town', 'United', 'Rovers', 'City', 'Wanderers'];
const GROUND_WORDS = ['Road', 'Lane', 'Park', 'Field', 'End', 'Green', 'Way', 'Quay'];
// Dark enough for the white initials on the badge in both looks.
const BADGE_COLORS = [
  '#5a4632', '#7a2f3a', '#2f5d62', '#4b3f72', '#6b4a1f', '#2d5340', '#7a5a1e', '#274b78',
  '#5c2d4a', '#3a4a2a', '#6f3a24', '#334d5c', '#6a2f5a', '#3f4770', '#59421c', '#2b5a4f',
];
// The reputation a generated club is dealt, by its place in its group. The
// whole pattern drops a rung from Division 3 down.
const GENERATED_REPS = [3, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2];
// The words a generated club's name is built from. Every combination of
// suffix, place, district and qualifier is used once, so two generated clubs
// never share a name, and the district word keeps them apart from the 162
// clubs that were already named by hand.
const NAME_DISTRICTS = [
  'North', 'South', 'East', 'West', 'Central', 'Harbour', 'Valley', 'Riverside',
  'Hill', 'Green', 'Moor', 'Wood', 'North-East', 'North-West', 'South-East', 'South-West',
];
// Disjoint from NAME_DISTRICTS, so "Upper North Ashcombe" and "North Upper
// Ashcombe" can never both be built.
const NAME_QUALIFIERS = [
  '', 'Upper', 'Lower', 'Old', 'New', 'Little', 'Great', 'High',
  'Low', 'Nether', 'Over', 'Middle', 'Outer', 'Inner', 'Far', 'Near',
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function objectiveForRep(rep) {
  if (rep >= 5) return 'Win the league';
  if (rep >= 3) return 'Finish in the top half';
  return 'Avoid finishing bottom';
}

function uniqueShort(name, used) {
  const [place, suffix] = name.split(' ');
  const p = place.toUpperCase();
  const candidates = [p[0] + suffix[0].toUpperCase(), p.slice(0, 2)];
  for (const ch of p.slice(1)) candidates.push(p[0] + ch);
  for (let i = 0; i < 26; i++) candidates.push(p[0] + String.fromCharCode(65 + i));
  for (const c of candidates) if (!used.has(c)) return c;
  return p.slice(0, 2);
}

function generateClubs() {
  const rng = mulberry32(hash(PYRAMID_SEED, 'clubs'));
  const combos = [];
  for (const place of PLACE_POOL) for (const suffix of CLUB_SUFFIXES) combos.push({ place, suffix });
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }
  const names = new Set(COASTAL_CLUBS.map((c) => c.name));
  const shorts = new Set(COASTAL_CLUBS.map((c) => c.short));
  const out = [];
  for (const { place, suffix } of combos) {
    if (out.length === LEGACY_CLUBS) break;
    const name = place + ' ' + suffix;
    if (names.has(name)) continue;
    names.add(name);
    const short = uniqueShort(name, shorts);
    shorts.add(short);
    const n = out.length;
    // The reputation block, one per 18 generated clubs: the first club of
    // each block is the strongest. The whole pattern drops a rung from the
    // sixth block down, which is Division 3.
    const block = n < 8 ? 1 : 2 + Math.floor((n - 8) / DIVISION_SIZE);
    const pos = n < 8 ? n : (n - 8) % DIVISION_SIZE;
    const rep = Math.max(1, GENERATED_REPS[pos] - (block >= 5 ? 1 : 0));
    out.push({
      id: slugify(name),
      name,
      short,
      color: BADGE_COLORS[n % BADGE_COLORS.length],
      rep,
      formation: FORMATION_NAMES[Math.floor(rng() * FORMATION_NAMES.length)],
      objective: objectiveForRep(rep),
      ground: place + ' ' + GROUND_WORDS[Math.floor(rng() * GROUND_WORDS.length)],
    });
  }
  return out;
}

export const CLUBS = COASTAL_CLUBS.concat(generateClubs());
const LEGACY_BY_ID = Object.fromEntries(CLUBS.map((c) => [c.id, c]));
const LEGACY_INDEX = Object.fromEntries(CLUBS.map((c, i) => [c.id, i]));
export const COASTAL_IDS = COASTAL_CLUBS.map((c) => c.id);

// ── Places in the pyramid ────────────────────────────────────────────────
// Clubs are numbered top down, group by group, 18 to a group: 0 to 17 are
// Division 1, 18 to 89 Division 2's four groups, 90 to 305 Division 3's
// twelve, and so on to 78,713. The first 162 positions keep the clubs the
// flat league had; the rest are generated.
export function groupsInDivision(division) {
  return GROUP_COUNTS[division - 1] || 0;
}

function clubsBefore(division) {
  let n = 0;
  for (let d = 1; d < division; d++) n += groupsInDivision(d) * DIVISION_SIZE;
  return n;
}

function groupPosition(division, group) {
  return clubsBefore(division) + group * DIVISION_SIZE;
}

function positionOf(p) {
  for (let d = 1; d <= DIVISION_COUNT; d++) {
    const span = groupsInDivision(d) * DIVISION_SIZE;
    const base = clubsBefore(d);
    if (p < base + span) return { division: d, group: Math.floor((p - base) / DIVISION_SIZE) };
  }
  return null;
}

// A group's name: "Division 1", "Division 2 Group B". Groups are lettered A to
// Z, then AA onwards, so Division 8's 2,916 groups each have a label.
export function groupLabel(group) {
  let n = Number(group) + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function groupLabelIndex(label) {
  let n = 0;
  for (const ch of String(label || '').toUpperCase()) {
    const v = ch.charCodeAt(0) - 64;
    if (v < 1 || v > 26) return 0;
    n = n * 26 + v;
  }
  return n > 0 ? n - 1 : 0;
}

export function groupName(division, group) {
  if (Number(division) === 1) return 'Division 1';
  const label = typeof group === 'number' ? groupLabel(group) : group;
  return 'Division ' + division + (label ? ' Group ' + label : '');
}

const NAME_SPACE = CLUB_SUFFIXES.length * PLACE_POOL.length
  * NAME_DISTRICTS.length * NAME_QUALIFIERS.length;

function generatedNameParts(p) {
  // A stride coprime to the number of combinations, so clubs that sit next to
  // each other in a group get different words rather than a run of the same
  // two: every combination is still used exactly once across the pyramid.
  let k = (p * 5009 + 11) % NAME_SPACE;
  const suffix = CLUB_SUFFIXES[k % CLUB_SUFFIXES.length]; k = Math.floor(k / CLUB_SUFFIXES.length);
  const place = PLACE_POOL[k % PLACE_POOL.length]; k = Math.floor(k / PLACE_POOL.length);
  const district = NAME_DISTRICTS[k % NAME_DISTRICTS.length]; k = Math.floor(k / NAME_DISTRICTS.length);
  const qualifier = NAME_QUALIFIERS[k % NAME_QUALIFIERS.length];
  return { suffix, place, district, qualifier };
}

function generatedName(p) {
  const n = generatedNameParts(p);
  return (n.qualifier ? n.qualifier + ' ' : '') + n.district + ' ' + n.place + ' ' + n.suffix;
}

// A generated club's strength: the group's own pattern, one rung weaker from
// Division 3 down. Even a one-star club never drops below one star.
function generatedRep(division, slot) {
  const drop = division >= 3 ? 1 : 0;
  return Math.max(1, GENERATED_REPS[slot % GENERATED_REPS.length] - drop);
}

// Two letters for the badge, unique within the group. The first choice is the
// place and the suffix, so most clubs read like "Ashcombe Town" -> AT.
function groupShort(place, suffix, used) {
  const first = place[0].toUpperCase();
  const candidates = [first + suffix[0].toUpperCase(), place.slice(0, 2).toUpperCase()];
  for (const ch of place.slice(1).toUpperCase()) candidates.push(first + ch);
  for (let i = 0; i < 26; i++) candidates.push(first + String.fromCharCode(65 + i));
  const short = candidates.find((c) => !used.has(c)) || place.slice(0, 2).toUpperCase();
  used.add(short);
  return short;
}

const GROUP_CACHE = new Map();
const CLUB_CACHE = new Map();

// The 18 clubs of one group, generated once and remembered. A group is the
// only unit the app ever shows or plays, so its clubs are what exist.
export function groupClubs(division, group) {
  const key = division + ':' + group;
  const cached = GROUP_CACHE.get(key);
  if (cached) return cached;
  const base = groupPosition(division, group);
  const used = new Set();
  const list = [];
  for (let slot = 0; slot < DIVISION_SIZE; slot++) {
    const p = base + slot;
    let club;
    if (p < LEGACY_CLUB_COUNT) {
      club = CLUBS[p];
      used.add(club.short);
    } else {
      const { place, suffix, district } = generatedNameParts(p);
      const name = generatedName(p);
      const rep = generatedRep(division, slot);
      club = {
        id: 'c' + p + '-' + slugify(name),
        name,
        short: groupShort(place, suffix, used),
        color: BADGE_COLORS[p % BADGE_COLORS.length],
        rep,
        formation: FORMATION_NAMES[hash(p, 'formation') % FORMATION_NAMES.length],
        objective: objectiveForRep(rep),
        ground: (district ? district + ' ' : '') + place + ' ' + GROUND_WORDS[hash(p, 'ground') % GROUND_WORDS.length],
      };
    }
    CLUB_CACHE.set(club.id, club);
    list.push(club);
  }
  GROUP_CACHE.set(key, list);
  return list;
}

export function groupClubIds(division, group) {
  return groupClubs(division, group).map((c) => c.id);
}

// Which position, and therefore which group, a club id names.
export function clubIndex(clubId) {
  if (typeof clubId !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(LEGACY_INDEX, clubId)) return LEGACY_INDEX[clubId];
  const m = /^c(\d+)-/.exec(clubId);
  if (!m) return null;
  const p = Number(m[1]);
  return p >= 0 && p < PYRAMID_CLUB_COUNT ? p : null;
}

export function clubAt(p) {
  if (!(p >= 0 && p < PYRAMID_CLUB_COUNT)) return undefined;
  if (p < LEGACY_CLUB_COUNT) return CLUBS[p];
  const where = positionOf(p);
  if (!where) return undefined;
  return groupClubs(where.division, where.group)[p - groupPosition(where.division, where.group)];
}

export function clubById(clubId) {
  if (typeof clubId !== 'string') return undefined;
  const cached = CLUB_CACHE.get(clubId);
  if (cached) return cached;
  const p = clubIndex(clubId);
  if (p == null) return undefined;
  const club = clubAt(p);
  return club && club.id === clubId ? club : undefined;
}

// Read-only shorthand, so `CLUB_BY_ID[squad.clubId]` still works.
export const CLUB_BY_ID = new Proxy({}, {
  get(_target, key) { return typeof key === 'string' ? clubById(key) : undefined; },
});

// What a new manager can buy: the first four groups of Division 8. The price
// and the balance are held by the server, which is where the money lives.
export const SHOP_GROUPS = Array.from({ length: SHOP_GROUP_COUNT }, (_, g) => ({
  division: SHOP_DIVISION,
  group: g,
  label: groupLabel(g),
  name: groupName(SHOP_DIVISION, g),
  clubIds: groupClubIds(SHOP_DIVISION, g),
}));
export const SHOP_CLUB_IDS = SHOP_GROUPS.flatMap((g) => g.clubIds);

// Why a purchase is refused, or null when it can go ahead.
export function purchaseError(clubId, balance, price) {
  if (!SHOP_CLUB_IDS.includes(clubId)) return 'club';
  if (!(typeof balance === 'number' && balance >= price)) return 'balance';
  return null;
}

export const MENTALITIES = {
  Defensive: { att: 0.86, mid: 0.98, def: 1.12 },
  Balanced: { att: 1.0, mid: 1.0, def: 1.0 },
  Positive: { att: 1.06, mid: 1.02, def: 0.96 },
  Attacking: { att: 1.14, mid: 1.04, def: 0.87 },
};
export const MENTALITY_NAMES = Object.keys(MENTALITIES);

export const PRESSING = {
  Low: { mid: 0.94, def: 1.03, stamina: 0.7, foul: 0.78 },
  Medium: { mid: 1.0, def: 1.0, stamina: 1.0, foul: 1.0 },
  High: { mid: 1.08, def: 0.95, stamina: 1.55, foul: 1.35 },
};
export const PRESSING_NAMES = Object.keys(PRESSING);

export const POS_GROUP = {
  GK: 'GK',
  RB: 'DF', LB: 'DF', CB: 'DF',
  DM: 'MF', CM: 'MF', AM: 'MF', RM: 'MF', LM: 'MF',
  RW: 'FW', LW: 'FW', ST: 'FW',
};

export const ROLES = {
  GK: ['Goalkeeper', 'Sweeper keeper'],
  DF: ['Full-back', 'Centre-back', 'Wing-back'],
  MF: ['Ball-winner', 'Playmaker', 'Box-to-box'],
  FW: ['Poacher', 'Target forward', 'Inside forward'],
};

export const ROLE_WEIGHTS = {
  Goalkeeper: { gk: 1 },
  'Sweeper keeper': { gk: 0.7, pas: 0.3 },
  'Full-back': { def: 0.4, pac: 0.5, pas: 0.1 },
  'Centre-back': { def: 0.7, pac: 0.15, pas: 0.15 },
  'Wing-back': { def: 0.35, pac: 0.4, pas: 0.25 },
  'Ball-winner': { def: 0.5, pas: 0.2, pac: 0.3 },
  Playmaker: { pas: 0.65, sho: 0.1, def: 0.1, pac: 0.15 },
  'Box-to-box': { pas: 0.3, def: 0.3, pac: 0.25, sho: 0.15 },
  Poacher: { sho: 0.6, pac: 0.35, pas: 0.05 },
  'Target forward': { sho: 0.55, def: 0.15, pas: 0.15, pac: 0.15 },
  'Inside forward': { sho: 0.45, pac: 0.35, pas: 0.2 },
};

export const OVERALL_WEIGHTS = {
  GK: { gk: 0.85, pas: 0.1, def: 0.05 },
  DF: { def: 0.5, pac: 0.2, pas: 0.2, sho: 0.1 },
  MF: { pas: 0.4, def: 0.2, pac: 0.2, sho: 0.2 },
  FW: { sho: 0.5, pac: 0.3, pas: 0.2 },
};

export function defaultRole(pos) {
  const g = POS_GROUP[pos];
  if (g === 'GK') return 'Goalkeeper';
  if (g === 'DF') return pos === 'RB' || pos === 'LB' ? 'Full-back' : 'Centre-back';
  if (g === 'MF') return pos === 'DM' ? 'Ball-winner' : 'Playmaker';
  return pos === 'ST' ? 'Poacher' : 'Inside forward';
}

export function overallOf(attrs, pos) {
  const w = OVERALL_WEIGHTS[POS_GROUP[pos]] || OVERALL_WEIGHTS.MF;
  let v = 0;
  for (const k in w) v += attrs[k] * w[k];
  return Math.round(v);
}

function roleScore(player, role) {
  const w = ROLE_WEIGHTS[role] || { pas: 1 };
  let v = 0;
  for (const k in w) v += player.attrs[k] * w[k];
  return v / 100; // roughly 0.4..0.9
}

// ── Randomness ───────────────────────────────────────────────────────────
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e3779b9;
  }
  return h >>> 0;
}

export function matchSeed(careerSeed, matchday, index) {
  return hash(careerSeed, 'match', matchday, index);
}

function poisson(rng, lambda) {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > l);
  return k - 1;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function weighted(rng, items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0.001, weightOf(it));
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0.001, weightOf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// ── Squads ───────────────────────────────────────────────────────────────
const FIRST_NAMES = ['Tomas', 'Dunn', 'Marco', 'Sam', 'Eli', 'Kofi', 'Lee', 'Theo', 'Jonas', 'Pia', 'Ansel', 'Ruben', 'Ismail', 'Noah', 'Hugo', 'Felix', 'Otto', 'Arun', 'Miles', 'Ivan', 'Kai', 'Luca', 'Nico', 'Owen', 'Reece', 'Silas', 'Tariq', 'Umar', 'Victor', 'Yusuf', 'Ade', 'Bram', 'Cato', 'Dario', 'Emeka', 'Finn', 'Gus', 'Hal', 'Ines', 'Jae', 'Kian', 'Levi', 'Milo', 'Nils', 'Osian', 'Pablo', 'Quinn', 'Rory', 'Sven', 'Teo', 'Anders', 'Beto', 'Cyrus', 'Dane', 'Ewan', 'Femi', 'Gil', 'Hadi', 'Idris', 'Jude'];
const LAST_NAMES = ['Brandt', 'Okafor', 'Voss', 'Ruiz', 'Kerr', 'Mensah', 'Ode', 'Bell', 'Ito', 'Lam', 'Hale', 'Pike', 'Grey', 'Lund', 'Fenn', 'Ash', 'Marsh', 'Tate', 'Rowe', 'Wade', 'Ellis', 'Vaughn', 'Nash', 'Cobb', 'Dean', 'Falk', 'Gorse', 'Hobb', 'Ives', 'Jarr', 'Kemp', 'Lunn', 'Moor', 'Nunn', 'Orr', 'Pace', 'Quay', 'Rest', 'Sand', 'Tarn', 'Ull', 'Veil', 'Wren', 'Yeo', 'Zell', 'Bowen', 'Crane', 'Dove', 'Eade', 'Frost', 'Gill', 'Holt', 'Irwin', 'Jett', 'Kerr', 'Lowe', 'Mays', 'Neal', 'Oakes', 'Pryce'];

const SQUAD_SHAPE = [
  'GK', 'GK',
  'CB', 'CB', 'CB', 'RB', 'LB',
  'CM', 'CM', 'CM', 'DM', 'AM', 'RM', 'LM',
  'ST', 'ST', 'RW', 'LW',
];

// The club's reputation decides where its players' attributes sit, and each
// division down is three points weaker.
function attrRange(rep, division = 1) {
  const centre = 48 + rep * 5.2 - (division - 1) * 3; // rep 1, Division 1 -> 53
  return { lo: centre - 11, hi: centre + 13 };
}

function makePlayer(rng, pos, rep, n, division) {
  const { lo, hi } = attrRange(rep, division);
  const roll = () => Math.round(lo + rng() * (hi - lo));
  const g = POS_GROUP[pos];
  const attrs = {
    pac: roll(), pas: roll(), sho: roll(), def: roll(), gk: roll(),
  };
  if (g === 'GK') { attrs.gk = Math.min(92, attrs.gk + 9); attrs.sho = Math.max(20, attrs.sho - 18); }
  if (g === 'DF') { attrs.def = Math.min(92, attrs.def + 6); attrs.sho = Math.max(20, attrs.sho - 12); }
  if (g === 'FW') { attrs.sho = Math.min(92, attrs.sho + 7); attrs.def = Math.max(20, attrs.def - 10); }
  const overall = overallOf(attrs, pos);
  return {
    id: 'p' + n,
    name: '',
    pos,
    age: 18 + Math.floor(rng() * 16),
    attrs,
    overall,
    fitness: 78 + Math.floor(rng() * 23),
    morale: 55 + Math.floor(rng() * 40),
    injury: 0,
    goals: 0,
    assists: 0,
    apps: 0,
    yellow: 0,
    red: 0,
    captain: false,
  };
}

export function buildSquad(seed, clubIndex, rep, division = 1) {
  const rng = mulberry32(hash(seed, 'squad', clubIndex));
  const used = new Set();
  const players = SQUAD_SHAPE.map((pos, i) => {
    const p = makePlayer(rng, pos, rep, clubIndex * 100 + i, division);
    let name;
    do {
      name = pick(rng, FIRST_NAMES) + ' ' + pick(rng, LAST_NAMES);
    } while (used.has(name));
    used.add(name);
    p.name = name;
    return p;
  });
  // The best outfield player in the middle of the park wears the armband.
  const mids = players.filter((p) => POS_GROUP[p.pos] === 'MF');
  const cap = mids.reduce((a, b) => (b.overall > a.overall ? b : a), mids[0]);
  if (cap) cap.captain = true;
  return players;
}

// ── Fixtures ─────────────────────────────────────────────────────────────
// A double round robin: everyone plays everyone home and away. A division of
// 18 gives 34 matchdays; the ten-club season of a version 1 career gives 18.
export function buildFixtures(seed, clubIds = COASTAL_IDS) {
  const ids = clubIds.slice();
  // Seeded shuffle so a career's league order differs but repeats for a seed.
  const rng = mulberry32(hash(seed, 'fixtures'));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const n = ids.length;
  const round = [];
  const half = n / 2;
  const fixed = ids[0];
  const rest = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const pairs = [{ home: fixed, away: rest[r] }];
    for (let i = 1; i < half; i++) {
      const a = rest[(r + i) % (n - 1)];
      const b = rest[(r - i + (n - 1) * 2) % (n - 1)];
      pairs.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    round.push(pairs);
  }
  const second = round.map((pairs) => pairs.map((p) => ({ home: p.away, away: p.home })));
  return round.concat(second);
}

// ── Team selection ───────────────────────────────────────────────────────
export function familiarity(pos, slotPos) {
  if (pos === slotPos) return 1;
  const a = POS_GROUP[pos];
  const b = POS_GROUP[slotPos];
  if (!a || !b) return 0.6;
  if (a === b) return 0.9;
  if (a === 'GK' || b === 'GK') return 0.35;
  const dist = Math.abs(['DF', 'MF', 'FW'].indexOf(a) - ['DF', 'MF', 'FW'].indexOf(b));
  return dist === 1 ? 0.7 : 0.55;
}

export function playerValue(player, slotPos, role, tactics) {
  const fam = familiarity(player.pos, slotPos);
  const fit = 0.72 + 0.28 * (player.fitness / 100);
  const mor = 0.95 + 0.1 * (player.morale / 100);
  const rs = role ? roleScore(player, role) : 0.7;
  const roleMul = role ? 0.96 + 0.09 * rs : 1;
  return player.overall * fam * fit * mor * roleMul;
}

// Fill the formation's slots from a pool: players whose own position is in
// the slot's group first, then anyone left, each at their best fit.
function assignSlots(pool, slots, roles) {
  const value = (p, slot) => playerValue(p, slot.pos, roles && roles[p.id]);
  const chosen = new Array(slots.length).fill(null);
  const poolLeft = pool.slice();
  const gkPool = poolLeft.filter((p) => POS_GROUP[p.pos] === 'GK');
  const gk = gkPool.length ? gkPool.reduce((a, b) => (value(b, slots[0]) > value(a, slots[0]) ? b : a)) : null;
  if (gk) {
    chosen[0] = gk;
    poolLeft.splice(poolLeft.indexOf(gk), 1);
  }
  const order = slots.map((_, i) => i).filter((i) => i > 0);
  for (const i of order) {
    const group = POS_GROUP[slots[i].pos];
    const cands = poolLeft.filter((p) => POS_GROUP[p.pos] === group);
    if (!cands.length) continue;
    const best = cands.reduce((a, b) => (value(b, slots[i]) > value(a, slots[i]) ? b : a));
    chosen[i] = best;
    poolLeft.splice(poolLeft.indexOf(best), 1);
  }
  for (const i of order) {
    if (chosen[i] || !poolLeft.length) continue;
    const best = poolLeft.reduce((a, b) => (value(b, slots[i]) > value(a, slots[i]) ? b : a));
    chosen[i] = best;
    poolLeft.splice(poolLeft.indexOf(best), 1);
  }
  if (!chosen[0] && poolLeft.length) chosen[0] = poolLeft[0];
  return chosen;
}

export function autoLineup(players, formation, roles, excludeInjured = true) {
  const slots = FORMATIONS[formation].slots;
  const available = players.filter((p) => !excludeInjured || p.injury <= 0);
  const pool = available.length >= 11 ? available : players.slice();
  return assignSlots(pool, slots, roles).filter(Boolean).map((p) => p.id);
}

// Put a set of eleven players into a formation's slots, keeping the best fit.
export function arrangeLineup(players, lineup, formation) {
  const slots = FORMATIONS[formation].slots;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const pool = lineup.map((id) => byId[id]).filter(Boolean);
  if (pool.length !== slots.length) return lineup.slice(0, slots.length);
  return assignSlots(pool, slots, {}).filter(Boolean).map((p) => p.id);
}

export function fixLineup(state) {
  const squad = state.squads[state.clubId];
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  const slots = FORMATIONS[state.tactics.formation].slots;
  const used = new Set();
  let rebuilt = false;
  const lineup = (state.lineup || []).slice(0, 11).map((id, i) => {
    const p = byId[id];
    const slot = slots[i] || slots[0];
    if (p && p.injury <= 0 && !used.has(id)) {
      used.add(id);
      return id;
    }
    // Replace an injured or missing starter with the best fit still free.
    const candidates = squad
      .filter((q) => q.injury <= 0 && !used.has(q.id) && (slot.pos !== 'GK' || POS_GROUP[q.pos] === 'GK'))
      .sort((a, b) => playerValue(b, slot.pos, state.roles[b.id]) - playerValue(a, slot.pos, state.roles[a.id]));
    const pick = candidates[0];
    if (pick) { used.add(pick.id); rebuilt = true; return pick.id; }
    return id;
  });
  if (lineup.length < 11 || POS_GROUP[(byId[lineup[0]] || {}).pos] !== 'GK') {
    state.lineup = autoLineup(squad, state.tactics.formation, state.roles);
    return state.lineup;
  }
  if (rebuilt) state.lineup = lineup;
  return state.lineup;
}

// A career saved by an earlier version of the app, made ready for today's club
// screen: only what is missing or unusable is filled in, from the career's own
// squad. A valid career comes back equal; null means it cannot be shown. It
// never touches the version, the divisions, the season, the seed, the results
// or the squads.
export function repairCareer(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const club = clubById(state.clubId);
  if (!club) return null;
  if (!state.squads || !Array.isArray(state.squads[state.clubId])) return null;
  if (!Array.isArray(state.fixtures) || !Array.isArray(state.results)) return null;
  // A pyramid career must know its group, and be in it.
  if (state.version >= 4) {
    if (!Number.isInteger(state.division) || state.division < 1 || state.division > DIVISION_COUNT) return null;
    if (!Number.isInteger(state.group) || state.group < 0 || state.group >= groupsInDivision(state.division)) return null;
    const ids = state.groupClubIds;
    if (!Array.isArray(ids) || ids.length !== DIVISION_SIZE || !ids.includes(state.clubId)) return null;
    if (!ids.every((id) => clubById(id))) return null;
  } else if (state.version >= 3) {
    // A three-tier career names its group by letter, in a list of nine.
    const group = Array.isArray(state.groups) ? state.groups[state.groupIndex] : null;
    if (!group || !Array.isArray(group.clubIds) || !group.clubIds.includes(state.clubId)) return null;
  }

  const squad = state.squads[state.clubId];
  const roles = state.roles && typeof state.roles === 'object' && !Array.isArray(state.roles)
    ? state.roles : {};
  const given = state.tactics && typeof state.tactics === 'object' ? state.tactics : {};
  const formation = FORMATION_NAMES.includes(given.formation) ? given.formation : club.formation;
  const tactics = {
    ...given,
    formation,
    mentality: MENTALITY_NAMES.includes(given.mentality) ? given.mentality : 'Balanced',
    pressing: PRESSING_NAMES.includes(given.pressing) ? given.pressing : 'Medium',
  };

  const ids = new Set(squad.map((p) => p && p.id));
  const givenLineup = state.lineup;
  const lineupOk = Array.isArray(givenLineup) && givenLineup.length === 11
    && new Set(givenLineup).size === 11 && givenLineup.every((id) => ids.has(id));
  const lineup = lineupOk ? givenLineup : autoLineup(squad, formation, roles);

  const total = state.fixtures.length;
  let matchday = state.matchday;
  if (!Number.isInteger(matchday) || matchday < 0 || matchday > total) {
    matchday = Number.isInteger(matchday) ? Math.min(Math.max(matchday, 0), total) : 0;
  }

  const report = state.lastReport;
  const reportOk = !!report && typeof report === 'object'
    && report.home && report.home.id
    && report.away && report.away.id
    && report.stats && typeof report.stats === 'object'
    && report.ratings && typeof report.ratings === 'object'
    && Array.isArray(report.moments);

  return {
    ...state,
    tactics,
    roles,
    lineup,
    matchday,
    finished: Boolean(state.finished),
    lastReport: reportOk ? report : null,
  };
}

// ── Validation ───────────────────────────────────────────────────────────
export function validateLineup(state) {
  const squad = state.squads[state.clubId];
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  if (!state.lineup || state.lineup.length !== 11) {
    return { ok: false, message: 'Pick eleven starters before you play.' };
  }
  if (new Set(state.lineup).size !== 11) {
    return { ok: false, message: 'The same player is in the lineup twice. Pick eleven different players.' };
  }
  for (const id of state.lineup) {
    if (!byId[id]) return { ok: false, message: 'A starter is no longer in your squad. Pick eleven starters again.' };
  }
  const injured = state.lineup.filter((id) => byId[id].injury > 0);
  if (injured.length) {
    const names = injured.map((id) => byId[id].name);
    return { ok: false, message: 'Injured: ' + names.join(', ') + '. Bring a fit player on in their place.' };
  }
  const slots = FORMATIONS[state.tactics.formation].slots;
  const gkId = state.lineup[0];
  if (POS_GROUP[byId[gkId].pos] !== 'GK') {
    return { ok: false, message: 'Your eleven needs a goalkeeper in goal. Pick one in the goalkeeper slot.' };
  }
  const otherGk = state.lineup.filter((id) => POS_GROUP[byId[id].pos] === 'GK' && id !== gkId);
  if (otherGk.length && slots[0].pos !== 'GK') {
    return { ok: false, message: 'Your eleven needs a goalkeeper in goal.' };
  }
  return { ok: true, message: '' };
}

// ── Club form, table, fixtures ───────────────────────────────────────────
export function allResults(state) {
  return state.results || [];
}

// The 18 clubs of the manager's group. A version 2 career keeps the flat
// divisions it was saved in; a version 1 career is the old ten-club season.
export function divisionClubIds(state) {
  if (state && state.version >= 4 && Array.isArray(state.groupClubIds)) return state.groupClubIds;
  if (state && state.version >= 3 && Array.isArray(state.groups)
    && state.groups[state.groupIndex] && Array.isArray(state.groups[state.groupIndex].clubIds)) {
    return state.groups[state.groupIndex].clubIds;
  }
  if (state && state.version >= 2 && Array.isArray(state.divisions) && state.divisions[state.division - 1]) {
    return state.divisions[state.division - 1];
  }
  return COASTAL_IDS;
}

// What a career's place is called: "Division 3 Group B", "Division 1", or the
// old ten-club league's name.
export function placeName(state) {
  if (state && state.version >= 4 && Number.isInteger(state.division)) {
    return groupName(state.division, currentGroup(state));
  }
  if (state && state.version >= 3 && Array.isArray(state.groups) && state.groups[state.groupIndex]) {
    return groupName(state.division, state.group);
  }
  if (state && state.version >= 2 && Array.isArray(state.divisions)) return 'Division ' + state.division;
  return LEAGUE_NAME;
}

// The seed a season's matches and squads come from. Season 1 is the career
// seed itself, so a version 1 career's matches stay exactly as they were.
export function seasonSeed(state) {
  const season = state.season || 1;
  return season <= 1 ? state.seed : hash(state.seed, 'season', season);
}

export function leagueTable(state) {
  const rows = {};
  for (const id of divisionClubIds(state)) {
    const c = CLUB_BY_ID[id];
    rows[c.id] = { id: c.id, name: c.name, short: c.short, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
  }
  for (const r of state.results) {
    const h = rows[r.home.id];
    const a = rows[r.away.id];
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += r.homeGoals; h.ga += r.awayGoals;
    a.gf += r.awayGoals; a.ga += r.homeGoals;
    if (r.homeGoals > r.awayGoals) { h.won++; a.lost++; h.points += 3; }
    else if (r.homeGoals < r.awayGoals) { a.won++; h.lost++; a.points += 3; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const list = Object.values(rows);
  for (const r of list) r.gd = r.gf - r.ga;
  list.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
  list.forEach((r, i) => { r.rank = i + 1; });
  return list;
}

export function formOf(state, clubId, count = 5) {
  const played = [];
  for (const r of state.results) {
    if (r.home.id === clubId) played.push(r.homeGoals > r.awayGoals ? 'W' : r.homeGoals < r.awayGoals ? 'L' : 'D');
    else if (r.away.id === clubId) played.push(r.awayGoals > r.homeGoals ? 'W' : r.awayGoals < r.homeGoals ? 'L' : 'D');
  }
  return played.slice(-count);
}

export function nextFixture(state) {
  if (state.matchday >= state.fixtures.length) return null;
  const fixtures = state.fixtures[state.matchday];
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    if (f.home === state.clubId || f.away === state.clubId) {
      const home = f.home === state.clubId;
      return {
        index: i,
        home: f.home,
        away: f.away,
        venue: home ? 'Home' : 'Away',
        opponentId: home ? f.away : f.home,
        matchday: state.matchday + 1,
      };
    }
  }
  return null;
}

// `size` is the number of clubs in the division the rank is in.
export function objectiveMet(rank, objective, size = DIVISION_SIZE) {
  if (objective === 'Win the league') return rank === 1;
  if (objective === 'Finish in the top half') return rank <= Math.ceil(size / 2);
  if (objective === 'Avoid finishing bottom') return rank < size;
  return rank <= Math.ceil(size / 2) - 1;
}

// ── Preparing a side for the simulation ──────────────────────────────────
function teamFor(state, clubId) {
  const club = CLUB_BY_ID[clubId];
  const squad = state.squads[clubId];
  const isUser = clubId === state.clubId;
  const tactics = isUser ? state.tactics : { formation: club.formation, mentality: 'Balanced', pressing: 'Medium' };
  const roles = isUser ? state.roles || {} : {};
  const lineup = isUser ? state.lineup : autoLineup(squad, tactics.formation, roles);
  return { club, squad, lineup, tactics, roles };
}

function sidePower(team) {
  const byId = Object.fromEntries(team.squad.map((p) => [p.id, p]));
  const slots = FORMATIONS[team.tactics.formation].slots;
  let att = 0; let mid = 0; let def = 0;
  const starters = [];
  team.lineup.forEach((id, i) => {
    const p = byId[id];
    const slot = slots[i] || slots[slots.length - 1];
    if (!p) return;
    const role = team.roles[id];
    const v = playerValue(p, slot.pos, role);
    starters.push({ player: p, slot, v });
    const g = POS_GROUP[slot.pos];
    if (g === 'GK') def += v * 1.4;
    else if (g === 'DF') def += v;
    else if (g === 'MF') mid += v;
    else att += v;
  });
  const f = FORMATIONS[team.tactics.formation];
  const m = MENTALITIES[team.tactics.mentality] || MENTALITIES.Balanced;
  const pr = PRESSING[team.tactics.pressing] || PRESSING.Medium;
  att = (att / 3) * f.att * m.att;
  mid = (mid / 3.4) * f.mid * m.mid * pr.mid;
  def = (def / 5.4) * f.def * m.def;
  return { att, mid, def, starters, press: pr, mentality: m };
}

// ── The match ────────────────────────────────────────────────────────────
// home/away: { club, squad, lineup, tactics, roles }. Returns a report and the
// effects on each player (fitness, injuries, goals, cards) for the caller to
// apply to the saved state.
export function simulateMatch(home, away, seed) {
  const rng = mulberry32(seed >>> 0);
  const h = sidePower(home);
  const a = sidePower(away);
  const homeAdv = 1.06;

  const hAtt = h.att * homeAdv;
  const aAtt = a.att;
  const hDef = h.def * 1.02;

  const hLambda = Math.max(0.22, Math.min(4.6, 1.38 * Math.pow(hAtt / Math.max(1, a.def), 1.7)));
  const aLambda = Math.max(0.18, Math.min(4.2, 1.26 * Math.pow(aAtt / Math.max(1, hDef), 1.7)));

  const homeGoals = Math.min(7, poisson(rng, hLambda));
  const awayGoals = Math.min(7, poisson(rng, aLambda));

  // Possession from the midfield battle.
  const hMid = h.mid + hAtt * 0.25;
  const aMid = a.mid + aAtt * 0.25;
  let share = hMid / (hMid + aMid);
  share = Math.max(0.3, Math.min(0.7, share + (rng() - 0.5) * 0.06));
  const poss = [Math.round(share * 100), 100 - Math.round(share * 100)];

  const sides = {
    home: { team: home, power: h, goals: homeGoals, att: hAtt, def: a.def, label: home.club.name },
    away: { team: away, power: a, goals: awayGoals, att: aAtt, def: hDef, label: away.club.name },
  };

  // Who is on the pitch for each side, and who is on the bench.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    const byId = Object.fromEntries(s.team.squad.map((p) => [p.id, p]));
    s.onPitch = s.team.lineup.map((id, i) => ({
      player: byId[id],
      slot: FORMATIONS[s.team.tactics.formation].slots[i],
      minutes: 0,
      on: 0,
      off: null,
    })).filter((x) => x.player);
    const ids = new Set(s.team.lineup);
    s.bench = s.team.squad.filter((p) => !ids.has(p.id) && p.injury <= 0);
    s.subs = 0;
    s.effects = {};
    s.goalsScored = [];
    s.cards = { yellow: 0, red: 0 };
    s.fouls = 0;
  }

  const moments = [];

  function ensureEffect(s, player) {
    if (!s.effects[player.id]) {
      s.effects[player.id] = { goals: 0, assists: 0, yellow: 0, red: 0, injury: 0, minutes: 0, fitness: 0, started: false, subOn: null, subOff: null };
    }
    return s.effects[player.id];
  }
  for (const key of ['home', 'away']) {
    const s = sides[key];
    for (const entry of s.onPitch) {
      const e = ensureEffect(s, entry.player);
      e.started = true;
    }
  }

  // Goal times, then everything else.
  const goalEvents = [];
  for (const key of ['home', 'away']) {
    for (let i = 0; i < sides[key].goals; i++) {
      goalEvents.push({ minute: 2 + Math.floor(rng() * 88), side: key });
    }
  }
  goalEvents.sort((x, y) => x.minute - y.minute);

  // Shots: every goal is a shot on target, plus the misses.
  const shots = {};
  const onTarget = {};
  for (const key of ['home', 'away']) {
    const g = sides[key].goals;
    const attempts = Math.min(30, g + poisson(rng, key === 'home' ? 9.6 : 8.4));
    const accurate = Math.min(attempts, g + poisson(rng, key === 'home' ? 3.6 : 3.0));
    shots[key] = attempts;
    onTarget[key] = accurate;
  }

  // Injuries and substitutions, in the last third of the match.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    const injuryRng = rng;
    if (injuryRng() < 0.3) {
      const healthy = s.onPitch.filter((e) => !e.off);
      const injuredEntry = healthy.length ? pick(rng, healthy) : null;
      if (injuredEntry) {
        const se = ensureEffect(s, injuredEntry.player);
        const weeks = 1 + Math.floor(rng() * 3);
        se.injury = weeks;
        const minute = 10 + Math.floor(rng() * 70);
        injuredEntry.off = minute;
        se.subOff = minute;
        moments.push({ minute, type: 'injury', side: key, playerId: injuredEntry.player.id, playerName: injuredEntry.player.name, detail: 'Injured, out for ' + weeks + (weeks === 1 ? ' match' : ' matches'), teamName: s.team.club.name });
        // An injured player comes off straight away when there is a bench.
        if (s.subs < 3 && s.bench.length) {
          let best = null;
          let bestV = -1;
          for (const p of s.bench) {
            const v = playerValue(p, injuredEntry.slot.pos, s.team.roles[p.id]);
            if (v > bestV) { bestV = v; best = p; }
          }
          if (best) {
            s.bench = s.bench.filter((p) => p !== best);
            s.onPitch.push({ player: best, slot: injuredEntry.slot, minutes: 0, on: minute, off: null });
            const seIn = ensureEffect(s, best);
            seIn.subOn = minute;
            s.subs++;
            moments.push({ minute, type: 'sub', side: key, playerId: best.id, playerName: best.name, playerOutName: injuredEntry.player.name, detail: 'Injured, replaced', teamName: s.team.club.name });
          }
        }
      }
    }
    // Up to three substitutions, made when a starter is tiring or injured.
    const subMinutes = [58, 67, 76, 84];
    for (const m of subMinutes) {
      if (s.subs >= 3) break;
      if (rng() > 0.62) continue;
      const tired = s.onPitch.filter((e) => !e.off && e.player.fitness - m * 0.28 * s.power.press.stamina < 52);
      const out = tired.sort((x, y) => x.player.fitness - y.player.fitness)[0];
      if (!out) continue;
      // A bench player who fits the vacated slot best.
      let best = null;
      let bestV = -1;
      for (const p of s.bench) {
        if (s.onPitch.some((e) => e.player.id === p.id)) continue;
        const v = playerValue(p, out.slot.pos, s.team.roles[p.id]);
        if (v > bestV) { bestV = v; best = p; }
      }
      if (!best) continue;
      s.bench = s.bench.filter((p) => p !== best);
      const seOut = ensureEffect(s, out.player);
      seOut.subOff = m;
      out.off = m;
      const onEntry = { player: best, slot: out.slot, minutes: 0, on: m, off: null };
      s.onPitch.push(onEntry);
      const seIn = ensureEffect(s, best);
      seIn.subOn = m;
      s.subs++;
      const outFit = Math.max(12, Math.round(out.player.fitness - m * 0.28 * s.power.press.stamina));
      moments.push({
        minute: m,
        type: 'sub',
        side: key,
        playerId: best.id,
        playerName: best.name,
        playerOutName: out.player.name,
        detail: out.player.name + ' tired, fitness ' + outFit + '%',
        teamName: s.team.club.name,
      });
    }
  }

  // Fouls and cards.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    const lambda = 10.4 * s.power.press.foul;
    const fouls = Math.min(26, poisson(rng, lambda));
    s.fouls = fouls;
    for (let i = 0; i < fouls; i++) {
      const chance = 0.115 * (key === 'away' ? 1.06 : 1);
      if (rng() < chance) {
        const cardMinute = 5 + Math.floor(rng() * 85);
        const candidates = s.onPitch.filter((e) => e.on <= cardMinute && (!e.off || e.off > cardMinute) && (POS_GROUP[e.slot.pos] !== 'GK' || rng() < 0.1));
        const offender = weighted(rng, candidates, (e) => 0.5 + e.player.attrs.def / 150);
        const se = ensureEffect(s, offender.player);
        const straight = rng() < 0.004;
        if (straight) {
          se.red++;
          s.cards.red++;
          moments.push({ minute: cardMinute, type: 'red', side: key, playerId: offender.player.id, playerName: offender.player.name, detail: 'Straight red card', teamName: s.team.club.name });
        } else {
          se.yellow++;
          s.cards.yellow++;
          moments.push({ minute: cardMinute, type: 'yellow', side: key, playerId: offender.player.id, playerName: offender.player.name, detail: 'Foul on ' + pick(rng, sides[key === 'home' ? 'away' : 'home'].onPitch).player.name, teamName: s.team.club.name });
        }
      }
    }
    // A second yellow is a red.
  }
  // Any player with two yellows is off.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    for (const id in s.effects) {
      const e = s.effects[id];
      if (e.yellow >= 2 && e.red === 0) {
        e.red = 1;
        s.cards.red++;
        const entry = s.onPitch.find((x) => x.player.id === id);
        if (entry) entry.off = 80;
        const yms = moments.filter((m) => m.type === 'yellow' && m.playerId === id);
        const lastY = yms[yms.length - 1];
        moments.push({ minute: lastY ? lastY.minute : 80, type: 'red', side: key, playerId: id, playerName: entry ? entry.player.name : '', detail: 'Second yellow card', teamName: s.team.club.name });
      }
      if (e.red) {
        const entry = s.onPitch.find((x) => x.player.id === id);
        if (entry) entry.off = 80;
      }
    }
  }

  // Goals and their makers.
  for (const ev of goalEvents) {
    const s = sides[ev.side];
    const outfield = s.onPitch.filter((e) => e.on <= ev.minute && (!e.off || e.off > ev.minute) && POS_GROUP[e.slot.pos] !== 'GK');
    const scorer = weighted(rng, outfield, (e) => {
      const p = e.player;
      const g = POS_GROUP[e.slot.pos];
      const posW = g === 'FW' ? 3 : g === 'MF' ? 1.2 : 0.35;
      return posW * (0.5 + p.attrs.sho / 100) * (0.8 + e.player.fitness / 250);
    });
    const mates = outfield.filter((e) => e !== scorer);
    const hasAssist = rng() < 0.74;
    const assist = hasAssist ? weighted(rng, mates, (e) => 0.4 + e.player.attrs.pas / 100) : null;
    const se = ensureEffect(s, scorer.player);
    se.goals++;
    if (assist) ensureEffect(s, assist.player).assists++;
    moments.push({
      minute: ev.minute,
      type: 'goal',
      side: ev.side,
      playerId: scorer.player.id,
      playerName: scorer.player.name,
      assistName: assist ? assist.player.name : null,
      teamName: s.team.club.name,
    });
  }

  moments.sort((x, y) => x.minute - y.minute || (x.type === 'goal' ? -1 : 0));

  // Minutes played and fitness drain.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    for (const id in s.effects) {
      const e = s.effects[id];
      const entry = s.onPitch.find((x) => x.player.id === id);
      const start = e.started ? 0 : (e.subOn || 0);
      const end = e.subOff || (e.red ? 70 : 90);
      e.minutes = Math.max(0, end - start);
    }
  }

  // Ratings for the user's side, and stats for the report.
  const ratingsFor = (s) => {
    const out = {};
    const conceded = s === sides.home ? sides.away.goals : sides.home.goals;
    const result = s.goals - conceded;
    for (const id in s.effects) {
      const e = s.effects[id];
      if (!e.minutes) continue;
      const entry = s.onPitch.find((x) => x.player.id === id);
      const pos = entry ? POS_GROUP[entry.slot.pos] : 'MF';
      let r = 6.1 + e.goals * 1.15 + e.assists * 0.65;
      r += result > 0 ? 0.3 : result < 0 ? -0.25 : 0;
      if (pos === 'GK' || pos === 'DF') r += conceded === 0 ? 0.55 : 0;
      if (pos === 'GK') r += 0.15;
      r -= e.yellow * 0.3 + e.red * 1.4;
      if (e.injury) r -= 0.3;
      out[id] = Math.round(Math.max(3, Math.min(9.8, r)) * 10) / 10;
    }
    return out;
  };

  const report = {
    matchday: null,
    home: { id: home.club.id, name: home.club.name, short: home.club.short, color: home.club.color },
    away: { id: away.club.id, name: away.club.name, short: away.club.short, color: away.club.color },
    homeGoals,
    awayGoals,
    moments,
    stats: {
      possession: poss,
      shots: [shots.home, shots.away],
      onTarget: [onTarget.home, onTarget.away],
      passes: [Math.round(poss[0] * 5.6), Math.round(poss[1] * 5.4)],
      fouls: [sides.home.fouls, sides.away.fouls],
      yellow: [sides.home.cards.yellow, sides.away.cards.yellow],
      red: [sides.home.cards.red, sides.away.cards.red],
    },
    ratings: { home: ratingsFor(sides.home), away: ratingsFor(sides.away) },
    effects: { home: sides.home.effects, away: sides.away.effects },
  };
  return report;
}

// ── Applying a match to the career ───────────────────────────────────────
export function applyReport(state, report) {
  const sides = { home: report.home.id, away: report.away.id };
  for (const key of ['home', 'away']) {
    const clubId = sides[key];
    const squad = state.squads[clubId];
    const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
    const effects = report.effects[key];
    const gf = key === 'home' ? report.homeGoals : report.awayGoals;
    const ga = key === 'home' ? report.awayGoals : report.homeGoals;
    const result = gf > ga ? 1 : gf < ga ? -1 : 0;
    const tacticalPress = key === 'home' || clubId === state.clubId
      ? (PRESSING[(clubId === state.clubId ? state.tactics : { pressing: 'Medium' }).pressing] || PRESSING.Medium).stamina
      : 1;
    for (const p of squad) {
      const e = effects[p.id];
      if (e) {
        p.apps++;
        p.goals += e.goals;
        p.assists += e.assists;
        p.yellow += e.yellow;
        p.red += e.red;
        p.fitness = Math.round(Math.max(30, Math.min(100, p.fitness - e.minutes * 0.19 * tacticalPress + 15)));
        if (e.injury) p.injury = Math.max(p.injury, e.injury);
        p.morale = Math.round(Math.max(20, Math.min(100, p.morale + (result > 0 ? 5 : result < 0 ? -5 : 1))));
        p.lastRating = report.ratings[key][p.id] || null;
        p.lastMinutes = e.minutes;
      } else {
        // Rested players recover.
        p.fitness = Math.round(Math.min(100, p.fitness + 15));
        if (p.injury > 0) p.injury = Math.max(0, p.injury - 1);
        p.morale = Math.round(Math.min(100, Math.max(20, p.morale + 1)));
      }
    }
  }
  // Keep the user's eleven fit where injuries took a starter out.
  if (state.clubId === report.home.id || state.clubId === report.away.id) fixLineup(state);
}

export function playMatchday(state) {
  const md = state.matchday;
  if (md >= state.fixtures.length) return [];
  const reports = [];
  state.fixtures[md].forEach((f, i) => {
    const home = teamFor(state, f.home);
    const away = teamFor(state, f.away);
    const report = simulateMatch(home, away, matchSeed(seasonSeed(state), md, i));
    report.matchday = md + 1;
    report.fixtureIndex = i;
    reports.push(report);
  });
  for (const report of reports) applyReport(state, report);
  for (const r of reports) {
    state.results.push({
      matchday: r.matchday,
      home: r.home,
      away: r.away,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
    });
  }
  state.lastReport = reports.find((r) => r.home.id === state.clubId || r.away.id === state.clubId) || null;
  state.matchday = md + 1;
  state.finished = state.matchday >= state.fixtures.length;
  return reports;
}

// ── A career ─────────────────────────────────────────────────────────────
function squadsFor(seed, clubIds, division) {
  const squads = {};
  for (const id of clubIds) {
    squads[id] = buildSquad(seed, clubIndex(id), clubById(id).rep, division);
  }
  return squads;
}

function rolesFor(squads) {
  const roles = {};
  for (const id in squads) {
    for (const p of squads[id]) roles[p.id] = defaultRole(p.pos);
  }
  return roles;
}

export function buildInitialState(clubId, managerName, seed) {
  const club = clubById(clubId);
  const p = clubIndex(clubId);
  const where = p == null ? null : positionOf(p);
  if (!club || !where) throw new Error('Unknown club');
  const { division, group } = where;
  const ids = groupClubIds(division, group);
  const squads = squadsFor(seed, ids, division);
  const state = {
    version: 4,
    season: 1,
    division,
    group,
    groupClubIds: ids.slice(),
    managerName,
    clubId,
    seed,
    squads,
    fixtures: buildFixtures(seed, ids),
    results: [],
    tactics: { formation: club.formation, mentality: 'Balanced', pressing: 'Medium' },
    roles: rolesFor(squads),
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
  };
  state.lineup = autoLineup(squads[clubId], state.tactics.formation, state.roles);
  return state;
}

export function clubSummary(seed, club, division = 1) {
  const squad = buildSquad(seed, clubIndex(club.id), club.rep, division);
  const avg = squad.reduce((s, p) => s + p.overall, 0) / squad.length;
  return { avg: Math.round(avg) };
}

// The group number a career is in. A version 3 career named its group by
// letter; a version 4 career and anything newer uses the number.
export function currentGroup(state) {
  if (!state) return 0;
  if (state.version >= 4) return Number.isInteger(state.group) ? state.group : 0;
  if (state.version >= 3) return groupLabelIndex(state.group);
  return 0;
}

// How many clubs leave the bottom of each group of a division. The counts are
// what keep every group at 18: Division 1 sends 8 down into four Division 2
// groups, every group in Divisions 2 to 7 sends 6 down into its three child
// groups, and nobody leaves Division 8.
function relegationCount(division) {
  if (division >= DIVISION_COUNT) return 0;
  return division === 1 ? 8 : 6;
}

// Where a finished season leaves the manager: how they finished, and the
// division and group they play in next. The top two of every group go up
// (Division 1 has no division above it, so its winner is the champion); the
// bottom eight of Division 1 and the bottom six of every other group in
// Divisions 2 to 7 go down; Division 8 keeps everyone it has.
export function nextPlacement(state) {
  const table = leagueTable(state);
  const size = divisionClubIds(state).length;
  const me = table.find((r) => r.id === state.clubId);
  const rank = me ? me.rank : size;
  const place = (kind, division, group) => ({ kind, rank, size, division, group });

  if (state && state.version >= 3) {
    const division = state.division;
    const group = currentGroup(state);
    if (division === 1) {
      if (rank === 1) return place('champions', 1, 0);
      if (rank >= 11) return place('relegated', 2, Math.floor((rank - 11) / 2));
      return place('stayed', 1, 0);
    }
    if (rank <= 2) {
      return place('promoted', division - 1, division - 1 === 1 ? 0 : Math.floor(group / 3));
    }
    if (division < DIVISION_COUNT && rank >= 13) {
      return place('relegated', division + 1, group * 3 + ((rank - 13) % 3));
    }
    return place('stayed', division, group);
  }

  // A career saved in the old flat divisions keeps the rule it was playing
  // under for its last season, then joins the pyramid at the same number:
  // old Division 1 is Division 1, old Division 8 is Division 8.
  const isV1 = !(state.version >= 2) || !Array.isArray(state.divisions);
  if (isV1) return { kind: rank === 1 ? 'champions' : 'stayed', rank, size, division: 1, group: 0, joinsNewLeague: true };
  const division = state.division;
  let kind = 'stayed';
  let next = division;
  if (division === 1 && rank === 1) kind = 'champions';
  else if (division > 1 && rank <= 3) { kind = 'promoted'; next = division - 1; }
  else if (division < LEGACY_DIVISION_COUNT && rank > size - 3) { kind = 'relegated'; next = division + 1; }
  return { kind, rank, size, division: next, group: 0, joinsNewLeague: true };
}

// How a finished season ended for the manager: where they finished, and the
// division and group they move to.
export function seasonOutcome(state) {
  const placement = nextPlacement(state);
  return { ...placement, toDivision: placement.division, toGroup: placement.group };
}

// Summer: the manager's own players stay and start again from zero; everyone
// else in the new division is dealt a squad at that division's strength.
function playerForNewSeason(p) {
  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    age: p.age,
    attrs: p.attrs,
    overall: p.overall,
    fitness: 100,
    morale: p.morale,
    injury: 0,
    goals: 0,
    assists: 0,
    apps: 0,
    yellow: 0,
    red: 0,
    captain: p.captain,
  };
}

// A group the manager is not in, played out from the season's seed so the same
// career always gives the same final table. Only its order matters: which two
// clubs go up, which six go down. Its clubs are the group's own again next
// season, so nothing about it is saved.
function simulateGroup(seed, division, group, clubIds) {
  const squads = squadsFor(seed, clubIds, division);
  const state = {
    version: 4,
    season: 1, // season 1 means seasonSeed(state) is the seed handed in
    division,
    group,
    groupClubIds: clubIds.slice(),
    managerName: '',
    clubId: null,
    seed,
    squads,
    fixtures: buildFixtures(hash(seed, 'group', division, group), clubIds),
    results: [],
    tactics: { formation: '4-4-2', mentality: 'Balanced', pressing: 'Medium' },
    roles: rolesFor(squads),
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
  };
  while (!state.finished) playMatchday(state);
  return leagueTable(state);
}

function groupTable(seed, division, group) {
  return simulateGroup(seed, division, group, groupClubIds(division, group));
}

// The two clubs a parent group sends down into one of its child groups.
// Division 1 relegates eight, two into each of Division 2's four groups in
// order of finish: 11th and 12th to Group A, 13th and 14th to Group B, and so
// on. Every other parent relegates six, two into each of its three children,
// again in order of finish: 13th and 16th to its first child, 14th and 17th to
// the second, 15th and 18th to the third.
function relegatedInto(table, parentDivision, childGroup) {
  if (parentDivision === 1) return [table[10 + childGroup * 2].id, table[11 + childGroup * 2].id];
  const c = childGroup % 3;
  return [table[12 + c].id, table[15 + c].id];
}

// 18 clubs, with no duplicates. A club that moved into the manager's group in
// an earlier season can also be in a neighbour's own roster, so a rare
// duplicate is dropped and the spare clubs the neighbours offered next fill
// the gap.
function settle(primary, spare, division, group) {
  const out = [];
  const seen = new Set();
  const add = (id) => {
    if (out.length >= DIVISION_SIZE || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  primary.forEach(add);
  spare.forEach(add);
  groupClubIds(division, group).forEach(add);
  return out;
}

// The manager stays in the same group: it keeps what is not promoted or
// relegated, takes two down from the group above, and takes the top two of
// each group below. Division 1 takes the top two of each Division 2 group
// instead of anything from above; Division 8 has nothing below it.
function stayMembership(state, table, seed, division, group) {
  const ids = divisionClubIds(state);
  const up = division > 1 ? table.slice(0, 2).map((r) => r.id) : [];
  const downCount = relegationCount(division);
  const down = downCount ? table.slice(-downCount).map((r) => r.id) : [];
  const primary = ids.filter((id) => !up.includes(id) && !down.includes(id));
  const spare = [];

  if (division === 1) {
    for (let g = 0; g < groupsInDivision(2); g++) {
      const t = groupTable(seed, 2, g);
      primary.push(...t.slice(0, 2).map((r) => r.id));
      spare.push(...t.slice(2, 6).map((r) => r.id));
    }
  } else {
    const parentGroup = division === 2 ? 0 : Math.floor(group / 3);
    const parent = groupTable(seed, division - 1, parentGroup);
    primary.push(...relegatedInto(parent, division - 1, group));
    spare.push(...parent.slice(-8).map((r) => r.id));
    if (division < DIVISION_COUNT) {
      for (let k = 0; k < 3; k++) {
        const child = groupTable(seed, division + 1, group * 3 + k);
        primary.push(...child.slice(0, 2).map((r) => r.id));
        spare.push(...child.slice(2, 8).map((r) => r.id));
      }
    }
  }
  return settle(primary, spare, division, group);
}

// The manager's group went up: the new group keeps its ten, takes the two the
// group above it sent down, and takes the top two of each of its three child
// groups. The manager's own old group is one of those children, so its real
// table is used for it; Division 1 has four child groups and nothing above it.
function promotedMembership(state, table, seed, division, group) {
  const oldDivision = state.division;
  const oldGroup = currentGroup(state);
  const parentIds = groupClubIds(division, group);
  const parent = groupTable(seed, division, group);
  const up = division > 1 ? parent.slice(0, 2).map((r) => r.id) : [];
  const downCount = relegationCount(division);
  const down = downCount ? parent.slice(-downCount).map((r) => r.id) : [];
  const primary = parentIds.filter((id) => !up.includes(id) && !down.includes(id));
  const spare = [];

  if (division > 1) {
    const grandparent = groupTable(seed, division - 1, Math.floor(group / 3));
    primary.push(...relegatedInto(grandparent, division - 1, group));
    spare.push(...grandparent.slice(-8).map((r) => r.id));
  }
  if (division === 1) {
    for (let k = 0; k < groupsInDivision(2); k++) {
      const own = oldDivision === 2 && k === oldGroup;
      const t = own ? table : groupTable(seed, 2, k);
      primary.push(...t.slice(0, 2).map((r) => r.id));
      spare.push(...t.slice(2, 6).map((r) => r.id));
    }
  } else {
    for (let k = 0; k < 3; k++) {
      const childGroup = group * 3 + k;
      const own = oldDivision === division + 1 && childGroup === oldGroup;
      const t = own ? table : groupTable(seed, division + 1, childGroup);
      primary.push(...t.slice(0, 2).map((r) => r.id));
      spare.push(...t.slice(2, 8).map((r) => r.id));
    }
  }
  return settle(primary, spare, division, group);
}

// The manager's group went down: the child group keeps what is not promoted
// or relegated, takes the two the manager's group sent down, and takes the top
// two of each of its own children.
function relegatedMembership(state, table, seed, division, group) {
  const childIds = groupClubIds(division, group);
  const child = groupTable(seed, division, group);
  const up = child.slice(0, 2).map((r) => r.id);
  const downCount = relegationCount(division);
  const down = downCount ? child.slice(-downCount).map((r) => r.id) : [];
  const gone = new Set(up.concat(down));
  const primary = childIds.filter((id) => !gone.has(id));
  const spare = child.filter((r) => !gone.has(r.id)).map((r) => r.id);

  primary.push(...relegatedInto(table, state.division, group));
  if (division < DIVISION_COUNT) {
    for (let k = 0; k < 3; k++) {
      const grandchild = groupTable(seed, division + 1, group * 3 + k);
      primary.push(...grandchild.slice(0, 2).map((r) => r.id));
      spare.push(...grandchild.slice(2, 8).map((r) => r.id));
    }
  }
  return settle(primary, spare, division, group);
}

// The next season: the same club, the same players and the same roles, in the
// group promotion and relegation put them in.
function newSeasonState(state, division, group, ids, season) {
  const seed = hash(state.seed, 'season', season);
  const squads = { [state.clubId]: state.squads[state.clubId].map(playerForNewSeason) };
  for (const id of ids) {
    if (id === state.clubId) continue;
    squads[id] = buildSquad(seed, clubIndex(id), clubById(id).rep, division);
  }
  const next = {
    version: 4,
    season,
    division,
    group,
    groupClubIds: ids.slice(),
    managerName: state.managerName,
    clubId: state.clubId,
    seed: state.seed,
    squads,
    fixtures: buildFixtures(seed, ids),
    results: [],
    tactics: { ...state.tactics },
    roles: rolesFor(squads),
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
  };
  // The manager's players keep the roles they were given.
  for (const p of next.squads[next.clubId]) {
    if (state.roles && state.roles[p.id]) next.roles[p.id] = state.roles[p.id];
  }
  next.lineup = autoLineup(next.squads[next.clubId], next.tactics.formation, next.roles);
  // The wallet and the purchase belong to the career, not the season.
  if (state.wallet) next.wallet = { ...state.wallet };
  if (state.purchase) next.purchase = { ...state.purchase };
  return next;
}

// A pyramid season rolls over from the manager's own table; the groups around
// it are played out from the same seed to decide who comes and goes.
function rollOver(state) {
  const season = (state.season || 1) + 1;
  const seed = seasonSeed(state);
  const table = leagueTable(state);
  const placement = nextPlacement(state);
  let ids;
  if (placement.kind === 'promoted') ids = promotedMembership(state, table, seed, placement.division, placement.group);
  else if (placement.kind === 'relegated') ids = relegatedMembership(state, table, seed, placement.division, placement.group);
  else ids = stayMembership(state, table, seed, placement.division, placement.group);
  return newSeasonState(state, placement.division, placement.group, ids, season);
}

// Apply promotion and relegation, then start the next season with the same
// club and players in its new group. Only a finished season rolls over.
export function startNextSeason(state) {
  if (!state || !state.finished) return state;
  const season = (state.season || 1) + 1;
  if (state.version >= 4 && Array.isArray(state.groupClubIds)) return rollOver(state);

  // A version 3 career was playing the three-tier league. It finishes that
  // season and joins the pyramid where its tier and group already sit.
  if (state.version >= 3 && Array.isArray(state.groups) && state.groups[state.groupIndex]) {
    const bridged = {
      ...state,
      version: 4,
      group: currentGroup(state),
      groupClubIds: state.groups[state.groupIndex].clubIds.slice(),
    };
    delete bridged.groups;
    delete bridged.groupIndex;
    return rollOver(bridged);
  }

  // A career from the flat divisions: it keeps the season it is in, then joins
  // the pyramid in the division its finish maps to, in that division's first
  // group. If its club is not already there it takes the place of the weakest
  // club in the group.
  const placement = nextPlacement(state);
  const ids = groupClubIds(placement.division, 0).slice();
  if (!ids.includes(state.clubId)) {
    let weakest = ids[0];
    for (const id of ids) if (clubById(id).rep < clubById(weakest).rep) weakest = id;
    ids[ids.indexOf(weakest)] = state.clubId;
  }
  return newSeasonState(state, placement.division, 0, ids, season);
}

// The staging demo: Harbourside seventeen matchdays into a Division 1 season,
// with one injury and one booking to show, the last result and the table
// already filled in.
export function buildDemoState(seed) {
  const state = buildInitialState('harbourside', 'Demo Manager', seed);
  for (let i = 0; i < 17; i++) playMatchday(state);
  // The demo shows exactly one injured player and one booked player.
  const squad = state.squads.harbourside;
  for (const p of squad) { p.injury = 0; p.yellow = 0; p.red = 0; }
  const benchPick = squad.filter((p) => !state.lineup.includes(p.id) && POS_GROUP[p.pos] !== 'GK')
    .sort((a, b) => b.overall - a.overall)[0] || squad[squad.length - 1];
  if (benchPick) benchPick.injury = 2;
  const booked = squad.find((p) => POS_GROUP[p.pos] === 'DF' && p !== benchPick) || squad[1];
  if (booked) booked.yellow = 1;
  state.lineup = autoLineup(squad, state.tactics.formation, state.roles);
  fixLineup(state);
  state.managerName = 'Demo Manager';
  // The demo bought its club, so the Wallet section has something to show.
  state.wallet = { currency: 'Dummy USDC', balance: 900 };
  state.purchase = { clubId: 'harbourside', price: 100, at: '2026-01-15T12:00:00.000Z', demo: true };
  return state;
}

// Find a seed whose demo puts Harbourside third after seventeen matchdays in
// Division 1. Done once, offline, and the answer is written into server.js as
// DEMO_SEED.
export function findDemoSeed(max = 400) {
  for (let seed = 1; seed <= max; seed++) {
    const state = buildDemoState(seed);
    const table = leagueTable(state);
    const me = table.find((r) => r.id === 'harbourside');
    if (me && me.rank === 3 && me.played === 17) return { seed, points: me.points, table: table.map((r) => [r.rank, r.name, r.points]) };
  }
  return null;
}
