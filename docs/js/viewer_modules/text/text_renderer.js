/**
 * viewer_modules/text/text_renderer.js
 * TXT 렌더링 (스크롤/클릭 모드, 1페이지/2페이지 레이아웃)
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { createCoverPage, createTOCPage } from './text_toc.js';
import { updateProgress } from './text_bookmark.js';
import { openSettings } from './text_controls.js';

let headerVisible = false;
let readMode = 'scroll'; // 'scroll' | 'click'
let pageLayout = '1page'; // '1page' | '2page'
let headerAutoCloseTimer = null;
let current2PageOffset = 0; // 2페이지 모드용 오프셋

/**
 * TXT 뷰어 초기화 및 렌더링
 */
export async function renderTxt(textContent, metadata) {
    TextViewerState.renderType = 'txt';
    TextViewerState.currentBook = metadata;
    headerVisible = false;
    current2PageOffset = 0;
    
    // 저장된 읽기 모드 불러오기
    readMode = localStorage.getItem('mylib_text_readmode') || 'scroll';
    
    // 저장된 레이아웃 불러오기 (PC만)
    if (window.innerWidth >= 1024) {
        pageLayout = localStorage.getItem('text_layout') || '1page';
    } else {
        pageLayout = '1page';
    }
    
    // 뷰어 오버레이 표시
    const viewer = document.getElementById('viewerOverlay');
    viewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // 이미지 뷰어 요소 숨기기
    const imageContent = document.getElementById('viewerContent');
    if (imageContent) {
        imageContent.style.display = 'none';
    }
    
    // 하단 컨트롤 숨기기
    const controls = document.getElementById('viewerControls');
    if (controls) {
        controls.style.display = 'none';
    }
    
    // 텍스트 뷰어 컨테이너 생성
    let container = document.getElementById('textViewerContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'textViewerContainer';
        viewer.appendChild(container);
    }
    
    // 컨테이너 스타일
    applyContainerStyle(container);
    
    // 토글 버튼 생성
    createToggleButton();
    
    // 헤더 생성
    createHeader(metadata.name);
    
    // 본문 콘텐츠 생성
    const content = createContent(textContent, metadata);
    
    container.innerHTML = '';
    container.appendChild(content);
    
    // 모드별 설정
    setupInteraction(container);
    
    // 스크롤 진행률 추적 (1페이지 모드용)
    if (pageLayout === '1page') {
        setupScrollTracking(container, metadata);
    }
    
    // 테마 적용
    applyTheme();
    applyTypography();
    
    // 전역 함수 등록
    window.openTextSettings = openSettings;
    window.toggleTextHeader = toggleHeader;
    window.setTextReadMode = setReadMode;
    window.getTextReadMode = () => readMode;
    window.setTextLayout = setTextLayout;
    window.getTextLayout = getTextLayout;
    
    // 키보드 이벤트
    setupKeyboardNavigation();
    
    Events.emit('text:open', { bookId: metadata.bookId, metadata });
    
    console.log(`📖 TXT Viewer opened (mode: ${readMode}, layout: ${pageLayout})`);
}

/**
 * 컨테이너 스타일 적용
 */
