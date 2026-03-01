/**
 * viewer_modules/text/text_renderer.js
 * TXT 렌더링 (스크롤/클릭 모드)
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { createCoverPage, createTOCPage } from './text_toc.js';
import { updateProgress } from './text_bookmark.js';
import { openSettings } from './text_controls.js';

let headerVisible = false;
let readMode = 'scroll'; // 'scroll' | 'click'
let pageLayout = '1page';

/**
 * TXT 뷰어 초기화 및 렌더링
 */
export async function renderTxt(textContent, metadata) {
    TextViewerState.renderType = 'txt';
    TextViewerState.currentBook = metadata;
    headerVisible = false;
    
    // 저장된 읽기 모드 불러오기
    readMode = localStorage.getItem('mylib_text_readmode') || 'scroll';
    
// 저장된 레이아웃 불러오기 (PC만)
if (window.innerWidth >= 1024) {
    pageLayout = localStorage.getItem('text_layout') || '1page';
} else {
    pageLayout = '1page';  // 모바일은 무조건 1page
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
    
    // 토글 버튼 생성 (항상 보임)
    createToggleButton();
    
    // 헤더 생성 (숨김 상태)
    createHeader(metadata.name);
    
    // 본문 콘텐츠 생성
    const content = createContent(textContent, metadata);
    
    container.innerHTML = '';
    container.appendChild(content);
    
    // 클릭 모드일 때 터치 영역 설정
    if (readMode === 'click') {
        setupClickZones(container);
    }
    
    // 스크롤 진행률 추적
    setupScrollTracking(container, metadata);
        
    // 테마 적용
    // applyTheme();  // ← 주석 처리 (설정에서 적용됨)
    applyTypography();
    
    // 전역 함수 등록
    window.openTextSettings = openSettings;
    window.toggleTextHeader = toggleHeader;
    window.setTextReadMode = setReadMode;
    window.getTextReadMode = () => readMode;
    window.setTextLayout = setTextLayout;
    window.getTextLayout = getTextLayout;
    
    // 이벤트 발생
    Events.emit('text:open', { bookId: metadata.bookId, metadata });
    
    console.log('📖 TXT Viewer opened (mode: ' + readMode + ')');
}

/**
 * 컨테이너 스타일 적용
 */
function applyContainerStyle(container) {
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg-primary, #0d0d0d);
        color: var(--text-primary, #e8e8e8);
        overflow-y: ${readMode === 'scroll' ? 'auto' : 'hidden'};
        overflow-x: hidden;
        z-index: 5001;
        -webkit-overflow-scrolling: touch;
    `;
}

/**
 * 토글 버튼 생성 (항상 보임)
 */
function createToggleButton() {
    // 기존 버튼 제거
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
 * 헤더 생성 (숨김 상태로 시작)
 */
function createHeader(title) {
    // 기존 헤더 제거
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
 * 헤더 토글
 */
function toggleHeader() {
    const header = document.getElementById('textViewerHeader');
    const toggleBtn = document.getElementById('textToggleBtn');
    
    if (!header) return;
    
    headerVisible = !headerVisible;
    
    if (headerVisible) {
        header.style.transform = 'translateY(0)';
        if (toggleBtn) toggleBtn.style.opacity = '0';
    } else {
        header.style.transform = 'translateY(-100%)';
        if (toggleBtn) toggleBtn.style.opacity = '1';
    }
}
/**
 * 클릭 영역 설정 (클릭 모드) - 좌우만
 */
function setupClickZones(container) {
    container.onclick = (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
        
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        // 좌측 20% → 이전
        if (clickX < width * 0.2) {
            scrollPageAmount(-1);
        }
        // 우측 20% → 다음
        else if (clickX > width * 0.8) {
            scrollPageAmount(1);
        }
        // 중앙 60% → 아무것도 안 함
    };
}
/**
 * 한 화면 분량 스크롤
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
 * 읽기 모드 변경
 */
function setReadMode(mode) {
    if (mode) {
        readMode = mode;
    } else {
        readMode = readMode === 'scroll' ? 'click' : 'scroll';
    }
    
    localStorage.setItem('mylib_text_readmode', readMode);
    
    // 컨테이너 스타일 업데이트
    const container = document.getElementById('textViewerContainer');
    if (container) {
        // overflow만 변경 (전체 스타일 재적용 안 함)
        container.style.overflowY = readMode === 'scroll' ? 'auto' : 'hidden';
        
        // 클릭 이벤트 설정
        if (readMode === 'click') {
            setupClickZones(container);
        } else {
            container.onclick = null;
        }
    }
    
    // 설정 UI 업데이트
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
    
    // 콘텐츠 다시 렌더링
    const container = document.getElementById('textViewerContainer');
    const content = document.getElementById('textViewerContent');
    
    if (content && pageLayout === '2page') {
        content.style.columnCount = '2';
        content.style.columnGap = '40px';
        content.style.maxWidth = '1400px';
        content.style.height = 'calc(100vh - 32px)';
        content.style.overflow = 'hidden';
    } else if (content) {
        content.style.columnCount = '';
        content.style.columnGap = '';
        content.style.maxWidth = '800px';
        content.style.height = '';
        content.style.overflow = '';
    }
    
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
 * 본문 콘텐츠 생성
 */
function createContent(textContent, metadata) {
    const content = document.createElement('div');
    content.id = 'textViewerContent';
    
    // 2페이지 모드일 때
    if (pageLayout === '2page') {
        content.style.cssText = `
            column-count: 2;
            column-gap: 40px;
            max-width: 1400px;
            margin: 0 auto;
            padding: 16px 24px 100px 24px;
            font-size: 18px;
            line-height: 1.9;
            word-break: keep-all;
            letter-spacing: 0.3px;
            height: calc(100vh - 32px);
            overflow: hidden;
        `;
    } else {
        content.style.cssText = `
            max-width: 800px;
            margin: 0 auto;
            padding: 16px 16px 100px 16px;
            font-size: 18px;
            line-height: 1.9;
            word-break: keep-all;
            letter-spacing: 0.3px;
        `;
    }
    
    // 표지 (있으면)
    if (metadata.coverUrl) {
        content.innerHTML += `
            <div style="
                text-align: center;
                margin-bottom: 32px;
                padding-top: 20px;
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
            padding: 60px 0;
            color: var(--text-tertiary, #666);
            font-size: 14px;
        ">
            — 끝 —
        </div>
    `;
    
    return content;
}

/**
 * 스크롤 진행률 추적
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
                
                // 진행률 표시 업데이트
                const indicator = document.getElementById('textProgressIndicator');
                if (indicator) {
                    indicator.textContent = progress + '%';
                }
                
                // 진행률 저장 (5% 단위로)
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
 * 특정 위치로 스크롤
 */
export function scrollToPosition(position) {
    const container = document.getElementById('textViewerContainer');
    if (container && position) {
        container.scrollTop = position;
    }
}

/**
 * 진행률로 스크롤
 */
export function scrollToProgress(percent) {
    const container = document.getElementById('textViewerContainer');
    if (container) {
        const scrollHeight = container.scrollHeight - container.clientHeight;
        container.scrollTop = (percent / 100) * scrollHeight;
    }
}

/**
 * 텍스트 뷰어 정리
 */
export function cleanupTextRenderer() {
    headerVisible = false;
    document.body.style.overflow = '';
    // 토글 버튼 제거
    const toggleBtn = document.getElementById('textToggleBtn');
    if (toggleBtn) toggleBtn.remove();
    
    // 헤더 제거
    const header = document.getElementById('textViewerHeader');
    if (header) header.remove();
    
    // 이미지 뷰어 요소 다시 표시
    const imageContent = document.getElementById('viewerContent');
    if (imageContent) {
        imageContent.style.display = '';
    }
    
    // 컨트롤 다시 표시
    const controls = document.getElementById('viewerControls');
    if (controls) {
        controls.style.display = '';
    }
    
    // 전역 함수 제거
    delete window.openTextSettings;
    delete window.toggleTextHeader;
    delete window.setTextReadMode;
    delete window.getTextReadMode;
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
