/**
 * viewer_modules/text/text_renderer.js
 * TXT 렌더링 (스크롤/클릭 모드, 1페이지/2페이지 레이아웃)
 * ✅ 최적화: 샘플링 기반 페이지 분할 + 여백 반영
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { createCoverPage, createTOCPage } from './text_toc.js';
import { updateProgress, startAutoSave, stopAutoSave, saveOnClose } from './text_bookmark.js';
import { openSettings } from './text_controls.js';
import { initHighlights, cleanupHighlights, restoreHighlights } from './text_highlight.js';

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

export async function renderTxt(textContent, metadata) {
    const renderStart = performance.now();
    
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
    
    initHighlights();
    
    window.openTextSettings = openSettings;
    window.toggleTextHeader = toggleHeader;
    window.setTextReadMode = setReadMode;
    window.getTextReadMode = () => readMode;
    window.setTextLayout = setTextLayout;
    window.getTextLayout = getTextLayout;
    window.onTextThemeChange = onThemeChange;
    window.scrollToProgress = scrollToProgress;
    window.rerenderTextContent = function() {
        const currentProgress = TextViewerState.scrollProgress || 0;
        renderContent();
        if (pageLayout === '2page') {
            var spreadIndex = Math.round((currentProgress / 100) * (totalSpreads - 1));
            renderSpread(Math.max(0, Math.min(spreadIndex, totalSpreads - 1)));
        }
    };
    
    startAutoSave(metadata.seriesId, metadata.bookId, 10000);
    
    const saved = localStorage.getItem('progress_' + metadata.seriesId);
    if (saved) {
        const progressData = JSON.parse(saved);
        const bookProgress = progressData[metadata.bookId];
        if (bookProgress && bookProgress.progress > 0) {
            requestAnimationFrame(function() {
                scrollToProgress(bookProgress.progress);
                console.log('📖 Restored to ' + bookProgress.progress + '%');
            });
        }
    }
    
    Events.emit('text:open', { bookId: metadata.bookId, metadata });
    console.log('📖 TXT Viewer opened (mode: ' + readMode + ', layout: ' + pageLayout + ')');
    console.log(`⏱️ [RENDER TOTAL] ${(performance.now() - renderStart).toFixed(2)}ms`);
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
    
    setTimeout(function() {
        restoreHighlights();
    }, 50);
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
            leftPage.style.borderRight = '1px solid ' + borderColor;
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
    const marginTop = is2Page ? 0 : parseInt(localStorage.getItem('text_padding_top') || '24');
    const marginBottom = is2Page ? 0 : parseInt(localStorage.getItem('text_padding_bottom') || '24');

    container.style.position = 'fixed';
    container.style.top = marginTop + 'px';
    container.style.left = '0';
    container.style.right = '0';
    container.style.bottom = marginBottom + 'px';
    container.style.height = 'auto';
    container.style.background = 'var(--bg-primary, #0d0d0d)';
    container.style.color = 'var(--text-primary, #e8e8e8)';
    container.style.overflowX = 'hidden';
    if (readMode === 'click' && !is2Page) {
        container.style.overflowY = 'clip';
        container.style.willChange = 'scroll-position';
    } else if (is2Page) {
        container.style.overflowY = 'hidden';
    } else {
        container.style.overflowY = 'auto';
    }
    container.style.zIndex = '5001';
    container.style.webkitOverflowScrolling = 'touch';
    container.style.display = is2Page ? 'flex' : 'block';
    container.style.alignItems = is2Page ? 'center' : 'stretch';
    container.style.justifyContent = is2Page ? 'center' : 'stretch';
    container.style.userSelect = 'text';
    container.style.webkitUserSelect = 'text';
    container.style.boxSizing = 'border-box';

    if (!is2Page) {
        const oldRight = document.getElementById('rightShadowOverlay');
        if (oldRight) oldRight.remove();

        let shadowOverlay = document.getElementById('leftShadowOverlay');

        if (!shadowOverlay) {
            shadowOverlay = document.createElement('div');
            shadowOverlay.id = 'leftShadowOverlay';
            shadowOverlay.style.position = 'fixed';
            shadowOverlay.style.top = '0';
            shadowOverlay.style.left = 'calc(50% - 400px)';
            shadowOverlay.style.width = '800px';
            shadowOverlay.style.height = '100vh';
            shadowOverlay.style.boxShadow = 'rgba(0, 0, 0, 0.3) 0px 4px 20px 0px';
            shadowOverlay.style.pointerEvents = 'none';
            shadowOverlay.style.zIndex = '5050';
            document.body.appendChild(shadowOverlay);
        }
    } else {
        const shadowOverlay = document.getElementById('leftShadowOverlay');
        if (shadowOverlay) shadowOverlay.remove();
    }
}

function createToggleButton() {
    const existing = document.getElementById('textToggleBtn');
    if (existing) existing.remove();
    
    const btn = document.createElement('button');
    btn.id = 'textToggleBtn';
    btn.innerHTML = '☰';
    btn.onclick = function() {
        toggleHeader();
        if (readMode === 'click' && window.innerWidth >= 1024) {
            showClickGuide();
        }
    };
    btn.style.cssText = 
        'position: fixed; top: 12px; right: 12px;' +
        'width: 40px; height: 40px;' +
        'background: rgba(0, 0, 0, 0.5);' +
        'border: 1px solid rgba(255, 255, 255, 0.2);' +
        'border-radius: 8px; color: #fff; font-size: 20px;' +
        'cursor: pointer; z-index: 5200;' +
        'display: flex; align-items: center; justify-content: center;' +
        'backdrop-filter: blur(10px); transition: opacity 0.3s;';
    document.body.appendChild(btn);
}

function createHeader(title) {
    const existing = document.getElementById('textViewerHeader');
    if (existing) existing.remove();
    
    const header = document.createElement('div');
    header.id = 'textViewerHeader';
    header.style.cssText = 
        'position: fixed; top: 0; left: 0; right: 0; height: 56px;' +
        'background: rgba(20, 20, 20, 0.95);' +
        'border-bottom: 1px solid var(--border-color, #2a2a2a);' +
        'display: flex; align-items: center; justify-content: space-between;' +
        'padding: 0 16px; z-index: 5150; backdrop-filter: blur(10px);' +
        'transform: translateY(-100%); transition: transform 0.3s ease;';
    
    header.innerHTML = 
        '<div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">' +
            '<button id="btnHeaderBack" class="text-header-btn back-btn">Back</button>' +
            '<span id="textViewerTitle" class="header-title">' + escapeHtml(title || 'Text Viewer') + '</span>' +
        '</div>' +
        '<div style="display: flex; align-items: center; gap: 4px;">' +
            '<span id="textProgressIndicator" style="font-size: 13px; color: #999;">0%</span>' +
            '<button id="btnHeaderSave" class="text-header-btn">Save</button>' +
            '<button id="btnHeaderSet" class="text-header-btn">Set</button>' +
            '<button id="btnHeaderClose" class="text-header-btn" style="font-size: 18px;">×</button>' +
        '</div>';

    document.body.appendChild(header);

    document.getElementById('btnHeaderBack').onclick = function() { if (typeof closeViewer === 'function') closeViewer(); };
    document.getElementById('btnHeaderSave').onclick = function() { if (typeof saveTextBookmark === 'function') saveTextBookmark(); };
    document.getElementById('btnHeaderSet').onclick = function() { if (typeof openTextSettings === 'function') openTextSettings(); };
    document.getElementById('btnHeaderClose').onclick = function() { toggleHeader(); };

    header.querySelectorAll('.text-header-btn').forEach(function(btn) {
        btn.onmouseenter = function() { this.style.color = '#4a9eff'; };
        btn.onmouseleave = function() { this.style.color = '#888'; };
    });

    var titleEl = document.getElementById('textViewerTitle');
    if (titleEl) {
        titleEl.onclick = function() {
            if (this.classList.contains('expanded')) {
                this.classList.remove('expanded');
            } else {
                this.classList.add('expanded');
            }
        };
    }

    if (!document.getElementById('textHeaderStyle')) {
        var headerStyle = document.createElement('style');
        headerStyle.id = 'textHeaderStyle';
        headerStyle.textContent = 
            '.text-header-btn {' +
                'background: none !important;' +
                'border: none !important;' +
                'color: #888 !important;' +
                'font-size: 14px;' +
                'cursor: pointer;' +
                'padding: 8px 10px;' +
                'border-radius: 6px;' +
                'transition: color 0.2s ease;' +
            '}' +
            '.text-header-btn:hover {' +
                'color: #4a9eff !important;' +
                'background: none !important;' +
            '}' +
            '.back-btn {' +
                'display: flex !important;' +
                'align-items: center;' +
                'gap: 4px;' +
            '}' +
            '.back-btn::before {' +
                'content: "";' +
                'display: inline-block;' +
                'width: 8px;' +
                'height: 8px;' +
                'border-left: 2px solid currentColor;' +
                'border-bottom: 2px solid currentColor;' +
                'transform: rotate(45deg);' +
            '}' +
            '.header-title {' +
                'font-size: 16px;' +
                'font-weight: 500;' +
                'white-space: nowrap;' +
                'overflow: hidden;' +
                'text-overflow: ellipsis;' +
                'cursor: pointer;' +
                'max-width: calc(100vw - 280px);' +
                'transition: all 0.3s ease;' +
            '}' +
            '.header-title.expanded {' +
                'white-space: normal;' +
                'overflow: visible;' +
                'position: absolute;' +
                'left: 70px;' +
                'top: 56px;' +
                'max-width: calc(100vw - 40px);' +
                'background: rgba(20, 20, 20, 0.95);' +
                'padding: 12px 16px;' +
                'border-radius: 8px;' +
                'box-shadow: 0 4px 12px rgba(0,0,0,0.3);' +
                'z-index: 5160;' +
            '}';
        document.head.appendChild(headerStyle);
    }
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
        if (toggleBtn) toggleBtn.style.display = 'none';
        headerAutoCloseTimer = setTimeout(function() {
            headerVisible = false;
            header.style.transform = 'translateY(-100%)';
            if (toggleBtn) toggleBtn.style.display = 'flex';
            headerAutoCloseTimer = null;
        }, 3000);
    } else {
        header.style.transform = 'translateY(-100%)';
        if (toggleBtn) toggleBtn.style.display = 'flex';
    }
}

function showClickGuide() {
    let guide = document.getElementById('textClickGuide');
    if (!guide) {
        guide = document.createElement('div');
        guide.id = 'textClickGuide';
        guide.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 5100; pointer-events: none; display: flex; transition: opacity 0.3s;';
        guide.innerHTML = 
            '<div style="width: 20%; height: 100%; background: rgba(100, 150, 255, 0.15); display: flex; align-items: center; justify-content: center; border-right: 2px dashed rgba(100, 150, 255, 0.5);">' +
                '<span style="color: rgba(255,255,255,0.8); font-size: 14px; background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 8px;">◀ 이전</span>' +
            '</div>' +
            '<div style="flex: 1; height: 100%;"></div>' +
            '<div style="width: 20%; height: 100%; background: rgba(100, 150, 255, 0.15); display: flex; align-items: center; justify-content: center; border-left: 2px dashed rgba(100, 150, 255, 0.5);">' +
                '<span style="color: rgba(255,255,255,0.8); font-size: 14px; background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 8px;">다음 ▶</span>' +
            '</div>';
        document.body.appendChild(guide);
    }
    guide.style.opacity = '1';
    guide.style.display = 'flex';
    clickGuideVisible = true;
    
    if (clickGuideTimeout) clearTimeout(clickGuideTimeout);
    clickGuideTimeout = setTimeout(function() { hideClickGuide(); }, 3000);
}

function hideClickGuide() {
    const guide = document.getElementById('textClickGuide');
    if (guide) {
        guide.style.opacity = '0';
        setTimeout(function() { guide.style.display = 'none'; }, 300);
    }
    clickGuideVisible = false;
}

function create1PageContent(container, textContent, metadata) {
    const paddingTop = localStorage.getItem('text_padding_top') || '24';
    const paddingBottom = localStorage.getItem('text_padding_bottom') || '24';
    
    const content = document.createElement('div');
    content.id = 'textViewerContent';
    content.style.cssText = 
        'max-width: 800px; margin: 0 auto;' +
        'padding: ' + paddingTop + 'px 16px ' + paddingBottom + 'px 16px;' +
        'font-size: 18px; line-height: 1.9; word-break: keep-all; letter-spacing: 0.3px;' +
        'box-sizing: border-box; overflow-x: hidden; width: 100%;';
    
    // ✅ Cover 표시 (1페이지)
    if (metadata.coverUrl) {
        const coverDiv = document.createElement('div');
        coverDiv.style.cssText = 
            'display: flex; flex-direction: column; align-items: center; ' +
            'justify-content: center; min-height: calc(100vh - 100px); ' +
            'padding: 20px; box-sizing: border-box; margin-bottom: 20px;';
        
        const coverImg = document.createElement('img');
        coverImg.src = metadata.coverUrl;
        coverImg.alt = 'cover';
        coverImg.style.cssText = 
            'max-width: 90%; max-height: 70vh; object-fit: contain; ' +
            'border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);';
        
        coverDiv.appendChild(coverImg);
        content.appendChild(coverDiv);
        
        const separator = document.createElement('hr');
        separator.style.cssText = 'border: none; border-top: 1px solid var(--border-color, #2a2a2a); margin: 32px 0;';
        content.appendChild(separator);
    }
    
    // ✅ 텍스트 본문 (2페이지~)
    content.innerHTML += formatText(textContent);
    content.innerHTML += '<div style="text-align: center; padding: 40px 0; color: var(--text-tertiary, #666); font-size: 14px;">— 끝 —</div>';
    container.appendChild(content);
}

function create2PageContent(container, textContent, metadata) {
    const pages = splitTextToPages(textContent, metadata);
    totalSpreads = Math.ceil(pages.length / 2);
    
    const bookWrapper = document.createElement('div');
    bookWrapper.id = 'textBookWrapper';
    bookWrapper.style.cssText = 'display: flex; justify-content: center; aligfunction create2PageContent(container, textContent, metadata) {
    const pages = splitTextToPages(textContent, metadata);
    totalSpreads = Math.ceil(pages.length / 2);
    
    const bookWrapper = document.createElement('div');
    bookWrapper.id = 'textBookWrapper';
    bookWrapper.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; padding: 20px; box-sizing: border-box;';
    
    const book = document.createElement('div');
    book.id = 'textBook';
    book.style.cssText = 'display: flex; width: calc(100% - 80px); max-width: 1400px; height: calc(100vh - 80px); border-radius: 8px; box-shadow: 0 0 40px rgba(0,0,0,0.5), 0 0 100px rgba(0,0,0,0.3), inset 0 0 2px rgba(255,255,255,0.1); overflow: hidden; position: relative;';
    
    const leftPage = document.createElement('div');
    leftPage.id = 'textLeftPage';
    leftPage.style.cssText = 'flex: 1; height: 100%; padding: 40px 40px 0 40px; overflow: hidden; font-size: 17px; line-height: 1.85; word-break: keep-all; overflow-wrap: break-word; letter-spacing: 0.3px; box-sizing: border-box; position: relative; border-right: 1px solid rgba(128,128,128,0.3);';
    
    const rightPage = document.createElement('div');
    rightPage.id = 'textRightPage';
    rightPage.style.cssText = 'flex: 1; height: 100%; padding: 40px 40px 0 40px; overflow: hidden; font-size: 17px; line-height: 1.85; word-break: keep-all; overflow-wrap: break-word; letter-spacing: 0.3px; box-sizing: border-box; position: relative;';
    
    book.appendChild(leftPage);
    book.appendChild(rightPage);
    bookWrapper.appendChild(book);
    container.appendChild(bookWrapper);
    container._pages = pages;
    
    renderSpread(0);
}
/**
 * ✅ 최적화된 페이지 분할 (샘플링 + 여백 반영)
 */
