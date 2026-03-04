/**
 * viewer_modules/text/epub_renderer.js
 * EPUB 렌더링 (txt 뷰어와 동일한 방식) - Lazy Loading 최적화
 * ✅ 수정: 모드 전환 위치 유지, insertBefore 에러, 2page 이미지, 2page TOC
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
    window.getTextLayout = getTextLayout;
    window.onTextThemeChange = onThemeChange;
    window.scrollToProgress = scrollToProgress;

    startAutoSave(metadata.seriesId, metadata.bookId, 10000);

    const saved = localStorage.getItem('progress_' + metadata.seriesId);
    if (saved) {
        const progressData = JSON.parse(saved);
        const bookProgress = progressData[metadata.bookId];
        if (bookProgress && bookProgress.progress > 0) {
            requestAnimationFrame(function () {
                scrollToProgress(bookProgress.progress);
                console.log('📖 Restored to ' + bookProgress.progress + '%');
            });
        }
    }

    Events.emit('text:open', { bookId: metadata.bookId, metadata: metadata });
    console.log('📖 EPUB Viewer opened (mode: ' + readMode + ', layout: ' + pageLayout + ')');
}

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

function applyContainerStyle(container) {
    const is2Page = pageLayout === '2page';
    container.style.cssText =
        'position: fixed; top: 0; left: 0; right: 0; bottom: 0;' +
        'background: var(--bg-primary, #0d0d0d);' +
        'color: var(--text-primary, #e8e8e8);' +
        'overflow-x: hidden;' +
        'overflow-y: ' + (is2Page ? 'hidden' : (readMode === 'click' ? 'hidden' : 'auto')) + ';' +
        'z-index: 5001;' +
        '-webkit-overflow-scrolling: touch;' +
        'display: ' + (is2Page ? 'flex' : 'block') + ';' +
        'align-items: ' + (is2Page ? 'center' : 'stretch') + ';' +
        'justify-content: ' + (is2Page ? 'center' : 'stretch') + ';' +
        'user-select: text !important;' +
        '-webkit-user-select: text !important;';
}

// ═══════════════════════════════════════════════════════════
// 1 PAGE 모드
// ═══════════════════════════════════════════════════════════

async function create1PageContent(container) {
    const content = document.createElement('div');
    content.id = 'textViewerContent';
    content.style.cssText =
        'max-width: 800px; margin: 0 auto; padding: 24px 16px; font-size: 18px;' +
        'line-height: 1.9; word-break: keep-all; letter-spacing: 0.3px;' +
        'box-sizing: border-box; overflow-x: hidden; width: 100%;';

    if (currentMetadata.coverUrl) {
        content.innerHTML +=
            '<div style="text-align: center; margin-bottom: 32px;">' +
            '<img src="' + currentMetadata.coverUrl + '" alt="cover" style="max-width: 180px; max-height: 260px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">' +
            '<h1 style="margin-top: 16px; font-size: 20px; font-weight: 600;">' + escapeHtml(currentMetadata.name || '') + '</h1>' +
            '</div>' +
            '<hr style="border: none; border-top: 1px solid var(--border-color, #2a2a2a); margin: 32px 0;">';
    }

    container.appendChild(content);

    if (epubData && epubData.chapterPaths) {
        const initialChapters = Math.min(3, epubData.chapterPaths.length);

        for (let i = 0; i < initialChapters; i++) {
            await renderChapter(content, i);
        }

        container._loadedChapters = initialChapters;

        // 모든 챕터가 초기 로딩에 포함된 경우
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

// ✅ 수정: insertBefore 에러 제거 — 단순 appendChild
async function renderChapter(container, index) {
    if (!epubData || !epubData.chapterPaths[index]) return;

    // 이미 로드된 챕터인지 확인
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

        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'epub-chapter';
        chapterDiv.dataset.chapterIndex = index;
        chapterDiv.dataset.chapterHref = chapterPath.href;
        chapterDiv.style.cssText = 'margin-bottom: 20px;';
        chapterDiv.innerHTML = body.innerHTML;

        if (!useOriginalStyle) {
            cleanInlineStyles(chapterDiv);
        }

        // ✅ 단순 appendChild — insertBefore 사용하지 않음
        container.appendChild(chapterDiv);

        if (index < epubData.chapterPaths.length - 1) {
            const divider = document.createElement('hr');
            divider.style.cssText = 'border: none; border-top: 1px solid var(--border-color, #2a2a2a); margin: 40px 0;';
            container.appendChild(divider);
        }

        // TOC 앵커 설정
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
        
        // 이미 data URL이면 스킵
        if (src.startsWith('data:')) continue;
        
        const normalizedSrc = normalizePath(chapterHref, src);
        
        // ✅ imagePaths에 있는 이미지만 로드
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
            // ✅ imagePaths에 없으면 숨김 (404 방지)
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
// 2 PAGE 모드 (이미지 포함)
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

// ✅ 새 함수: 이미지 포함 페이지 추출
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

            // 이미지 처리
            await processImages(body, epubData.zip, epubData.imagePaths, chapter.href);

            // ✅ 추가: 남아있는 문제 이미지 완전 제거
            body.querySelectorAll('img').forEach(function(img) {
                const src = img.getAttribute('src') || '';
                if (!src.startsWith('data:')) {
                    img.removeAttribute('src');
                    img.style.display = 'none';
                }
            });

            // ✅ 추가: CSS 링크 제거
            body.querySelectorAll('link[rel="stylesheet"]').forEach(function(link) {
                link.remove();
            });
// ✅ SVG image 추가! ←←←
body.querySelectorAll('svg image').forEach(function(img) {
    var href = img.getAttribute('href') || img.getAttribute('xlink:href') || '';
    if (!href.startsWith('data:') && !href.startsWith('http')) {
        img.removeAttribute('href');
        img.removeAttribute('xlink:href');
        img.style.display = 'none';
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
// ✅ HTML을 페이지 높이에 맞게 분할
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
        
        // ✅ 이미지 제거 (404 방지)
        testClone.querySelectorAll('img').forEach(img => {
            const placeholder = document.createElement('div');
            placeholder.style.cssText = 'height: 200px; margin: 16px auto;';
            img.parentNode.replaceChild(placeholder, img);
        });
        
        // ✅ CSS 링크 제거 (404 방지)
        testClone.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            link.remove();
        });

        measureDiv.innerHTML = '';
        
        currentElements.forEach(el => {
            const clone = el.cloneNode(true);
            // ✅ 누적 요소도 이미지/CSS 제거
            clone.querySelectorAll('img').forEach(img => {
                const ph = document.createElement('div');
                ph.style.cssText = 'height: 200px; margin: 16px auto;';
                img.parentNode.replaceChild(ph, img);
            });
            clone.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                link.remove();
            });
            measureDiv.appendChild(clone);
        });
        
        measureDiv.appendChild(testClone);
        const currentHeight = measureDiv.scrollHeight;

        if (currentHeight > maxHeight && currentElements.length > 0) {
            chunks.push({
                type: 'html',
                content: currentElements.map(el => el.outerHTML).join(''),
                chapterIndex: chapterIdx
            });
            currentElements = [child]; // ✅ 원본 유지
        } else {
            currentElements.push(child);
        }
    }

    if (currentElements.length > 0) {
        chunks.push({
            type: 'html',
            content: currentElements.map(el => el.outerHTML).join(''),
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
    const progress = totalSpreads > 1 ? Math.round((spreadIndex / (totalSpreads - 1)) * 100) : 100;
    updateProgressIndicator(progress);

    setTimeout(function () {
        restoreHighlights();
    }, 50);
}

// ✅ 수정: HTML 타입 추가 (이미지 렌더링 지원)
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
    
    // ✅ 깨진 img 숨김
    contentDiv.querySelectorAll('img').forEach(function(img) {
        var src = img.getAttribute('src') || '';
        if (!src.startsWith('data:') && !src.startsWith('http')) {
            img.removeAttribute('src');
            img.style.display = 'none';
        }
    });
    
    // ✅ 추가: SVG image 태그도 숨김
    contentDiv.querySelectorAll('svg image').forEach(function(img) {
        var href = img.getAttribute('href') || img.getAttribute('xlink:href') || '';
        if (!href.startsWith('data:') && !href.startsWith('http')) {
            img.removeAttribute('href');
            img.removeAttribute('xlink:href');
            img.style.display = 'none';
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
            // 빈 페이지
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
        epubData.toc.forEach(function (item, index) {
            tocHtml +=
                '<div class="toc-item" data-toc-index="' + index + '" data-href="' + item.href + '" style="' +
                'padding: 12px 20px; cursor: pointer; font-size: 14px;' +
                'color: var(--text-secondary, #aaa); transition: all 0.2s;' +
                'border-left: 3px solid transparent;" ' +
                'onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'; this.style.color=\'#e8e8e8\';" ' +
                'onmouseout="this.style.background=\'transparent\'; this.style.color=\'var(--text-secondary, #aaa)\';">' +
                escapeHtml(item.label) +
                '</div>';
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

// ✅ 수정: 1page + 2page 모드 모두 TOC 작동
async function navigateToTocItem(href) {
    if (pageLayout === '1page') {
        const chapterIndex = epubData.chapterPaths.findIndex(function (ch) {
            return ch.href === href || ch.path === href;
        });

        if (chapterIndex >= 0) {
            const content = document.getElementById('textViewerContent');
            const container = document.getElementById('textViewerContainer');

            // 필요한 챕터까지 로드
            const loadedChapters = container._loadedChapters || 0;
            for (let i = loadedChapters; i <= chapterIndex; i++) {
                await renderChapter(content, i);
            }
            container._loadedChapters = Math.max(container._loadedChapters || 0, chapterIndex + 1);

            // 스크롤
            setTimeout(function () {
                const chapterEl = document.querySelector('[data-chapter-index="' + chapterIndex + '"]');
                if (chapterEl) {
                    chapterEl.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }
    } else {
        // ✅ 2page 모드 TOC
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
// 헤더 / 토글 버튼
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
    btn.onclick = function () { toggleHeader(); };
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
    var scrollAmount = container.clientHeight * 0.9;
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
// 모드 전환 (✅ 위치 유지 개선)
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

// ✅ 수정: 모드 전환 시 현재 챕터 + 챕터 내 진행률 유지
async function setTextLayout(layout) {
    // 현재 챕터 인덱스와 챕터 내 진행률 저장
    let currentChapterIndex = 0;
    let chapterProgress = 0;

    if (pageLayout === '1page') {
        // 1page에서 현재 보이는 챕터 찾기
        const container = document.getElementById('textViewerContainer');
        if (container) {
            const chapters = container.querySelectorAll('.epub-chapter');
            const scrollTop = container.scrollTop;
            const viewportHeight = container.clientHeight;
            const viewCenter = scrollTop + viewportHeight / 2;

            for (const ch of chapters) {
                if (ch.offsetTop <= viewCenter && ch.offsetTop + ch.offsetHeight > viewCenter) {
                    currentChapterIndex = parseInt(ch.dataset.chapterIndex) || 0;
                    chapterProgress = (viewCenter - ch.offsetTop) / ch.offsetHeight;
                    break;
                }
            }
        }
    } else {
        // 2page에서 현재 챕터 찾기
        const container = document.getElementById('textViewerContainer');
        if (container && container._pages) {
            const leftIdx = currentSpreadIndex * 2;
            const pageData = container._pages[leftIdx];
            if (pageData && pageData.chapterIndex !== undefined) {
                currentChapterIndex = pageData.chapterIndex;
            }
        }
    }

    pageLayout = layout;
    localStorage.setItem('text_layout', layout);

    var container = document.getElementById('textViewerContainer');
    if (container) container.style.visibility = 'hidden';

    await renderContent();

    // ✅ 위치 복원
    if (layout === '1page') {
        requestAnimationFrame(async function () {
            await scrollToChapter(currentChapterIndex, chapterProgress);
            if (container) container.style.visibility = 'visible';
        });
    } else {
        scrollToChapterIn2Page(currentChapterIndex);
        if (container) container.style.visibility = 'visible';
    }

    if (window.showToast) window.showToast(layout === '2page' ? '2 Page Mode' : '1 Page Mode');
}

// ✅ 새 함수: 1page 모드에서 챕터로 스크롤
async function scrollToChapter(chapterIndex, progress) {
    const container = document.getElementById('textViewerContainer');
    const content = document.getElementById('textViewerContent');
    if (!container || !content) return;

    // 필요한 챕터까지 로드
    const loadedChapters = container._loadedChapters || 0;
    if (chapterIndex >= loadedChapters) {
        for (let i = loadedChapters; i <= chapterIndex; i++) {
            await renderChapter(content, i);
        }
        container._loadedChapters = chapterIndex + 1;
    }

    // 챕터 위치로 스크롤
    const chapterEl = document.querySelector('[data-chapter-index="' + chapterIndex + '"]');
    if (chapterEl) {
        const targetScroll = chapterEl.offsetTop + (chapterEl.offsetHeight * progress);
        container.scrollTop = targetScroll - container.clientHeight / 2;
    }
}

// ✅ 새 함수: 2page 모드에서 챕터로 이동
function scrollToChapterIn2Page(chapterIndex) {
    const container = document.getElementById('textViewerContainer');
    if (!container || !container._pages) return;

    // 해당 챕터의 첫 페이지 찾기
    for (let i = 0; i < container._pages.length; i++) {
        const page = container._pages[i];
        if (page.chapterIndex === chapterIndex) {
            const spreadIndex = Math.floor(i / 2);
            renderSpread(spreadIndex);
            return;
        }
    }
}

function getTextLayout() {
    return pageLayout;
}

export function scrollToProgress(percent) {
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

    if (headerAutoCloseTimer) {
        clearTimeout(headerAutoCloseTimer);
        headerAutoCloseTimer = null;
    }
    if (window._epubKeyHandler) {
        document.removeEventListener('keydown', window._epubKeyHandler);
        delete window._epubKeyHandler;
    }

    document.body.style.overflow = '';
    ['textToggleBtn', 'textViewerHeader', 'epubTocPanel'].forEach(function (id) {
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

console.log('✅ EPUB Renderer loaded (Lazy mode + 4 fixes)');
