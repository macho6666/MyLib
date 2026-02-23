/**
 * Viewer Modules Aggregator
 */

import { vState, updateCurrentBookList } from './state.js';  // ✨ 수정됨

import { 
    openEpisodeList, 
    loadViewer, 
    closeEpisodeModal, 
    openEpisodeListFromViewer 
} from './actions.js';

import { 
    navigateViewer, 
    navigateScrollMode 
} from './navigation.js';

import { 
    toggleViewMode, 
    toggleScrollMode, 
    toggleCoverMode, 
    toggleRtlMode, 
    togglePreloadMode, 
    changeFontSize, 
    closeViewer, 
    toggleControls, 
    handleViewerClick,
    onSliderInput,
    onSliderChange,
    initKeyControls
} from './controls.js';

// Expose to Window
window.openEpisodeList = openEpisodeList;
window.loadViewer = loadViewer;
window.closeEpisodeModal = closeEpisodeModal;
window.openEpisodeListFromViewer = openEpisodeListFromViewer;

window.navigateViewer = navigateViewer;

window.toggleViewMode = toggleViewMode;
window.toggleScrollMode = toggleScrollMode;
window.toggleCoverMode = toggleCoverMode;
window.toggleRtlMode = toggleRtlMode;
window.togglePreloadMode = togglePreloadMode;
window.changeFontSize = changeFontSize;
window.closeViewer = closeViewer;
window.toggleControls = toggleControls;
window.handleViewerClick = handleViewerClick;
window.onSliderInput = onSliderInput;
window.onSliderChange = onSliderChange;

// ✨ 추가됨!
window.updateCurrentBookList = updateCurrentBookList;
window.openViewer = loadViewer;

// Initialize Key Controls
initKeyControls();
console.log("🚀 Viewer Modules Loaded & Initialized");