function splitTextToPages(textContent, metadata) {
    const startTime = performance.now();
    const pages = [];
    
    if (metadata.coverUrl) {
        pages.push({ type: 'cover', coverUrl: metadata.coverUrl, title: metadata.name });
        pages.push({ type: 'empty' });
    }
    
    const paragraphs = textContent.split(/\n/).filter(line => line.trim());
    
    // ✅ 여백 설정 반영
    const maxHeight = calculateMaxPageHeight();
    
    // ✅ 샘플링: 처음 30개 문단으로 평균 높이 계산
    const testPage = createTestPageElement();
    const sampleSize = Math.min(30, paragraphs.length);
    let totalSampleHeight = 0;
    let totalSampleChars = 0;
    
    for (let i = 0; i < sampleSize; i++) {
        const para = paragraphs[i].trim();
        if (!para) continue;
        testPage.innerHTML = '<p style="margin: 0 0 0.8em 0; text-indent: 1em;">' + escapeHtml(para) + '</p>';
        totalSampleHeight += testPage.scrollHeight;
        totalSampleChars += para.length;
    }
    
    document.body.removeChild(testPage);
    
    // 글자당 평균 높이 계산
    const avgHeightPerChar = totalSampleChars > 0 ? totalSampleHeight / totalSampleChars : 0.5;
    const charsPerPage = Math.floor(maxHeight / avgHeightPerChar);
    
    console.log(`📐 Max height: ${maxHeight}px, ~${charsPerPage} chars/page`);
    
    // ✅ 글자 수 기반으로 빠르게 분할
    let currentPageContent = [];
    let currentCharCount = 0;
    
    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (!para) continue;
        
        const paraLength = para.length;
        
        if (currentCharCount + paraLength > charsPerPage && currentPageContent.length > 0) {
            pages.push({ type: 'text', content: currentPageContent.join('\n\n') });
            currentPageContent = [para];
            currentCharCount = paraLength;
        } else {
            currentPageContent.push(para);
            currentCharCount += paraLength;
        }
    }
    
    if (currentPageContent.length > 0) {
        pages.push({ type: 'text', content: currentPageContent.join('\n\n') });
    }
    
    pages.push({ type: 'end' });
    if (pages.length % 2 !== 0) {
        pages.push({ type: 'empty' });
    }
    
    console.log(`⏱️ [SPLIT PAGES] ${(performance.now() - startTime).toFixed(2)}ms (${pages.length} pages)`);
    
    return pages;
}

