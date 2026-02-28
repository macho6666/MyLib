/**
 * viewer_modules/text/text_renderer.js
 * TXT 렌더링 (스크롤 모드 + 터치/클릭 네비게이션)
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { createCoverPage, createTOCPage } from './text_toc.js';
import { updateProgress } from './text_bookmark.js';
import { initControls, openSettings } from './text_controls.js';

let headerVisible = false;
let readMode = 'scroll'; // 'scroll' | 'touch'

/**
 * TXT 뷰어 초기화 및 렌더링
 */
export async function renderTxt(textContent, metadata) {
    TextViewerState.renderType = 'txt';
    TextViewerState.currentBook = metadata;
    headerVisible = false;
    
    // 저장된 읽기 모드 불러오기
    readMode = localStorage.getItem('mylib_text_readmode') || 'scroll';
    
    // 뷰어 오버레이 표시
    const viewer = document.getElementById('viewerOverlay');
    viewer.style.display = 'flex';
    document.body.classList.add('no-scroll');
    
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
    
    // 컨테이너 스타일 (읽기 모드에 따라)
    applyContainerStyle(container);
    
    // 헤더 생성 (숨김 상태)
    const header = createHeader(metadata.name);
    
    // 본문 콘텐츠 생성
    const content = createContent(textContent, metadata);
    
    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(content);
    
    // 터치 영역 생성 (터치 모드일 때만 활성화)
    createTouchZones(container);
    
    // 스크롤 진행률 추적
    setupScrollTracking(container, metadata);
    
    // 설정 패널 초기화
    initControls();
    
    // 테마 적용
    applyTheme();
    applyTypography();
    
    // 전역 함수 등록
    window.openTextSettings = openSettings;
    window.toggleTextHeader = toggleHeader;
    window.setTextReadMode = setReadMode;
    
    // 이벤트 발생
    Events.emit('text:open', { bookId: metadata.bookId, metadata });
    
    console.log('📖 TXT Viewer opened (mode: ' + readMode + ')');
}

/**
 * 컨테이너 스타일 적용
 */
