// Eingebaute Übungen (Deutsch) und Zuordnung gängiger Strong-Übungsnamen (Englisch).

export const CATEGORIES = [
  'Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Beine', 'Gesäß', 'Waden', 'Bauch', 'Ganzkörper', 'Sonstige',
];

// [id, Name, Kategorie, Körpergewichtsübung?]
const RAW = [
  // Brust
  ['b-bankdruecken-lh', 'Bankdrücken (Langhantel)', 'Brust'],
  ['b-bankdruecken-kh', 'Bankdrücken (Kurzhantel)', 'Brust'],
  ['b-schraegbank-lh', 'Schrägbankdrücken (Langhantel)', 'Brust'],
  ['b-schraegbank-kh', 'Schrägbankdrücken (Kurzhantel)', 'Brust'],
  ['b-negativbank-lh', 'Negativbankdrücken (Langhantel)', 'Brust'],
  ['b-bankdruecken-mp', 'Bankdrücken (Multipresse)', 'Brust'],
  ['b-schraegbank-mp', 'Schrägbankdrücken (Multipresse)', 'Brust'],
  ['b-brustpresse', 'Brustpresse (Maschine)', 'Brust'],
  ['b-fliegende-kh', 'Fliegende (Kurzhantel)', 'Brust'],
  ['b-butterfly', 'Butterfly (Maschine)', 'Brust'],
  ['b-crossover', 'Cable Crossover (Kabel)', 'Brust'],
  ['b-liegestuetze', 'Liegestütze', 'Brust', true],
  ['b-dips-brust', 'Dips (Brust)', 'Brust', true],
  // Rücken
  ['b-kreuzheben', 'Kreuzheben (Langhantel)', 'Rücken'],
  ['b-kreuzheben-sumo', 'Sumo-Kreuzheben (Langhantel)', 'Rücken'],
  ['b-klimmzuege', 'Klimmzüge', 'Rücken', true],
  ['b-klimmzuege-ug', 'Klimmzüge (Untergriff)', 'Rücken', true],
  ['b-latziehen', 'Latziehen (Kabel)', 'Rücken'],
  ['b-latziehen-eng', 'Latziehen eng (Kabel)', 'Rücken'],
  ['b-rudern-lh', 'Langhantelrudern', 'Rücken'],
  ['b-rudern-kh', 'Kurzhantelrudern (einarmig)', 'Rücken'],
  ['b-rudern-kabel', 'Rudern sitzend (Kabel)', 'Rücken'],
  ['b-rudern-maschine', 'Rudern (Maschine)', 'Rücken'],
  ['b-tbar-rudern', 'T-Bar-Rudern', 'Rücken'],
  ['b-ueberzuege-kabel', 'Überzüge gestreckt (Kabel)', 'Rücken'],
  ['b-hyperextensions', 'Hyperextensions', 'Rücken', true],
  // Schultern
  ['b-schulterdruecken-lh', 'Schulterdrücken (Langhantel)', 'Schultern'],
  ['b-schulterdruecken-kh', 'Schulterdrücken (Kurzhantel)', 'Schultern'],
  ['b-schulterdruecken-m', 'Schulterdrücken (Maschine)', 'Schultern'],
  ['b-arnold-press', 'Arnold Press (Kurzhantel)', 'Schultern'],
  ['b-seitheben-kh', 'Seitheben (Kurzhantel)', 'Schultern'],
  ['b-seitheben-kabel', 'Seitheben (Kabel)', 'Schultern'],
  ['b-seitheben-m', 'Seitheben (Maschine)', 'Schultern'],
  ['b-frontheben-kh', 'Frontheben (Kurzhantel)', 'Schultern'],
  ['b-reverse-butterfly', 'Reverse Butterfly (Maschine)', 'Schultern'],
  ['b-vorgeb-seitheben', 'Vorgebeugtes Seitheben (Kurzhantel)', 'Schultern'],
  ['b-face-pulls', 'Face Pulls (Kabel)', 'Schultern'],
  ['b-aufrechtes-rudern', 'Aufrechtes Rudern (Langhantel)', 'Schultern'],
  ['b-shrugs-lh', 'Shrugs (Langhantel)', 'Schultern'],
  ['b-shrugs-kh', 'Shrugs (Kurzhantel)', 'Schultern'],
  // Bizeps
  ['b-curls-lh', 'Bizepscurls (Langhantel)', 'Bizeps'],
  ['b-curls-kh', 'Bizepscurls (Kurzhantel)', 'Bizeps'],
  ['b-curls-sz', 'Bizepscurls (SZ-Stange)', 'Bizeps'],
  ['b-curls-kabel', 'Bizepscurls (Kabel)', 'Bizeps'],
  ['b-curls-maschine', 'Bizepscurls (Maschine)', 'Bizeps'],
  ['b-hammercurls', 'Hammercurls (Kurzhantel)', 'Bizeps'],
  ['b-hammercurls-kabel', 'Hammercurls (Kabel)', 'Bizeps'],
  ['b-konzentrationscurls', 'Konzentrationscurls (Kurzhantel)', 'Bizeps'],
  ['b-scottcurls', 'Scottcurls (SZ-Stange)', 'Bizeps'],
  ['b-scottcurls-lh', 'Scottcurls (Langhantel)', 'Bizeps'],
  ['b-scottcurls-m', 'Scottcurls (Maschine)', 'Bizeps'],
  ['b-schraegbankcurls', 'Schrägbankcurls (Kurzhantel)', 'Bizeps'],
  // Trizeps
  ['b-trizepsdruecken', 'Trizepsdrücken (Kabel)', 'Trizeps'],
  ['b-trizepsdruecken-seil', 'Trizepsdrücken Seil (Kabel)', 'Trizeps'],
  ['b-french-press', 'French Press (SZ-Stange)', 'Trizeps'],
  ['b-ueberkopf-kabel', 'Überkopf-Trizepsdrücken (Kabel)', 'Trizeps'],
  ['b-ueberkopf-kh', 'Überkopf-Trizepsdrücken (Kurzhantel)', 'Trizeps'],
  ['b-enges-bankdruecken', 'Enges Bankdrücken (Langhantel)', 'Trizeps'],
  ['b-dips-trizeps', 'Dips (Trizeps)', 'Trizeps', true],
  ['b-kickbacks', 'Trizeps-Kickbacks (Kurzhantel)', 'Trizeps'],
  // Beine
  ['b-kniebeuge', 'Kniebeuge (Langhantel)', 'Beine'],
  ['b-frontkniebeuge', 'Frontkniebeuge (Langhantel)', 'Beine'],
  ['b-kniebeuge-mp', 'Kniebeuge (Multipresse)', 'Beine'],
  ['b-hackenschmidt', 'Hackenschmidt-Kniebeuge (Maschine)', 'Beine'],
  ['b-goblet-squat', 'Goblet Squat', 'Beine'],
  ['b-beinpresse', 'Beinpresse (Maschine)', 'Beine'],
  ['b-ausfallschritte', 'Ausfallschritte (Kurzhantel)', 'Beine'],
  ['b-bulgarian-split', 'Bulgarische Split-Kniebeuge (Kurzhantel)', 'Beine'],
  ['b-beinstrecker', 'Beinstrecker (Maschine)', 'Beine'],
  ['b-beinbeuger-liegend', 'Beinbeuger liegend (Maschine)', 'Beine'],
  ['b-beinbeuger-sitzend', 'Beinbeuger sitzend (Maschine)', 'Beine'],
  ['b-rdl-lh', 'Rumänisches Kreuzheben (Langhantel)', 'Beine'],
  ['b-rdl-kh', 'Rumänisches Kreuzheben (Kurzhantel)', 'Beine'],
  ['b-adduktoren', 'Adduktoren (Maschine)', 'Beine'],
  ['b-abduktoren', 'Abduktoren (Maschine)', 'Beine'],
  // Gesäß
  ['b-hip-thrust-lh', 'Hip Thrust (Langhantel)', 'Gesäß'],
  ['b-hip-thrust-m', 'Hip Thrust (Maschine)', 'Gesäß'],
  ['b-glute-bridge', 'Glute Bridge', 'Gesäß', true],
  ['b-glute-kickback', 'Glute Kickback (Kabel)', 'Gesäß'],
  // Waden
  ['b-waden-stehend', 'Wadenheben stehend (Maschine)', 'Waden'],
  ['b-waden-sitzend', 'Wadenheben sitzend (Maschine)', 'Waden'],
  ['b-waden-beinpresse', 'Wadenheben (Beinpresse)', 'Waden'],
  // Bauch
  ['b-crunches', 'Crunches', 'Bauch', true],
  ['b-crunches-kabel', 'Crunches (Kabel)', 'Bauch'],
  ['b-beinheben-haengend', 'Beinheben hängend', 'Bauch', true],
  ['b-russian-twist', 'Russian Twists', 'Bauch', true],
  ['b-ab-roller', 'Ab-Roller', 'Bauch', true],
  ['b-situps', 'Sit-ups', 'Bauch', true],
  // Ganzkörper
  ['b-kettlebell-swing', 'Kettlebell Swings', 'Ganzkörper'],
  ['b-farmers-walk', "Farmer's Walk (Kurzhantel)", 'Ganzkörper'],
  ['b-power-clean', 'Power Clean (Langhantel)', 'Ganzkörper'],
];