/**
 * 테스트용 페이지 요소 생성
 */
function createTestPageElement() {
    const testPage = document.createElement('div');
    testPage.style.cssText = 
        'position: absolute; ' +
        'left: -9999px; ' +
        'top: 0; ' +
        'width: 700px; ' +
        'padding: 40px 40px 0 40px; ' +
        'font-size: 17px; ' +
        'line-height: 1.85; ' +
        'word-break: keep-all; ' +
        'letter-spacing: 0.3px; ' +
        'box-sizing: border-box; ' +
        'visibility: hidden;';
    document.body.appendChild(testPage);
    return testPage;
}

/**
 * 페이지 최대 높이 계산 (여백 반영)
 */
function calculateMaxPageHeight() {
    const bookHeight = window.innerHeight - 80;
    const topPadding = 40;
    const pageNumArea = 40;
    const userMargin = parseInt(localStorage.getItem('text_2page_padding_bottom') || '20');
    
    return bookHeight - topPadding - pageNumArea - userMargin;
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
    
    setTimeout(function() {
        restoreHighlights();
    }, 50);
}

function renderSinglePage(pageEl, pageData, pageNumber, side) {
    pageEl.innerHTML = '';
    if (!pageData) return;
    
    const userMargin = parseInt(localStorage.getItem('text_2page_padding_bottom') || '20');
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = `
        height: calc(100% - 40px - ${userMargin}px);
        overflow: hidden;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    `;
    
    const pageNumDiv = document.createElement('div');
    pageNumDiv.style.cssText = 'height: 40px; display: flex; align-items: center; font-size: 12px; color: var(--text-tertiary, #666); justify-content: ' + (side === 'left' ? 'flex-start' : 'flex-end') + ';';
    
    switch (pageData.type) {
        // ✅ 제목 페이지
        case 'title':
            contentDiv.innerHTML = 
                '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: 40px 20px; box-sizing: border-box;">' +
                    '<h1 style="font-size: 24px; font-weight: 700; margin: 0 0 20px 0; word-break: keep-all; color: var(--text-primary, #e8e8e8);">' + escapeHtml(pageData.title) + '</h1>' +
                    (pageData.author ? '<p style="font-size: 14px; color: var(--text-secondary, #999); margin: 0;">저자: ' + escapeHtml(pageData.author) + '</p>' : '') +
                '</div>';
            break;
        
        // ✅ Cover 페이지
        case 'cover':
            contentDiv.innerHTML = 
                '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: 20px; box-sizing: border-box;">' +
                    '<img src="' + pageData.coverUrl + '" alt="cover" style="max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">' +
                '</div>';
            break;
        
        // ✅ 텍스트 페이지
        case 'text':
            contentDiv.innerHTML = formatText(pageData.content);
            pageNumDiv.textContent = pageNumber;
            break;
        
        // ✅ 끝 페이지
        case 'end':
            contentDiv.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-tertiary, #666); font-size: 16px;">— 끝 —</div>';
            pageNumDiv.textContent = pageNumber;
            break;
        
        // ✅ 빈 페이지
        case 'empty':
            contentDiv.innerHTML = '';
            break;
    }
    
    const marginDiv = document.createElement('div');
    marginDiv.style.cssText = `height: ${userMargin}px; background: transparent;`;
    
    pageEl.appendChild(contentDiv);
    pageEl.appendChild(marginDiv);
    pageEl.appendChild(pageNumDiv);
}
function formatText(text) {
    if (!text) return '';
    return text.split(/\n/).map(function(line) {
        const trimmed = line.trim();
        if (!trimmed) return '<br>';
        return '<p style="margin: 0 0 0.8em 0; text-indent: 1em;">' + escapeHtml(trimmed) + '</p>';
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
        container.onwheel = function(e) {
            e.preventDefault();
            navigate2Page(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
        };
        
        var touchStartX = 0, touchStartY = 0;
        container.ontouchstart = function(e) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; };
        container.ontouchend = function(e) {
            var diffX = touchStartX - e.changedTouches[0].clientX;
            var diffY = touchStartY - e.changedTouches[0].clientY;
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) navigate2Page(diffX > 0 ? 1 : -1);
            else if (Math.abs(diffY) > 50) navigate2Page(diffY > 0 ? 1 : -1);
        };
    }
    
    if (readMode === 'click') {
        container.onclick = function(e) {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
            var clickX = e.clientX - container.getBoundingClientRect().left;
            var width = container.getBoundingClientRect().width;
            if (clickX < width * 0.2) navigate2Page(-1);
            else if (clickX > width * 0.8) navigate2Page(1);
        };
    }
}

