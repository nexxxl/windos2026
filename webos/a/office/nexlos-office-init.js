/* Plugin-edition office boot defaults.
 * The DSH panel is narrower than the native NexlOS window; start Word at
 * "page width" so a real A4 page fits instead of being clipped at 100%.
 * This file is part of the plugin bundle only; the NexlOS source is untouched.
 */
(function () {
  function applyAppearance(value) {
    if (value === 'current' || value === 'win98') document.documentElement.dataset.appearance = value;
  }
  try {
    applyAppearance(localStorage.getItem('nexlos.appearance.v1') || 'current');
  } catch (error) { /* storage unavailable */ }
  try {
    const parentAppearance = window.parent.document.documentElement.dataset.appearance;
    applyAppearance(parentAppearance || 'current');
  } catch (error) { /* cross-origin or not embedded */ }
  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data && event.data.type === 'nexlos.settings' && event.data.patch) applyAppearance(event.data.patch.appearance);
  });
  try {
    if (!localStorage.getItem('nexlos.office.zoomInit')) {
      localStorage.setItem('office.docZoom', 'pagewidth');
      localStorage.setItem('nexlos.office.zoomInit', '1');
    }
  } catch (error) {
    /* private mode: the office's own default still works */
  }
})();
