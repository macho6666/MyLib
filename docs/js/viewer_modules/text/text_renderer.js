/**
 * viewer_modules/text/text_renderer.js
 * TXT 렌더링 (스크롤 모드)
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { createCoverPage, createTOCPage } from './text_toc.js';
import { updateProgress } from './text_bookmark.js';

/**
 * TXT 뷰어 초기화 및 렌더링
 */
export async function renderTxt(textContent, metadata) {
    TextViewerState.renderType = 'txt';
    TextViewerState.currentBook = metadata;
    
    // 뷰어 오버레이 표시
    const viewer = document.getElementById('viewerOverlay');
    viewer.style.display = 'flex';
    document.body.classList.add('no-scroll');
    
    // 이미지 뷰어 요소 숨기기
    const imageContent = document.getElementById('viewerContent');
    if (imageContent) {
        imageContent.style.display = 'none';
    }
    
    // 하단 컨트롤 숨기기 (스크롤 모드에서는 불필요)
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
    
    // 컨테이너 스타일 (전체 화면, 스크롤 가능)
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg-primary, #0d0d0d);
        color: var(--text-primary, #e8e8e8);
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 5001;
        -webkit-overflow-scrolling: touch;
    `;
    
    // 헤더 생성
    const header = createHeader(metadata.name);
    
    // 본문 콘텐츠 생성
    const content = createContent(textContent, metadata);
    
    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(content);
    
    // 스크롤 진행률 추적
    setupScrollTracking(container, metadata);
    
    // 테마 적용
    applyTheme();
    applyTypography();
    
    // 이벤트 발생
    Events.emit('text:open', { bookId: metadata.bookId, metadata });
    
    console.log('📖 TXT Viewer opened (scroll mode)');
}

/**
 * 헤더 생성
 */
function createHeader(title) {
    const header = document.createElement('div');
    header.id = 'textViewerHeader';
    header.style.cssText = `
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        height: 50px;
        background: var(--bg-secondary, #1a1a1a);
        border-bottom: 1px solid var(--border-color, #2a2a2a);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        z-index: 100;
        backdrop-filter: blur(10px);
    `;
    
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <button onclick="closeViewer()" style="
                background: none;
                border: none;
                color: var(--text-primary, #fff);
                font-size: 24px;
                cursor: pointer;
                padding: 4px;
            ">←</button>
            <span style="
                font-size: 16px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            ">${escapeHtml(title || 'Text Viewer')}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <button onclick="openTextSettings()" style="
                background: none;
                border: none;
                color: var(--text-primary, #fff);
                font-size: 20px;
                cursor: pointer;
                padding: 4px;
            ">⚙️</button>
        </div>
    `;
    
    return header;
}

/**
 * 본문 콘텐츠 생성
 */
function createContent(textContent, metadata) {
    const content = document.createElement('div');
    content.id = 'textViewerContent';
    content.style.cssText = `
        max-width: 800px;
        margin: 0 auto;
        padding: 20px 24px 100px 24px;
        font-size: 18px;
        line-height: 1.9;
        word-break: keep-all;
        letter-spacing: 0.3px;
    `;
    
    // 표지 (있으면)
    if (metadata.coverUrl) {
        content.innerHTML += `
            <div style="
                text-align: center;
                margin-bottom: 40px;
                padding-top: 20px;
            ">
                <img src="${metadata.coverUrl}" alt="cover" style="
                    max-width: 200px;
                    max-height: 300px;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                ">
                <h1 style="
                    margin-top: 20px;
                    font-size: 24px;
                    font-weight: 600;
                ">${escapeHtml(metadata.name || '')}</h1>
            </div>
            <hr style="
                border: none;
                border-top: 1px solid var(--border-color, #2a2a2a);
                margin: 40px 0;
            ">
        `;
    }
    
    // 본문 텍스트
    const paragraphs = textContent
        .split(/\n/)
        .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '<br>';
            return `<p style="margin: 0 0 1em 0; text-indent: 1em;">${escapeHtml(trimmed)}</p>`;
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

// 페이지 모드용 (사용 안 함, 호환성 유지)
export function renderPage(pageIndex) {
    console.log('renderPage called but using scroll mode');
}

console.log('✅ TXT Renderer loaded (scroll mode)');
