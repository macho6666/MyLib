/**
 * viewer_modules/text/text_renderer.js
 * TXT 렌더링 (스크롤/클릭 모드, 1페이지/2페이지 레이아웃)
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { createCoverPage, createTOCPage } from './text_toc.js';
import { updateProgress, startAutoSave, stopAutoSave } from './text_bookmark.js';
import { openSettings } from './text_controls.js';

let headerVisible = false;
let readMode = 'scroll';
let pageLayout = '1page';
let headerAutoCloseTimer = null;
let currentSpreadIndex = 0;
let totalSpreads = 0;
let currentTextContent = '';
let currentMetadata = null;
let clickGuideVisible = false;
let clickGuideTimeout = null;

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
    if (imageContent) imageContent.style.display = 'none';
    
    const controls = document.getElementById('viewerControls');
    if (controls) controls.style.display = 'none';
    
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
    window.onTextThemeChange = onThemeChange;
    window.scrollToProgress = scrollToProgress;
    
    // 자동 저장 시작 (10초마다)
    startAutoSave(metadata.seriesId, metadata.bookId, 10000);
    
    Events.emit('text:open', { bookId: metadata.bookId, metadata });
    console.log(`📖 TXT Viewer opened (mode: ${readMode}, layout: ${pageLayout})`);
}

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
    
    if (pageLayout === '2page') {
        apply2PageTheme();
    }
}

export function onThemeChange() {
    if (pageLayout === '2page') {
        apply2PageTheme();
    }
}

function apply2PageTheme() {
    setTimeout(() => {
        const container = document.getElementById('textViewerContainer');
        if (!container) return;
        
        const computedStyle = getComputedStyle(container);
        const bgColor = computedStyle.backgroundColor || '#1c1c1c';
        const textColor = computedStyle.color || '#e8e8e8';
        const lightTheme = isLightColor(bgColor);
        const borderColor = lightTheme ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)';
        
        const book = document.getElementById('textBook');
        const leftPage = document.getElementById('textLeftPage');
        const rightPage = document.getElementById('textRightPage');
        
        if (book) book.style.background = bgColor;
        if (leftPage) {
            leftPage.style.background = bgColor;
            leftPage.style.color = textColor;
            leftPage.style.borderRight = `1px solid ${borderColor}`;
        }
        if (rightPage) {
            rightPage.style.background = bgColor;
            rightPage.style.color = textColor;
        }
    }, 10);
}

function isLightColor(color) {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128;
    }
    return false;
}

function applyContainerStyle(container) {
    const is2Page = pageLayout === '2page';
    container.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: var(--bg-primary, #0d0d0d);
        color: var(--text-primary, #e8e8e8);
        overflow-x: hidden;
        overflow-y: ${is2Page ? 'hidden' : (readMode === 'click' ? 'hidden' : 'auto')};
        z-index: 5001;
        -webkit-overflow-scrolling: touch;
        display: ${is2Page ? 'flex' : 'block'};
        align-items: ${is2Page ? 'center' : 'stretch'};
        justify-content: ${is2Page ? 'center' : 'stretch'};
    `;
}

function createToggleButton() {
    const existing = document.getElementById('textToggleBtn');
    if (existing) existing.remove();
    
    const btn = document.createElement('button');
    btn.id = 'textToggleBtn';
    btn.innerHTML = '☰';
    btn.onclick = () => {
        toggleHeader();
        if (readMode === 'click' && window.innerWidth >= 1024) {
            showClickGuide();
        }
    };
    btn.style.cssText = `
        position: fixed; top: 12px; right: 12px;
        width: 40px; height: 40px;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px; color: #fff; font-size: 20px;
        cursor: pointer; z-index: 5200;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(10px); transition: opacity 0.3s;
    `;
    document.body.appendChild(btn);
}

function createHeader(title) {
    const existing = document.getElementById('textViewerHeader');
    if (existing) existing.remove();
    
    const header = document.createElement('div');
    header.id = 'textViewerHeader';
    header.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; height: 56px;
        background: rgba(20, 20, 20, 0.95);
        border-bottom: 1px solid var(--border-color, #2a2a2a);
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 16px; z-index: 5150; backdrop-filter: blur(10px);
        transform: translateY(-100%); transition: transform 0.3s ease;
    `;
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <button onclick="closeViewer()" style="background: none; border: none; color: var(--text-primary, #fff); font-size: 20px; cursor: pointer; padding: 8px;">←</button>
            <span style="font-size: 16px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(title || 'Text Viewer')}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
            <span id="textProgressIndicator" style="font-size: 13px; color: var(--text-secondary, #999);">0%</span>
            <button onclick="saveTextBookmark()" style="background: none; border: none; color: var(--text-primary, #fff); font-size: 14px; cursor: pointer; padding: 6px;">Save</button>
            <button onclick="openTextSettings()" style="background: none; border: none; color: var(--text-primary, #fff); font-size: 14px; cursor: pointer; padding: 6px;">Set</button>
            <button onclick="toggleTextHeader()" style="background: none; border: none; color: var(--text-primary, #fff); font-size: 18px; cursor: pointer; padding: 6px;">x</button>
        </div>
    `;
    document.body.appendChild(header);
}

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

function showClickGuide() {
    let guide = document.getElementById('textClickGuide');
    if (!guide) {
        guide = document.createElement('div');
        guide.id = 'textClickGuide';
        guide.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 5100; pointer-events: none; display: flex; transition: opacity 0.3s;`;
        guide.innerHTML = `
            <div style="width: 20%; height: 100%; background: rgba(100, 150, 255, 0.15); display: flex; align-items: center; justify-content: center; border-right: 2px dashed rgba(100, 150, 255, 0.5);">
                <span style="color: rgba(255,255,255,0.8); font-size: 14px; background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 8px;">◀ 이전</span>
            </div>
            <div style="flex: 1; height: 100%;"></div>
            <div style="width: 20%; height: 100%; background: rgba(100, 150, 255, 0.15); display: flex; align-items: center; justify-content: center; border-left: 2px dashed rgba(100, 150, 255, 0.5);">
                <span style="color: rgba(255,255,255,0.8); font-size: 14px; background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 8px;">다음 ▶</span>
            </div>
        `;
        document.body.appendChild(guide);
    }
    guide.style.opacity = '1';
    guide.style.display = 'flex';
    clickGuideVisible = true;
    
    if (clickGuideTimeout) clearTimeout(clickGuideTimeout);
    clickGuideTimeout = setTimeout(() => hideClickGuide(), 3000);
}

function hideClickGuide() {
    const guide = document.getElementById('textClickGuide');
    if (guide) {
        guide.style.opacity = '0';
        setTimeout(() => { guide.style.display = 'none'; }, 300);
    }
    clickGuideVisible = false;
}

function create1PageContent(container, textContent, metadata) {
    const content = document.createElement('div');
    content.id = 'textViewerContent';
    content.style.cssText = `max-width: 800px; margin: 0 auto; padding: 24px 16px; font-size: 18px; line-height: 1.9; word-break: keep-all; letter-spacing: 0.3px; box-sizing: border-box; overflow-x: hidden; width: 100%;`;
    
    if (metadata.coverUrl) {
        content.innerHTML += `
            <div style="text-align: center; margin-bottom: 32px;">
                <img src="${metadata.coverUrl}" alt="cover" style="max-width: 180px; max-height: 260px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <h1 style="margin-top: 16px; font-size: 20px; font-weight: 600;">${escapeHtml(metadata.name || '')}</h1>
            </div>
            <hr style="border: none; border-top: 1px solid var(--border-color, #2a2a2a); margin: 32px 0;">
        `;
    }
    content.innerHTML += formatText(textContent);
    content.innerHTML += `<div style="text-align: center; padding: 40px 0; color: var(--text-tertiary, #666); font-size: 14px;">— 끝 —</div>`;
    container.appendChild(content);
}

function create2PageContent(container, textContent, metadata) {
    const pages = splitTextToPages(textContent, metadata);
    totalSpreads = Math.ceil(pages.length / 2);
    
    const bookWrapper = document.createElement('div');
    bookWrapper.id = 'textBookWrapper';
    bookWrapper.style.cssText = `display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; padding: 20px; box-sizing: border-box;`;
    
    const book = document.createElement('div');
    book.id = 'textBook';
    book.style.cssText = `display: flex; width: calc(100% - 80px); max-width: 1400px; height: calc(100vh - 80px); border-radius: 8px; box-shadow: 0 0 40px rgba(0,0,0,0.5), 0 0 100px rgba(0,0,0,0.3), inset 0 0 2px rgba(255,255,255,0.1); overflow: hidden; position: relative;`;
    
    const leftPage = document.createElement('div');
    leftPage.id = 'textLeftPage';
    leftPage.style.cssText = `flex: 1; height: 100%; padding: 40px 40px 50px 40px; overflow: hidden; font-size: 17px; line-height: 1.85; word-break: keep-all; letter-spacing: 0.3px; box-sizing: border-box; position: relative; border-right: 1px solid rgba(128,128,128,0.3);`;
    
    const rightPage = document.createElement('div');
    rightPage.id = 'textRightPage';
    rightPage.style.cssText = `flex: 1; height: 100%; padding: 40px 40px 50px 40px; overflow: hidden; font-size: 17px; line-height: 1.85; word-break: keep-all; letter-spacing: 0.3px; box-sizing: border-box; position: relative;`;
    
    book.appendChild(leftPage);
    book.appendChild(rightPage);
    bookWrapper.appendChild(book);
    container.appendChild(bookWrapper);
    container._pages = pages;
    
    renderSpread(0);
}

function splitTextToPages(textContent, metadata) {
    const pages = [];
    
    if (metadata.coverUrl) {
        pages.push({ type: 'cover', coverUrl: metadata.coverUrl, title: metadata.name });
        pages.push({ type: 'empty' });
    }
    
    const paragraphs = textContent.split(/\n/).filter(line => line.trim());
    const linesPerPage = 15;
    let currentLines = [];
    
    paragraphs.forEach(para => {
        const trimmed = para.trim();
        if (!trimmed) return;
        
        const estimatedLines = Math.ceil(trimmed.length / 35);
        
        if (currentLines.length + estimatedLines > linesPerPage) {
            if (currentLines.length > 0) {
                pages.push({ type: 'text', content: currentLines.join('\n\n') });
            }
            currentLines = [trimmed];
        } else {
            currentLines.push(trimmed);
        }
    });
    
    if (currentLines.length > 0) {
        pages.push({ type: 'text', content: currentLines.join('\n\n') });
    }
    
    pages.push({ type: 'end' });
    if (pages.length % 2 !== 0) pages.push({ type: 'empty' });
    
    return pages;
}

function renderSpread(spreadIndex) {
    const container = document.getElementById('textViewerContainer');
    const leftPage = document.getElementById('textLeftPage');
    const rightPage = document.getElementById('textRightPage');
    
    if (!container || !leftPage || !rightPage) return;
    
    const pages = container._pages || [];
    const leftIdx = spreadIndex * 2;
    const rightIdx = spreadIndex * 2 + 1;
    
    renderSinglePage(leftPage, pages[leftIdx], leftIdx + 1, 'left');
    renderSinglePage(rightPage, pages[rightIdx], rightIdx + 1, 'right');
    
    currentSpreadIndex = spreadIndex;
    const progress = totalSpreads > 1 ? Math.round((spreadIndex / (totalSpreads - 1)) * 100) : 100;
    updateProgressIndicator(progress);
}

function renderSinglePage(pageEl, pageData, pageNumber, side) {
    pageEl.innerHTML = '';
    if (!pageData) return;
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; height: 100%; box-sizing: border-box;';
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 40px; overflow: hidden; box-sizing: border-box;';
    
    const pageNumDiv = document.createElement('div');
    pageNumDiv.style.cssText = `position: absolute; bottom: 10px; ${side === 'left' ? 'left: 0;' : 'right: 0;'} font-size: 12px; color: var(--text-tertiary, #666);`;
    
    switch (pageData.type) {
        case 'cover':
            contentDiv.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center;">
                    <img src="${pageData.coverUrl}" alt="cover" style="max-width: 200px; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <h1 style="margin-top: 24px; font-size: 22px; font-weight: 600;">${escapeHtml(pageData.title || '')}</h1>
                </div>
            `;
            break;
        case 'text':
            contentDiv.innerHTML = formatText(pageData.content);
            pageNumDiv.textContent = pageNumber;
            break;
        case 'end':
            contentDiv.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-tertiary, #666); font-size: 16px;">— 끝 —</div>`;
            pageNumDiv.textContent = pageNumber;
            break;
    }
    
    wrapper.appendChild(contentDiv);
    wrapper.appendChild(pageNumDiv);
    pageEl.appendChild(wrapper);
}

function formatText(text) {
    if (!text) return '';
    return text.split(/\n/).map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '<br>';
        return `<p style="margin: 0 0 0.8em 0; text-indent: 1em;">${escapeHtml(trimmed)}</p>`;
    }).join('');
}

function setupInteraction(container) {
    container.onclick = null;
    container.onwheel = null;
    container.ontouchstart = null;
    container.ontouchend = null;
    
    if (pageLayout === '2page') {
        setup2PageInteraction(container);
    } else if (readMode === 'click') {
        setupClickZones(container);
    }
}

function setup2PageInteraction(container) {
    if (readMode === 'scroll') {
        container.onwheel = (e) => {
            e.preventDefault();
            navigate2Page(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
        };
        
        let touchStartX = 0, touchStartY = 0;
        container.ontouchstart = (e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; };
        container.ontouchend = (e) => {
            const diffX = touchStartX - e.changedTouches[0].clientX;
            const diffY = touchStartY - e.changedTouches[0].clientY;
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) navigate2Page(diffX > 0 ? 1 : -1);
            else if (Math.abs(diffY) > 50) navigate2Page(diffY > 0 ? 1 : -1);
        };
    }
    
    if (readMode === 'click') {
        container.onclick = (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
            const clickX = e.clientX - container.getBoundingClientRect().left;
            const width = container.getBoundingClientRect().width;
            if (clickX < width * 0.2) navigate2Page(-1);
            else if (clickX > width * 0.8) navigate2Page(1);
        };
    }
}

function navigate2Page(direction) {
    const newIndex = currentSpreadIndex + direction;
    if (newIndex >= 0 && newIndex < totalSpreads) renderSpread(newIndex);
}

function setupClickZones(container) {
    container.onclick = (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
        const clickX = e.clientX - container.getBoundingClientRect().left;
        const width = container.getBoundingClientRect().width;
        if (clickX < width * 0.2) scrollPageAmount(-1);
        else if (clickX > width * 0.8) scrollPageAmount(1);
    };
}

function scrollPageAmount(direction) {
    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    const scrollAmount = container.clientHeight * 0.9;
    if (readMode === 'click') {
        container.style.scrollBehavior = 'auto';
        container.scrollTop += direction * scrollAmount;
    } else {
        container.scrollBy({ top: direction * scrollAmount, behavior: 'smooth' });
    }
}

function setupKeyboardNavigation() {
    if (window._textKeyHandler) document.removeEventListener('keydown', window._textKeyHandler);
    
    window._textKeyHandler = (e) => {
        const container = document.getElementById('textViewerContainer');
        if (!container || container.style.display === 'none') return;
        
        switch (e.key) {
            case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
                e.preventDefault(); navigatePage(-1); break;
            case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ':
                e.preventDefault(); navigatePage(1); break;
            case 'Home': e.preventDefault(); goToStart(); break;
            case 'End': e.preventDefault(); goToEnd(); break;
            case 'Escape': if (typeof closeViewer === 'function') closeViewer(); break;
        }
    };
    document.addEventListener('keydown', window._textKeyHandler);
}

function navigatePage(direction) {
    if (pageLayout === '2page') navigate2Page(direction);
    else scrollPageAmount(direction);
}

function goToStart() {
    if (pageLayout === '2page') renderSpread(0);
    else document.getElementById('textViewerContainer').scrollTop = 0;
}

function goToEnd() {
    if (pageLayout === '2page') renderSpread(totalSpreads - 1);
    else { const c = document.getElementById('textViewerContainer'); c.scrollTop = c.scrollHeight; }
}

function updateProgressIndicator(progress) {
    const indicator = document.getElementById('textProgressIndicator');
    if (indicator) indicator.textContent = progress + '%';
    TextViewerState.scrollProgress = progress;
}

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
                if (progress % 5 === 0) updateProgress(metadata.seriesId, metadata.bookId);
                ticking = false;
            });
            ticking = true;
        }
    });
}

function setReadMode(mode) {
    readMode = mode || (readMode === 'scroll' ? 'click' : 'scroll');
    localStorage.setItem('mylib_text_readmode', readMode);
    
    const container = document.getElementById('textViewerContainer');
    if (container) { applyContainerStyle(container); setupInteraction(container); }
    
    applyTheme(); applyTypography();
    if (pageLayout === '2page') apply2PageTheme();
    updateReadModeUI();
    if (window.showToast) window.showToast(readMode === 'scroll' ? 'Scroll Mode' : 'Click Mode');
}

function setTextLayout(layout) {
    const currentProgress = TextViewerState.scrollProgress || 0;
    pageLayout = layout;
    localStorage.setItem('text_layout', layout);
    
    const container = document.getElementById('textViewerContainer');
    if (container) container.style.visibility = 'hidden';
    
    renderContent();
    
    if (layout === '1page') {
        requestAnimationFrame(() => { scrollToProgress(currentProgress); if (container) container.style.visibility = 'visible'; });
    } else {
        scrollToProgress(currentProgress);
        if (container) container.style.visibility = 'visible';
    }
    if (window.showToast) window.showToast(layout === '2page' ? '2 Page Mode' : '1 Page Mode');
}

function getTextLayout() { return pageLayout; }

function updateReadModeUI() {
    const scrollBtn = document.getElementById('btnModeScroll');
    const clickBtn = document.getElementById('btnModeClick');
    if (scrollBtn) scrollBtn.classList.toggle('active', readMode === 'scroll');
    if (clickBtn) clickBtn.classList.toggle('active', readMode === 'click');
}

export function scrollToPosition(position) {
    const container = document.getElementById('textViewerContainer');
    if (container && position) {
        if (pageLayout === '2page') { if (position < totalSpreads) renderSpread(Math.floor(position)); }
        else container.scrollTop = position;
    }
}

export function scrollToProgress(percent) {
    if (pageLayout === '2page') {
        const spreadIndex = Math.round((percent / 100) * (totalSpreads - 1));
        renderSpread(Math.max(0, Math.min(spreadIndex, totalSpreads - 1)));
    } else {
        const container = document.getElementById('textViewerContainer');
        if (container) container.scrollTop = (percent / 100) * (container.scrollHeight - container.clientHeight);
    }
}

export function cleanupTextRenderer() {
    // 자동 저장 중지
    stopAutoSave();
    
    headerVisible = false; currentSpreadIndex = 0; totalSpreads = 0;
    currentTextContent = ''; currentMetadata = null;
    
    if (headerAutoCloseTimer) { clearTimeout(headerAutoCloseTimer); headerAutoCloseTimer = null; }
    if (clickGuideTimeout) { clearTimeout(clickGuideTimeout); clickGuideTimeout = null; }
    if (window._textKeyHandler) { document.removeEventListener('keydown', window._textKeyHandler); delete window._textKeyHandler; }
    
    document.body.style.overflow = '';
    ['textToggleBtn', 'textViewerHeader', 'textClickGuide'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
    
    const imageContent = document.getElementById('viewerContent');
    if (imageContent) imageContent.style.display = '';
    const controls = document.getElementById('viewerControls');
    if (controls) controls.style.display = '';
    
    const container = document.getElementById('textViewerContainer');
    if (container) { container.onclick = null; container.onwheel = null; container.ontouchstart = null; container.ontouchend = null; container._pages = null; }
    
    delete window.openTextSettings; delete window.toggleTextHeader;
    delete window.setTextReadMode; delete window.getTextReadMode;
    delete window.setTextLayout; delete window.getTextLayout;
    delete window.onTextThemeChange; delete window.scrollToProgress;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function renderPage(pageIndex) { console.log('renderPage called but using scroll mode'); }

console.log('✅ TXT Renderer loaded');