function applyContainerStyle(container) {
    const is2Page = pageLayout === '2page';
    
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg-primary, #0d0d0d);
        color: var(--text-primary, #e8e8e8);
        overflow: ${is2Page ? 'hidden' : (readMode === 'click' ? 'hidden' : 'auto')};
        z-index: 5001;
        -webkit-overflow-scrolling: touch;
    `;
}

/**
 * 토글 버튼 생성
 */
function createToggleButton() {
    const existing = document.getElementById('textToggleBtn');
    if (existing) existing.remove();
    
    const btn = document.createElement('button');
    btn.id = 'textToggleBtn';
    btn.innerHTML = '☰';
    btn.onclick = toggleHeader;
    btn.style.cssText = `
        position: fixed;
        top: 12px;
        right: 12px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: #fff;
        font-size: 20px;
        cursor: pointer;
        z-index: 5200;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(10px);
        transition: opacity 0.3s;
    `;
    
    document.body.appendChild(btn);
}

/**
 * 헤더 생성
 */
function createHeader(title) {
    const existing = document.getElementById('textViewerHeader');
    if (existing) existing.remove();
    
    const header = document.createElement('div');
    header.id = 'textViewerHeader';
    header.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 56px;
        background: rgba(20, 20, 20, 0.95);
        border-bottom: 1px solid var(--border-color, #2a2a2a);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        z-index: 5150;
        backdrop-filter: blur(10px);
        transform: translateY(-100%);
        transition: transform 0.3s ease;
    `;
    
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <button onclick="closeViewer()" style="
                background: none;
                border: none;
                color: var(--text-primary, #fff);
                font-size: 20px;
                cursor: pointer;
                padding: 8px;
            ">←</button>
            <span style="
                font-size: 16px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            ">${escapeHtml(title || 'Text Viewer')}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
            <span id="textProgressIndicator" style="
                font-size: 13px;
                color: var(--text-secondary, #999);
            ">0%</span>
            <button onclick="saveTextBookmark()" title="Bookmark" style="
                background: none;
                border: none;
                color: var(--text-primary, #fff);
                font-size: 14px;
                cursor: pointer;
                padding: 6px;
            ">Save</button>
            <button onclick="openTextSettings()" title="Settings" style="
                background: none;
                border: none;
                color: var(--text-primary, #fff);
                font-size: 14px;
                cursor: pointer;
                padding: 6px;
            ">Set</button>
            <button onclick="toggleTextHeader()" title="Close" style="
                background: none;
                border: none;
                color: var(--text-primary, #fff);
                font-size: 18px;
                cursor: pointer;
                padding: 6px;
            ">x</button>
        </div>
    `;
    
    document.body.appendChild(header);
}

/**
 * 헤더 토글 (3초 후 자동 닫힘)
 */
function toggleHeader() {
    const header = document.getElementById('textViewerHeader');
    const toggleBtn = document.getElementById('textToggleBtn');
    
    if (!header) return;
    
    if (headerAutoCloseTimer) {
        clearTimeout(headerAutoCloseTimer);
        headerAutoCloseTimer = null;
    }
    
    headerVisible = !headerVisible;
    
    if (headerVisible) {
        header.style.transform = 'translateY(0)';
        if (toggleBtn) toggleBtn.style.opacity = '0';
        
        headerAutoCloseTimer = setTimeout(() => {
            headerVisible = false;
            header.style.transform = 'translateY(-100%)';
            if (toggleBtn) toggleBtn.style.opacity = '1';
            headerAutoCloseTimer = null;
        }, 3000);
    } else {
        header.style.transform = 'translateY(-100%)';
        if (toggleBtn) toggleBtn.style.opacity = '1';
    }
}

/**
 * 본문 콘텐츠 생성
 */
function createContent(textContent, metadata) {
    const content = document.createElement('div');
    content.id = 'textViewerContent';
    
    const is2Page = pageLayout === '2page';
    const verticalPadding = '24px';
    
    if (is2Page) {
        // 2페이지: 가로로 컬럼 확장, 화면 높이 고정
        content.style.cssText = `
            column-count: 2;
            column-gap: 48px;
            column-fill: auto;
            height: calc(100vh - 48px);
            width: max-content;
            padding: ${verticalPadding} 48px;
            font-size: 18px;
            line-height: 1.9;
            word-break: keep-all;
            letter-spacing: 0.3px;
            box-sizing: border-box;
            background: var(--bg-primary, #0d0d0d);
            color: var(--text-primary, #e8e8e8);
        `;
    } else {
        content.style.cssText = `
            max-width: 800px;
            margin: 0 auto;
            padding: ${verticalPadding} 16px;
            font-size: 18px;
            line-height: 1.9;
            word-break: keep-all;
            letter-spacing: 0.3px;
            box-sizing: border-box;
            background: var(--bg-primary, #0d0d0d);
            color: var(--text-primary, #e8e8e8);
        `;
    }
    
    // 표지
    if (metadata.coverUrl) {
        content.innerHTML += `
            <div style="
                text-align: center;
                margin-bottom: 32px;
                ${is2Page ? 'break-inside: avoid;' : ''}
            ">
                <img src="${metadata.coverUrl}" alt="cover" style="
                    max-width: 180px;
                    max-height: 260px;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                ">
                <h1 style="
                    margin-top: 16px;
                    font-size: 20px;
                    font-weight: 600;
                ">${escapeHtml(metadata.name || '')}</h1>
            </div>
            <hr style="
                border: none;
                border-top: 1px solid var(--border-color, #2a2a2a);
                margin: 32px 0;
            ">
        `;
    }
    
    // 본문 텍스트
    const paragraphs = textContent
        .split(/\n/)
        .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '<br>';
            return `<p style="margin: 0 0 0.8em 0; text-indent: 1em;">${escapeHtml(trimmed)}</p>`;
        })
        .join('');
    
    content.innerHTML += paragraphs;
    
    // 끝 표시
    content.innerHTML += `
        <div style="
            text-align: center;
            padding: 40px 0;
            color: var(--text-tertiary, #666);
            font-size: 14px;
            ${is2Page ? 'break-inside: avoid;' : ''}
        ">
            — 끝 —
        </div>
    `;
    
    return content;
}

/**
 * 인터랙션 설정
 */
function setupInteraction(container) {
    // 기존 이벤트 제거
    container.onclick = null;
    container.onwheel = null;
    
    if (pageLayout === '2page') {
        // 2페이지 모드: 항상 페이지 단위 이동
        setup2PageInteraction(container);
    } else {
        // 1페이지 모드
        if (readMode === 'click') {
            setupClickZones(container);
        }
    }
}

/**
 * 2페이지 인터랙션 설정
 */
function setup2PageInteraction(container) {
    const content = document.getElementById('textViewerContent');
    if (!content) return;
    
    // 휠 이벤트 (스크롤 모드)
    container.onwheel = (e) => {
        e.preventDefault();
        if (e.deltaY > 0) {
            navigate2Page(1);
        } else if (e.deltaY < 0) {
            navigate2Page(-1);
        }
    };
    
    // 터치 이벤트 (스크롤 모드)
    let touchStartX = 0;
    let touchStartY = 0;
    
    container.ontouchstart = (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    };
    
    container.ontouchend = (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;
        
        // 가로 스와이프가 더 크면
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
            if (diffX > 0) {
                navigate2Page(1); // 왼쪽으로 스와이프 = 다음
            } else {
                navigate2Page(-1); // 오른쪽으로 스와이프 = 이전
            }
        }
        // 세로 스와이프
        else if (Math.abs(diffY) > 50) {
            if (diffY > 0) {
                navigate2Page(1); // 위로 스와이프 = 다음
            } else {
                navigate2Page(-1); // 아래로 스와이프 = 이전
            }
        }
    };
    
    // 클릭 모드
    if (readMode === 'click') {
        container.onclick = (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
            
            const rect = container.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;
            
            if (clickX < width * 0.2) {
                navigate2Page(-1);
            } else if (clickX > width * 0.8) {
                navigate2Page(1);
            }
        };
    }
}

/**
 * 2페이지 네비게이션
 */
function navigate2Page(direction) {
    const container = document.getElementById('textViewerContainer');
    const content = document.getElementById('textViewerContent');
    if (!container || !content) return;
    
    const containerWidth = container.clientWidth;
    const maxScroll = Math.max(0, content.scrollWidth - containerWidth);
    
    // 2컬럼 너비만큼 이동
    const scrollAmount = containerWidth;
    
    if (direction > 0) {
        current2PageOffset = Math.min(current2PageOffset + scrollAmount, maxScroll);
    } else {
        current2PageOffset = Math.max(current2PageOffset - scrollAmount, 0);
    }
    
    content.style.transform = `translateX(-${current2PageOffset}px)`;
    content.style.transition = 'transform 0.3s ease';
    
    // 진행률 업데이트
    const progress = maxScroll > 0 ? Math.round((current2PageOffset / maxScroll) * 100) : 0;
    updateProgressIndicator(progress);
}

/**
 * 1페이지 클릭 영역 설정
 */
function setupClickZones(container) {
    container.onclick = (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
        
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        if (clickX < width * 0.2) {
            scrollPageAmount(-1);
        } else if (clickX > width * 0.8) {
            scrollPageAmount(1);
        }
    };
}

/**
 * 1페이지 한 화면 스크롤
 */
function scrollPageAmount(direction) {
    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    
    const scrollAmount = container.clientHeight * 0.9;
    
    container.scrollBy({
        top: direction * scrollAmount,
        behavior: 'smooth'
    });
}

/**
 * 키보드 네비게이션
 */
function setupKeyboardNavigation() {
    if (window._textKeyHandler) {
        document.removeEventListener('keydown', window._textKeyHandler);
    }
    
    window._textKeyHandler = (e) => {
        const container = document.getElementById('textViewerContainer');
        if (!container || container.style.display === 'none') return;
        
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
            case 'PageUp':
                e.preventDefault();
                navigatePage(-1);
                break;
            case 'ArrowRight':
            case 'ArrowDown':
            case 'PageDown':
            case ' ':
                e.preventDefault();
                navigatePage(1);
                break;
            case 'Home':
                e.preventDefault();
                goToStart();
                break;
            case 'End':
                e.preventDefault();
                goToEnd();
                break;
            case 'Escape':
                if (typeof closeViewer === 'function') closeViewer();
                break;
        }
    };
    
    document.addEventListener('keydown', window._textKeyHandler);
}

/**
 * 페이지 네비게이션 (레이아웃별 분기)
 */
function navigatePage(direction) {
    if (pageLayout === '2page') {
        navigate2Page(direction);
    } else {
        scrollPageAmount(direction);
    }
}

/**
 * 처음으로
 */
function goToStart() {
    const container = document.getElementById('textViewerContainer');
    const content = document.getElementById('textViewerContent');
    
    if (pageLayout === '2page') {
        current2PageOffset = 0;
        if (content) {
            content.style.transform = 'translateX(0)';
            content.style.transition = 'transform 0.3s ease';
        }
        updateProgressIndicator(0);
    } else if (container) {
        container.scrollTop = 0;
    }
}

/**
 * 끝으로
 */
function goToEnd() {
    const container = document.getElementById('textViewerContainer');
    const content = document.getElementById('textViewerContent');
    
    if (pageLayout === '2page') {
        if (container && content) {
            const maxScroll = Math.max(0, content.scrollWidth - container.clientWidth);
            current2PageOffset = maxScroll;
            content.style.transform = `translateX(-${current2PageOffset}px)`;
            content.style.transition = 'transform 0.3s ease';
        }
        updateProgressIndicator(100);
    } else if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

/**
 * 진행률 표시 업데이트
 */
function updateProgressIndicator(progress) {
    const indicator = document.getElementById('textProgressIndicator');
    if (indicator) {
        indicator.textContent = progress + '%';
    }
    TextViewerState.scrollProgress = progress;
}

/**
 * 스크롤 진행률 추적 (1페이지 모드용)
 */
function setupScrollTracking(container, metadata) {
    let ticking = false;
    
    container.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const scrollTop = container.scrollTop;
                const scrollHeight = container.scrollHeight - container.clientHeight;
                const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
                
                TextViewerState.scrollProgress = progress;
                TextViewerState.scrollPosition = scrollTop;
                
                updateProgressIndicator(progress);
                
                if (progress % 5 === 0) {
                    updateProgress(metadata.seriesId, metadata.bookId);
                }
                
                ticking = false;
            });
            ticking = true;
        }
    });
}

/**
 * 읽기 모드 변경
 */
function setReadMode(mode) {
    if (mode) {
        readMode = mode;
    } else {
        readMode = readMode === 'scroll' ? 'click' : 'scroll';
    }
    
    localStorage.setItem('mylib_text_readmode', readMode);
    
    const container = document.getElementById('textViewerContainer');
    
    if (container) {
        applyContainerStyle(container);
        setupInteraction(container);
    }
    
    // 테마 재적용
    applyTheme();
    applyTypography();
    
    updateReadModeUI();
    
    const modeText = readMode === 'scroll' ? 'Scroll Mode' : 'Click Mode';
    if (window.showToast) window.showToast(modeText);
}

/**
 * 레이아웃 변경
 */
function setTextLayout(layout) {
    pageLayout = layout;
    localStorage.setItem('text_layout', layout);
    
    const container = document.getElementById('textViewerContainer');
    const content = document.getElementById('textViewerContent');
    
    if (!content) return;
    
    // 오프셋 리셋
    content.style.transform = '';
    content.style.transition = '';
    current2PageOffset = 0;
    
    const verticalPadding = '24px';
    
    if (pageLayout === '2page') {
        content.style.cssText = `
            column-count: 2;
            column-gap: 48px;
            column-fill: auto;
            height: calc(100vh - 48px);
            width: max-content;
            padding: ${verticalPadding} 48px;
            font-size: 18px;
            line-height: 1.9;
            word-break: keep-all;
            letter-spacing: 0.3px;
            box-sizing: border-box;
            background: var(--bg-primary, #0d0d0d);
            color: var(--text-primary, #e8e8e8);
        `;
    } else {
        content.style.cssText = `
            max-width: 800px;
            margin: 0 auto;
            padding: ${verticalPadding} 16px;
            font-size: 18px;
            line-height: 1.9;
            word-break: keep-all;
            letter-spacing: 0.3px;
            box-sizing: border-box;
            background: var(--bg-primary, #0d0d0d);
            color: var(--text-primary, #e8e8e8);
        `;
    }
    
    if (container) {
        applyContainerStyle(container);
        setupInteraction(container);
    }
    
    // 테마 재적용
    applyTheme();
    applyTypography();
    
    if (window.showToast) {
        window.showToast(layout === '2page' ? '2 Page Mode' : '1 Page Mode');
    }
}

/**
 * 레이아웃 가져오기
 */
function getTextLayout() {
    return pageLayout;
}

/**
 * 읽기 모드 UI 업데이트
 */
function updateReadModeUI() {
    const scrollBtn = document.getElementById('btnModeScroll');
    const clickBtn = document.getElementById('btnModeClick');
    
    if (scrollBtn) {
        scrollBtn.classList.toggle('active', readMode === 'scroll');
    }
    if (clickBtn) {
        clickBtn.classList.toggle('active', readMode === 'click');
    }
}

/**
 * 특정 위치로 스크롤
 */
export function scrollToPosition(position) {
    const container = document.getElementById('textViewerContainer');
    if (container && position) {
        if (pageLayout === '2page') {
            current2PageOffset = position;
            const content = document.getElementById('textViewerContent');
            if (content) {
                content.style.transform = `translateX(-${position}px)`;
            }
        } else {
            container.scrollTop = position;
        }
    }
}

/**
 * 진행률로 스크롤
 */
export function scrollToProgress(percent) {
    const container = document.getElementById('textViewerContainer');
    const content = document.getElementById('textViewerContent');
    
    if (pageLayout === '2page' && container && content) {
        const maxScroll = Math.max(0, content.scrollWidth - container.clientWidth);
        current2PageOffset = (percent / 100) * maxScroll;
        content.style.transform = `translateX(-${current2PageOffset}px)`;
    } else if (container) {
        const scrollHeight = container.scrollHeight - container.clientHeight;
        container.scrollTop = (percent / 100) * scrollHeight;
    }
}

/**
 * 텍스트 뷰어 정리
 */
export function cleanupTextRenderer() {
    headerVisible = false;
    current2PageOffset = 0;
    
    if (headerAutoCloseTimer) {
        clearTimeout(headerAutoCloseTimer);
        headerAutoCloseTimer = null;
    }
    
    if (window._textKeyHandler) {
        document.removeEventListener('keydown', window._textKeyHandler);
        delete window._textKeyHandler;
    }
    
    document.body.style.overflow = '';
    
    const toggleBtn = document.getElementById('textToggleBtn');
    if (toggleBtn) toggleBtn.remove();
    
    const header = document.getElementById('textViewerHeader');
    if (header) header.remove();
    
    const imageContent = document.getElementById('viewerContent');
    if (imageContent) {
        imageContent.style.display = '';
    }
    
    const controls = document.getElementById('viewerControls');
    if (controls) {
        controls.style.display = '';
    }
    
    // 컨테이너 이벤트 제거
    const container = document.getElementById('textViewerContainer');
    if (container) {
        container.onclick = null;
        container.onwheel = null;
        container.ontouchstart = null;
        container.ontouchend = null;
    }
    
    delete window.openTextSettings;
    delete window.toggleTextHeader;
    delete window.setTextReadMode;
    delete window.getTextReadMode;
    delete window.setTextLayout;
    delete window.getTextLayout;
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 호환성 유지
export function renderPage(pageIndex) {
    console.log('renderPage called but using scroll mode');
}

console.log('✅ TXT Renderer loaded');
