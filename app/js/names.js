// Random name generator. Everything is built in, so it works offline and
// nothing is sent anywhere.

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const chance = (p) => Math.random() < p;

// ---------- Word lists ----------

const FIRST = {
  modern: {
    f: ['Ava', 'Maya', 'Nora', 'Claire', 'Jess', 'Hannah', 'Leah', 'Tessa', 'Rosa', 'Imani', 'Priya', 'Dana', 'Megan', 'Lucy', 'Erin', 'Paige', 'Kira', 'Naomi', 'Grace', 'Julia', 'Sadie', 'Ines', 'Mina', 'Corinne', 'Beth', 'Talia', 'Wren', 'Harper', 'Zoe', 'Elena', 'Bianca', 'Josie', 'Keisha', 'Mei', 'Lena', 'Ruth', 'Vera', 'Holly', 'Amara', 'Celeste'],
    m: ['Sam', 'Eli', 'Marcus', 'Owen', 'Theo', 'Daniel', 'Jonah', 'Caleb', 'Luis', 'Andre', 'Ravi', 'Nate', 'Grant', 'Isaac', 'Felix', 'Malik', 'Dev', 'Colin', 'Hugo', 'Tomas', 'Wes', 'Rhys', 'Adrian', 'Desmond', 'Kenji', 'Mateo', 'Simon', 'Victor', 'Gabe', 'Reggie', 'Abe', 'Curtis', 'Ian', 'Leon', 'Omar', 'Pete', 'Russell', 'Silas', 'Trent', 'Yusuf'],
    n: ['Alex', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Quinn', 'Avery', 'Jamie', 'Rowan', 'Sasha', 'Robin', 'Taylor', 'Emerson', 'Sky', 'Parker', 'Reese', 'Blake', 'Drew', 'Frankie', 'Kai'],
  },
  vintage: {
    f: ['Mabel', 'Hazel', 'Dorothy', 'Edith', 'Vivian', 'Loretta', 'Ida', 'Opal', 'Pearl', 'Ruby', 'Della', 'Frances', 'Ginny', 'Harriet', 'Irene', 'Lorraine', 'Marjorie', 'Nell', 'Rosalind', 'Sylvia', 'Violet', 'Winifred', 'Bette', 'Clara', 'Evelyn', 'Fay', 'Gloria', 'Lillian', 'Mae', 'Thelma'],
    m: ['Walter', 'Arthur', 'Harold', 'Clarence', 'Eugene', 'Floyd', 'Leonard', 'Mortimer', 'Otis', 'Percy', 'Raymond', 'Stanley', 'Virgil', 'Wendell', 'Augustus', 'Bertram', 'Chester', 'Cyril', 'Earl', 'Ezra', 'Homer', 'Irving', 'Jasper', 'Lionel', 'Murray', 'Roscoe', 'Rufus', 'Sterling', 'Vernon', 'Wilbur'],
    n: ['Frankie', 'Billie', 'Lou', 'Jo', 'Charlie', 'Sydney', 'Marion', 'Leslie', 'Jean', 'Carroll'],
  },
  fantasy: {
    f: ['Aelith', 'Brisenne', 'Calla', 'Ysolde', 'Maelis', 'Seraphine', 'Thessaly', 'Liora', 'Ondine', 'Rhiannon', 'Elowen', 'Isveth', 'Marrow', 'Nimue', 'Oriel', 'Sabeth', 'Velka', 'Wynna', 'Ilsabet', 'Corra', 'Eirlys', 'Feyra', 'Gwenora', 'Lirien', 'Saoirse', 'Tamsin', 'Yvaine', 'Zerah', 'Ardith', 'Mirelle'],
    m: ['Aldric', 'Bram', 'Caedmon', 'Doran', 'Edric', 'Fenwick', 'Garrick', 'Hadrian', 'Ivor', 'Joren', 'Kestrel', 'Leofric', 'Merek', 'Osric', 'Perrin', 'Roderick', 'Soren', 'Tobin', 'Ulric', 'Varian', 'Wystan', 'Corvin', 'Dain', 'Emeric', 'Halvard', 'Lucan', 'Oswin', 'Rowe', 'Tavish', 'Thane'],
    n: ['Ash', 'Briar', 'Ember', 'Sparrow', 'Vale', 'Wren', 'Sable', 'Rook', 'Linden', 'Hollis'],
  },
  scifi: {
    f: ['Nova', 'Lyra', 'Vega', 'Kesh', 'Ione', 'Aris', 'Talen', 'Cyra', 'Mira', 'Zaya', 'Elara', 'Juno', 'Nyx', 'Oona', 'Pella', 'Rhea', 'Sela', 'Tova', 'Veda', 'Xia'],
    m: ['Rook', 'Dax', 'Orrin', 'Cass', 'Jett', 'Kael', 'Lux', 'Marek', 'Nils', 'Odo', 'Pax', 'Quill', 'Rennick', 'Stellan', 'Tycho', 'Vance', 'Wolfe', 'Zane', 'Ansel', 'Brannick'],
    n: ['Echo', 'Sol', 'Rune', 'Indigo', 'Onyx', 'Cipher', 'Arlo', 'Ren', 'Tem', 'Ixi'],
  },
};

const LAST = {
  modern: ['Abernathy', 'Bellamy', 'Brooks', 'Calloway', 'Chen', 'Dalton', 'Delgado', 'Ellison', 'Farrow', 'Fischer', 'Garza', 'Greer', 'Hale', 'Hollis', 'Iyer', 'Jensen', 'Kader', 'Kowalski', 'Lam', 'Lindqvist', 'Marsh', 'Mercer', 'Nakamura', 'Novak', 'Okafor', 'Ortega', 'Park', 'Pryce', 'Quinlan', 'Reyes', 'Rourke', 'Sato', 'Shaw', 'Sinclair', 'Strand', 'Thorne', 'Vance', 'Walsh', 'Webb', 'Whitlock', 'Yates', 'Zielinski', 'Achebe', 'Bishop', 'Castellano', 'Doyle', 'Frost', 'Haddad', 'Kerr', 'Moreau'],
  vintage: ['Ashcroft', 'Blackwood', 'Carrigan', 'Delacroix', 'Fairbanks', 'Galloway', 'Hargrove', 'Kilbride', 'Larkin', 'Malone', 'McCready', 'Pemberton', 'Prescott', 'Quaid', 'Rafferty', 'Sloane', 'Tremaine', 'Vandermeer', 'Wexley', 'Whitcombe', 'Bannister', 'Crane', 'Dunmore', 'Everhart', 'Finch', 'Holloway', 'Lockhart', 'Monroe', 'Reilly', 'Stokes'],
};

const SURNAME_PARTS = {
  a: ['Ash', 'Black', 'Bright', 'Cold', 'Crow', 'Dun', 'Fair', 'Fen', 'Frost', 'Gold', 'Grey', 'Hart', 'Holl', 'Iron', 'Marsh', 'Oak', 'Raven', 'Red', 'Salt', 'Silver', 'Stone', 'Storm', 'Thorn', 'Under', 'West', 'Whit', 'Wick', 'Wild', 'Wolf', 'Wyn'],
  b: ['bourne', 'brook', 'by', 'combe', 'croft', 'dale', 'field', 'ford', 'gate', 'grove', 'hall', 'ham', 'hart', 'hill', 'hollow', 'hurst', 'leigh', 'mere', 'more', 'ridge', 'shaw', 'stead', 'thorpe', 'ton', 'vale', 'well', 'wick', 'wood', 'worth', 'wright'],
};

const PLACE = {
  townA: ['Ash', 'Bar', 'Black', 'Bram', 'Bright', 'Brook', 'Bur', 'Cal', 'Cold', 'Crow', 'Dun', 'East', 'Elm', 'Fair', 'Fern', 'Glen', 'Gold', 'Green', 'Hay', 'Heron', 'Holly', 'Kings', 'Lark', 'Lin', 'Long', 'Mill', 'North', 'Oak', 'Pen', 'Red', 'Rook', 'Rush', 'Salt', 'Shep', 'Stan', 'Stone', 'Thorn', 'Tre', 'Wil', 'Wind', 'Wyn'],
  townB: ['bridge', 'bury', 'by', 'caster', 'combe', 'cross', 'dale', 'den', 'field', 'ford', 'gate', 'ham', 'haven', 'holm', 'hurst', 'ley', 'low', 'march', 'mere', 'minster', 'mouth', 'port', 'stead', 'stow', 'thorpe', 'ton', 'wall', 'water', 'well', 'wick', 'worth'],
  adj: ['Amber', 'Ashen', 'Black', 'Bleak', 'Broken', 'Burning', 'Crimson', 'Drowned', 'Ember', 'Emerald', 'Forgotten', 'Gilded', 'Glass', 'Grey', 'Hallowed', 'Hollow', 'Iron', 'Last', 'Lonely', 'Lost', 'Moonlit', 'Pale', 'Restless', 'Salt', 'Shattered', 'Silent', 'Silver', 'Sleeping', 'Sunken', 'Thousand', 'Twin', 'Weeping', 'Whispering', 'White', 'Wild', 'Winter'],
  feature: ['Barrens', 'Bay', 'Bluffs', 'Coast', 'Crossing', 'Deep', 'Downs', 'Expanse', 'Falls', 'Fen', 'Fields', 'Forest', 'Gate', 'Glade', 'Hills', 'Hollow', 'Isles', 'Marsh', 'Mire', 'Moor', 'Narrows', 'Pass', 'Peaks', 'Reach', 'Ridge', 'Sands', 'Shallows', 'Spire', 'Steppe', 'Strand', 'Teeth', 'Vale', 'Wastes', 'Weald', 'Wood'],
  noun: ['Crows', 'Kings', 'Bones', 'Bells', 'Lanterns', 'Ashes', 'Thorns', 'Stars', 'Wolves', 'Whispers', 'Mirrors', 'Saints', 'Echoes', 'Ravens', 'Tides', 'Embers', 'Lost Things', 'the Drowned', 'the Old Gods', 'Broken Oaths'],
  bAdj: ['Amber', 'Black', 'Blue', 'Brass', 'Crooked', 'Gilded', 'Glass', 'Golden', 'Grand', 'Green', 'Grey', 'Lucky', 'Old', 'Red', 'Royal', 'Silver', 'Starlight', 'Velvet', 'White', 'Winter'],
  urban: ['Alley', 'Arcade', 'Avenue', 'Court', 'Market', 'Row', 'Square', 'Street', 'Terrace', 'Wharf', 'Yard', 'Lane', 'Close', 'Circus'],
  building: ['Arms', 'Hotel', 'Library', 'Station', 'Theater', 'Diner', 'Lighthouse', 'Chapel', 'Observatory', 'Tavern', 'Inn', 'Tower', 'House', 'Institute', 'Asylum', 'Mill', 'Dock', 'Archive'],
  station: ['Station', 'Outpost', 'Array', 'Colony', 'Habitat', 'Relay', 'Ring', 'Spire', 'Yard', 'Anchorage', 'Platform', 'Beacon'],
  greek: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Theta', 'Kappa', 'Sigma', 'Tau', 'Omega'],
};

const GROUP = {
  head: ['Order', 'Brotherhood', 'Sisterhood', 'Circle', 'Court', 'Company', 'Guild', 'House', 'League', 'Society', 'Covenant', 'Council', 'Fellowship', 'Assembly', 'Syndicate', 'Collective', 'Congregation', 'Watch', 'Lodge', 'Cartel', 'Choir', 'Hand'],
  of: ['the Silver Hand', 'the Long Night', 'the Ninth Gate', 'the Unbroken Chain', 'Quiet Waters', 'the Last Light', 'the Hollow Crown', 'Ash and Thorn', 'the Pale Star', 'Saint Wren', 'the Drowned Bell', 'the Open Eye', 'the Seventh Door', 'the Black Lantern', 'Iron and Salt', 'the Red Thread', 'the Burning Page', 'the Twelve Keys'],
  modernA: ['Meridian', 'Halcyon', 'Northwind', 'Blackridge', 'Ardent', 'Vantage', 'Cobalt', 'Paragon', 'Sentinel', 'Stillwater', 'Kestrel', 'Lumen', 'Oakhaven', 'Tessellate', 'Verity', 'Wexford', 'Axiom', 'Helix'],
  modernB: ['Holdings', 'Group', 'Industries', 'Dynamics', 'Systems', 'Partners', 'Trust', 'Institute', 'Labs', 'Foundation', 'Logistics', '& Co.', 'Collective', 'Initiative'],
  the: ['Lanterns', 'Unnamed', 'Faithful', 'Grey Men', 'Sleepers', 'Quiet Ones', 'Wardens', 'Mourners', 'Tinkers', 'Ninefold', 'Remnant', 'Sworn', 'Ashborn', 'Keepers', 'Hollowed'],
};

const ITEM = {
  adj: ['Ashen', 'Broken', 'Brass', 'Cracked', 'Crimson', 'Ebon', 'Gilded', 'Glass', 'Hollow', 'Iron', 'Ivory', 'Last', 'Lonely', 'Moon', 'Pale', 'Quiet', 'Silver', 'Starless', 'Sunken', 'Unspoken', 'Weeping', 'Winter'],
  noun: ['Blade', 'Bell', 'Book', 'Chalice', 'Compass', 'Crown', 'Dagger', 'Key', 'Lantern', 'Locket', 'Map', 'Mask', 'Mirror', 'Needle', 'Ring', 'Seal', 'Shard', 'Spindle', 'Stone', 'Thread', 'Veil', 'Watch', 'Lens', 'Coin'],
  of: ['Dawn', 'Ending', 'Hours', 'Kings', 'Memory', 'Mourning', 'Names', 'Return', 'Silence', 'Sorrow', 'Tides', 'Unmaking', 'Whispers', 'the Deep', 'the Lost', 'the North', 'the Seventh Saint', 'Ten Thousand Doors'],
};

// Syllables for invented words, by flavor.
const SYL = {
  soft: { start: ['a', 'e', 'i', 'el', 'il', 'ae', 'li', 'ma', 'na', 'sa', 'se', 'thi', 'va', 'lu', 'ny', 'ri', 'so', 'mi'], mid: ['la', 'ri', 'na', 'the', 'si', 'le', 'ra', 'li', 'wy', 'mae', 'ne', 'lo', 'ry'], end: ['a', 'el', 'iel', 'is', 'wen', 'ra', 'ith', 'ys', 'ael', 'ine', 'ora', 'eth', 'ia', 'on'] },
  harsh: { start: ['kr', 'gr', 'dr', 'th', 'vor', 'kal', 'zh', 'mor', 'brak', 'gor', 'ul', 'thr', 'skar', 'vek'], mid: ['ak', 'ur', 'og', 'ra', 'ul', 'ash', 'ok', 'ar', 'ug', 'ez', 'ok'], end: ['ak', 'og', 'uk', 'ash', 'rak', 'gar', 'oth', 'mog', 'zul', 'dur', 'rek', 'mar'] },
  ancient: { start: ['ae', 'cy', 'il', 'ka', 'me', 'ny', 'ot', 'pha', 'sa', 'ta', 'xe', 'zo', 'ar', 'he', 'is'], mid: ['ra', 'the', 'lo', 'mo', 'ne', 'phi', 'ri', 'sto', 'ta', 'ly', 'ka'], end: ['on', 'os', 'ia', 'is', 'ax', 'eus', 'ra', 'ene', 'ion', 'ys', 'um', 'ae'] },
  northern: { start: ['ar', 'bjor', 'dag', 'ei', 'fro', 'gun', 'hal', 'in', 'kol', 'rag', 'sig', 'thor', 'ulf', 'vig', 'yr'], mid: ['na', 'ri', 'ma', 'ge', 'da', 'ha', 'lo', 'vi'], end: ['vald', 'heim', 'ström', 'gard', 'mund', 'run', 'dis', 'hild', 'nir', 'vik', 'rik', 'stad', 'ny'] },
  desert: { start: ['al', 'ba', 'da', 'ka', 'ma', 'na', 'qa', 'sa', 'ta', 'za', 'ha', 'ra', 'ya'], mid: ['ri', 'sh', 'ha', 'mi', 'li', 'za', 'qa', 'di', 'su'], end: ['ar', 'an', 'im', 'ah', 'iz', 'ud', 'ir', 'esh', 'ara', 'un', 'ani', 'ad'] },
  alien: { start: ['x', 'qu', 'zz', 'vy', "k'", 'tl', 'ph', 'oo', 'y', 'zr', 'vh', 'ix'], mid: ['ix', 'oq', 'yl', "'a", 'th', 'uu', 'zi', 'ae', 'rr', 'ko'], end: ['ix', 'oth', 'yx', 'aa', 'ul', 'ek', 'qi', 'orr', 'ae', 'iz', 'on'] },
};

export const FLAVORS = [
  ['soft', 'Soft & lyrical'],
  ['harsh', 'Harsh & guttural'],
  ['ancient', 'Ancient (Greek/Latin feel)'],
  ['northern', 'Northern (Norse feel)'],
  ['desert', 'Desert & spice'],
  ['alien', 'Alien'],
];

const VOWELS = { soft: 'aeiaeo', harsh: 'aouo', ancient: 'aeio', northern: 'aeiu', desert: 'aai', alien: 'aiuo' };
const isV = (c) => /[aeiouy']/i.test(c);

// Joins two syllables, slipping a vowel between consonant clusters.
function join(a, b, s) {
  if (!isV(a.slice(-1)) && !isV(b[0])) {
    const vs = VOWELS[Object.keys(SYL).find((k) => SYL[k] === s)] || 'aeio';
    return a + vs[Math.floor(Math.random() * vs.length)] + b;
  }
  return a + b;
}

function invented(flavor = 'soft', { minSyl = 2, maxSyl = 3, start = '' } = {}) {
  const s = SYL[flavor] || SYL.soft;
  for (let tries = 0; tries < 30; tries++) {
    const n = minSyl + Math.floor(Math.random() * (maxSyl - minSyl + 1));
    let w = pick(s.start);
    for (let i = 2; i < n; i++) w = join(w, pick(s.mid), s);
    if (n > 1) w = join(w, pick(s.end), s);
    w = w.replace(/(.)\1\1+/g, '$1$1').replace(/([aeiouy])\1/g, '$1');
    if (/[^aeiouy']{4}/i.test(w)) continue;
    if (w.length < 3 || w.length > 11) continue;
    if (start && !w.toLowerCase().startsWith(start.toLowerCase())) continue;
    return cap(w);
  }
  return start ? cap(start.toLowerCase() + pick(s.end)) : cap(pick(s.start) + pick(s.end));
}

// ---------- Generators ----------

export const KINDS = {
  person: {
    label: 'People',
    styles: [
      ['modern', 'Modern'],
      ['vintage', 'Vintage / noir'],
      ['fantasy', 'Fantasy'],
      ['scifi', 'Science fiction'],
      ['invented', 'Invented'],
    ],
    gender: true,
    make(style, { gender = 'any', flavor = 'soft' } = {}) {
      if (style === 'invented') {
        const first = invented(flavor, { minSyl: 2, maxSyl: 3 });
        return chance(0.6) ? `${first} ${invented(flavor, { minSyl: 2, maxSyl: 3 })}` : first;
      }
      const pool = FIRST[style] || FIRST.modern;
      const g = gender === 'any' ? pick(['f', 'm', 'f', 'm', 'n']) : gender;
      const first = pick(pool[g]);
      let last;
      if (style === 'fantasy') {
        last = chance(0.25) ? `of ${pick(PLACE.townA)}${pick(PLACE.townB)}` : pick(SURNAME_PARTS.a) + pick(SURNAME_PARTS.b);
      } else if (style === 'scifi') {
        last = chance(0.5) ? pick(LAST.modern) : `${pick(['Vey', 'Orlo', 'Tarn', 'Kade', 'Sorrow', 'Ibarra', 'Achterberg', 'Holt', 'Ng', 'Voss', 'Halloran', 'Okonkwo-Reyes'])}`;
        if (chance(0.12)) last += `-${Math.floor(2 + Math.random() * 90)}`;
      } else if (style === 'vintage') {
        last = pick(LAST.vintage);
      } else {
        last = chance(0.2) ? pick(SURNAME_PARTS.a) + pick(SURNAME_PARTS.b) : pick(LAST.modern);
      }
      return `${first} ${last}`;
    },
  },
  place: {
    label: 'Places',
    styles: [
      ['town', 'Towns & villages'],
      ['landmark', 'Landscapes'],
      ['urban', 'City spots'],
      ['realm', 'Fantasy realms'],
      ['space', 'Space'],
      ['invented', 'Invented'],
    ],
    make(style, { flavor = 'soft' } = {}) {
      switch (style) {
        case 'landmark':
          return pick([
            () => `The ${pick(PLACE.adj)} ${pick(PLACE.feature)}`,
            () => `${pick(PLACE.feature)} of ${pick(PLACE.noun)}`,
            () => `${pick(PLACE.townA)}${pick(PLACE.townB)} ${pick(PLACE.feature)}`,
          ])();
        case 'urban':
          return pick([
            () => `${pick(PLACE.townA)}${pick(['', 'wood', 'more', 'field', 'ton'])} ${pick(PLACE.urban)}`,
            () => `The ${pick(PLACE.bAdj)} ${pick(PLACE.building)}`,
            () => `${pick(LAST.vintage)}’s ${pick(PLACE.building)}`,
            () => `${Math.floor(10 + Math.random() * 990)} ${pick(PLACE.townA)}${pick(['', 'wood', 'more', 'field'])} ${pick(PLACE.urban)}`,
          ])();
        case 'realm':
          return pick([
            () => invented(flavor, { minSyl: 2, maxSyl: 3 }),
            () => `The ${pick(PLACE.adj)} ${pick(['Kingdom', 'Reach', 'Marches', 'Throne', 'Dominion', 'Isles', 'Wastes', 'Expanse'])}`,
            () => `${invented(flavor, { minSyl: 2, maxSyl: 2 })} ${pick(PLACE.feature)}`,
            () => `${invented(flavor, { minSyl: 2, maxSyl: 3 })}${pick(['heim', 'mar', 'dell', 'gard', 'holt', 'mere', 'thal', 'shire'])}`,
          ])();
        case 'space':
          return pick([
            () => `${invented('ancient', { minSyl: 2, maxSyl: 3 })} ${pick(['Prime', 'IV', 'VII', 'Minor', 'b', 'Station', 'Reach'])}`,
            () => `${pick(['Kepler', 'Gliese', 'Tycho', 'Halley', 'Hubble', 'Ross', 'Wolf', 'Lacaille'])}-${Math.floor(100 + Math.random() * 900)}${pick(['', 'b', 'c', 'd'])}`,
            () => `${pick(PLACE.greek)} ${pick(PLACE.station)}`,
            () => `${pick(GROUP.modernA)} ${pick(PLACE.station)}`,
            () => `New ${pick(['Lagos', 'Kyoto', 'Avalon', 'Eden', 'Halifax', 'Tallinn', 'Bombay', 'Carthage', 'Selene', 'Odessa'])}`,
          ])();
        case 'invented':
          return invented(flavor, { minSyl: 2, maxSyl: 3 });
        default:
          return pick([
            () => `${pick(PLACE.townA)}${pick(PLACE.townB)}`,
            () => `${pick(PLACE.townA)}${pick(PLACE.townB)}`,
            () => `${pick(['Little', 'Upper', 'Lower', 'Old', 'East', 'West', 'Great', 'Saint'])} ${pick(PLACE.townA)}${pick(PLACE.townB)}`,
            () => `${pick(PLACE.townA)}${pick(PLACE.townB)}-on-${pick(['Sea', 'Wye', 'Avon', 'Tees', 'Lune', 'Ouse'])}`,
          ])();
      }
    },
  },
  group: {
    label: 'Groups',
    styles: [
      ['secret', 'Orders & cults'],
      ['noble', 'Noble houses'],
      ['modern', 'Companies'],
      ['gang', 'Crews & gangs'],
    ],
    make(style, { flavor = 'soft' } = {}) {
      switch (style) {
        case 'noble': return `House ${chance(0.5) ? invented(flavor, { minSyl: 2, maxSyl: 3 }) : pick(SURNAME_PARTS.a) + pick(SURNAME_PARTS.b)}`;
        case 'modern': return `${pick(GROUP.modernA)} ${pick(GROUP.modernB)}`;
        case 'gang': return pick([
          () => `The ${pick(PLACE.townA)}${pick(['', ' Street', ' Row'])} ${pick(['Boys', 'Kings', 'Saints', 'Rats', 'Crew', 'Knives', 'Dogs', 'Widows'])}`,
          () => `The ${pick(PLACE.adj)} ${pick(['Hands', 'Jacks', 'Crows', 'Lanterns', 'Teeth', 'Hounds'])}`,
        ])();
        default: return pick([
          () => `The ${pick(GROUP.head)} of ${pick(GROUP.of)}`,
          () => `The ${pick(GROUP.the)}`,
          () => `The ${pick(PLACE.adj)} ${pick(GROUP.head)}`,
        ])();
      }
    },
  },
  thing: {
    label: 'Objects',
    styles: [
      ['legend', 'Legendary'],
      ['plain', 'Plain & eerie'],
      ['ship', 'Ships & vessels'],
    ],
    make(style, { flavor = 'soft' } = {}) {
      switch (style) {
        case 'plain': return `The ${pick(ITEM.adj)} ${pick(ITEM.noun)}`;
        case 'ship': return pick([
          () => `The ${pick(PLACE.adj)} ${pick(['Gull', 'Heron', 'Promise', 'Wanderer', 'Maiden', 'Fortune', 'Reply', 'Hope', 'Lady', 'Tide'])}`,
          () => `${pick(['Unreasonable', 'Quiet', 'Patient', 'Persistent', 'Ordinary', 'Second'])} ${pick(['Objection', 'Answer', 'Thought', 'Errand', 'Courtesy', 'Apology'])}`,
          () => `${invented(flavor, { minSyl: 2, maxSyl: 3 })}’s ${pick(['Grace', 'Folly', 'Revenge', 'Luck', 'Return'])}`,
        ])();
        default: return pick([
          () => `The ${pick(ITEM.noun)} of ${pick(ITEM.of)}`,
          () => `${invented(flavor, { minSyl: 2, maxSyl: 3 })}, the ${pick(ITEM.adj)} ${pick(ITEM.noun)}`,
          () => `The ${pick(ITEM.adj)} ${pick(ITEM.noun)} of ${pick(ITEM.of)}`,
        ])();
      }
    },
  },
  word: {
    label: 'Invented words',
    styles: [['short', 'Short'], ['long', 'Long'], ['compound', 'Two-part']],
    make(style, { flavor = 'soft', start = '' } = {}) {
      if (style === 'long') return invented(flavor, { minSyl: 3, maxSyl: 4, start });
      if (style === 'compound') return `${invented(flavor, { minSyl: 1, maxSyl: 2, start })}-${invented(flavor, { minSyl: 1, maxSyl: 2 }).toLowerCase()}`;
      return invented(flavor, { minSyl: 2, maxSyl: 2, start });
    },
  },
};

// Which kind of name fits an entry type, judging by its name.
export function kindForType(typeName = '') {
  const t = typeName.toLowerCase();
  if (/charac|person|people|cast|npc|god|deit|creature/.test(t)) return 'person';
  if (/place|location|setting|city|cities|town|world|realm|planet|region|map/.test(t)) return 'place';
  if (/faction|group|guild|house|org|order|famil|clan|compan|church|cult/.test(t)) return 'group';
  if (/object|item|artifact|artefact|weapon|ship|vehicle|relic/.test(t)) return 'thing';
  return 'word';
}

// Generates `count` distinct names, filtered by optional starting letters.
export function generate(kind, style, opts = {}, count = 12) {
  const k = KINDS[kind] || KINDS.word;
  const out = new Set();
  const start = (opts.start || '').trim().toLowerCase();
  let guard = 0;
  while (out.size < count && guard++ < count * 60) {
    const n = k.make(style, opts);
    if (start && !n.replace(/^(the|house|new|little|upper|lower|old|great|saint|east|west)\s+/i, '').toLowerCase().startsWith(start)) continue;
    out.add(n);
  }
  return [...out];
}
