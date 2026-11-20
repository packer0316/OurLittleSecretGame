import manifest from '../../public/assets/story/visual-v2/manifest.json' with { type: 'json' };

// Import metadata only. Image files are requested when their event is shown.
export const PICTURES = Object.freeze(Object.fromEntries(manifest.map(item => [item.id, Object.freeze(item)])));
export const evidencePicture = id => Object.hasOwn(PICTURES, `evidence-${id}`) ? `evidence-${id}` : null;
export const notePicture = id => Object.hasOwn(PICTURES, `note-${id}`) ? `note-${id}` : null;
// Production metadata can name an ending; the player-facing card must not announce it early.
export const pictureChapter = art => ({
  '第二章／真結局': '第二章', '真結局C': '後殿・送行',
  '第四章真相／真結局C': '第四章', '第四章支線': '第四章',
})[art.chapter] || art.chapter;
export function normalizePictures(value) {
  return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && Object.hasOwn(PICTURES, id)))].slice(0, manifest.length) : [];
}

// Entering these phases is already gated by the playable C ending.
// Each card pauses that phase before its input window/timer begins.
export const FINALE_PICTURES = Object.freeze({
  'c-six': 'beat-six-seats',
  'c-fire': 'beat-key-fire',
  'c-girl': 'beat-child-threshold',
  'c-mother': 'beat-mother-daughter',
});
