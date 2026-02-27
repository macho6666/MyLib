/**
 * viewer_modules/image/index.js
 * 이미지 뷰어 진입점
 */

import { ImageViewerState, resetImageState, loadImageSettings } from './image_state.js';
import { renderImages, recalcSpreads, renderCurrentSpread } from './image_renderer.js';
import { initImageNavigation, cleanupImageNavigation } from './image_navigation.js';
import { initImageControls, cleanupImageControls } from './image_controls.js';
import { Events } from '../core/events.js';
import { showToast, getProgress } from '../core/utils.js';

/**
 * 이미지 뷰어 열기
 * @param {Object} result - { type: 'images', images: [...] }
 * @param {Object} metadata - { bookId, name, seriesId }
 */
export async function openImageViewer(result, metadata) {
    try {
        console.log('🖼️ Opening Image Viewer:', metadata.name);
        
        // 설정 로드
        loadImageSettings();
        
        // 상태 초기화
        resetImageState();
        ImageViewerState.currentBook = metadata;
        
        // 이미지 렌더링
        await renderImages(result.images, metadata);
        
        // 컨트롤 초기화
        initImageControls();
        
        // 네비게이션 초기화
        initImageNavigation();
        
        // 이전 진행도 불러오기
        const lastPage = getProgress(metadata.seriesId, metadata.bookId);
        if (lastPage > 0 && lastPage < ImageViewerState.images.length) {
            const spreadIdx = ImageViewerState.spreads.findIndex(spread => 
                spread.includes(lastPage)
            );
            if (spreadIdx >= 0) {
                ImageViewerState.currentSpreadIndex = spreadIdx;
                renderCurrentSpread();
                showToast(`📑 이어보기: ${lastPage + 1}페이지`);
            }
        }
        
        console.log('✅ Image Viewer opened');
        
    } catch (e) {
        console.error('Image Viewer open failed:', e);
        showToast('이미지 뷰어 열기 실패: ' + e.message, 3000);
        closeImageViewer();
    }
}

/**
 * 이미지 뷰어 닫기
 */
export function closeImageViewer() {
    console.log('🖼️ Closing Image Viewer');
    
    // 네비게이션 정리
    cleanupImageNavigation();
    
    // 컨트롤 정리
    cleanupImageControls();
    
    // 이미지 URL 해제
    if (ImageViewerState.images) {
        ImageViewerState.images.forEach(img => {
            if (img.src) URL.revokeObjectURL(img.src);
        });
    }
    
    // DOM 정리
    const container = document.getElementById('imageViewerContainer');
    if (container) container.remove();
    
    // 뷰어 오버레이 숨김
    const viewer = document.getElementById('viewerOverlay');
    if (viewer) {
        viewer.style.display = 'none';
        document.body.classList.remove('no-scroll');
    }
    
    // 상태 초기화
    resetImageState();
    
    // 이벤트 발생
    Events.emit('image:close');
    
    console.log('✅ Image Viewer closed');
}

/**
 * 이미지 뷰어 상태 확인
 * @returns {boolean}
 */
export function isImageViewerOpen() {
    const viewer = document.getElementById('viewerOverlay');
    const container = document.getElementById('imageViewerContainer');
    return viewer && viewer.style.display === 'flex' && container;
}

// 전역 함수 등록
window.openImageViewer = openImageViewer;
window.closeImageViewer = closeImageViewer;

console.log('✅ Image Viewer Module loaded');
