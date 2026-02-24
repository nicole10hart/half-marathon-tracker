export const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export const TYPE_LABELS = {
  easy: 'Easy Run', tempo: 'Tempo Run', long: 'Long Run',
  recovery: 'Recovery Run', race: 'Race Day',
};

export const DAYS_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const STATE_KEY = 'halftrack_v2';

export const CT_TYPES = [
  'aqua jogging', 'barre', 'basketball', 'biking', 'climbing', 'crossfit',
  'dance', 'elliptical', 'foam rolling', 'golf', 'hiking', 'hiit',
  'kayaking', 'martial arts', 'pilates', 'rowing', 'skateboarding',
  'skiing', 'soccer', 'spinning', 'stretching', 'surfing', 'swimming',
  'tennis', 'volleyball', 'weightlifting', 'yoga',
];

export const INJURY_PARTS = [
  'Left Knee', 'Right Knee', 'Left Ankle', 'Right Ankle',
  'Left Hip', 'Right Hip', 'IT Band (Left)', 'IT Band (Right)',
  'Left Hamstring', 'Right Hamstring', 'Left Calf', 'Right Calf',
  'Left Shin', 'Right Shin', 'Plantar Fascia (Left)', 'Plantar Fascia (Right)',
  'Lower Back', 'Achilles (Left)', 'Achilles (Right)', 'Other',
];

export const INJURY_SEVERITY = ['Mild', 'Moderate', 'Severe'];

// { id, name, dur, desc }
export const WARMUP_EXERCISES = [
  { id: 'walk',       name: 'Easy Walk',                dur: '3–5 min',           desc: 'Brisk walking to raise heart rate and loosen up. Keep it easy — not a run.' },
  { id: 'leg-fb',     name: 'Leg Swings (fwd/back)',    dur: '20 each side',      desc: 'Hold a wall, swing each leg forward and back. Loosens hip flexors and hamstrings.' },
  { id: 'leg-side',   name: 'Leg Swings (side/side)',   dur: '20 each side',      desc: 'Hold a wall, swing each leg side to side across your body. Opens the hips.' },
  { id: 'ankle',      name: 'Ankle Circles',            dur: '10 each direction', desc: 'Lift one foot and rotate the ankle in full circles. Activates ankle stabilizers.' },
  { id: 'calf-raise', name: 'Calf Raises',              dur: '15 reps',           desc: 'Rise up on your toes slowly, lower back down. Activates calves and achilles.' },
  { id: 'hip-lunge',  name: 'Hip Flexor Lunge',         dur: '30 sec each side',  desc: 'Lunge forward, drop back knee to ground, press hips forward. Deep hip flexor stretch.' },
  { id: 'high-knees', name: 'High Knee March',          dur: '30 steps',          desc: 'March in place, driving knees up to hip height. Engages core and hip flexors.' },
  { id: 'butt-kicks', name: 'Butt Kicks',               dur: '30 steps',          desc: 'Jog in place, kicking heels toward your glutes. Activates hamstrings and improves turnover.' },
  { id: 'lateral',    name: 'Lateral Shuffle',          dur: '10 steps each way', desc: 'Step sideways in a low athletic stance, then shuffle back. Activates glutes and adductors.' },
  { id: 'glute-br',   name: 'Glute Bridges',            dur: '15 reps',           desc: 'Lie on back, feet flat, drive hips up and squeeze glutes at the top. Activates posterior chain.' },
  { id: 'calf-str',   name: 'Standing Calf Stretch',    dur: '30 sec each side',  desc: 'Hands on wall, one leg back with heel pressed to floor. Stretches calf and achilles.' },
  { id: 'quad-str',   name: 'Standing Quad Stretch',    dur: '30 sec each side',  desc: 'Balance on one foot, pull other ankle toward glute. Stretches quad and hip flexor.' },
  { id: 'itband-str', name: 'IT Band Cross Stretch',    dur: '30 sec each side',  desc: 'Cross one leg behind the other, lean away. Targets the IT band along outer thigh.' },
  { id: 'shin-str',   name: 'Shin & Foot Stretch',      dur: '30 sec each side',  desc: 'Kneel with tops of feet flat on ground. Stretches shins and foot extensors.' },
];

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