export const BUILTIN_EXERCISES = RAW.map(([id, name, category, bodyweight]) => ({
  id, name, category, bodyweight: !!bodyweight, custom: false,
}));

/** Normalisiert Übungsnamen für Vergleiche (Groß/Klein, Bindestriche, Leerzeichen). */
export function normalizeExerciseName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/[^\p{L}\p{N}()' ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
}

// Strong-Name (Englisch) -> eingebaute Übung. Nicht gelistete Namen werden beim
// Import als eigene Übung mit dem Originalnamen angelegt. Bewusst nur eindeutige
// Namen: "Chest Fly" ohne Gerät könnte Kurzhantel oder Maschine sein – solche
// Namen ordnet man in der Import-Vorschau selbst zu.
const STRONG_RAW = {
  'b-bankdruecken-lh': ['Bench Press (Barbell)'],
  'b-bankdruecken-kh': ['Bench Press (Dumbbell)'],
  'b-schraegbank-lh': ['Incline Bench Press (Barbell)'],
  'b-schraegbank-kh': ['Incline Bench Press (Dumbbell)'],
  'b-negativbank-lh': ['Decline Bench Press (Barbell)'],
  'b-bankdruecken-mp': ['Bench Press (Smith Machine)'],
  'b-schraegbank-mp': ['Incline Bench Press (Smith Machine)'],
  'b-brustpresse': ['Chest Press (Machine)'],
  'b-fliegende-kh': ['Chest Fly (Dumbbell)', 'Dumbbell Fly'],
  'b-butterfly': ['Chest Fly (Machine)', 'Pec Deck (Machine)', 'Butterfly'],
  'b-crossover': ['Cable Crossover', 'Cable Fly', 'Chest Fly (Cable)'],
  'b-liegestuetze': ['Push Up', 'Push Ups', 'Push-Up'],
  'b-dips-brust': ['Chest Dip'],
  'b-kreuzheben': ['Deadlift (Barbell)', 'Deadlift'],
  'b-kreuzheben-sumo': ['Sumo Deadlift (Barbell)', 'Sumo Deadlift'],
  'b-klimmzuege': ['Pull Up', 'Pull Ups', 'Pull-Up', 'Pull Up (Weighted)'],
  'b-klimmzuege-ug': ['Chin Up', 'Chin Ups', 'Chin-Up'],
  'b-latziehen': ['Lat Pulldown (Cable)', 'Lat Pulldown', 'Lat Pulldown (Machine)', 'Lat Pulldown - Wide Grip (Cable)'],
  'b-latziehen-eng': ['Lat Pulldown - Close Grip (Cable)', 'Close Grip Lat Pulldown'],
  'b-rudern-lh': ['Bent Over Row (Barbell)', 'Barbell Row', 'Pendlay Row (Barbell)'],
  'b-rudern-kh': ['Bent Over One Arm Row (Dumbbell)', 'Dumbbell Row', 'One Arm Row (Dumbbell)'],
  'b-rudern-kabel': ['Seated Row (Cable)', 'Seated Cable Row', 'Cable Row'],
  'b-rudern-maschine': ['Seated Row (Machine)', 'Iso-Lateral Row (Machine)', 'Row (Machine)'],
  'b-tbar-rudern': ['T Bar Row', 'T-Bar Row'],
  'b-ueberzuege-kabel': ['Straight Arm Pulldown (Cable)', 'Straight Arm Pulldown'],
  'b-hyperextensions': ['Back Extension', 'Hyperextension', 'Back Extension (Machine)'],
  'b-schulterdruecken-lh': ['Overhead Press (Barbell)', 'Strict Military Press (Barbell)', 'Military Press', 'Seated Overhead Press (Barbell)'],
  'b-schulterdruecken-kh': ['Overhead Press (Dumbbell)', 'Seated Overhead Press (Dumbbell)', 'Shoulder Press (Dumbbell)'],
  'b-schulterdruecken-m': ['Shoulder Press (Machine)', 'Overhead Press (Machine)', 'Shoulder Press (Plate Loaded)'],
  'b-arnold-press': ['Arnold Press (Dumbbell)', 'Arnold Press'],
  'b-seitheben-kh': ['Lateral Raise (Dumbbell)'],
  'b-seitheben-kabel': ['Lateral Raise (Cable)'],
  'b-seitheben-m': ['Lateral Raise (Machine)'],
  'b-frontheben-kh': ['Front Raise (Dumbbell)'],
  'b-reverse-butterfly': ['Reverse Fly (Machine)', 'Rear Delt Fly (Machine)'],
  'b-vorgeb-seitheben': ['Reverse Fly (Dumbbell)', 'Rear Delt Raise (Dumbbell)'],
  'b-face-pulls': ['Face Pull (Cable)', 'Face Pull'],
  'b-aufrechtes-rudern': ['Upright Row (Barbell)', 'Upright Row'],
  'b-shrugs-lh': ['Shrug (Barbell)'],
  'b-shrugs-kh': ['Shrug (Dumbbell)'],
  'b-curls-lh': ['Bicep Curl (Barbell)', 'Biceps Curl (Barbell)', 'Barbell Curl'],
  'b-curls-kh': ['Bicep Curl (Dumbbell)', 'Biceps Curl (Dumbbell)', 'Dumbbell Curl'],
  'b-curls-sz': ['EZ Bar Curl', 'Bicep Curl (EZ Bar)', 'EZ Bar Biceps Curl'],
  'b-curls-kabel': ['Bicep Curl (Cable)', 'Biceps Curl (Cable)', 'Cable Curl'],
  'b-curls-maschine': ['Bicep Curl (Machine)', 'Biceps Curl (Machine)'],
  'b-hammercurls': ['Hammer Curl (Dumbbell)'],
  'b-hammercurls-kabel': ['Hammer Curl (Cable)', 'Rope Hammer Curl'],
  'b-konzentrationscurls': ['Concentration Curl (Dumbbell)', 'Concentration Curl'],
  'b-scottcurls': ['Preacher Curl (EZ Bar)'],
  'b-scottcurls-lh': ['Preacher Curl (Barbell)'],
  'b-scottcurls-m': ['Preacher Curl (Machine)'],
  'b-schraegbankcurls': ['Incline Curl (Dumbbell)', 'Incline Dumbbell Curl'],
  'b-trizepsdruecken': ['Triceps Pushdown (Cable - Straight Bar)', 'Triceps Pushdown (Cable)', 'Triceps Pushdown', 'Tricep Pushdown'],
  'b-trizepsdruecken-seil': ['Triceps Rope Pushdown', 'Triceps Pushdown (Rope)', 'Rope Pushdown'],
  'b-french-press': ['Skullcrusher (Barbell)', 'Skullcrusher (EZ Bar)', 'Skullcrusher', 'Lying Triceps Extension (EZ Bar)'],
  'b-ueberkopf-kabel': ['Triceps Extension (Cable)', 'Overhead Triceps Extension (Cable)', 'Overhead Cable Triceps Extension'],
  'b-ueberkopf-kh': ['Triceps Extension (Dumbbell)', 'Overhead Triceps Extension (Dumbbell)'],
  'b-enges-bankdruecken': ['Bench Press - Close Grip (Barbell)', 'Close Grip Bench Press'],
  'b-dips-trizeps': ['Triceps Dip', 'Triceps Dip (Assisted)', 'Bench Dip'],
  'b-kickbacks': ['Triceps Kickback (Dumbbell)', 'Triceps Kickback'],
  'b-kniebeuge': ['Squat (Barbell)', 'Back Squat (Barbell)'],
  'b-frontkniebeuge': ['Front Squat (Barbell)', 'Front Squat'],
  'b-kniebeuge-mp': ['Squat (Smith Machine)'],
  'b-hackenschmidt': ['Hack Squat', 'Hack Squat (Machine)'],
  'b-goblet-squat': ['Goblet Squat (Kettlebell)', 'Goblet Squat (Dumbbell)', 'Goblet Squat'],
  'b-beinpresse': ['Leg Press', 'Leg Press (Machine)'],
  'b-ausfallschritte': ['Lunge (Dumbbell)', 'Walking Lunge (Dumbbell)'],
  'b-bulgarian-split': ['Bulgarian Split Squat', 'Bulgarian Split Squat (Dumbbell)'],
  'b-beinstrecker': ['Leg Extension (Machine)', 'Leg Extension'],
  'b-beinbeuger-liegend': ['Lying Leg Curl (Machine)', 'Leg Curl (Machine)', 'Lying Leg Curl'],
  'b-beinbeuger-sitzend': ['Seated Leg Curl (Machine)', 'Seated Leg Curl'],
  'b-rdl-lh': ['Romanian Deadlift (Barbell)', 'Romanian Deadlift', 'Stiff Leg Deadlift (Barbell)'],
  'b-rdl-kh': ['Romanian Deadlift (Dumbbell)'],
  'b-adduktoren': ['Hip Adductor (Machine)', 'Hip Adductor'],
  'b-abduktoren': ['Hip Abductor (Machine)', 'Hip Abductor'],
  'b-hip-thrust-lh': ['Hip Thrust (Barbell)'],
  'b-hip-thrust-m': ['Hip Thrust (Machine)'],
  'b-glute-bridge': ['Glute Bridge'],
  'b-glute-kickback': ['Glute Kickback (Cable)', 'Glute Kickback (Machine)'],
  'b-waden-stehend': ['Standing Calf Raise (Machine)', 'Standing Calf Raise', 'Calf Raise (Machine)', 'Standing Calf Raise (Smith Machine)'],
  'b-waden-sitzend': ['Seated Calf Raise (Machine)', 'Seated Calf Raise'],
  'b-waden-beinpresse': ['Calf Press on Leg Press', 'Calf Press (Machine)'],
  'b-crunches': ['Crunch', 'Crunches'],
  'b-crunches-kabel': ['Cable Crunch', 'Crunch (Cable)'],
  'b-beinheben-haengend': ['Hanging Leg Raise', 'Hanging Knee Raise'],
  'b-russian-twist': ['Russian Twist'],
  'b-ab-roller': ['Ab Wheel', 'Ab Wheel Rollout'],
  'b-situps': ['Sit Up', 'Sit Ups', 'Decline Crunch'],
  'b-kettlebell-swing': ['Kettlebell Swing'],
  'b-farmers-walk': ['Farmers Walk', "Farmer's Walk", 'Farmer Walk'],
  'b-power-clean': ['Power Clean', 'Clean (Barbell)', 'Power Clean (Barbell)'],
};

