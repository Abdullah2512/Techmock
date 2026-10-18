export const TOPICS = ['dsa', 'javascript', 'react', 'nodejs', 'python', 'sql', 'system-design'];
export const TOPIC_LABELS = {
  dsa: 'Data Structures & Algorithms',
  javascript: 'JavaScript',
  react: 'React',
  nodejs: 'Node.js',
  python: 'Python',
  sql: 'SQL',
  'system-design': 'System Design',
};
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
export const MODES = ['coding', 'qa'];
export const DURATIONS = [15, 30, 45, 60];
// System design is conceptual; coding mode is not offered for it.
export const CODING_TOPICS = TOPICS.filter((t) => t !== 'system-design');
export const LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'go', 'sql'];
export const THEMES = ['dark', 'light'];
export const MAX_FOLLOW_UPS = 3;
export const LIMITS = { sourceCode: 50_000, answerText: 20_000, stdin: 10_000 };

export const SESSION_STATUS = {
  CREATED: 'created',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/** Languages offered per topic in the coding workspace (also sent to the AI service for starter code). */
export function languagesForTopic(topic) {
  switch (topic) {
    case 'python': return ['python'];
    case 'sql': return ['sql'];
    case 'javascript': case 'react': case 'nodejs': return ['javascript', 'typescript'];
    default: return ['javascript', 'typescript', 'python', 'java', 'cpp', 'go'];
  }
}
export function defaultLanguage(topic, preferred) {
  const options = languagesForTopic(topic);
  return options.includes(preferred) ? preferred : options[0];
}
export const REPORT_DISCLAIMER =
  'Scores are AI-generated estimates against the rubric shown, not an objective or guaranteed grade.';