function navigate2Page(direction) {
    var newIndex = currentSpreadIndex + direction;
    if (newIndex >= 0 && newIndex < totalSpreads) renderSpread(newIndex);
}

function setupClickZones(container) {
    container.onclick = function(e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
        var clickX = e.clientX - container.getBoundingClientRect().left;
        var width = container.getBoundingClientRect().width;
        if (clickX < width * 0.2) scrollPageAmount(-1);
        else if (clickX > width * 0.8) scrollPageAmount(1);
    };
}

function scrollPageAmount(direction) {
    var container = document.getElementById('textViewerContainer');
    if (!container) return;
    
    container.style.overflowY = 'hidden';
    container.style.scrollBehavior = 'auto';
    
    var scrollAmount = container.clientHeight;
    container.scrollTop += direction * scrollAmount;
}

function setupKeyboardNavigation() {
    if (window._epubKeyHandler) document.removeEventListener('keydown', window._epubKeyHandler, true);

    window._epubKeyHandler = function (e) {
        var target = e.target;
        if (target.tagName === 'INPUT' || 
            target.tagName === 'TEXTAREA' || 
            target.isContentEditable) {
            return;
        }

        var container = document.getElementById('textViewerContainer');
        if (!container) return;

        switch (e.key) {
            case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
                e.preventDefault();
                e.stopImmediatePropagation();
                navigatePage(-1);
                break;
            case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ':
                e.preventDefault();
                e.stopImmediatePropagation();
                navigatePage(1);
                break;
            case 'Home':
                e.preventDefault();
                e.stopImmediatePropagation();
                goToStart();
                break;
            case 'End':
                e.preventDefault();
                e.stopImmediatePropagation();
                goToEnd();
                break;
            case 'Escape':
                if (typeof closeViewer === 'function') closeViewer();
                break;
        }
    };
    document.addEventListener('keydown', window._epubKeyHandler, true);
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
    else { var c = document.getElementById('textViewerContainer'); c.scrollTop = c.scrollHeight; }
}

