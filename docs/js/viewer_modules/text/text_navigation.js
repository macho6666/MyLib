/**
 * viewer_modules/text/text_navigation.js
 * 텍스트 뷰어 입력 처리 (클릭/휠/스크롤/키보드)
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { renderPage } from './text_renderer.js';
import { navigateEpub } from './epub_renderer.js';
import { showToast } from '../core/utils.js';

let wheelTimeout = null;
let isNavigating = false;

/**
 * 네비게이션 초기화
 */
export function initNavigation() {
    const container = getViewerContainer();
    if (!container) return;
    
    // 기존 리스너 제거
    cleanupNavigation();
    
    // 입력 방식에 따라 등록
    if (TextViewerState.input.click) {
        setupClickNavigation(container);
    }
    
    if (TextViewerState.input.wheel) {
        setupWheelNavigation(container);
    }
    
    if (TextViewerState.input.scroll) {
        setupScrollNavigation(container);
    }
    
    // 키보드 (항상 활성화)
    setupKeyboardNavigation();
    
    console.log('🎮 Navigation initialized');
}

/**
 * 뷰어 컨테이너 가져오기
 */
function getViewerContainer() {
    if (TextViewerState.renderType === 'txt') {
        return document.getElementById('textViewerContainer');
    } else if (TextViewerState.renderType === 'epub') {
        return document.getElementById('epubViewerContainer');
    }
    return null;
}

/**
 * 클릭 네비게이션 설정
 * @param {HTMLElement} container
 */
function setupClickNavigation(container) {
    const clickHandler = (e) => {
        // 버튼/링크 클릭 제외
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
        
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        // 좌측 30% 클릭 → 이전
        if (clickX < width * 0.3) {
            navigatePage(-1);
        }
        // 우측 30% 클릭 → 다음
        else if (clickX > width * 0.7) {
            navigatePage(1);
        }
        // 중앙 클릭 → 컨트롤 토글
        else {
            toggleControls();
        }
    };
    
    container.addEventListener('click', clickHandler);
    container._clickHandler = clickHandler;
}

/**
 * 휠 네비게이션 설정
 * @param {HTMLElement} container
 */
function setupWheelNavigation(container) {
    const wheelHandler = (e) => {
        // 스크롤 모드는 제외
        if (TextViewerState.input.scroll) return;
        
        e.preventDefault();
        
        // 디바운스
        if (wheelTimeout) return;
        
        wheelTimeout = setTimeout(() => {
            wheelTimeout = null;
        }, 300);
        
        // 방향 결정
        if (e.deltaY > 0) {
            navigatePage(1);  // 다음
        } else if (e.deltaY < 0) {
            navigatePage(-1); // 이전
        }
    };
    
    container.addEventListener('wheel', wheelHandler, { passive: false });
    container._wheelHandler = wheelHandler;
}

/**
 * 스크롤 네비게이션 설정 (1페이지 전용)
 * @param {HTMLElement} container
 */
function setupScrollNavigation(container) {
    // TXT 전용 (EPUB은 자체 스크롤)
    if (TextViewerState.renderType !== 'txt') return;
    
    // 페이지 콘텐츠를 스크롤 가능하게
    const pageContent = container.querySelector('.text-page');
    if (pageContent) {
        pageContent.style.overflowY = 'auto';
        pageContent.style.height = 'calc(100vh - 90px)';
    }
    
    // 끝까지 스크롤 시 다음 페이지
    const scrollHandler = () => {
        const { scrollTop, scrollHeight, clientHeight } = pageContent;
        
        // 하단 도달
        if (scrollTop + clientHeight >= scrollHeight - 10) {
            if (!window._scrollBottomReached) {
                window._scrollBottomReached = true;
                showToast('⬇️ 계속 스크롤하면 다음 페이지로 이동합니다');
                
                setTimeout(() => {
                    if (window._scrollBottomReached) {
                        navigatePage(1);
                        window._scrollBottomReached = false;
                    }
                }, 1000);
            }
        } else {
            window._scrollBottomReached = false;
        }
    };
    
    if (pageContent) {
        pageContent.addEventListener('scroll', scrollHandler);
        pageContent._scrollHandler = scrollHandler;
    }
}

