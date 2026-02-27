/**
 * viewer_modules/image/image_state.js
 * 이미지 뷰어 전용 상태 관리
 */

import { saveSettings } from '../core/state.js';

/**
 * 이미지 뷰어 상태
 */
export const ImageViewerState = {
    // 현재 열린 책 정보
    currentBook: null,        // { id, name, seriesId, ... }
    
    // 레이아웃
    mode: '1page',            // '1page' | '2page'
    scrollMode: false,        // 웹툰 모드 (세로 스크롤)
    coverPriority: true,      // 표지 우선 (2페이지 모드에서 첫 페이지 단독)
    rtlMode: false,           // 오른쪽→왼쪽 (일본 만화)
    
    // 이미지 데이터
    images: [],               // [{ src, width, height, loaded }, ...]
    spreads: [],              // [[0], [1,2], [3,4], ...] 페이지 묶음
    currentSpreadIndex: 0,
    
    // 프리로드
    preload: true,
    nextBookPreload: null,
    
    // 캐시
    cachedFileId: null,
    cachedBytes: null,
    
    // UI 상태
    ui: {
        controlsVisible: false
    }
};

/**
 * 모드 변경 (1페이지/2페이지)
 * @param {string} mode - '1page' | '2page'
 */
export function setMode(mode) {
    ImageViewerState.mode = mode;
    localStorage.setItem('image_mode', mode);
}

/**
 * 스크롤 모드 토글
 * @param {boolean} enabled
 */
export function setScrollMode(enabled) {
    ImageViewerState.scrollMode = enabled;
    localStorage.setItem('image_scroll', enabled);
}

/**
 * 표지 우선 모드 토글
 * @param {boolean} enabled
 */
export function setCoverPriority(enabled) {
    ImageViewerState.coverPriority = enabled;
    localStorage.setItem('image_cover', enabled);
}

/**
 * RTL 모드 토글
 * @param {boolean} enabled
 */
export function setRtlMode(enabled) {
    ImageViewerState.rtlMode = enabled;
    localStorage.setItem('image_rtl', enabled);
}

/**
 * 현재 스프레드 인덱스 설정
 * @param {number} index
 */
export function setCurrentSpreadIndex(index) {
    ImageViewerState.currentSpreadIndex = Math.max(0, Math.min(index, ImageViewerState.spreads.length - 1));
}

/**
 * 설정 로드
 */
export function loadImageSettings() {
    const mode = localStorage.getItem('image_mode');
    if (mode) ImageViewerState.mode = mode;
    
    const scroll = localStorage.getItem('image_scroll');
    if (scroll !== null) ImageViewerState.scrollMode = (scroll === 'true');
    
    const cover = localStorage.getItem('image_cover');
    if (cover !== null) ImageViewerState.coverPriority = (cover === 'true');
    
    const rtl = localStorage.getItem('image_rtl');
    if (rtl !== null) ImageViewerState.rtlMode = (rtl === 'true');
    
    console.log('✅ Image settings loaded');
}

/**
 * 상태 초기화
 */
export function resetImageState() {
    ImageViewerState.currentBook = null;
    ImageViewerState.images = [];
    ImageViewerState.spreads = [];
    ImageViewerState.currentSpreadIndex = 0;
    ImageViewerState.nextBookPreload = null;
}

// 초기 로드
loadImageSettings();

console.log('✅ Image State initialized');
