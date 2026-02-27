/**
 * viewer_modules/image/image_navigation.js
 * 이미지 뷰어 네비게이션 (페이지 이동)
 */

import { ImageViewerState, setCurrentSpreadIndex } from './image_state.js';
import { renderCurrentSpread, renderScrollMode, recalcSpreads } from './image_renderer.js';
import { showToast } from '../core/utils.js';
import { Events } from '../core/events.js';

/**
 * 네비게이션 초기화
 */
export function initImageNavigation() {
    const container = document.getElementById('imageViewerContainer');
    if (!container) return;
    
    // 클릭 영역 설정
    setupClickZones();
    
    // 키보드 이벤트
    setupKeyboardNav();
    
    // 휠 이벤트
    setupWheelNav();
    
    console.log('🎮 Image Navigation initialized');
}

/**
 * 클릭 영역 설정
 */
function setupClickZones() {
    // 기존 영역 제거
    const existingPrev = document.querySelector('.nav-zone.nav-prev');
    const existingNext = document.querySelector('.nav-zone.nav-next');
    if (existingPrev) existingPrev.remove();
    if (existingNext) existingNext.remove();
    
    const viewerContent = document.getElementById('viewerContent');
    if (!viewerContent) return;
    
    // 이전 페이지 영역 (왼쪽 25%)
    const prevZone = document.createElement('div');
    prevZone.className = 'nav-zone nav-prev';
    prevZone.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: 25%;
        height: 100%;
        cursor: pointer;
        z-index: 10;
    `;
    prevZone.onclick = () => navigateImage(ImageViewerState.rtlMode ? 1 : -1);
    
    // 다음 페이지 영역 (오른쪽 25%)
    const nextZone = document.createElement('div');
    nextZone.className = 'nav-zone nav-next';
    nextZone.style.cssText = `
        position: absolute;
        right: 0;
        top: 0;
        width: 25%;
        height: 100%;
        cursor: pointer;
        z-index: 10;
    `;
    nextZone.onclick = () => navigateImage(ImageViewerState.rtlMode ? -1 : 1);
    
    viewerContent.appendChild(prevZone);
    viewerContent.appendChild(nextZone);
}

/**
 * 키보드 네비게이션
 */
function setupKeyboardNav() {
    const keyHandler = (e) => {
        const viewer = document.getElementById('viewerOverlay');
        if (!viewer || viewer.style.display !== 'flex') return;
        
        // 텍스트 뷰어가 열려있으면 무시
        if (document.getElementById('textViewerContainer')) return;
        
        switch (e.key) {
            case 'ArrowLeft':
                navigateImage(ImageViewerState.rtlMode ? 1 : -1);
                e.preventDefault();
                break;
            case 'ArrowRight':
                navigateImage(ImageViewerState.rtlMode ? -1 : 1);
                e.preventDefault();
                break;
            case 'ArrowUp':
                navigateImage(-1);
                e.preventDefault();
                break;
            case 'ArrowDown':
                navigateImage(1);
                e.preventDefault();
                break;
            case ' ':
            case 'Enter':
                navigateImage(1);
                e.preventDefault();
                break;
        }
    };
    
    // 기존 핸들러 제거 후 등록
    if (window._imageKeyHandler) {
        document.removeEventListener('keydown', window._imageKeyHandler);
    }
    
    document.addEventListener('keydown', keyHandler);
    window._imageKeyHandler = keyHandler;
}

/**
 * 휠 네비게이션
 */
function setupWheelNav() {
    const container = document.getElementById('imageViewerContainer');
    if (!container) return;
    
    // 스크롤 모드면 휠 네비 안 함
    if (ImageViewerState.scrollMode) return;
    
    let wheelTimeout = null;
    
    const wheelHandler = (e) => {
        e.preventDefault();
        
        if (wheelTimeout) return;
        
        wheelTimeout = setTimeout(() => {
            wheelTimeout = null;
        }, 300);
        
        if (e.deltaY > 0) {
            navigateImage(1);
        } else if (e.deltaY < 0) {
            navigateImage(-1);
        }
    };
    
    container.addEventListener('wheel', wheelHandler, { passive: false });
}

/**
 * 페이지 이동
 * @param {number} direction - 1: 다음, -1: 이전
 */
export function navigateImage(direction) {
    // 스크롤 모드
    if (ImageViewerState.scrollMode) {
        navigateScrollMode(direction);
        return;
    }
    
    const spreads = ImageViewerState.spreads;
    const currentIndex = ImageViewerState.currentSpreadIndex;
    const nextIndex = currentIndex + direction;
    
    // 범위 체크
    if (nextIndex < 0) {
        showToast('첫 페이지입니다');
        return;
    }
    
    if (nextIndex >= spreads.length) {
        showToast('마지막 페이지입니다');
        // TODO: 다음 에피소드 확인
        return;
    }
    
    setCurrentSpreadIndex(nextIndex);
    renderCurrentSpread();
}

/**
 * 스크롤 모드 페이지 이동
 * @param {number} direction
 */
function navigateScrollMode(direction) {
    const container = document.getElementById('imageViewerContainer');
    if (!container) return;
    
    const scrollAmount = container.clientHeight * 0.9;
    
    if (direction > 0) {
        container.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    } else {
        container.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
    }
}

/**
 * 특정 페이지로 이동 (슬라이더용)
 * @param {number} pageNumber - 페이지 번호 (1-based)
 */
export function goToImagePage(pageNumber) {
    const pageIndex = pageNumber - 1;
    
    // 스프레드에서 해당 페이지 찾기
    const spreadIndex = ImageViewerState.spreads.findIndex(spread => 
        spread.includes(pageIndex)
    );
    
    if (spreadIndex >= 0) {
        setCurrentSpreadIndex(spreadIndex);
        renderCurrentSpread();
    }
}

/**
 * 네비게이션 정리
 */
export function cleanupImageNavigation() {
    // 키보드 핸들러 제거
    if (window._imageKeyHandler) {
        document.removeEventListener('keydown', window._imageKeyHandler);
        delete window._imageKeyHandler;
    }
    
    // 클릭 영역 제거
    const zones = document.querySelectorAll('.nav-zone');
    zones.forEach(zone => zone.remove());
    
    console.log('🎮 Image Navigation cleaned up');
}

console.log('✅ Image Navigation loaded');
