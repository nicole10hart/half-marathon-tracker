export const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export const TYPE_LABELS = {
  easy: 'Easy Run', tempo: 'Tempo Run', long: 'Long Run',
  recovery: 'Recovery Run', race: 'Race Day',
};

export const DAYS_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const STATE_KEY = 'halftrack_v2';

// Long run miles indexed from the end of the plan.
// Index 0  = taper week (1 week before race)
// Index 1  = 2 weeks before race, etc.
// Supports plans up to 16 training weeks; extra weeks repeat the base (index 12+).
export const LONG_FROM_END = {
  3: [ 5,  7,  9,  7, 10, 11,  9,  7,  5,  6,  5,  4,  4,  4,  4,  4],
  4: [ 7, 10, 12, 11,  9, 10,  9,  8,  6,  7,  6,  5,  5,  5,  5,  4],
  5: [ 7, 11, 13, 12,  9, 11, 10,  9,  6,  8,  7,  5,  5,  5,  5,  5],
  6: [ 8, 12, 13, 13, 10, 12, 11, 10,  7,  9,  8,  6,  6,  6,  5,  5],
};