export const STRONG_NAME_MAP = new Map();
for (const [id, names] of Object.entries(STRONG_RAW)) {
  for (const n of names) STRONG_NAME_MAP.set(normalizeExerciseName(n), id);
}

/** Beispielvorlagen (optional, per Knopfdruck auf der Startseite). */
export const SAMPLE_TEMPLATES = [
  { name: 'Push', exercises: [['b-bankdruecken-lh', 4], ['b-schraegbank-kh', 3], ['b-schulterdruecken-kh', 3], ['b-seitheben-kh', 3], ['b-trizepsdruecken-seil', 3]] },
  { name: 'Pull', exercises: [['b-klimmzuege', 3], ['b-rudern-lh', 4], ['b-latziehen', 3], ['b-face-pulls', 3], ['b-curls-sz', 3]] },
  { name: 'Beine', exercises: [['b-kniebeuge', 4], ['b-rdl-lh', 3], ['b-beinpresse', 3], ['b-beinbeuger-sitzend', 3], ['b-waden-stehend', 4]] },
  { name: 'Oberkörper', exercises: [['b-bankdruecken-lh', 3], ['b-rudern-kabel', 3], ['b-schulterdruecken-lh', 3], ['b-latziehen', 3], ['b-curls-kh', 2], ['b-trizepsdruecken', 2]] },
];
