import { vState, currentBookList, currentBookIndex } from './state.js';
import { applyTextSettings, recalcSpreads, renderCurrentSpread } from './renderer.js';
import { navigateViewer } from './navigation.js';
// docs/js/viewer_modules/controls.js
import { loadViewer, closeEpisodeModal } from './actions.js'; // closeEpisodeModal imported
import { showToast } from './utils.js';

export function updateNavHandlers() {
const prev = document.querySelector('.nav-prev');
const next = document.querySelector('.nav-next');
if(prev) prev.onclick = () => navigateViewer(vState.rtlMode ? 1 : -1);
if(next) next.onclick = () => navigateViewer(vState.rtlMode ? -1 : 1);
}

export function updateSliderUI() {
const slider = document.getElementById('pageSlider');
const currentLabel = document.getElementById('sliderCurrent');
const totalLabel = document.getElementById('sliderTotal');
const title = document.getElementById('viewerTitle');

text

if (!vState.spreads || vState.spreads.length === 0) return;

// Current page number (1-based)
const currentImgIndex = vState.spreads[vState.currentSpreadIndex][0] + 1;
const totalImages = vState.images.length;

if (slider) {
    slider.min = 1;
    slider.max = totalImages;
    slider.value = currentImgIndex;
}
if (currentLabel) currentLabel.innerText = currentImgIndex;
if (totalLabel) totalLabel.innerText = totalImages;

if(title && currentBookList[currentBookIndex]) {
    title.innerText = currentBookList[currentBookIndex].name;
}
}

export function onSliderInput(val) {
const el = document.getElementById('sliderCurrent');
if(el) el.innerText = val;
}

export function onSliderChange(val) {
const targetPage = parseInt(val) - 1; // 0-based index
const spreadIdx = vState.spreads.findIndex(spread => spread.includes(targetPage));
if (spreadIdx >= 0) {
vState.currentSpreadIndex = spreadIdx;
renderCurrentSpread();
} else {
vState.currentSpreadIndex = Math.min(targetPage, vState.spreads.length - 1);
renderCurrentSpread();
}
}

export function toggleControls() {
const controls = document.getElementById('viewerControls');
if (!controls) return;
controls.classList.toggle('show');
}

export function handleViewerClick(e) {
if (e.target.tagName.toLowerCase() === 'button' || e.target.tagName.toLowerCase() === 'input') return;
if (e.target.closest('.nav-zone')) return;
toggleControls();
}

export function updateButtonStates() {
// Visibility Toggle
const isEpub = vState.epubMode;
document.querySelectorAll('.image-only').forEach(el => el.style.display = isEpub ? 'none' : '');
document.querySelectorAll('.epub-only').forEach(el => el.style.display = isEpub ? 'inline-block' : 'none');

text

const setBtn = (id, active) => {
    const btn = document.getElementById(id);
    if(btn) active ? btn.classList.add('active') : btn.classList.remove('active');
};

setBtn('btnTwoPage', vState.mode === '2page');
setBtn('btnCover', vState.coverPriority);
setBtn('btnRtl', vState.rtlMode);
setBtn('btnPreload', vState.preload);
setBtn('btnScroll', vState.scrollMode); 
}

export function toggleViewMode() {
vState.mode = (vState.mode === '1page') ? '2page' : '1page';
localStorage.setItem('toki_v_mode', vState.mode);
updateButtonStates();

text

if (vState.epubMode) {
    applyTextSettings(); 
} else {
    recalcSpreads(false); 
}
}

export function toggleCoverMode() {
vState.coverPriority = !vState.coverPriority;
localStorage.setItem('toki_v_cover', vState.coverPriority);
updateButtonStates();
recalcSpreads(false);
}

export function toggleRtlMode() {
vState.rtlMode = !vState.rtlMode;
localStorage.setItem('toki_v_rtl', vState.rtlMode);
updateButtonStates();
recalcSpreads(false);
}

export function toggleScrollMode() {
vState.scrollMode = !vState.scrollMode;
localStorage.setItem('toki_v_scroll', vState.scrollMode);

text

// Refresh Viewer
loadViewer(currentBookIndex);
}

export function togglePreloadMode() {
vState.preload = !vState.preload;
localStorage.setItem('toki_v_preload', vState.preload);
updateButtonStates();
showToast(vState.preload ? "미리 불러오기: ON" : "미리 불러오기: OFF");
}

export function changeFontSize(delta) {
if (!vState.epubMode || !vState.foliateView) return;

text

vState.textSettings.fontSize += delta;
if(vState.textSettings.fontSize < 12) vState.textSettings.fontSize = 12;
if(vState.textSettings.fontSize > 48) vState.textSettings.fontSize = 48; 

localStorage.setItem('toki_v_fontsize', vState.textSettings.fontSize);

applyTextSettings();
showToast(`글자 크기: ${vState.textSettings.fontSize}px`);
}

export function loadViewerSettings() {
vState.mode = localStorage.getItem('toki_v_mode') || '1page';
vState.coverPriority = (localStorage.getItem('toki_v_cover') === 'true');

text

vState.rtlMode = (localStorage.getItem('toki_v_rtl') === 'true');
vState.preload = (localStorage.getItem('toki_v_preload') !== 'false'); // Default true
vState.scrollMode = (localStorage.getItem('toki_v_scroll') === 'true'); 

const savedFs = localStorage.getItem('toki_v_fontsize');
if(savedFs) vState.textSettings.fontSize = parseInt(savedFs);

updateButtonStates();
}

/**

뷰어를 닫고 리소스를 정리합니다.
*/
export function closeViewer() {
const viewer = document.getElementById('viewerOverlay');
const container = document.getElementById('viewerImageContainer');

if (vState.images) {
vState.images.forEach(img => URL.revokeObjectURL(img.src));
}
vState.images = [];
vState.spreads = [];

container.innerHTML = '';
viewer.style.display = 'none';
document.body.classList.remove('no-scroll');

}

// Key Controls
export function initKeyControls() {
document.addEventListener('keydown', (e) => {
if (document.getElementById('viewerOverlay').style.display === 'flex') {
if (e.key === 'Escape') {
closeViewer();
e.preventDefault();
}
else if (e.key === 'ArrowLeft') {
navigateViewer(vState.rtlMode ? 1 : -1);
e.preventDefault();
}
else if (e.key === 'ArrowRight') {
navigateViewer(vState.rtlMode ? -1 : 1);
e.preventDefault();
}
else if (e.key === 'ArrowUp') {
navigateViewer(-1); // Prev
e.preventDefault();
}
else if (e.key === 'ArrowDown') {
navigateViewer(1); // Next
e.preventDefault();
}
else if (e.key === ' ' || e.key === 'Enter') {
navigateViewer(1);
e.preventDefault();
}
} else if (document.getElementById('episodeModal').style.display === 'flex') {
if (e.key === 'Escape') closeEpisodeModal(); // closeEpisodeModal is in actions/episode.js
// This needs to call the imported function.
// We'll export this handler or run it in index.js
}
});
}