function applyContainerStyle(container) {
    const isScrollMode = readMode === 'scroll';
    
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg-primary, #0d0d0d);
        color: var(--text-primary, #e8e8e8);
        overflow-y: ${isScrollMode ? 'auto' : 'hidden'};
        overflow-x: hidden;
        z-index: 5001;
        -webkit-overflow-scrolling: touch;
    `;
}

/**
 * 헤더 생성 (숨김 상태로 시작)
 */
function createHeader(title) {
    const header = document.createElement('div');
    header.id = 'textViewerHeader';
    header.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 50px;
        background: rgba(26, 26, 26, 0.95);
        border-bottom: 1px solid var(--border-color, #2a2a2a);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        z-index: 5100;
        backdrop-filter: blur(10px);
        transform: translateY(-100%);
        transition: transform 0.3s ease;
    `;
    
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
            <button onclick="closeViewer()" style="
                background: none;
                border: none;
                color: var(--text-primary, #fff);
                font-size: 24px;
                cursor: pointer;
                padding: 4px 8px;
            ">←</button>
            <span style="
                font-size: 15px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            ">${escapeHtml(title || 'Text Viewer')}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
            <span id="textProgressIndicator" style="
                font-size: 12px;
                color: var(--text-secondary, #999);
                margin-right: 4px;
            ">0%</span>
            <button onclick="setTextReadMode()" title="읽기 모드" style="
                background: none;
                border: none;
                color: var(--text-primary, #fff);
                font-size: 18px;
                cursor: pointer;
                padding: 4px 8px;
            " id="readModeBtn">📖</button>
            <button onclick="openTextSettings()" title="설정" style="
                background: none;
                border: none;
                color: var(--text-primary, #fff);
                font-size: 18px;
                cursor: pointer;
                padding: 4px 8px;
            ">⚙️</button>
        </div>
    `;
    
    return header;
}

/**
 * 터치 영역 생성
 */
function createTouchZones(scrollContainer) {
    // 기존 터치 영역 제거
    const existing = document.getElementById('textTouchZones');
    if (existing) existing.remove();
    
    const zones = document.createElement('div');
    zones.id = 'textTouchZones';
    zones.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 5050;
        pointer-events: none;
    `;
    
    // 왼쪽 영역 (이전)
    const leftZone = document.createElement('div');
    leftZone.id = 'textZoneLeft';
    leftZone.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 25%;
        height: 100%;
        pointer-events: ${readMode === 'touch' ? 'auto' : 'none'};
        cursor: pointer;
    `;
    leftZone.onclick = () => scrollPage(-1);
    
    // 가운데 영역 (헤더 토글) - 항상 활성화
    const centerZone = document.createElement('div');
    centerZone.id = 'textZoneCenter';
    centerZone.style.cssText = `
        position: absolute;
        top: 0;
        left: 25%;
        width: 50%;
        height: 80px;
        pointer-events: auto;
        cursor: pointer;
    `;
    centerZone.onclick = () => toggleHeader();
    
    // 오른쪽 영역 (다음)
    const rightZone = document.createElement('div');
    rightZone.id = 'textZoneRight';
    rightZone.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        width: 25%;
        height: 100%;
        pointer-events: ${readMode === 'touch' ? 'auto' : 'none'};
        cursor: pointer;
    `;
    rightZone.onclick = () => scrollPage(1);
    
    zones.appendChild(leftZone);
    zones.appendChild(centerZone);
    zones.appendChild(rightZone);
    
    document.body.appendChild(zones);
    
    updateReadModeBtn();
}

/**
 * 읽기 모드 전환
 */
function setReadMode(mode) {
    if (mode) {
        readMode = mode;
    } else {
        // 토글
        readMode = readMode === 'scroll' ? 'touch' : 'scroll';
    }
    
    localStorage.setItem('mylib_text_readmode', readMode);
    
    // 컨테이너 스타일 업데이트
    const container = document.getElementById('textViewerContainer');
    if (container) {
        applyContainerStyle(container);
    }
    
    // 터치 영역 업데이트
    const leftZone = document.getElementById('textZoneLeft');
    const rightZone = document.getElementById('textZoneRight');
    
    if (leftZone) {
        leftZone.style.pointerEvents = readMode === 'touch' ? 'auto' : 'none';
    }
    if (rightZone) {
        rightZone.style.pointerEvents = readMode === 'touch' ? 'auto' : 'none';
    }
    
    updateReadModeBtn();
    
    const modeText = readMode === 'scroll' ? '스크롤 모드' : '터치 모드';
    showToast(modeText);
}

/**
 * 읽기 모드 버튼 업데이트
 */
function updateReadModeBtn() {
    const btn = document.getElementById('readModeBtn');
    if (btn) {
        btn.textContent = readMode === 'scroll' ? '📜' : '👆';
        btn.title = readMode === 'scroll' ? '터치 모드로 전환' : '스크롤 모드로 전환';
    }
}

/**
 * 헤더 토글
 */
function toggleHeader() {
    const header = document.getElementById('textViewerHeader');
    if (!header) return;
    
    headerVisible = !headerVisible;
    header.style.transform = headerVisible ? 'translateY(0)' : 'translateY(-100%)';
}

/**
 * 페이지 스크롤 (한 화면 분량)
 */
function scrollPage(direction) {
    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    
    const scrollAmount = container.clientHeight * 0.9;
    const currentScroll = container.scrollTop;
    const maxScroll = container.scrollHeight - container.clientHeight;
    
    let newScroll;
    if (direction > 0) {
        newScroll = Math.min(currentScroll + scrollAmount, maxScroll);
    } else {
        newScroll = Math.max(currentScroll - scrollAmount, 0);
    }
    
    container.scrollTo({
        top: newScroll,
        behavior: 'smooth'
    });
}

/**
 * 본문 콘텐츠 생성
 */
function createContent(textContent, metadata) {
    const content = document.createElement('div');
    content.id = 'textViewerContent';
    
    // 반응형 패딩 (모바일 여백 최소화)
    content.style.cssText = `
        max-width: 800px;
        margin: 0 auto;
        padding: 16px 12px 100px 12px;
        font-size: 18px;
        line-height: 1.9;
        word-break: keep-all;
        letter-spacing: 0.3px;
        position: relative;
        z-index: 1;
    `;
    
    // 표지 (있으면)
    if (metadata.coverUrl) {
        content.innerHTML += `
            <div style="
                text-align: center;
                margin-bottom: 32px;
                padding-top: 16px;
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
                    padding: 0 8px;
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
            padding: 50px 0;
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
    
    // 터치 영역 제거
    const touchZones = document.getElementById('textTouchZones');
    if (touchZones) touchZones.remove();
    
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

/**
 * 토스트 (간단한 알림)
 */
function showToast(msg) {
    if (window.showToast) {
        window.showToast(msg);
    } else {
        console.log('Toast:', msg);
    }
}

// 페이지 모드용 (호환성 유지)
export function renderPage(pageIndex) {
    console.log('renderPage called but using scroll mode');
}

console.log('✅ TXT Renderer loaded (scroll + touch mode)');
