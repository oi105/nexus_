export const TOPIC_COLORS: Record<string, string> = {
  'All Topics': '#EF233C',
  'C++': '#00B8D9',
  Python: '#C8ED62',
  DSA: '#8676E8',
  DBMS: '#34D399',
  'CAD and AutoCAD': '#00E5FF',
  Mathematics: '#FFB020',
  'UI/UX': '#FF7AC6',
  Debugging: '#EF233C',
  Programming: '#365BEE',
  'Engineering concepts': '#38BDF8',
};

export const TOPIC_LIGHT_INK: Record<string, string> = {
  'All Topics': '#B91C1C',
  'C++': '#0E7490',
  Python: '#3F6212',
  DSA: '#5B21B6',
  DBMS: '#047857',
  'CAD and AutoCAD': '#0369A1',
  Mathematics: '#B45309',
  'UI/UX': '#BE185D',
  Debugging: '#B91C1C',
  Programming: '#1D4ED8',
  'Engineering concepts': '#0369A1',
};

export function getTopicAccent(topic?: string | null): string {
  if (!topic) return TOPIC_COLORS['All Topics'];
  return TOPIC_COLORS[topic] ?? '#EF233C';
}

export function getTopicLightInk(topic?: string | null): string {
  if (!topic) return TOPIC_LIGHT_INK['All Topics'];
  return TOPIC_LIGHT_INK[topic] ?? '#090B10';
}

export function getTopicShortMark(topic?: string | null): string {
  switch (topic) {
    case 'C++':
      return 'C++';
    case 'Python':
      return 'Py';
    case 'DSA':
      return 'DSA';
    case 'DBMS':
      return 'SQL';
    case 'CAD and AutoCAD':
      return 'CAD';
    case 'Mathematics':
      return 'Σπ';
    case 'UI/UX':
      return 'UI';
    case 'Debugging':
      return 'DBG';
    case 'Programming':
      return '</>';
    case 'Engineering concepts':
      return 'ENG';
    default:
      return 'NX';
  }
}
