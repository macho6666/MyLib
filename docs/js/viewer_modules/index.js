/**
 * viewer_modules/index.js
 * 뷰어 모듈 메인 진입점 (텍스트 + 이미지)
 * ✅ 타이밍 측정 추가
 */

// Core
import { GlobalState, loadSettings } from './core/state.js';
import { Events } from './core/events.js';
import * as Utils from './core/utils.js';

// Text Viewer
import { openTextViewer, closeTextViewer, isTextViewerOpen } from './text/index.js';

// Image Viewer
import { openImageViewer, closeImageViewer, isImageViewerOpen } from './image/index.js';

/**
 * 뷰어 열기 (통합 진입점)
 * @param {Object} result - fetcher 결과
 * @param {Object} metadata - { bookId, name, seriesId, size }
 */
export async function openViewer(result, metadata) {
    console.log('🚀 Opening Viewer:', result.type);
    const viewerOpenStart = performance.now();
    
    try {
        // 타입에 따라 분기
        if (result.type === 'text' || result.type === 'txt' || result.type === 'epub') {
            // 텍스트 뷰어
            console.log('⏱️ [TEXT VIEWER OPEN START]');
            const textStart = performance.now();
            
            GlobalState.viewerType = 'text';
            await openTextViewer(result, metadata);
            
            const textTime = performance.now() - textStart;
            console.log(`⏱️ [TEXT VIEWER OPEN END] ${textTime.toFixed(2)}ms`);
            
        } else if (result.type === 'images') {
            // 이미지 뷰어
            console.log('⏱️ [IMAGE VIEWER OPEN START]');
            const imageStart = performance.now();
            
            GlobalState.viewerType = 'image';
            await openImageViewer(result, metadata);
            
            const imageTime = performance.now() - imageStart;
            console.log(`⏱️ [IMAGE VIEWER OPEN END] ${imageTime.toFixed(2)}ms`);
            
        } else if (result.type === 'external') {
            // PDF 등 외부 링크
            console.log('📄 External file opened in new tab');
            
        } else {
            throw new Error('Unknown viewer type: ' + result.type);
        }
        
        const totalViewerTime = performance.now() - viewerOpenStart;
        console.log(`✅ [VIEWER OPEN COMPLETE] ${totalViewerTime.toFixed(2)}ms`);
        
    } catch (e) {
        console.error('❌ Viewer open failed:', e);
        throw e;
    }
}

/**
 * 뷰어 닫기 (통합)
 */
export function closeViewer() {
    if (GlobalState.viewerType === 'text') {
        closeTextViewer();
    } else if (GlobalState.viewerType === 'image') {
        closeImageViewer();
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
