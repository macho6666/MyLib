/**
 * viewer_modules/index.js
 * 뷰어 모듈 메인 진입점 (텍스트 + 이미지)
 */

// Core
import { GlobalState, loadSettings } from './core/state.js';
import { Events } from './core/events.js';
import * as Utils from './core/utils.js';

// Text Viewer
import { openTextViewer, closeTextViewer, isTextViewerOpen } from './text/index.js';

// Image Viewer (기존 viewer_modules에서 분리 필요)
// import { openImageViewer, closeImageViewer } from './image/index.js';

/**
 * 뷰어 열기 (통합 진입점)
 * @param {Object} result - fetcher 결과
 * @param {Object} metadata - { bookId, name, seriesId, size }
 */
export async function openViewer(result, metadata) {
    console.log('🚀 Opening Viewer:', result.type);
    
    // 타입에 따라 분기
    if (result.type === 'text' || result.type === 'txt' || result.type === 'epub') {
        // 텍스트 뷰어
        GlobalState.viewerType = 'text';
        await openTextViewer(result, metadata);
    } else if (result.type === 'images') {
        // 이미지 뷰어
        GlobalState.viewerType = 'image';
        // await openImageViewer(result, metadata);
        
        // 임시: 기존 이미지 뷰어 사용
        if (typeof window.loadViewer === 'function') {
            // main.js의 기존 함수 사용
            showToast('이미지 뷰어는 기존 방식 사용 중');
        } else {
            showToast('이미지 뷰어 준비 중...', 2000);
        }
    } else if (result.type === 'external') {
        // PDF 등 외부 링크
        console.log('External file opened in new tab');
    } else {
        throw new Error('Unknown viewer type: ' + result.type);
    }
}

/**
 * 뷰어 닫기 (통합)
 */
export function closeViewer() {
    if (GlobalState.viewerType === 'text') {
        closeTextViewer();
    } else if (GlobalState.viewerType === 'image') {
        // closeImageViewer();
        
        // 임시: 기존 방식
        if (typeof window.closeViewer === 'function') {
            window.closeViewer();
        }
    }
    
    GlobalState.viewerType = null;
}

/**
 * 뷰어 상태 확인
 * @returns {boolean}
 */
export function isViewerOpen() {
    return GlobalState.viewerType !== null;
}

/**
 * 현재 뷰어 타입
 * @returns {string|null} 'text' | 'image' | null
 */
export function getViewerType() {
    return GlobalState.viewerType;
}

// 전역 함수 등록
window.ViewerModules = {
    openViewer,
    closeViewer,
    isViewerOpen,
    getViewerType,
    Events,
    Utils,
    GlobalState
};

// 단축 전역 함수
window.openViewer = openViewer;
window.closeViewer = closeViewer;

// Utils 전역 등록
window.showToast = Utils.showToast;

// 초기 설정 로드
loadSettings();

console.log('✅ Viewer Modules initialized');
console.log('📦 Available:', Object.keys(window.ViewerModules));