function updateProgressIndicator(progress) {
    var indicator = document.getElementById('textProgressIndicator');
    if (indicator) indicator.textContent = progress + '%';
    TextViewerState.scrollProgress = progress;
}

function setupScrollTracking(container, metadata) {
    var ticking = false;
    container.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(function() {
                var scrollTop = container.scrollTop;
                var scrollHeight = container.scrollHeight - container.clientHeight;
                var progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
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
    
    var container = document.getElementById('textViewerContainer');
    if (container) { applyContainerStyle(container); setupInteraction(container); }
    
    applyTheme(); applyTypography();
    if (pageLayout === '2page') apply2PageTheme();
    updateReadModeUI();
    if (window.showToast) window.showToast(readMode === 'scroll' ? 'Scroll Mode' : 'Click Mode');
}

function setTextLayout(layout) {
    var currentProgress = TextViewerState.scrollProgress || 0;
    pageLayout = layout;
    localStorage.setItem('text_layout', layout);
    
    var container = document.getElementById('textViewerContainer');
    if (container) container.style.visibility = 'hidden';
    
    renderContent();
    
    if (layout === '1page') {
        requestAnimationFrame(function() { scrollToProgress(currentProgress); if (container) container.style.visibility = 'visible'; });
    } else {
        scrollToProgress(currentProgress);
        if (container) container.style.visibility = 'visible';
    }
    if (window.showToast) window.showToast(layout === '2page' ? '2 Page Mode' : '1 Page Mode');
}

function getTextLayout() { return pageLayout; }

function updateReadModeUI() {
    var scrollBtn = document.getElementById('btnModeScroll');
    var clickBtn = document.getElementById('btnModeClick');
    if (scrollBtn) scrollBtn.classList.toggle('active', readMode === 'scroll');
    if (clickBtn) clickBtn.classList.toggle('active', readMode === 'click');
}

export function scrollToPosition(position) {
    var container = document.getElementById('textViewerContainer');
    if (container && position) {
        if (pageLayout === '2page') { if (position < totalSpreads) renderSpread(Math.floor(position)); }
        else container.scrollTop = position;
    }
}

export function scrollToProgress(percent) {
    if (pageLayout === '2page') {
        var spreadIndex = Math.round((percent / 100) * (totalSpreads - 1));
        renderSpread(Math.max(0, Math.min(spreadIndex, totalSpreads - 1)));
    } else {
        var container = document.getElementById('textViewerContainer');
        if (container) container.scrollTop = (percent / 100) * (container.scrollHeight - container.clientHeight);
    }
}

export function cleanupTextRenderer() {
    cleanupHighlights();
    if (currentMetadata && currentMetadata.seriesId && currentMetadata.bookId) {
        saveOnClose(currentMetadata.seriesId, currentMetadata.bookId);
    }
    
    stopAutoSave();
    
    headerVisible = false; currentSpreadIndex = 0; totalSpreads = 0;
    currentTextContent = ''; currentMetadata = null;
    
    if (headerAutoCloseTimer) { clearTimeout(headerAutoCloseTimer); headerAutoCloseTimer = null; }
    if (clickGuideTimeout) { clearTimeout(clickGuideTimeout); clickGuideTimeout = null; }
    if (window._textKeyHandler) { document.removeEventListener('keydown', window._textKeyHandler); delete window._textKeyHandler; }
    
    document.body.style.overflow = '';
    ['textToggleBtn', 'textViewerHeader', 'textClickGuide', 'leftShadowOverlay', 'rightShadowOverlay'].forEach(function(id) { 
        var el = document.getElementById(id); 
        if (el) el.remove(); 
    });
    
    var imageContent = document.getElementById('viewerContent');
    if (imageContent) imageContent.style.display = '';
    var controls = document.getElementById('viewerControls');
    if (controls) controls.style.display = '';
    
    var container = document.getElementById('textViewerContainer');
    if (container) { container.onclick = null; container.onwheel = null; container.ontouchstart = null; container.ontouchend = null; container._pages = null; }
    
    delete window.openTextSettings; delete window.toggleTextHeader;
    delete window.setTextReadMode; delete window.getTextReadMode;
    delete window.setTextLayout; delete window.getTextLayout;
    delete window.onTextThemeChange; delete window.scrollToProgress;
    delete window.rerenderTextContent;
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function renderPage(pageIndex) { console.log('renderPage called but using scroll mode'); }

console.log('✅ TXT Renderer loaded');
