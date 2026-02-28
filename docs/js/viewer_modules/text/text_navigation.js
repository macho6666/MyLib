/**
 * viewer_modules/text/text_navigation.js
 * 텍스트 뷰어 키보드 네비게이션
 */

import { TextViewerState } from './text_state.js';

/**
 * 네비게이션 초기화 (키보드만)
 */
export function initNavigation() {
    setupKeyboardNavigation();
    console.log('🎮 Navigation initialized (keyboard only)');
}

/**
 * 키보드 네비게이션 설정
 */
function setupKeyboardNavigation() {
    if (window._textViewerKeyHandler) {
        document.removeEventListener('keydown', window._textViewerKeyHandler);
    }
    
    const keyHandler = (e) => {
        const viewer = document.getElementById('viewerOverlay');
        if (!viewer || viewer.style.display !== 'flex') return;
        
        const container = document.getElementById('textViewerContainer');
        if (!container) return;
        
        const scrollAmount = container.clientHeight * 0.9;
        
        switch (e.key) {
            case 'ArrowDown':
            case ' ':
            case 'PageDown':
                container.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                e.preventDefault();
                break;
            case 'ArrowUp':
            case 'PageUp':
                container.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
                e.preventDefault();
                break;
            case 'ArrowLeft':
                container.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
                e.preventDefault();
                break;
            case 'ArrowRight':
                container.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                e.preventDefault();
                break;
            case 'Home':
                container.scrollTo({ top: 0, behavior: 'smooth' });
                e.preventDefault();
                break;
            case 'End':
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                e.preventDefault();
                break;
            case 'Escape':
                if (window.closeViewer) window.closeViewer();
                e.preventDefault();
                break;
        }
    };
    
    document.addEventListener('keydown', keyHandler);
    window._textViewerKeyHandler = keyHandler;
}

/**
 * 페이지 이동 (호환성)
 */
export function navigatePage(direction) {
    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    
    const scrollAmount = container.clientHeight * 0.9;
    container.scrollBy({ 
        top: direction * scrollAmount, 
        behavior: 'smooth' 
    });
}

/**
 * 특정 페이지로 이동 (호환성)
 */
export function goToPage(pageNumber) {
    console.log('goToPage called but using scroll mode');
}

/**
 * 네비게이션 정리
 */
export function cleanupNavigation() {
    if (window._textViewerKeyHandler) {
        document.removeEventListener('keydown', window._textViewerKeyHandler);
        delete window._textViewerKeyHandler;
    }
    console.log('🎮 Navigation cleaned up');
}

console.log('✅ Text Navigation loaded');
