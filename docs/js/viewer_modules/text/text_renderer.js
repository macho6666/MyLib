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
let currentSpreadIndex = 0;
let totalSpreads = 0;
let currentTextContent = '';
let currentMetadata = null;

/**
 * TXT 뷰어 초기화 및 렌더링
 */
export async function renderTxt(textContent, metadata) {
    TextViewerState.renderType = 'txt';
    TextViewerState.currentBook = metadata;
    headerVisible = false;
    currentSpreadIndex = 0;
    currentTextContent = textContent;
    currentMetadata = metadata;
    
    readMode = localStorage.getItem('mylib_text_readmode') || 'scroll';
    
    if (window.innerWidth >= 1024) {
        pageLayout = localStorage.getItem('text_layout') || '1page';
    } else {
        pageLayout = '1page';
    }
    
    const viewer = document.getElementById('viewerOverlay');
    viewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    const imageContent = document.getElementById('viewerContent');
    if (imageContent) {
        imageContent.style.display = 'none';
    }
    
    const controls = document.getElementById('viewerControls');
    if (controls) {
        controls.style.display = 'none';
    }
    
    let container = document.getElementById('textViewerContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'textViewerContainer';
        viewer.appendChild(container);
    }
    
    renderContent();
    
    createToggleButton();
    createHeader(metadata.name);
    setupKeyboardNavigation();
    
    window.openTextSettings = openSettings;
    window.toggleTextHeader = toggleHeader;
    window.setTextReadMode = setReadMode;
    window.getTextReadMode = () => readMode;
    window.setTextLayout = setTextLayout;
    window.getTextLayout = getTextLayout;
    
    Events.emit('text:open', { bookId: metadata.bookId, metadata });
    
    console.log(`📖 TXT Viewer opened (mode: ${readMode}, layout: ${pageLayout})`);
}

/**
 * 콘텐츠 렌더링
 */
function renderContent() {
    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    
    applyContainerStyle(container);
    
    container.innerHTML = '';
    
    if (pageLayout === '2page') {
        create2PageContent(container, currentTextContent, currentMetadata);
    } else {
        create1PageContent(container, currentTextContent, currentMetadata);
    }
    
    setupInteraction(container);
    
    if (pageLayout === '1page') {
        setupScrollTracking(container, currentMetadata);
    }
    
    applyTheme();
    applyTypography();
    
    // 2페이지 모드 테마 강제 적용
    if (pageLayout === '2page') {
        apply2PageTheme();
    }
}

/**
 * 2페이지 모드 테마 강제 적용
 */
