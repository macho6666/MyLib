/**
 * viewer_modules/text/text_renderer.js
 * TXT 렌더링 (스크롤/클릭 모드, 1페이지/2페이지 레이아웃)
 * ✅ Cover 공간 무조건 생성 + 백그라운드 로드
 * ✅ 외부에서 Cover 업데이트 가능
 * ✅ 모드/여백 변경 시 charIndex 기반 위치 유지
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { createCoverPage, createTOCPage } from './text_toc.js';
import { updateProgress, startAutoSave, stopAutoSave, saveOnClose } from './text_bookmark.js';
import { openSettings } from './text_controls.js';
import { initHighlights, cleanupHighlights, restoreHighlights } from './text_highlight.js';

var headerVisible = false;
var readMode = 'scroll';
var pageLayout = '1page';
var headerAutoCloseTimer = null;
var currentSpreadIndex = 0;
var totalSpreads = 0;
var currentTextContent = '';
var currentMetadata = null;
var clickGuideVisible = false;
var clickGuideTimeout = null;
var coverLoaded = false;
var pendingCoverUrl = null;

// ═══════════════════════════════════════
// 현재 위치를 charIndex로 가져오기
// ═══════════════════════════════════════

function getCurrentCharIndex() {
    var textContent = window.currentTextContent || '';
    var container = document.getElementById('textViewerContainer');
    if (!container || textContent.length === 0) return 0;

    if (pageLayout === '2page') {
        var pages = container._pages || [];
        var spreadIndex = currentSpreadIndex || 0;
        var leftIdx = spreadIndex * 2;
        var totalChars = 0;

        for (var i = 0; i < leftIdx && i < pages.length; i++) {
            if (pages[i].type === 'text' && pages[i].content) {
                totalChars += pages[i].content.length;
            }
        }
        return totalChars;
    } else {
        var scrollTop = container.scrollTop;
        var scrollHeight = container.scrollHeight - container.clientHeight;
        if (scrollHeight > 0) {
            var ratio = scrollTop / scrollHeight;
            return Math.floor(textContent.length * ratio);
        }
        return 0;
    }
}

// ═══════════════════════════════════════
// 메인 진입점
// ═══════════════════════════════════════

export async function renderTxt(textContent, metadata) {
    var renderStart = performance.now();

    TextViewerState.renderType = 'txt';
    TextViewerState.currentBook = metadata;
    headerVisible = false;
    currentSpreadIndex = 0;
    currentTextContent = textContent;
    window.currentTextContent = textContent;
    currentMetadata = metadata;
    
    var hasPendingCover = false;
    if (pendingCoverUrl) {
        console.log('📸 Applying pending cover:', pendingCoverUrl);
        currentMetadata.coverUrl = pendingCoverUrl;
        pendingCoverUrl = null;
        hasPendingCover = true;
    }
    
    coverLoaded = false;

    readMode = localStorage.getItem('mylib_text_readmode') || 'scroll';

    if (window.innerWidth >= 1024) {
        pageLayout = localStorage.getItem('text_layout') || '1page';
    } else {
        pageLayout = '1page';
    }

    var viewer = document.getElementById('viewerOverlay');
    viewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    var imageContent = document.getElementById('viewerContent');
    if (imageContent) imageContent.style.display = 'none';

    var controls = document.getElementById('viewerControls');
    if (controls) controls.style.display = 'none';

    var container = document.getElementById('textViewerContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'textViewerContainer';
        viewer.appendChild(container);
    }

    renderContent();
    
    if (currentMetadata.coverUrl && !coverLoaded) {
        loadCoverBackground(currentMetadata.coverUrl);
    } else if (hasPendingCover && currentMetadata.coverUrl) {
        loadCoverBackground(currentMetadata.coverUrl);
    }
    
    createToggleButton();
    createHeader(metadata.name);
    setupKeyboardNavigation();

    initHighlights();

    window.openTextSettings = openSettings;
    window.toggleTextHeader = toggleHeader;
    window.setTextReadMode = setReadMode;
    window.getTextReadMode = function() { return readMode; };
    window.setTextLayout = setTextLayout;
    window.getTextLayout = getTextLayout;
    window.onTextThemeChange = onThemeChange;
    window.scrollToProgress = scrollToProgress;
    window.updateCoverImage = updateCoverImage;
    window._renderSpread = renderSpread;
    window.rerenderTextContent = function() {
        var savedCharIndex = getCurrentCharIndex();
        renderContent();
        restorePosition(savedCharIndex);
    };

    startAutoSave(metadata.seriesId, metadata.bookId, 10000);

    // ✅ 북마크 복원: charIndex 우선, fallback %
    setTimeout(function() {
        var saved = localStorage.getItem('progress_' + metadata.seriesId);
        if (saved) {
            var progressData = JSON.parse(saved);
            var bookProgress = progressData[metadata.bookId];
            if (bookProgress && bookProgress.charIndex > 0) {
                restorePosition(bookProgress.charIndex);
            } else if (bookProgress && bookProgress.progress > 0) {
                var c = document.getElementById('textViewerContainer');
                if (c) {
                    var scrollHeight = c.scrollHeight - c.clientHeight;
                    c.scrollTop = (bookProgress.progress / 100) * scrollHeight;
                }
            }
        }
    }, 100);

    Events.emit('text:open', { bookId: metadata.bookId, metadata: metadata });
    console.log('📖 TXT Viewer opened (' + (performance.now() - renderStart).toFixed(0) + 'ms)');
}

// ═══════════════════════════════════════
// Cover 업데이트 (외부에서 호출)
// ═══════════════════════════════════════

export function updateCoverImage(coverUrl) {
    if (!coverUrl) return;
    
    console.log('📸 updateCoverImage:', coverUrl);
    
    if (!currentMetadata) {
        pendingCoverUrl = coverUrl;
        console.log('📸 Pending (renderer not ready)');
        return;
    }
    
    currentMetadata.coverUrl = coverUrl;
    
    // ✅ 2페이지 모드: _pages의 cover 데이터도 업데이트
    var container = document.getElementById('textViewerContainer');
    if (container && container._pages) {
        for (var i = 0; i < container._pages.length; i++) {
            if (container._pages[i].type === 'cover') {
                container._pages[i].coverUrl = coverUrl;
                break;
            }
        }
    }
    
    coverLoaded = false;
    loadCoverBackground(coverUrl);
}

export function updateCoverFailed() {
    console.log('📸 Cover load failed');

    var ph1 = document.getElementById('coverPlaceholder1Page');
    if (ph1) {
        ph1.innerHTML = '';
        var titleWrap = document.createElement('div');
        titleWrap.style.cssText = 'text-align: center;';
        var title = currentMetadata ? (currentMetadata.name || 'Untitled') : 'Untitled';
        var author = currentMetadata ? (currentMetadata.author || '') : '';
        titleWrap.innerHTML =
            '<h1 style="font-size: 28px; font-weight: 700; margin: 0 0 20px 0; word-break: keep-all; color: var(--text-primary, #e8e8e8);">' + escapeHtml(title) + '</h1>' +
            (author ? '<p style="font-size: 16px; color: var(--text-secondary, #999); margin: 0;">저자: ' + escapeHtml(author) + '</p>' : '');
        ph1.appendChild(titleWrap);
    }

    var ph2 = document.getElementById('coverPlaceholder2Page');
    if (ph2) {
        ph2.innerHTML = '<div style="text-align: center; color: var(--text-tertiary, #666);"><p style="font-size: 14px;">No Cover</p></div>';
    }
}

window.updateCoverFailed = updateCoverFailed;

// ═══════════════════════════════════════
// Cover 백그라운드 로드
// ═══════════════════════════════════════

function loadCoverBackground(coverUrl) {
    var img = new Image();
    img.onload = function() {
        coverLoaded = true;

        var ph1 = document.getElementById('coverPlaceholder1Page');
        if (ph1) {
            ph1.innerHTML = '';
            var coverImg = document.createElement('img');
            coverImg.src = coverUrl;
            coverImg.alt = 'cover';
            coverImg.style.cssText =
                'max-width: 90%; max-height: 70vh; object-fit: contain; ' +
                'border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); ' +
                'opacity: 0; transition: opacity 0.3s ease;';
            ph1.appendChild(coverImg);
            requestAnimationFrame(function() { coverImg.style.opacity = '1'; });
        }

        var ph2 = document.getElementById('coverPlaceholder2Page');
        if (ph2) {
            renderSpread(currentSpreadIndex);
        }
    };
    img.onerror = function() {
        coverLoaded = false;
        var ph1 = document.getElementById('coverPlaceholder1Page');
        if (ph1) {
            ph1.innerHTML = '<p style="color: var(--text-tertiary, #666); font-size: 14px;">이미지를 불러올 수 없습니다</p>';
        }
        var ph2 = document.getElementById('coverPlaceholder2Page');
        if (ph2) {
            renderSpread(currentSpreadIndex);
        }
    };
    img.src = coverUrl;
}

// ═══════════════════════════════════════
// 위치 복원 (charIndex 기반)
// ═══════════════════════════════════════

function restorePosition(charIndex) {
    var textContent = window.currentTextContent || '';
    if (textContent.length === 0 || charIndex <= 0) return;

    if (pageLayout === '2page') {
        var container = document.getElementById('textViewerContainer');
        var pages = container ? container._pages : [];
        var totalChars = 0;
        var targetSpread = 0;

        for (var i = 0; i < pages.length; i++) {
            if (pages[i].type === 'text' && pages[i].content) {
                totalChars += pages[i].content.length;
                if (totalChars >= charIndex) {
                    targetSpread = Math.floor(i / 2);
                    break;
                }
            }
        }
        renderSpread(targetSpread);
    } else {
        var container = document.getElementById('textViewerContainer');
        if (container) {
            setTimeout(function() {
                var scrollHeight = container.scrollHeight - container.clientHeight;
                if (scrollHeight > 0 && textContent.length > 0) {
                    var ratio = Math.min(1, charIndex / textContent.length);
                    container.scrollTop = scrollHeight * ratio;
                }
            }, 50);
        }
    }
}

// ═══════════════════════════════════════
// 콘텐츠 렌더링
// ═══════════════════════════════════════

function renderContent() {
    var container = document.getElementById('textViewerContainer');
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
    setTimeout(function() {
        var container = document.getElementById('textViewerContainer');
        if (!container) return;

        var computedStyle = getComputedStyle(container);
        var bgColor = computedStyle.backgroundColor || '#1c1c1c';
        var textColor = computedStyle.color || '#e8e8e8';
        var lightTheme = isLightColor(bgColor);
        var borderColor = lightTheme ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)';

        var book = document.getElementById('textBook');
        var leftPage = document.getElementById('textLeftPage');
        var rightPage = document.getElementById('textRightPage');

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
    var match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
        var r = parseInt(match[1]);
        var g = parseInt(match[2]);
        var b = parseInt(match[3]);
        var brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128;
    }
    return false;
}

// ═══════════════════════════════════════
// 컨테이너 스타일
// ═══════════════════════════════════════

function applyContainerStyle(container) {
    var is2Page = pageLayout === '2page';
    var marginTop = is2Page ? 0 : parseInt(localStorage.getItem('text_padding_top') || '24');
    var marginBottom = is2Page ? 0 : parseInt(localStorage.getItem('text_padding_bottom') || '24');

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
        var oldRight = document.getElementById('rightShadowOverlay');
        if (oldRight) oldRight.remove();

        var shadowOverlay = document.getElementById('leftShadowOverlay');
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
        var shadow = document.getElementById('leftShadowOverlay');
        if (shadow) shadow.remove();
    }
}

// ═══════════════════════════════════════
// 1페이지 보기
// ═══════════════════════════════════════

function create1PageContent(container, textContent, metadata) {
    var paddingTop = localStorage.getItem('text_padding_top') || '24';
    var paddingBottom = localStorage.getItem('text_padding_bottom') || '24';

    var content = document.createElement('div');
    content.id = 'textViewerContent';
    content.style.cssText =
        'max-width: 800px; margin: 0 auto;' +
        'padding: ' + paddingTop + 'px 16px ' + paddingBottom + 'px 16px;' +
        'font-size: 18px; line-height: 1.9; word-break: keep-all; letter-spacing: 0.3px;' +
        'box-sizing: border-box; overflow-x: hidden; width: 100%;';

    var coverDiv = document.createElement('div');
    coverDiv.id = 'coverPlaceholder1Page';
    coverDiv.style.cssText =
        'display: flex; flex-direction: column; align-items: center; ' +
        'justify-content: center; min-height: calc(100vh - 100px); ' +
        'padding: 20px; box-sizing: border-box; margin-bottom: 20px;';

    if (metadata.coverUrl && coverLoaded) {
        var coverImg = document.createElement('img');
        coverImg.src = metadata.coverUrl;
        coverImg.alt = 'cover';
        coverImg.style.cssText =
            'max-width: 90%; max-height: 70vh; object-fit: contain; ' +
            'border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);';
        coverDiv.appendChild(coverImg);
    } else {
        var spinnerWrap = document.createElement('div');
        spinnerWrap.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 16px;';

        var spinner = document.createElement('div');
        spinner.className = 'cover-spinner';
        spinner.style.cssText =
            'width: 40px; height: 40px; ' +
            'border: 3px solid var(--border-color, #2a2a2a); ' +
            'border-top-color: var(--accent, #71717a); ' +
            'border-radius: 50%; ' +
            'animation: spin 0.8s linear infinite;';

        var loadingText = document.createElement('p');
        loadingText.style.cssText = 'margin: 0; font-size: 14px; color: var(--text-tertiary, #666);';
        loadingText.textContent = '이미지 불러오는 중...';

        spinnerWrap.appendChild(spinner);
        spinnerWrap.appendChild(loadingText);
        coverDiv.appendChild(spinnerWrap);
    }

    content.appendChild(coverDiv);

    var separator = document.createElement('hr');
    separator.id = 'coverSeparator1Page';
    separator.style.cssText = 'border: none; border-top: 1px solid var(--border-color, #2a2a2a); margin: 32px 0;';
    content.appendChild(separator);

    var textDiv = document.createElement('div');
    textDiv.innerHTML = formatText(textContent);
    content.appendChild(textDiv);

    var endDiv = document.createElement('div');
    endDiv.style.cssText = 'text-align: center; padding: 40px 0; color: var(--text-tertiary, #666); font-size: 14px;';
    endDiv.textContent = '— 끝 —';
    content.appendChild(endDiv);

    container.appendChild(content);
}

// ═══════════════════════════════════════
// 2페이지 보기
// ═══════════════════════════════════════

function create2PageContent(container, textContent, metadata) {
    var pages = splitTextToPages(textContent, metadata);
    totalSpreads = Math.ceil(pages.length / 2);

    var bookWrapper = document.createElement('div');
    bookWrapper.id = 'textBookWrapper';
    bookWrapper.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; padding: 20px; box-sizing: border-box;';

    var book = document.createElement('div');
    book.id = 'textBook';
    book.style.cssText = 'display: flex; width: calc(100% - 80px); max-width: 1400px; height: calc(100vh - 80px); border-radius: 8px; box-shadow: 0 0 40px rgba(0,0,0,0.5), 0 0 100px rgba(0,0,0,0.3), inset 0 0 2px rgba(255,255,255,0.1); overflow: hidden; position: relative;';

    var leftPage = document.createElement('div');
    leftPage.id = 'textLeftPage';
    leftPage.style.cssText = 'flex: 1; height: 100%; padding: 40px 40px 0 40px; overflow: hidden; font-size: 17px; line-height: 1.85; word-break: keep-all; overflow-wrap: break-word; letter-spacing: 0.3px; box-sizing: border-box; position: relative; border-right: 1px solid rgba(128,128,128,0.3);';

    var rightPage = document.createElement('div');
    rightPage.id = 'textRightPage';
    rightPage.style.cssText = 'flex: 1; height: 100%; padding: 40px 40px 0 40px; overflow: hidden; font-size: 17px; line-height: 1.85; word-break: keep-all; overflow-wrap: break-word; letter-spacing: 0.3px; box-sizing: border-box; position: relative;';

    book.appendChild(leftPage);
    book.appendChild(rightPage);
    bookWrapper.appendChild(book);
    container.appendChild(bookWrapper);
    container._pages = pages;

    renderSpread(0);
}

// ═══════════════════════════════════════
// 페이지 분할
// ═══════════════════════════════════════

function splitTextToPages(textContent, metadata) {
    var pages = [];

    pages.push({ type: 'title', title: metadata.name || 'Untitled', author: metadata.author || '' });
    pages.push({ type: 'cover', coverUrl: metadata.coverUrl || null });

    var paragraphs = textContent.split(/\n/).filter(function(line) { return line.trim(); });
    var maxHeight = calculateMaxPageHeight();

    var testPage = createTestPageElement();
    var sampleSize = Math.min(30, paragraphs.length);
    var totalSampleHeight = 0;
    var totalSampleChars = 0;

    for (var i = 0; i < sampleSize; i++) {
        var para = paragraphs[i].trim();
        if (!para) continue;
        testPage.innerHTML = '<p style="margin: 0 0 0.8em 0; text-indent: 1em;">' + escapeHtml(para) + '</p>';
        totalSampleHeight += testPage.scrollHeight;
        totalSampleChars += para.length;
    }

    document.body.removeChild(testPage);

    var avgHeightPerChar = totalSampleChars > 0 ? totalSampleHeight / totalSampleChars : 0.5;
    var charsPerPage = Math.floor(maxHeight / avgHeightPerChar);

    var currentPageContent = [];
    var currentCharCount = 0;

    for (var j = 0; j < paragraphs.length; j++) {
        var p = paragraphs[j].trim();
        if (!p) continue;

        var paraLength = p.length;

        if (currentCharCount + paraLength > charsPerPage && currentPageContent.length > 0) {
            pages.push({ type: 'text', content: currentPageContent.join('\n\n') });
            currentPageContent = [p];
            currentCharCount = paraLength;
        } else {
            currentPageContent.push(p);
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

    return pages;
}

function createTestPageElement() {
    var testPage = document.createElement('div');
    testPage.style.cssText =
        'position: absolute; left: -9999px; top: 0; ' +
        'width: 700px; padding: 40px 40px 0 40px; ' +
        'font-size: 17px; line-height: 1.85; ' +
        'word-break: keep-all; letter-spacing: 0.3px; ' +
        'box-sizing: border-box; visibility: hidden;';
    document.body.appendChild(testPage);
    return testPage;
}

function calculateMaxPageHeight() {
    var bookHeight = window.innerHeight - 80;
    var topPadding = 40;
    var pageNumArea = 40;
    var userMargin = parseInt(localStorage.getItem('text_2page_padding_bottom') || '20');

    return bookHeight - topPadding - pageNumArea - userMargin;
}

// ═══════════════════════════════════════
// Spread 렌더링
// ═══════════════════════════════════════

function renderSpread(spreadIndex) {
    var container = document.getElementById('textViewerContainer');
    var leftPage = document.getElementById('textLeftPage');
    var rightPage = document.getElementById('textRightPage');

    if (!container || !leftPage || !rightPage) return;

    var pages = container._pages || [];
    var leftIdx = spreadIndex * 2;
    var rightIdx = spreadIndex * 2 + 1;

    renderSinglePage(leftPage, pages[leftIdx], leftIdx + 1, 'left');
    renderSinglePage(rightPage, pages[rightIdx], rightIdx + 1, 'right');

    currentSpreadIndex = spreadIndex;
    TextViewerState.currentSpreadIndex = spreadIndex;

    var progress = totalSpreads > 1 ? Math.round((spreadIndex / (totalSpreads - 1)) * 100) : 100;
    updateProgressIndicator(progress);

    setTimeout(function() {
        restoreHighlights();
    }, 50);
}

function renderSinglePage(pageEl, pageData, pageNumber, side) {
    pageEl.innerHTML = '';
    if (!pageData) return;

    var userMargin = parseInt(localStorage.getItem('text_2page_padding_bottom') || '20');

    var contentDiv = document.createElement('div');
    contentDiv.style.cssText =
        'height: calc(100% - 40px - ' + userMargin + 'px); ' +
        'overflow: hidden; ' +
        'box-sizing: border-box;';

    var pageNumDiv = document.createElement('div');
    pageNumDiv.style.cssText = 'height: 40px; display: flex; align-items: center; font-size: 12px; color: var(--text-tertiary, #666); justify-content: ' + (side === 'left' ? 'flex-start' : 'flex-end') + ';';

    switch (pageData.type) {
        case 'title':
            contentDiv.style.display = 'flex';
            contentDiv.style.flexDirection = 'column';
            contentDiv.style.alignItems = 'center';
            contentDiv.style.justifyContent = 'center';
            contentDiv.innerHTML =
                '<div style="text-align: center; padding: 40px 20px; box-sizing: border-box;">' +
                    '<h1 style="font-size: 24px; font-weight: 700; margin: 0 0 20px 0; word-break: keep-all; color: var(--text-primary, #e8e8e8);">' + escapeHtml(pageData.title) + '</h1>' +
                    (pageData.author ? '<p style="font-size: 14px; color: var(--text-secondary, #999); margin: 0;">저자: ' + escapeHtml(pageData.author) + '</p>' : '') +
                '</div>';
            break;

        case 'cover':
            contentDiv.id = 'coverPlaceholder2Page';
            contentDiv.style.display = 'flex';
            contentDiv.style.flexDirection = 'column';
            contentDiv.style.alignItems = 'center';
            contentDiv.style.justifyContent = 'center';

            if (pageData.coverUrl && coverLoaded) {
                contentDiv.innerHTML =
                    '<img src="' + pageData.coverUrl + '" alt="cover" ' +
                    'style="max-width: 90%; max-height: 90%; object-fit: contain; ' +
                    'border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">';
            } else if (pageData.coverUrl) {
                contentDiv.innerHTML =
                    '<div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">' +
                        '<div class="cover-spinner" style="' +
                        'width: 40px; height: 40px; ' +
                        'border: 3px solid var(--border-color, #2a2a2a); ' +
                        'border-top-color: var(--accent, #71717a); ' +
                        'border-radius: 50%; ' +
                        'animation: spin 0.8s linear infinite;"></div>' +
                        '<p style="margin: 0; font-size: 14px; color: var(--text-tertiary, #666);">이미지 불러오는 중...</p>' +
                    '</div>';
            } else {
                contentDiv.innerHTML =
                    '<div style="text-align: center; color: var(--text-tertiary, #666);">' +
                        '<p style="font-size: 14px;">No Cover</p>' +
                    '</div>';
            }
            break;

        case 'text':
            contentDiv.innerHTML = formatText(pageData.content);
            pageNumDiv.textContent = pageNumber;
            break;

        case 'end':
            contentDiv.style.display = 'flex';
            contentDiv.style.alignItems = 'center';
            contentDiv.style.justifyContent = 'center';
            contentDiv.innerHTML = '<div style="color: var(--text-tertiary, #666); font-size: 16px;">— 끝 —</div>';
            pageNumDiv.textContent = pageNumber;
            break;

        case 'empty':
            contentDiv.innerHTML = '';
            break;
    }

    var marginDiv = document.createElement('div');
    marginDiv.style.cssText = 'height: ' + userMargin + 'px; background: transparent;';

    pageEl.appendChild(contentDiv);
    pageEl.appendChild(marginDiv);
    pageEl.appendChild(pageNumDiv);
}

// ═══════════════════════════════════════
// 텍스트 포맷
// ═══════════════════════════════════════

function formatText(text) {
    if (!text) return '';
    return text.split(/\n/).map(function(line) {
        var trimmed = line.trim();
        if (!trimmed) return '<br>';
        return '<p style="margin: 0 0 0.8em 0; text-indent: 1em;">' + escapeHtml(trimmed) + '</p>';
    }).join('');
}

// ═══════════════════════════════════════
// 인터랙션
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// 키보드 네비게이션
// ═══════════════════════════════════════

function setupKeyboardNavigation() {
    if (window._epubKeyHandler) document.removeEventListener('keydown', window._epubKeyHandler, true);

    window._epubKeyHandler = function(e) {
        var target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

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

// ═══════════════════════════════════════
// 진행률
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// 모드/레이아웃 변경 (charIndex 기반 위치 유지)
// ═══════════════════════════════════════

function setReadMode(mode) {
    var savedCharIndex = getCurrentCharIndex();

    readMode = mode || (readMode === 'scroll' ? 'click' : 'scroll');
    localStorage.setItem('mylib_text_readmode', readMode);

    var container = document.getElementById('textViewerContainer');
    if (container) { applyContainerStyle(container); setupInteraction(container); }

    applyTheme(); applyTypography();
    if (pageLayout === '2page') apply2PageTheme();
    updateReadModeUI();

    restorePosition(savedCharIndex);

    if (window.showToast) window.showToast(readMode === 'scroll' ? 'Scroll Mode' : 'Click Mode');
}

function setTextLayout(layout) {
    var savedCharIndex = getCurrentCharIndex();

    pageLayout = layout;
    localStorage.setItem('text_layout', layout);

    renderContent();
    restorePosition(savedCharIndex);

    if (window.showToast) window.showToast(layout === '2page' ? '2 Page Mode' : '1 Page Mode');
}

function getTextLayout() { return pageLayout; }

function updateReadModeUI() {
    var scrollBtn = document.getElementById('btnModeScroll');
    var clickBtn = document.getElementById('btnModeClick');
    if (scrollBtn) scrollBtn.classList.toggle('active', readMode === 'scroll');
    if (clickBtn) clickBtn.classList.toggle('active', readMode === 'click');
}

// ═══════════════════════════════════════
// 스크롤 위치
// ═══════════════════════════════════════

export function scrollToPosition(position) {
    var container = document.getElementById('textViewerContainer');
    if (container && position) {
        if (pageLayout === '2page') { if (position < totalSpreads) renderSpread(Math.floor(position)); }
        else container.scrollTop = position;
    }
}

export function scrollToProgress(percent) {
    var textContent = window.currentTextContent || '';
    if (textContent.length > 0) {
        var charIndex = Math.floor(textContent.length * (percent / 100));
        restorePosition(charIndex);
    } else {
        var container = document.getElementById('textViewerContainer');
        if (container) {
            container.scrollTop = (percent / 100) * (container.scrollHeight - container.clientHeight);
        }
    }
}

// ═══════════════════════════════════════
// 헤더/토글
// ═══════════════════════════════════════

function createToggleButton() {
    var existing = document.getElementById('textToggleBtn');
    if (existing) existing.remove();

    var btn = document.createElement('button');
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
    var existing = document.getElementById('textViewerHeader');
    if (existing) existing.remove();

    var header = document.createElement('div');
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
    var header = document.getElementById('textViewerHeader');
    var toggleBtn = document.getElementById('textToggleBtn');
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
    var guide = document.getElementById('textClickGuide');
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
    var guide = document.getElementById('textClickGuide');
    if (guide) {
        guide.style.opacity = '0';
        setTimeout(function() { guide.style.display = 'none'; }, 300);
    }
    clickGuideVisible = false;
}

// ═══════════════════════════════════════
// 클린업
// ═══════════════════════════════════════

export function cleanupTextRenderer() {
    cleanupHighlights();
    if (currentMetadata && currentMetadata.seriesId && currentMetadata.bookId) {
        saveOnClose(currentMetadata.seriesId, currentMetadata.bookId);
    }

    stopAutoSave();

    headerVisible = false; currentSpreadIndex = 0; totalSpreads = 0;
    currentTextContent = ''; currentMetadata = null; coverLoaded = false; pendingCoverUrl = null;

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
    delete window.updateCoverImage; delete window.rerenderTextContent;
    delete window._renderSpread;
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function renderPage(pageIndex) { }

console.log('✅ TXT Renderer loaded');
