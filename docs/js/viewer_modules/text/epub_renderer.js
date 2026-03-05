/**
 * viewer_modules/text/epub_renderer.js
 * EPUB 렌더링 (txt 뷰어와 동일한 방식) - Lazy Loading 최적화
 * ✅ 여백 설정 (top/bottom), 클릭 가이드, 모드 전환 위치 유지, 이미지 404 제거, TOC
 * 📝 TOC "권" 구분: 나중에 추가 예정 (금색 #d4af37)
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { updateProgress, startAutoSave, stopAutoSave, saveOnClose } from './text_bookmark.js';
import { openSettings } from './text_controls.js';
import { initHighlights, cleanupHighlights, restoreHighlights } from './text_highlight.js';
import { parseEpub } from './epub_parser.js';

let headerVisible = false;
let readMode = 'scroll';
let pageLayout = '1page';
let headerAutoCloseTimer = null;
let currentSpreadIndex = 0;
let totalSpreads = 0;
let currentMetadata = null;
let epubData = null;
let tocVisible = false;
let clickGuideVisible = false;
let clickGuideTimeout = null;

// ═══════════════════════════════════════════════════════════
// 메인 렌더링
// ═══════════════════════════════════════════════════════════

export async function renderEpub(epubResult, metadata) {
    TextViewerState.renderType = 'epub';
    TextViewerState.currentBook = metadata;
    headerVisible = false;
    currentSpreadIndex = 0;
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

    try {
        epubData = await parseEpub(epubResult.zip);
        console.log('📘 EPUB parsed:', epubData.chapterPaths.length, 'chapters');
        console.log('📚 TOC:', epubData.toc.length, 'items');
    } catch (e) {
        console.error('EPUB parse failed:', e);
        container.innerHTML = '<div style="color:#e8e8e8; padding: 40px; text-align:center;">EPUB 파싱 실패: ' + e.message + '</div>';
        return;
    }

    await renderContent();
    createToggleButton();
    createHeader(metadata.name);
    createTocPanel();
    setupKeyboardNavigation();

    initHighlights();

    window.openTextSettings = openSettings;
    window.toggleTextHeader = toggleHeader;
    window.setTextReadMode = setReadMode;
    window.getTextReadMode = function () { return readMode; };
    window.setTextLayout = setTextLayout;
    window.getTextLayout = function () { return pageLayout; };
    window.onTextThemeChange = onThemeChange;
    window.scrollToProgress = scrollToProgress;

    startAutoSave(metadata.seriesId, metadata.bookId, 10000);

    const saved = localStorage.getItem('progress_' + metadata.seriesId);
    if (saved) {
        const progressData = JSON.parse(saved);
        const bookProgress = progressData[metadata.bookId];
        if (bookProgress) {
            requestAnimationFrame(async function () {
                if (bookProgress.chapterIndex !== undefined) {
                    if (pageLayout === '2page') {
                        scrollToChapterIn2Page(bookProgress.chapterIndex, bookProgress.chapterProgress);
                        console.log('📖 Restored to chapter ' + bookProgress.chapterIndex + ' (2page)');
                    } else {
                        await scrollToChapter(bookProgress.chapterIndex, bookProgress.chapterProgress || 0);
                        console.log('📖 Restored to chapter ' + bookProgress.chapterIndex + ' (1page)');
                    }
                } else if (bookProgress.progress > 0) {
                    scrollToProgress(bookProgress.progress);
                    console.log('📖 Restored to ' + bookProgress.progress + '%');
                }
            });
        }
    }

    Events.emit('text:open', { bookId: metadata.bookId, metadata: metadata });
    console.log('📖 EPUB Viewer opened (mode: ' + readMode + ', layout: ' + pageLayout + ')');
}

// ═══════════════════════════════════════════════════════════
// 콘텐츠 렌더링
// ═══════════════════════════════════════════════════════════

async function renderContent() {
    const container = document.getElementById('textViewerContainer');
    if (!container) return;

    applyContainerStyle(container);
    container.innerHTML = '';

    if (pageLayout === '2page') {
        await create2PageContent(container);
    } else {
        await create1PageContent(container);
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

    setTimeout(function () {
        restoreHighlights();
    }, 100);
}

export function onThemeChange() {
    if (pageLayout === '2page') {
        apply2PageTheme();
    }
}

function apply2PageTheme() {
    setTimeout(function () {
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

// ✅ 여백: top/height로 컨테이너 크기 조절 (1page만)
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
    container.style.overflowY = is2Page ? 'hidden' : (readMode === 'click' ? 'hidden' : 'auto');
    container.style.zIndex = '5001';
    container.style.webkitOverflowScrolling = 'touch';
    container.style.display = is2Page ? 'flex' : 'block';
    container.style.alignItems = is2Page ? 'center' : 'stretch';
    container.style.justifyContent = is2Page ? 'center' : 'stretch';
    container.style.userSelect = 'text';
    container.style.webkitUserSelect = 'text';
    container.style.boxSizing = 'border-box';

// ✅ 1페이지 모드: 좌우 그림자
if (!is2Page) {
    const viewerOverlay = document.getElementById('viewerOverlay');
    if (!viewerOverlay) return;
    
    let leftShadow = document.getElementById('leftShadowOverlay');
    let rightShadow = document.getElementById('rightShadowOverlay');
    
    if (!leftShadow) {
        leftShadow = document.createElement('div');
        leftShadow.id = 'leftShadowOverlay';
        leftShadow.style.cssText = 
            'position: fixed; top: 0; left: 0; width: 50px; height: 100vh;' +
            'background: linear-gradient(to right, rgba(0,0,0,0.3), transparent);' +
            'pointer-events: none; z-index: 5002;';
        viewerOverlay.appendChild(leftShadow);
    }
    
    if (!rightShadow) {
        rightShadow = document.createElement('div');
        rightShadow.id = 'rightShadowOverlay';
        rightShadow.style.cssText = 
            'position: fixed; top: 0; right: 0; width: 50px; height: 100vh;' +
            'background: linear-gradient(to left, rgba(0,0,0,0.3), transparent);' +
            'pointer-events: none; z-index: 5002;';
        viewerOverlay.appendChild(rightShadow);
    }
} else {
    const leftShadow = document.getElementById('leftShadowOverlay');
    const rightShadow = document.getElementById('rightShadowOverlay');
    if (leftShadow) leftShadow.remove();
    if (rightShadow) rightShadow.remove();
}
    } 
// ═══════════════════════════════════════════════════════════
// 1 PAGE 모드
// ═══════════════════════════════════════════════════════════

async function create1PageContent(container) {
    const content = document.createElement('div');
    content.id = 'textViewerContent';
    content.style.cssText =
        'max-width: 800px; margin: 0 auto;' +
        'padding: 0 16px;' +
        'font-size: 18px; line-height: 1.9; word-break: keep-all; letter-spacing: 0.3px;' +
        'box-sizing: border-box; overflow-x: hidden; width: 100%;';

    container.appendChild(content);

    if (epubData && epubData.chapterPaths) {
        const initialChapters = Math.min(3, epubData.chapterPaths.length);

        for (let i = 0; i < initialChapters; i++) {
            await renderChapter(content, i);
        }

        container._loadedChapters = initialChapters;

        if (initialChapters >= epubData.chapterPaths.length) {
            content.innerHTML += '<div style="text-align: center; padding: 40px 0; color: var(--text-tertiary, #666); font-size: 14px;">— 끝 —</div>';
        }

        container.addEventListener('scroll', async function () {
            let loadedChapters = container._loadedChapters || initialChapters;
            if (loadedChapters >= epubData.chapterPaths.length) return;

            const scrollBottom = container.scrollTop + container.clientHeight;
            const threshold = container.scrollHeight - 500;

            if (scrollBottom > threshold) {
                const nextBatch = Math.min(loadedChapters + 2, epubData.chapterPaths.length);

                for (let i = loadedChapters; i < nextBatch; i++) {
                    await renderChapter(content, i);
                }

                container._loadedChapters = nextBatch;

                if (nextBatch >= epubData.chapterPaths.length) {
                    content.innerHTML += '<div style="text-align: center; padding: 40px 0; color: var(--text-tertiary, #666); font-size: 14px;">— 끝 —</div>';
                }
            }
        });
    }

    setupTocAnchors();
}

async function renderChapter(container, index) {
    if (!epubData || !epubData.chapterPaths[index]) return;

    const existing = document.querySelector('[data-chapter-index="' + index + '"]');
    if (existing) return;

    const chapterPath = epubData.chapterPaths[index];
    const zip = epubData.zip;

    try {
        const file = zip.file(chapterPath.path);
        if (!file) {
            console.warn('Chapter file not found:', chapterPath.path);
            return;
        }

        const html = await file.async('string');
        const useOriginalStyle = localStorage.getItem('epub_use_original_style') === 'true';

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'application/xhtml+xml');
        const body = doc.querySelector('body');

        if (!body) return;

        await processImages(body, epubData.zip, epubData.imagePaths, chapterPath.href);

        // 남아있는 문제 이미지 제거
        body.querySelectorAll('img').forEach(function (img) {
            var src = img.getAttribute('src') || '';
            if (!src.startsWith('data:') && !src.startsWith('http')) {
                img.removeAttribute('src');
                img.style.display = 'none';
            }
        });

        // SVG image 제거
        body.querySelectorAll('svg image').forEach(function (img) {
            var href = img.getAttribute('href') || img.getAttribute('xlink:href') || '';
            if (!href.startsWith('data:') && !href.startsWith('http')) {
                var svg = img.closest('svg');
                if (svg) svg.remove();
                else img.remove();
            }
        });

        // CSS 링크 제거
        body.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
            link.remove();
        });

        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'epub-chapter';
        chapterDiv.dataset.chapterIndex = index;
        chapterDiv.dataset.chapterHref = chapterPath.href;
        chapterDiv.style.cssText = 'margin-bottom: 20px;';
        chapterDiv.innerHTML = body.innerHTML;

        if (!useOriginalStyle) {
            cleanInlineStyles(chapterDiv);
        }

        container.appendChild(chapterDiv);

        if (index < epubData.chapterPaths.length - 1) {
            const divider = document.createElement('hr');
            divider.style.cssText = 'border: none; border-top: 1px solid var(--border-color, #2a2a2a); margin: 40px 0;';
            container.appendChild(divider);
        }

        chapterDiv.id = 'epub-toc-' + chapterPath.href.replace(/[^a-zA-Z0-9]/g, '_');

        setTimeout(function () {
            restoreHighlights();
        }, 50);

    } catch (e) {
        console.error('Chapter render failed:', chapterPath.path, e);
    }
}

async function processImages(bodyEl, zip, imagePaths, chapterHref) {
    const images = bodyEl.querySelectorAll('img');

    for (const img of images) {
        const src = img.getAttribute('src') || '';

        if (src.startsWith('data:')) continue;

        const normalizedSrc = normalizePath(chapterHref, src);

        if (imagePaths[normalizedSrc]) {
            try {
                const imgFile = zip.file(imagePaths[normalizedSrc].path);
                if (imgFile) {
                    const base64 = await imgFile.async('base64');
                    const dataUrl = 'data:' + imagePaths[normalizedSrc].mediaType + ';base64,' + base64;
                    img.setAttribute('src', dataUrl);
                    img.style.cssText = 'max-width: 100%; height: auto; display: block; margin: 16px auto; border-radius: 4px;';
                }
            } catch (e) {
                console.warn('Image load failed:', normalizedSrc, e);
                img.removeAttribute('src');
                img.style.display = 'none';
            }
        } else {
            console.warn('Image not in manifest:', src, '→', normalizedSrc);
            img.removeAttribute('src');
            img.style.display = 'none';
        }
    }
}

function normalizePath(basePath, relativePath) {
    if (relativePath.startsWith('http') || relativePath.startsWith('data:')) {
        return relativePath;
    }

    const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1);
    const combined = baseDir + relativePath;

    const parts = combined.split('/');
    const resolved = [];
    for (const part of parts) {
        if (part === '..') {
            resolved.pop();
        } else if (part !== '.') {
            resolved.push(part);
        }
    }

    return resolved.join('/');
}

function cleanInlineStyles(el) {
    el.querySelectorAll('[style]').forEach(function (node) {
        const style = node.getAttribute('style');
        const cleaned = style
            .split(';')
            .filter(function (rule) {
                const prop = rule.split(':')[0].trim().toLowerCase();
                return prop !== 'color' &&
                    prop !== 'background' &&
                    prop !== 'background-color' &&
                    prop !== 'font-size' &&
                    prop !== 'line-height';
            })
            .join(';');
        if (cleaned.trim()) {
            node.setAttribute('style', cleaned);
        } else {
            node.removeAttribute('style');
        }
    });
}

function setupTocAnchors() {
    if (!epubData || !epubData.toc) return;

    epubData.toc.forEach(function (item) {
        const chapterDiv = document.querySelector('[data-chapter-href="' + item.href + '"]');
        if (chapterDiv) {
            chapterDiv.id = 'epub-toc-' + item.href.replace(/[^a-zA-Z0-9]/g, '_');
        }
    });
}

// ═══════════════════════════════════════════════════════════
// 2 PAGE 모드
// ═══════════════════════════════════════════════════════════

async function create2PageContent(container) {
    const pages = await extractPagesWithImages();
    totalSpreads = Math.ceil(pages.length / 2);

    const bookWrapper = document.createElement('div');
    bookWrapper.id = 'textBookWrapper';
    bookWrapper.style.cssText =
        'display: flex; justify-content: center; align-items: center;' +
        'width: 100%; height: 100%; padding: 20px; box-sizing: border-box;';

    const book = document.createElement('div');
    book.id = 'textBook';
    book.style.cssText =
        'display: flex; width: calc(100% - 80px); max-width: 1400px;' +
        'height: calc(100vh - 80px); border-radius: 8px;' +
        'box-shadow: 0 0 40px rgba(0,0,0,0.5), 0 0 100px rgba(0,0,0,0.3), inset 0 0 2px rgba(255,255,255,0.1);' +
        'overflow: hidden; position: relative;';

    const leftPage = document.createElement('div');
    leftPage.id = 'textLeftPage';
    leftPage.style.cssText =
        'flex: 1; height: 100%; padding: 40px 40px 0 40px; overflow: hidden;' +
        'font-size: 17px; line-height: 1.85; word-break: keep-all; letter-spacing: 0.3px;' +
        'box-sizing: border-box; position: relative;' +
        'border-right: 1px solid rgba(128,128,128,0.3);';

    const rightPage = document.createElement('div');
    rightPage.id = 'textRightPage';
    rightPage.style.cssText =
        'flex: 1; height: 100%; padding: 40px 40px 0 40px; overflow: hidden;' +
        'font-size: 17px; line-height: 1.85; word-break: keep-all; letter-spacing: 0.3px;' +
        'box-sizing: border-box; position: relative;';

    book.appendChild(leftPage);
    book.appendChild(rightPage);
    bookWrapper.appendChild(book);
    container.appendChild(bookWrapper);
    container._pages = pages;

    renderSpread(0);
}

async function extractPagesWithImages() {
    const pages = [];

    if (!epubData || !epubData.chapterPaths) {
        pages.push({ type: 'end' });
        return pages;
    }

    if (currentMetadata && currentMetadata.coverUrl) {
        pages.push({ type: 'cover', coverUrl: currentMetadata.coverUrl, title: currentMetadata.name });
        pages.push({ type: 'empty' });
    }

    const parser = new DOMParser();
    const maxHeight = calculateMaxPageHeight();

    for (let chapterIdx = 0; chapterIdx < epubData.chapterPaths.length; chapterIdx++) {
        const chapter = epubData.chapterPaths[chapterIdx];

        try {
            const file = epubData.zip.file(chapter.path);
            if (!file) continue;

            const html = await file.async('string');
            const doc = parser.parseFromString(html, 'application/xhtml+xml');
            const body = doc.querySelector('body');
            if (!body) continue;

            await processImages(body, epubData.zip, epubData.imagePaths, chapter.href);

            body.querySelectorAll('img').forEach(function (img) {
                const src = img.getAttribute('src') || '';
                if (!src.startsWith('data:')) {
                    img.removeAttribute('src');
                    img.style.display = 'none';
                }
            });

            body.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
                link.remove();
            });

            body.querySelectorAll('svg image').forEach(function (img) {
                var href = img.getAttribute('href') || img.getAttribute('xlink:href') || '';
                if (!href.startsWith('data:') && !href.startsWith('http')) {
                    var svg = img.closest('svg');
                    if (svg) svg.remove();
                    else img.remove();
                }
            });

            const chunks = splitHtmlToChunks(body, maxHeight, chapterIdx);
            pages.push.apply(pages, chunks);

        } catch (e) {
            console.warn('Chapter extract failed:', chapter.path, e);
        }
    }

    pages.push({ type: 'end' });
    if (pages.length % 2 !== 0) pages.push({ type: 'empty' });

    console.log('📄 2Page 모드: 총', pages.length, '페이지 생성');
    return pages;
}

function splitHtmlToChunks(body, maxHeight, chapterIdx) {
    const chunks = [];
    const children = Array.from(body.children);

    let currentElements = [];

    const measureDiv = document.createElement('div');
    measureDiv.style.cssText =
        'position: absolute; left: -9999px; top: 0;' +
        'width: 700px; padding: 40px 40px 20px 40px;' +
        'font-size: 17px; line-height: 1.85;' +
        'word-break: keep-all; letter-spacing: 0.3px;' +
        'box-sizing: border-box; visibility: hidden;';
    document.body.appendChild(measureDiv);

    for (const child of children) {
        const testClone = child.cloneNode(true);

        testClone.querySelectorAll('img').forEach(function (img) {
            const placeholder = document.createElement('div');
            placeholder.style.cssText = 'height: 200px; margin: 16px auto;';
            img.parentNode.replaceChild(placeholder, img);
        });

        testClone.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
            link.remove();
        });

        measureDiv.innerHTML = '';

        currentElements.forEach(function (el) {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('img').forEach(function (img) {
                const ph = document.createElement('div');
                ph.style.cssText = 'height: 200px; margin: 16px auto;';
                img.parentNode.replaceChild(ph, img);
            });
            clone.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
                link.remove();
            });
            measureDiv.appendChild(clone);
        });

        measureDiv.appendChild(testClone);
        const currentHeight = measureDiv.scrollHeight;

        if (currentHeight > maxHeight && currentElements.length > 0) {
            chunks.push({
                type: 'html',
                content: currentElements.map(function (el) { return el.outerHTML; }).join(''),
                chapterIndex: chapterIdx
            });
            currentElements = [child];
        } else {
            currentElements.push(child);
        }
    }

    if (currentElements.length > 0) {
        chunks.push({
            type: 'html',
            content: currentElements.map(function (el) { return el.outerHTML; }).join(''),
            chapterIndex: chapterIdx
        });
    }

    document.body.removeChild(measureDiv);

    if (chunks.length === 0 && body.innerHTML.trim()) {
        chunks.push({
            type: 'html',
            content: body.innerHTML,
            chapterIndex: chapterIdx
        });
    }

    return chunks;
}

function createTestPageElement() {
    const testPage = document.createElement('div');
    testPage.style.cssText =
        'position: absolute; left: -9999px; top: 0; width: 700px;' +
        'padding: 40px 40px 0 40px; font-size: 17px; line-height: 1.85;' +
        'word-break: keep-all; letter-spacing: 0.3px; box-sizing: border-box; visibility: hidden;';
    document.body.appendChild(testPage);
    return testPage;
}

function calculateMaxPageHeight() {
    return window.innerHeight - 80 - 40 - 40;
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
    TextViewerState.currentSpreadIndex = spreadIndex;

    const progress = totalSpreads > 1 ? Math.round((spreadIndex / (totalSpreads - 1)) * 100) : 100;
    updateProgressIndicator(progress);

    setTimeout(function () {
        restoreHighlights();
    }, 50);
}

function renderSinglePage(pageEl, pageData, pageNumber, side) {
    pageEl.innerHTML = '';
    if (!pageData) return;

    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'height: calc(100% - 40px); overflow: hidden; box-sizing: border-box;';

    const pageNumDiv = document.createElement('div');
    pageNumDiv.style.cssText =
        'height: 40px; display: flex; align-items: center; font-size: 12px;' +
        'color: var(--text-tertiary, #666);' +
        'justify-content: ' + (side === 'left' ? 'flex-start' : 'flex-end') + ';';

    switch (pageData.type) {
        case 'cover':
            contentDiv.innerHTML =
                '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center;">' +
                '<img src="' + pageData.coverUrl + '" alt="cover" style="max-width: 200px; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">' +
                '<h1 style="margin-top: 24px; font-size: 22px; font-weight: 600;">' + escapeHtml(pageData.title || '') + '</h1>' +
                '</div>';
            break;
        case 'html':
            contentDiv.innerHTML = pageData.content;
            contentDiv.dataset.chapterIndex = pageData.chapterIndex;
            pageNumDiv.textContent = pageNumber;

            contentDiv.querySelectorAll('img').forEach(function (img) {
                var src = img.getAttribute('src') || '';
                if (!src.startsWith('data:') && !src.startsWith('http')) {
                    img.removeAttribute('src');
                    img.style.display = 'none';
                }
            });

            contentDiv.querySelectorAll('svg image').forEach(function (img) {
                var href = img.getAttribute('href') || img.getAttribute('xlink:href') || '';
                if (!href.startsWith('data:') && !href.startsWith('http')) {
                    var svg = img.closest('svg');
                    if (svg) svg.remove();
                    else img.remove();
                }
            });
            break;
        case 'text':
            contentDiv.innerHTML = formatText(pageData.content);
            pageNumDiv.textContent = pageNumber;
            break;
        case 'end':
            contentDiv.innerHTML =
                '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-tertiary, #666); font-size: 16px;">— 끝 —</div>';
            pageNumDiv.textContent = pageNumber;
            break;
        case 'empty':
            break;
    }

    pageEl.appendChild(contentDiv);
    pageEl.appendChild(pageNumDiv);
}

function formatText(text) {
    if (!text) return '';
    return text.split(/\n/).map(function (line) {
        const trimmed = line.trim();
        if (!trimmed) return '<br>';
        return '<p style="margin: 0 0 0.8em 0; text-indent: 1em;">' + escapeHtml(trimmed) + '</p>';
    }).join('');
}

// ═══════════════════════════════════════════════════════════
// TOC 패널
// 📝 TODO: "권" 구분 추가 예정 (금색 #d4af37, 패턴: /^\d+권|제\d+권/)
// ═══════════════════════════════════════════════════════════

function createTocPanel() {
    const existing = document.getElementById('epubTocPanel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'epubTocPanel';
    panel.style.cssText =
        'position: fixed; left: -300px; top: 0; width: 300px; height: 100vh;' +
        'background: rgba(20, 20, 20, 0.98); border-right: 1px solid var(--border-color, #2a2a2a);' +
        'z-index: 5200; overflow-y: auto; transition: left 0.3s ease;' +
        'backdrop-filter: blur(10px); box-sizing: border-box;';

    let tocHtml =
        '<div style="padding: 20px; border-bottom: 1px solid var(--border-color, #2a2a2a); display: flex; justify-content: space-between; align-items: center;">' +
        '<h3 style="font-size: 16px; font-weight: 600; color: var(--text-primary, #e8e8e8); margin: 0;">📚 목차</h3>' +
        '<button id="btnCloseToc" style="background: none; border: none; color: #888; font-size: 22px; cursor: pointer; padding: 4px 8px;">×</button>' +
        '</div>' +
        '<div id="tocList" style="padding: 12px 0;">';

    if (epubData && epubData.toc && epubData.toc.length > 0) {

        
            // 📝 TODO: "권" 구분 스타일 추가 예정
            // const isVolume = /^\d+권|제\d+권|Volume\s*\d/i.test(item.label);
            // if (isVolume) → 금색 #d4af37, 폰트 크기 16px, font-weight: 600

        
         epubData.toc.forEach(function (item, index) {
            var isVolume = /^\d+권|제\d+권|Volume\s*\d/i.test(item.label.trim());

            if (isVolume) {
                tocHtml +=
                    '<div class="toc-item toc-volume" data-toc-index="' + index + '" data-href="' + item.href + '" style="' +
                    'padding: 14px 20px; cursor: pointer; font-size: 16px; font-weight: 600;' +
                    'color: #d4af37; transition: all 0.2s;' +
                    'border-left: 3px solid #d4af37; margin-top: 8px;" ' +
                    'onmouseover="this.style.background=\'rgba(212,175,55,0.1)\'; this.style.color=\'#e8c84a\';" ' +
                    'onmouseout="this.style.background=\'transparent\'; this.style.color=\'#d4af37\';">' +
                    '📖 ' + escapeHtml(item.label) +
                    '</div>';
            } else {
                tocHtml +=
                    '<div class="toc-item" data-toc-index="' + index + '" data-href="' + item.href + '" style="' +
                    'padding: 12px 20px; cursor: pointer; font-size: 14px;' +
                    'color: var(--text-secondary, #aaa); transition: all 0.2s;' +
                    'border-left: 3px solid transparent;" ' +
                    'onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'; this.style.color=\'#e8e8e8\';" ' +
                    'onmouseout="this.style.background=\'transparent\'; this.style.color=\'var(--text-secondary, #aaa)\';">' +
                    escapeHtml(item.label) +
                    '</div>';
            }
        });
    } else {
        tocHtml += '<div style="padding: 20px; color: var(--text-tertiary, #666); font-size: 13px;">목차 없음</div>';
    }

    tocHtml += '</div>';
    panel.innerHTML = tocHtml;
    document.body.appendChild(panel);

    document.getElementById('btnCloseToc').onclick = toggleToc;

    panel.querySelectorAll('.toc-item').forEach(function (item) {
        item.onclick = function () {
            navigateToTocItem(item.dataset.href);
            toggleToc();
        };
    });
}

async function navigateToTocItem(href) {
    if (pageLayout === '1page') {
        const chapterIndex = epubData.chapterPaths.findIndex(function (ch) {
            return ch.href === href || ch.path === href;
        });

        if (chapterIndex >= 0) {
            const content = document.getElementById('textViewerContent');
            const container = document.getElementById('textViewerContainer');

            const loadedChapters = container._loadedChapters || 0;
            for (let i = loadedChapters; i <= chapterIndex; i++) {
                await renderChapter(content, i);
            }
            container._loadedChapters = Math.max(container._loadedChapters || 0, chapterIndex + 1);

            setTimeout(function () {
                const chapterEl = document.querySelector('[data-chapter-index="' + chapterIndex + '"]');
                if (chapterEl) {
                    chapterEl.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }
    } else {
        const chapterIndex = epubData.chapterPaths.findIndex(function (ch) {
            return ch.href === href || ch.path === href;
        });

        if (chapterIndex >= 0) {
            scrollToChapterIn2Page(chapterIndex);
        }
    }
}

function toggleToc() {
    const panel = document.getElementById('epubTocPanel');
    if (!panel) return;

    tocVisible = !tocVisible;
    panel.style.left = tocVisible ? '0' : '-300px';
}

// ═══════════════════════════════════════════════════════════
// 헤더 / 토글 버튼 / 클릭 가이드
// ═══════════════════════════════════════════════════════════

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
        '<button id="btnHeaderToc" class="text-header-btn">TOC</button>' +
        '<span id="textViewerTitle" class="header-title">' + escapeHtml(title || 'EPUB Viewer') + '</span>' +
        '</div>' +
        '<div style="display: flex; align-items: center; gap: 4px;">' +
        '<span id="textProgressIndicator" style="font-size: 13px; color: #999;">0%</span>' +
        '<button id="btnHeaderSave" class="text-header-btn">Save</button>' +
        '<button id="btnHeaderSet" class="text-header-btn">Set</button>' +
        '<button id="btnHeaderClose" class="text-header-btn" style="font-size: 18px;">×</button>' +
        '</div>';

    document.body.appendChild(header);

    document.getElementById('btnHeaderBack').onclick = function () { if (typeof closeViewer === 'function') closeViewer(); };
    document.getElementById('btnHeaderToc').onclick = function () { toggleToc(); };
    document.getElementById('btnHeaderSave').onclick = function () { if (typeof saveTextBookmark === 'function') saveTextBookmark(); };
    document.getElementById('btnHeaderSet').onclick = function () { if (typeof openTextSettings === 'function') openTextSettings(); };
    document.getElementById('btnHeaderClose').onclick = function () { toggleHeader(); };

    header.querySelectorAll('.text-header-btn').forEach(function (btn) {
        btn.onmouseenter = function () { this.style.color = '#4a9eff'; };
        btn.onmouseleave = function () { this.style.color = '#888'; };
    });

    var titleEl = document.getElementById('textViewerTitle');
    if (titleEl) {
        titleEl.onclick = function () {
            this.classList.toggle('expanded');
        };
    }

    if (!document.getElementById('textHeaderStyle')) {
        var headerStyle = document.createElement('style');
        headerStyle.id = 'textHeaderStyle';
        headerStyle.textContent =
            '.text-header-btn { background: none !important; border: none !important; color: #888 !important; font-size: 14px; cursor: pointer; padding: 8px 10px; border-radius: 6px; transition: color 0.2s ease; }' +
            '.text-header-btn:hover { color: #4a9eff !important; background: none !important; }' +
            '.back-btn { display: flex !important; align-items: center; gap: 4px; }' +
            '.back-btn::before { content: ""; display: inline-block; width: 8px; height: 8px; border-left: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); }' +
            '.header-title { font-size: 16px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; max-width: calc(100vw - 320px); transition: all 0.3s ease; }' +
            '.header-title.expanded { white-space: normal; overflow: visible; position: absolute; left: 70px; top: 56px; max-width: calc(100vw - 40px); background: rgba(20, 20, 20, 0.95); padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 5160; }';
        document.head.appendChild(headerStyle);
    }
}

function createToggleButton() {
    const existing = document.getElementById('textToggleBtn');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.id = 'textToggleBtn';
    btn.innerHTML = '☰';
    btn.onclick = function () {
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
        headerAutoCloseTimer = setTimeout(function () {
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
    let guide = document.getElementById('epubClickGuide');
    if (!guide) {
        guide = document.createElement('div');
        guide.id = 'epubClickGuide';
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
    clickGuideTimeout = setTimeout(function () { hideClickGuide(); }, 3000);
}

function hideClickGuide() {
    const guide = document.getElementById('epubClickGuide');
    if (guide) {
        guide.style.opacity = '0';
        setTimeout(function () { guide.style.display = 'none'; }, 300);
    }
    clickGuideVisible = false;
}

// ═══════════════════════════════════════════════════════════
// 인터랙션 / 네비게이션
// ═══════════════════════════════════════════════════════════

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
        container.onwheel = function (e) {
            e.preventDefault();
            navigate2Page(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
        };

        var touchStartX = 0, touchStartY = 0;
        container.ontouchstart = function (e) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        };
        container.ontouchend = function (e) {
            var diffX = touchStartX - e.changedTouches[0].clientX;
            var diffY = touchStartY - e.changedTouches[0].clientY;
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                navigate2Page(diffX > 0 ? 1 : -1);
            } else if (Math.abs(diffY) > 50) {
                navigate2Page(diffY > 0 ? 1 : -1);
            }
        };
    }

    if (readMode === 'click') {
        container.onclick = function (e) {
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
    container.onclick = function (e) {
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

    var scrollAmount = container.clientHeight;
    container.scrollTop += direction * scrollAmount;
}

function setupKeyboardNavigation() {
    if (window._epubKeyHandler) document.removeEventListener('keydown', window._epubKeyHandler);

    window._epubKeyHandler = function (e) {
        var container = document.getElementById('textViewerContainer');
        if (!container) return;

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
    document.addEventListener('keydown', window._epubKeyHandler);
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
    else {
        var c = document.getElementById('textViewerContainer');
        c.scrollTop = c.scrollHeight;
    }
}

// ═══════════════════════════════════════════════════════════
// 진행률 / 스크롤 트래킹
// ═══════════════════════════════════════════════════════════

function updateProgressIndicator(progress) {
    var indicator = document.getElementById('textProgressIndicator');
    if (indicator) indicator.textContent = progress + '%';
    TextViewerState.scrollProgress = progress;
}

function setupScrollTracking(container, metadata) {
    var ticking = false;
    container.addEventListener('scroll', function () {
        if (!ticking) {
            requestAnimationFrame(function () {
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

// ═══════════════════════════════════════════════════════════
// 모드 전환
// ═══════════════════════════════════════════════════════════

function setReadMode(mode) {
    readMode = mode;
    localStorage.setItem('mylib_text_readmode', readMode);

    var container = document.getElementById('textViewerContainer');
    if (container) {
        applyContainerStyle(container);
        setupInteraction(container);
    }

    applyTheme();
    applyTypography();
    if (pageLayout === '2page') apply2PageTheme();
    if (window.showToast) window.showToast(readMode === 'scroll' ? 'Scroll Mode' : 'Click Mode');
}

async function setTextLayout(layout) {
    if (window.innerWidth < 1024 && layout === '2page') {
        if (window.showToast) window.showToast('2페이지는 PC에서만 가능');
        return;
    }

    // 현재 위치 저장
    let currentChapterIndex = 0;
    let chapterProgress = 0;

    if (pageLayout === '1page') {
        const container = document.getElementById('textViewerContainer');
        const chapters = document.querySelectorAll('.epub-chapter');

        for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            const chTop = ch.offsetTop;
            const chBottom = chTop + ch.offsetHeight;
            const viewCenter = container.scrollTop + container.clientHeight / 2;

            if (viewCenter >= chTop && viewCenter < chBottom) {
                currentChapterIndex = parseInt(ch.dataset.chapterIndex) || i;
                chapterProgress = (viewCenter - chTop) / ch.offsetHeight;
                break;
            }
        }
    } else {
        const container = document.getElementById('textViewerContainer');
        if (container && container._pages) {
            const leftIdx = currentSpreadIndex * 2;
            const page = container._pages[leftIdx];
            if (page && page.chapterIndex !== undefined) {
                currentChapterIndex = page.chapterIndex;

                let chapterPages = [];
                for (let i = 0; i < container._pages.length; i++) {
                    if (container._pages[i].chapterIndex === currentChapterIndex) {
                        chapterPages.push(i);
                    }
                }
                if (chapterPages.length > 0) {
                    const posInChapter = chapterPages.indexOf(leftIdx);
                    chapterProgress = posInChapter >= 0 ? posInChapter / chapterPages.length : 0;
                }
            }
        }
    }

    console.log('📍 레이아웃 전환: ch=' + currentChapterIndex + ', progress=' + chapterProgress.toFixed(2));

    // 전환 전 localStorage에 직접 저장
    if (currentMetadata && currentMetadata.seriesId && currentMetadata.bookId) {
        const key = 'progress_' + currentMetadata.seriesId;
        const progressData = JSON.parse(localStorage.getItem(key) || '{}');

        let totalProgress = 0;
        if (epubData && epubData.chapterPaths.length > 0) {
            totalProgress = Math.round(((currentChapterIndex + chapterProgress) / epubData.chapterPaths.length) * 100);
        }

        progressData[currentMetadata.bookId] = {
            progress: totalProgress,
            chapterIndex: currentChapterIndex,
            chapterProgress: chapterProgress,
            page: TextViewerState.currentPage,
            totalPages: TextViewerState.totalPages,
            timestamp: new Date().toISOString(),
            type: TextViewerState.renderType
        };

        localStorage.setItem(key, JSON.stringify(progressData));
        console.log('💾 전환 전 저장: ch=' + currentChapterIndex + ', chProgress=' + chapterProgress.toFixed(2) + ', total=' + totalProgress + '%');
    }

    // 레이아웃 변경
    pageLayout = layout;
    localStorage.setItem('text_layout', layout);

    await renderContent();

    // DOM 준비 후 복원
    setTimeout(async function () {
        if (pageLayout === '2page') {
            scrollToChapterIn2Page(currentChapterIndex, chapterProgress);
            console.log('✅ 2page 복원: ch=' + currentChapterIndex + ', progress=' + chapterProgress.toFixed(2));
        } else {
            await scrollToChapter(currentChapterIndex, chapterProgress);
            console.log('✅ 1page 복원: ch=' + currentChapterIndex + ', progress=' + chapterProgress.toFixed(2));
        }
    }, 200);

    if (window.showToast) window.showToast(layout === '2page' ? '2페이지 모드' : '1페이지 모드');
}

// ═══════════════════════════════════════════════════════════
// 챕터 기반 위치 이동
// ═══════════════════════════════════════════════════════════

async function scrollToChapter(chapterIndex, progress) {
    const container = document.getElementById('textViewerContainer');
    const content = document.getElementById('textViewerContent');
    if (!container || !content) return;

    const loadTarget = Math.min(chapterIndex + 1, epubData.chapterPaths.length - 1);
    const loadedChapters = container._loadedChapters || 0;
    if (loadTarget >= loadedChapters) {
        for (let i = loadedChapters; i <= loadTarget; i++) {
            await renderChapter(content, i);
        }
        container._loadedChapters = loadTarget + 1;
    }

    await new Promise(function (resolve) { setTimeout(resolve, 100); });

    const chapterEl = document.querySelector('[data-chapter-index="' + chapterIndex + '"]');
    if (chapterEl) {
        const chapterTop = chapterEl.offsetTop;
        const chapterHeight = chapterEl.offsetHeight;
        const targetScroll = chapterTop + (chapterHeight * progress);
        container.scrollTop = Math.max(0, targetScroll - container.clientHeight * 0.3);
        console.log('📜 스크롤 복원: top=' + chapterTop + ', height=' + chapterHeight + ', progress=' + progress.toFixed(2) + ', scrollTo=' + container.scrollTop);
    }
}

function scrollToChapterIn2Page(chapterIndex, chapterProgress) {
    console.log('📖 scrollToChapterIn2Page: ch=' + chapterIndex + ', progress=' + (chapterProgress || 0).toFixed(2));

    const container = document.getElementById('textViewerContainer');
    if (!container || !container._pages) {
        console.warn('❌ container 또는 _pages 없음');
        return;
    }

    let chapterPages = [];
    for (let i = 0; i < container._pages.length; i++) {
        const page = container._pages[i];
        if (page.chapterIndex === chapterIndex) {
            chapterPages.push(i);
        }
    }

    console.log('📄 챕터 ' + chapterIndex + '의 페이지: ' + chapterPages.length + '개');

    if (chapterPages.length === 0) {
        console.warn('⚠️ 챕터 ' + chapterIndex + ' 페이지 없음');
        return;
    }

    let targetPageIndex;
    if (chapterProgress !== undefined && chapterProgress > 0) {
        const pageOffset = Math.floor(chapterPages.length * chapterProgress);
        targetPageIndex = chapterPages[Math.min(pageOffset, chapterPages.length - 1)];
        console.log('📍 offset ' + pageOffset + ' → pageIdx ' + targetPageIndex);
    } else {
        targetPageIndex = chapterPages[0];
        console.log('📍 첫 페이지: ' + targetPageIndex);
    }

    const spreadIndex = Math.floor(targetPageIndex / 2);
    console.log('📖 스프레드로 이동: ' + spreadIndex + ' (총 ' + totalSpreads + ')');
    renderSpread(spreadIndex);
}

function scrollToProgress(percent) {
    if (pageLayout === '2page') {
        var spreadIndex = Math.round((percent / 100) * (totalSpreads - 1));
        renderSpread(Math.max(0, Math.min(spreadIndex, totalSpreads - 1)));
    } else {
        var container = document.getElementById('textViewerContainer');
        if (container) {
            container.scrollTop = (percent / 100) * (container.scrollHeight - container.clientHeight);
        }
    }
}

// ═══════════════════════════════════════════════════════════
// 클린업
// ═══════════════════════════════════════════════════════════

export function cleanupEpubViewer() {
    cleanupHighlights();

    if (currentMetadata && currentMetadata.seriesId && currentMetadata.bookId) {
        saveOnClose(currentMetadata.seriesId, currentMetadata.bookId);
    }

    stopAutoSave();

    headerVisible = false;
    currentSpreadIndex = 0;
    totalSpreads = 0;
    currentMetadata = null;
    epubData = null;
    tocVisible = false;
    clickGuideVisible = false;

    if (headerAutoCloseTimer) {
        clearTimeout(headerAutoCloseTimer);
        headerAutoCloseTimer = null;
    }
    if (clickGuideTimeout) {
        clearTimeout(clickGuideTimeout);
        clickGuideTimeout = null;
    }
    if (window._epubKeyHandler) {
        document.removeEventListener('keydown', window._epubKeyHandler);
        delete window._epubKeyHandler;
    }

    document.body.style.overflow = '';
    
    // ✅ 좌우 그림자 제거
    ['textToggleBtn', 'textViewerHeader', 'epubTocPanel', 'epubClickGuide', 'leftShadowOverlay', 'rightShadowOverlay'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
    });

    var imageContent = document.getElementById('viewerContent');
    if (imageContent) imageContent.style.display = '';
    var controls = document.getElementById('viewerControls');
    if (controls) controls.style.display = '';

    var container = document.getElementById('textViewerContainer');
    if (container) {
        container.onclick = null;
        container.onwheel = null;
        container.ontouchstart = null;
        container.ontouchend = null;
        container._pages = null;
        container._loadedChapters = null;
    }

    delete window.openTextSettings;
    delete window.toggleTextHeader;
    delete window.setTextReadMode;
    delete window.getTextReadMode;
    delete window.setTextLayout;
    delete window.getTextLayout;
    delete window.onTextThemeChange;
    delete window.scrollToProgress;
}

// ═══════════════════════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════════════════════

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('✅ EPUB Renderer loaded');