/**
 * 키보드 네비게이션 설정
 */
function setupKeyboardNavigation() {
    const keyHandler = (e) => {
        // 뷰어가 열려있지 않으면 무시
        if (document.getElementById('viewerOverlay').style.display !== 'flex') return;
        
        switch (e.key) {
            case 'ArrowLeft':
                navigatePage(-1);
                e.preventDefault();
                break;
            case 'ArrowRight':
                navigatePage(1);
                e.preventDefault();
                break;
            case 'ArrowUp':
                navigatePage(-1);
                e.preventDefault();
                break;
            case 'ArrowDown':
                navigatePage(1);
                e.preventDefault();
                break;
            case ' ':
            case 'Enter':
                navigatePage(1);
                e.preventDefault();
                break;
            case 'Escape':
                // 뷰어 닫기는 controls에서 처리
                break;
        }
    };
    
    document.addEventListener('keydown', keyHandler);
    window._textViewerKeyHandler = keyHandler;
}

/**
 * 페이지 이동 (통합)
 * @param {number} direction - 1: 다음, -1: 이전
 */
export function navigatePage(direction) {
    if (isNavigating) return;
    isNavigating = true;
    
    setTimeout(() => { isNavigating = false; }, 300);
    
    if (TextViewerState.renderType === 'epub') {
        // EPUB
        navigateEpub(direction);
    } else {
        // TXT
        navigateTxtPage(direction);
    }
}

/**
 * TXT 페이지 이동
 * @param {number} direction
 */
function navigateTxtPage(direction) {
    const newPage = TextViewerState.currentPage + direction;
    
    // 범위 체크
    if (newPage < 0) {
        showToast('첫 페이지입니다');
        return;
    }
    
    if (newPage >= TextViewerState.totalPages) {
        showToast('마지막 페이지입니다');
        // TODO: 다음 에피소드 확인
        return;
    }
    
    // 페이지 렌더링
    renderPage(newPage);
}

/**
 * 특정 페이지로 이동 (슬라이더용)
 * @param {number} pageNumber - 페이지 번호 (1-based)
 */
export function goToPage(pageNumber) {
    const pageIndex = pageNumber - 1;
    
    if (pageIndex < 0 || pageIndex >= TextViewerState.totalPages) {
        showToast('잘못된 페이지 번호입니다');
        return;
    }
    
    if (TextViewerState.renderType === 'txt') {
        renderPage(pageIndex);
    } else if (TextViewerState.renderType === 'epub') {
        // EPUB은 퍼센트 기준
        const rendition = TextViewerState.epub.rendition;
        if (rendition) {
            const percentage = pageIndex / 100;
            const cfi = rendition.book.locations.cfiFromPercentage(percentage);
            rendition.display(cfi);
        }
    }
}

/**
 * 컨트롤 토글
 */
function toggleControls() {
    const controls = document.getElementById('viewerControls');
    if (!controls) return;
    
    controls.classList.toggle('show');
    TextViewerState.ui.controlsVisible = controls.classList.contains('show');
}

/**
 * 네비게이션 정리
 */
export function cleanupNavigation() {
    const container = getViewerContainer();
    
    if (container) {
        // 클릭
        if (container._clickHandler) {
            container.removeEventListener('click', container._clickHandler);
            delete container._clickHandler;
        }
        
        // 휠
        if (container._wheelHandler) {
            container.removeEventListener('wheel', container._wheelHandler);
            delete container._wheelHandler;
        }
        
        // 스크롤
        const pageContent = container.querySelector('.text-page');
        if (pageContent && pageContent._scrollHandler) {
            pageContent.removeEventListener('scroll', pageContent._scrollHandler);
            delete pageContent._scrollHandler;
        }
    }
    
    // 키보드
    if (window._textViewerKeyHandler) {
        document.removeEventListener('keydown', window._textViewerKeyHandler);
        delete window._textViewerKeyHandler;
    }
    
    console.log('🎮 Navigation cleaned up');
}

console.log('✅ Text Navigation loaded');
