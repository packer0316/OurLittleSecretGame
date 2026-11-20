// Menu-only slow perspective response. Never touches the player's camera or pointer lock.
const lobby = document.getElementById('lobby');
const logo = lobby.querySelector('.title-mark img');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let frame = 0, x = 0, y = 0;
function reset() {
  cancelAnimationFrame(frame); frame = 0;
  lobby.style.removeProperty('--gaze-x'); lobby.style.removeProperty('--gaze-y');
}
lobby.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || motion.matches || innerWidth <= 760 || lobby.classList.contains('hidden')) return;
  x = (e.clientX / innerWidth - .5) * -7;
  y = (e.clientY / innerHeight - .5) * -4;
  if (!frame) frame = requestAnimationFrame(() => {
    frame = 0; lobby.style.setProperty('--gaze-x', `${x.toFixed(2)}px`); lobby.style.setProperty('--gaze-y', `${y.toFixed(2)}px`);
  });
}, { passive:true });
lobby.addEventListener('pointerleave', reset);
motion.addEventListener('change', reset);
document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
new MutationObserver(() => { if (lobby.classList.contains('hidden')) reset(); }).observe(lobby, { attributes:true, attributeFilter:['class'] });
if (logo) {
  const fallback = () => logo.parentElement.classList.add('logo-unavailable');
  logo.addEventListener('error', fallback, { once:true });
  if (logo.complete && !logo.naturalWidth) fallback();
}