function apply2PageTheme() {
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#1c1c1c';
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#e8e8e8';
    
    const book = document.getElementById('textBook');
    const leftPage = document.getElementById('textLeftPage');
    const rightPage = document.getElementById('textRightPage');
    
    if (book) book.style.background = bgColor;
    if (leftPage) {
        leftPage.style.background = bgColor;
        leftPage.style.color = textColor;
    }
    if (rightPage) {
        rightPage.style.background = bgColor;
        rightPage.style.color = textColor;
    }
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
        display: ${is2Page ? 'flex' : 'block'};
        align-items: ${is2Page ? 'center' : 'stretch'};
        justify-content: ${is2Page ? 'center' : 'stretch'};
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
 * 1페이지 콘텐츠 생성
 */
function create1PageContent(container, textContent, metadata) {
    const content = document.createElement('div');
    content.id = 'textViewerContent';
    
    content.style.cssText = `
        max-width: 800px;
        margin: 0 auto;
        padding: 24px 16px;
        font-size: 18px;
        line-height: 1.9;
        word-break: keep-all;
        letter-spacing: 0.3px;
        box-sizing: border-box;
    `;
    
    if (metadata.coverUrl) {
        content.innerHTML += `
            <div style="text-align: center; margin-bottom: 32px;">
                <img src="${metadata.coverUrl}" alt="cover" style="
                    max-width: 180px;
                    max-height: 260px;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                ">
                <h1 style="margin-top: 16px; font-size: 20px; font-weight: 600;">
                    ${escapeHtml(metadata.name || '')}
                </h1>
            </div>
            <hr style="border: none; border-top: 1px solid var(--border-color, #2a2a2a); margin: 32px 0;">
        `;
    }
    
    content.innerHTML += formatText(textContent);
    
    content.innerHTML += `
        <div style="text-align: center; padding: 40px 0; color: var(--text-tertiary, #666); font-size: 14px;">
            — 끝 —
        </div>
    `;
    
    container.appendChild(content);
}

/**
 * 2페이지 콘텐츠 생성
 */
function create2PageContent(container, textContent, metadata) {
    const pages = splitTextToPages(textContent, metadata);
    totalSpreads = Math.ceil(pages.length / 2);
    
    const bookWrapper = document.createElement('div');
    bookWrapper.id = 'textBookWrapper';
    bookWrapper.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        padding: 20px;
        box-sizing: border-box;
    `;
    
    const book = document.createElement('div');
    book.id = 'textBook';
    book.style.cssText = `
        display: flex;
        width: calc(100% - 80px);
        max-width: 1400px;
        height: calc(100vh - 80px);
        border-radius: 8px;
        box-shadow: 
            0 0 40px rgba(0,0,0,0.5),
            0 0 100px rgba(0,0,0,0.3),
            inset 0 0 2px rgba(255,255,255,0.1);
        overflow: hidden;
        position: relative;
    `;
    
    const binding = document.createElement('div');
    binding.style.cssText = `
        position: absolute;
        left: 50%;
        top: 20px;
        bottom: 20px;
        width: 1px;
        transform: translateX(-50%);
        background: rgba(255,255,255,0.08);
        z-index: 10;
        pointer-events: none;
    `;
    
    const leftPage = document.createElement('div');
    leftPage.id = 'textLeftPage';
    leftPage.style.cssText = `
        flex: 1;
        height: 100%;
        padding: 40px 50px 50px 40px;
        overflow: hidden;
        font-size: 17px;
        line-height: 1.85;
        word-break: keep-all;
        letter-spacing: 0.3px;
        box-sizing: border-box;
        border-right: 1px solid rgba(255,255,255,0.05);
        position: relative;
    `;
    
    const rightPage = document.createElement('div');
    rightPage.id = 'textRightPage';
    rightPage.style.cssText = `
        flex: 1;
        height: 100%;
        padding: 40px 40px 50px 50px;
        overflow: hidden;
        font-size: 17px;
        line-height: 1.85;
        word-break: keep-all;
        letter-spacing: 0.3px;
        box-sizing: border-box;
        position: relative;
    `;
    
    const pageNumStyle = `
        position: absolute;
        bottom: 20px;
        font-size: 12px;
        color: var(--text-tertiary, #666);
        z-index: 1;
    `;
    
    const leftPageNum = document.createElement('div');
    leftPageNum.id = 'textLeftPageNum';
    leftPageNum.style.cssText = pageNumStyle + 'left: 40px;';
    
    const rightPageNum = document.createElement('div');
    rightPageNum.id = 'textRightPageNum';
    rightPageNum.style.cssText = pageNumStyle + 'right: 40px;';
    
    leftPage.appendChild(leftPageNum);
    rightPage.appendChild(rightPageNum);
    
    book.appendChild(leftPage);
    book.appendChild(binding);
    book.appendChild(rightPage);
    bookWrapper.appendChild(book);
    container.appendChild(bookWrapper);
    
    container._pages = pages;
    
    renderSpread(0);
}

/**
 * 텍스트를 페이지로 분할
 */
function splitTextToPages(textContent, metadata) {
    const pages = [];
    
    if (metadata.coverUrl) {
        pages.push({
            type: 'cover',
            coverUrl: metadata.coverUrl,
            title: metadata.name
        });
        pages.push({ type: 'empty' });
    }
    
    const paragraphs = textContent.split(/\n/).filter(line => line.trim());
    
    const charsPerPage = 800;
    let currentPageText = '';
    
    paragraphs.forEach(para => {
        const trimmed = para.trim();
        if (!trimmed) return;
        
        if (currentPageText.length + trimmed.length > charsPerPage) {
            if (currentPageText) {
                pages.push({ type: 'text', content: currentPageText });
            }
            currentPageText = trimmed;
        } else {
            currentPageText += (currentPageText ? '\n\n' : '') + trimmed;
        }
    });
    
    if (currentPageText) {
        pages.push({ type: 'text', content: currentPageText });
    }
    
    pages.push({ type: 'end' });
    
    if (pages.length % 2 !== 0) {
        pages.push({ type: 'empty' });
    }
    
    return pages;
}

/**
 * 스프레드 렌더링
 */
function renderSpread(spreadIndex) {
    const container = document.getElementById('textViewerContainer');
    const leftPage = document.getElementById('textLeftPage');
    const rightPage = document.getElementById('textRightPage');
    const leftPageNum = document.getElementById('textLeftPageNum');
    const rightPageNum = document.getElementById('textRightPageNum');
    
    if (!container || !leftPage || !rightPage) return;
    
    const pages = container._pages || [];
    const leftIdx = spreadIndex * 2;
    const rightIdx = spreadIndex * 2 + 1;
    
    renderSinglePage(leftPage, pages[leftIdx], leftPageNum, leftIdx + 1);
    renderSinglePage(rightPage, pages[rightIdx], rightPageNum, rightIdx + 1);
    
    currentSpreadIndex = spreadIndex;
    
    const progress = totalSpreads > 1 ? Math.round((spreadIndex / (totalSpreads - 1)) * 100) : 100;
    updateProgressIndicator(progress);
}

/**
 * 단일 페이지 렌더링
 */
function renderSinglePage(pageEl, pageData, pageNumEl, pageNumber) {
    const children = Array.from(pageEl.children);
    children.forEach(child => {
        if (child !== pageNumEl) {
            child.remove();
        }
    });
    
    if (!pageData) {
        pageNumEl.textContent = '';
        return;
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'height: 100%; padding-bottom: 50px; overflow: hidden; position: relative; z-index: 2; box-sizing: border-box;';
    
    switch (pageData.type) {
        case 'cover':
            contentDiv.innerHTML = `
                <div style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    text-align: center;
                ">
                    <img src="${pageData.coverUrl}" alt="cover" style="
                        max-width: 200px;
                        max-height: 300px;
                        border-radius: 8px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    ">
                    <h1 style="
                        margin-top: 24px;
                        font-size: 22px;
                        font-weight: 600;
                    ">${escapeHtml(pageData.title || '')}</h1>
                </div>
            `;
            pageNumEl.textContent = '';
            break;
            
        case 'text':
            contentDiv.innerHTML = formatText(pageData.content);
            pageNumEl.textContent = pageNumber;
            break;
            
        case 'end':
            contentDiv.innerHTML = `
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: var(--text-tertiary, #666);
                    font-size: 16px;
                ">
                    — 끝 —
                </div>
            `;
            pageNumEl.textContent = pageNumber;
            break;
            
        case 'empty':
        default:
            pageNumEl.textContent = '';
            break;
    }
    
    pageEl.insertBefore(contentDiv, pageNumEl);
}

/**
 * 텍스트 포맷팅
 */
function formatText(text) {
    if (!text) return '';
    
    return text
        .split(/\n/)
        .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '<br>';
            return `<p style="margin: 0 0 0.8em 0; text-indent: 1em;">${escapeHtml(trimmed)}</p>`;
        })
        .join('');
}

/**
 * 인터랙션 설정
 */
function setupInteraction(container) {
    container.onclick = null;
    container.onwheel = null;
    container.ontouchstart = null;
    container.ontouchend = null;
    
    if (pageLayout === '2page') {
        setup2PageInteraction(container);
    } else {
        if (readMode === 'click') {
            setupClickZones(container);
        }
    }
}

/**
 * 2페이지 인터랙션 설정
 */
function setup2PageInteraction(container) {
    if (readMode === 'scroll') {
        container.onwheel = (e) => {
            e.preventDefault();
            if (e.deltaY > 0 || e.deltaX > 0) {
                navigate2Page(1);
            } else if (e.deltaY < 0 || e.deltaX < 0) {
                navigate2Page(-1);
            }
        };
        
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
            
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                navigate2Page(diffX > 0 ? 1 : -1);
            } else if (Math.abs(diffY) > 50) {
                navigate2Page(diffY > 0 ? 1 : -1);
            }
        };
    }
    
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
    const newIndex = currentSpreadIndex + direction;
    
    if (newIndex < 0 || newIndex >= totalSpreads) {
        return;
    }
    
    renderSpread(newIndex);
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
 * 페이지 네비게이션
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
    if (pageLayout === '2page') {
        renderSpread(0);
    } else {
        const container = document.getElementById('textViewerContainer');
        if (container) container.scrollTop = 0;
    }
}

/**
 * 끝으로
 */
function goToEnd() {
    if (pageLayout === '2page') {
        renderSpread(totalSpreads - 1);
    } else {
        const container = document.getElementById('textViewerContainer');
        if (container) container.scrollTop = container.scrollHeight;
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
    
    applyTheme();
    applyTypography();
    
    if (pageLayout === '2page') {
        apply2PageTheme();
    }
    
    updateReadModeUI();
    
    const modeText = readMode === 'scroll' ? 'Scroll Mode' : 'Click Mode';
    if (window.showToast) window.showToast(modeText);
}

/**
 * 레이아웃 변경
 */
function setTextLayout(layout) {
    const currentProgress = TextViewerState.scrollProgress || 0;
    
    pageLayout = layout;
    localStorage.setItem('text_layout', layout);
    
    renderContent();
    
    setTimeout(() => {
        scrollToProgress(currentProgress);
    }, 100);
    
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
            const spreadIndex = Math.floor(position);
            if (spreadIndex < totalSpreads) {
                renderSpread(spreadIndex);
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
    if (pageLayout === '2page') {
        const spreadIndex = Math.round((percent / 100) * (totalSpreads - 1));
        renderSpread(Math.max(0, Math.min(spreadIndex, totalSpreads - 1)));
    } else {
        const container = document.getElementById('textViewerContainer');
        if (container) {
            const scrollHeight = container.scrollHeight - container.clientHeight;
            container.scrollTop = (percent / 100) * scrollHeight;
        }
    }
}

/**
 * 텍스트 뷰어 정리
 */
export function cleanupTextRenderer() {
    headerVisible = false;
    currentSpreadIndex = 0;
    totalSpreads = 0;
    currentTextContent = '';
    currentMetadata = null;
    
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
    
    const container = document.getElementById('textViewerContainer');
    if (container) {
        container.onclick = null;
        container.onwheel = null;
        container.ontouchstart = null;
        container.ontouchend = null;
        container._pages = null;
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

export function renderPage(pageIndex) {
    console.log('renderPage called but using scroll mode');
}

console.log('✅ TXT Renderer loaded');
