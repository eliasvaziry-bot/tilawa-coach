// Tajweed rule catalogue for the annotation data (ids = the names cpfair/quran-tajweed's classifier emits).
// Provenance: rule list + madd counts from the cpfair/quran-tajweed README (opened 2026-11-21) and BRIEF.md B3
// (Hafs 'an 'Asim via ash-Shatibiyyah). Short English glosses are model-knowledge (see TEACHER_REVIEW.md).

export type RuleName =
  | 'ghunnah'
  | 'hamzat_wasl'
  | 'idghaam_ghunnah'
  | 'idghaam_mutajanisayn'
  | 'idghaam_mutaqaribayn'
  | 'idghaam_no_ghunnah'
  | 'idghaam_shafawi'
  | 'ikhfa'
  | 'ikhfa_shafawi'
  | 'iqlab'
  | 'lam_shamsiyyah'
  | 'madd_2'
  | 'madd_246'
  | 'madd_6'
  | 'madd_munfasil'
  | 'madd_muttasil'
  | 'qalqalah'
  | 'silent';

export type RuleGroup = 'silent' | 'madd' | 'nasal' | 'merge' | 'qalqalah';

export interface RuleInfo {
  id: RuleName;
  en: string;
  ar: string;
  group: RuleGroup;
  /** Counts (harakat) where the rule is a length rule. */
  counts?: string;
  /** CSS custom property used for the colour; the colour-blind mode adds `pattern`. */
  colour: string;
  pattern: 'solid' | 'dotted' | 'dashed' | 'double' | 'wavy';
  gloss: string;
}

export const RULES: readonly RuleInfo[] = [
  { id: 'hamzat_wasl', en: 'Hamzat al-wasl', ar: 'همزة الوصل', group: 'silent', colour: '--tj-silent', pattern: 'dotted', gloss: 'Joining hamza: silent when you read on from the word before.' },
  { id: 'lam_shamsiyyah', en: 'Lam shamsiyyah', ar: 'اللام الشمسية', group: 'silent', colour: '--tj-silent', pattern: 'dotted', gloss: 'The lam of "al-" is not pronounced; the next letter is doubled.' },
  { id: 'silent', en: 'Silent letter', ar: 'حرف لا يُلفظ', group: 'silent', colour: '--tj-silent', pattern: 'dotted', gloss: 'Written but not pronounced.' },
  { id: 'madd_2', en: 'Madd: 2 counts', ar: 'مدّ طبيعي', group: 'madd', counts: '2', colour: '--tj-madd2', pattern: 'solid', gloss: 'Natural lengthening: hold the vowel for 2 counts.' },
  { id: 'madd_246', en: "Madd 'arid / leen: 2, 4 or 6", ar: 'مدّ عارض / لين', group: 'madd', counts: '2/4/6', colour: '--tj-madd246', pattern: 'solid', gloss: 'When you stop here: 2, 4 or 6 counts (stay consistent).' },
  { id: 'madd_muttasil', en: 'Madd muttasil: 4–5', ar: 'مدّ متّصل', group: 'madd', counts: '4–5', colour: '--tj-madd45', pattern: 'double', gloss: 'Madd letter + hamza in the same word: 4–5 counts (6 allowed when stopping on that hamza).' },
  { id: 'madd_munfasil', en: 'Madd munfasil: 4–5', ar: 'مدّ منفصل', group: 'madd', counts: '4–5', colour: '--tj-madd45', pattern: 'dashed', gloss: 'Madd letter at a word end, hamza starts the next word: 4–5 counts.' },
  { id: 'madd_6', en: 'Madd lazim: 6', ar: 'مدّ لازم', group: 'madd', counts: '6', colour: '--tj-madd6', pattern: 'double', gloss: 'Necessary lengthening: 6 counts. A few special words allow other lengths — learn those from a teacher.' },
  { id: 'ghunnah', en: 'Ghunnah: 2 counts', ar: 'غنّة', group: 'nasal', counts: '2', colour: '--tj-ghunnah', pattern: 'wavy', gloss: 'Nasal sound on noon/meem with shadda: 2 counts.' },
  { id: 'ikhfa', en: 'Ikhfa', ar: 'إخفاء', group: 'nasal', colour: '--tj-ikhfa', pattern: 'wavy', gloss: 'Noon sakinah/tanween hidden: half-way sound with ghunnah.' },
  { id: 'ikhfa_shafawi', en: 'Ikhfa shafawi', ar: 'إخفاء شفوي', group: 'nasal', colour: '--tj-ikhfa', pattern: 'wavy', gloss: 'Meem sakinah before ب: hidden with ghunnah.' },
  { id: 'iqlab', en: 'Iqlab', ar: 'إقلاب', group: 'nasal', colour: '--tj-iqlab', pattern: 'wavy', gloss: 'Noon sakinah/tanween before ب turns into a hidden meem with ghunnah.' },
  { id: 'idghaam_ghunnah', en: 'Idgham with ghunnah', ar: 'إدغام بغنّة', group: 'merge', colour: '--tj-idgham', pattern: 'dashed', gloss: 'Noon sakinah/tanween merges into ي ن م و with ghunnah.' },
  { id: 'idghaam_no_ghunnah', en: 'Idgham without ghunnah', ar: 'إدغام بلا غنّة', group: 'merge', colour: '--tj-idgham-plain', pattern: 'dashed', gloss: 'Noon sakinah/tanween merges fully into ل or ر.' },
  { id: 'idghaam_shafawi', en: 'Idgham shafawi', ar: 'إدغام شفوي', group: 'merge', colour: '--tj-idgham', pattern: 'dashed', gloss: 'Meem sakinah merges into the next meem with ghunnah.' },
  { id: 'idghaam_mutajanisayn', en: 'Idgham mutajanisayn', ar: 'إدغام متجانسين', group: 'merge', colour: '--tj-idgham-plain', pattern: 'dashed', gloss: 'Two letters from the same point of articulation merge.' },
  { id: 'idghaam_mutaqaribayn', en: 'Idgham mutaqaribayn', ar: 'إدغام متقاربين', group: 'merge', colour: '--tj-idgham-plain', pattern: 'dashed', gloss: 'Two close letters merge.' },
  { id: 'qalqalah', en: 'Qalqalah', ar: 'قلقلة', group: 'qalqalah', colour: '--tj-qalqalah', pattern: 'solid', gloss: 'Echo/bounce on ق ط ب ج د when they have sukun.' },
];

export const RULE_BY_ID: Readonly<Record<RuleName, RuleInfo>> = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleName, RuleInfo>;

/** Per-annotation flags stored in the shipped data. */
export const ANN_FLAGS = {
  WASL_ONLY: 1, // applies when you continue past the pause mark beside it (not when you stop there)
  REBUILD_ONLY: 2, // found by the rebuild on the current text but not in cpfair's 2017 release
  FROM_2017: 4, // in cpfair's 2017 release (mapped onto today's text) but not found by the rebuild
  DISPUTED: 8, // the two annotation sources disagree (Quran.com cross-check)
  WAQF_ONLY: 16, // reserved (unused: see DECISIONS D-005 correction)
  ENGINE_DISPUTED: 32, // our independent rule engine (src/data/ruleEngine.ts) disagrees
} as const;
