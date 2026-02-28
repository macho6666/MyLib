/**
 * viewer_modules/text/epub_renderer.js
 * EPUB 렌더링 (Epub.js 사용)
 */

import { TextViewerState } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme } from './text_theme.js';
import { parseEpubTOC } from './text_toc.js';
import { saveBookmark, loadBookmark, updateProgress, startAutoSave } from './text_bookmark.js';
import { showToast } from '../core/utils.js';

/**
 * EPUB 뷰어 초기화 및 렌더링
 * @param {Blob} epubBlob - EPUB 파일 Blob
 * @param {Object} metadata - { bookId, name, seriesId }
 */
export async function renderEpub(epubBlob, metadata) {
    TextViewerState.renderType = 'epub';
    TextViewerState.currentBook = metadata;
    
    // Epub.js 로드 확인
    if (typeof ePub === 'undefined') {
        await loadEpubJs();
    }
    
    // 컨테이너 준비
    const viewer = document.getElementById('viewerOverlay');
    viewer.style.display = 'flex';
    document.body.classList.add('no-scroll');
    
    // 기존 렌더링 정리
    cleanupEpubViewer();
    
    // EPUB 컨테이너 생성
    let container = document.getElementById('epubViewerContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'epubViewerContainer';
        container.className = 'epub-viewer-container';
        container.style.cssText = `
            width: 100%;
            height: 100%;
            background: var(--bg-primary, #0d0d0d);
        `;
        document.getElementById('viewerContent').appendChild(container);
    }
    
    try {
        // EPUB Book 생성
        const blobUrl = URL.createObjectURL(epubBlob);
        const book = ePub(blobUrl);
        TextViewerState.epub.book = book;
        
        await book.ready;
        
        // Rendition 생성
        const rendition = book.renderTo('epubViewerContainer', {
            width: '100%',
            height: '100%',
            flow: TextViewerState.layout === '1page' ? 'paginated' : 'scrolled',
            manager: 'default',
            spread: TextViewerState.layout === '2page' ? 'auto' : 'none'
        });
        
        TextViewerState.epub.rendition = rendition;
        
        // 목차 파싱
        await parseEpubTOC(book);
        
        // 테마 적용
        applyTheme();
        
        // 책갈피 불러오기
        const bookmark = loadBookmark(metadata.seriesId, metadata.bookId);
        
        if (bookmark && bookmark.position) {
            await rendition.display(bookmark.position);
            showToast(`📑 이어보기: ${bookmark.page + 1}페이지`);
        } else {
            await rendition.display();
        }
        
        // 이벤트 등록
        setupEpubEvents(rendition, metadata);
        
        // 자동 저장 시작
        startAutoSave(metadata.seriesId, metadata.bookId);
        
        TextViewerState.epub.isReady = true;
        
        // 이벤트 발생
        Events.emit('text:open', { bookId: metadata.bookId, metadata });
        
        console.log('📖 EPUB Viewer ready');
        
    } catch (e) {
        console.error('EPUB rendering failed:', e);
        showToast('EPUB 로드 실패: ' + e.message, 3000);
    }
}

/**
 * EPUB 이벤트 등록
 * @param {Object} rendition - Epub.js Rendition
 * @param {Object} metadata - 메타데이터
 */
function setupEpubEvents(rendition, metadata) {
    // 위치 변경 (페이지 넘김)
    rendition.on('relocated', (location) => {
        TextViewerState.epub.currentCfi = location.start.cfi;
        
        // 진행률 계산
        const progress = rendition.book.locations.percentageFromCfi(location.start.cfi);
        const currentPage = Math.floor(progress * 100);
        const totalPages = 100; // EPUB은 퍼센트 기준
        
        TextViewerState.currentPage = currentPage;
        TextViewerState.totalPages = totalPages;
        
        // UI 업데이트
        updateEpubUI(currentPage, totalPages);
        
        // 진행도 저장
        updateProgress(metadata.seriesId, metadata.bookId);
        
        // 이벤트 발생
        Events.emit('text:page-change', { page: currentPage, totalPages });
    });
    
    // 렌더링 완료
    rendition.on('rendered', (section) => {
        console.log('EPUB section rendered:', section.href);
    });
    
    // 선택 (하이라이트용)
    rendition.on('selected', (cfiRange, contents) => {
        const text = contents.window.getSelection().toString();
        if (text.trim()) {
            Events.emit('text:selection', { cfiRange, text });
        }
    });
}

/**
 * EPUB UI 업데이트
 * @param {number} currentPage - 현재 페이지 (0~100)
 * @param {number} totalPages - 전체 페이지 (100)
 */
function updateEpubUI(currentPage, totalPages) {
    // 페이지 카운터
    const counter = document.getElementById('pageCounter');
    if (counter) {
        counter.innerText = `${currentPage}%`;
    }
    
    // 슬라이더
    const slider = document.getElementById('pageSlider');
    if (slider) {
        slider.min = 0;
        slider.max = 100;
        slider.value = currentPage;
    }
    
    const sliderCurrent = document.getElementById('sliderCurrent');
    if (sliderCurrent) {
        sliderCurrent.innerText = `${currentPage}%`;
    }
    
    const sliderTotal = document.getElementById('sliderTotal');
    if (sliderTotal) {
        sliderTotal.innerText = '100%';
    }
}

/**
 * EPUB 페이지 이동
 * @param {number} direction - 방향 (1: 다음, -1: 이전)
 */
export function navigateEpub(direction) {
    const rendition = TextViewerState.epub.rendition;
    if (!rendition) return;
    
    if (direction > 0) {
        rendition.next();
    } else {
        rendition.prev();
    }
}

/**
 * EPUB 특정 위치로 이동
 * @param {string} target - CFI 또는 href
 */
export function goToEpubLocation(target) {
    const rendition = TextViewerState.epub.rendition;
    if (!rendition) return;
    
    rendition.display(target);
}

/**
 * EPUB 레이아웃 변경
 * @param {string} layout - '1page' | '2page'
 */
export function changeEpubLayout(layout) {
    const rendition = TextViewerState.epub.rendition;
    if (!rendition) return;
    
    TextViewerState.layout = layout;
    
    // flow 변경
    rendition.flow(layout === '1page' ? 'paginated' : 'scrolled');
    
    // spread 변경
    rendition.spread(layout === '2page' ? 'auto' : 'none');
    
    Events.emit('text:layout-change', { layout });
}

/**
 * EPUB 뷰어 정리
 */
export function cleanupEpubViewer() {
    if (TextViewerState.epub.rendition) {
        TextViewerState.epub.rendition.destroy();
    }
    
    if (TextViewerState.epub.book) {
        TextViewerState.epub.book.destroy();
    }
    
    const container = document.getElementById('epubViewerContainer');
    if (container) {
        container.innerHTML = '';
    }
    
    TextViewerState.epub.book = null;
    TextViewerState.epub.rendition = null;
    TextViewerState.epub.currentCfi = null;
    TextViewerState.epub.isReady = false;
}

/**
 * Epub.js 라이브러리 동적 로드
 * @returns {Promise}
 */
function loadEpubJs() {
    return new Promise((resolve, reject) => {
        if (typeof ePub !== 'undefined') {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
        script.onload = () => {
            console.log('✅ Epub.js loaded');
            resolve();
        };
        script.onerror = () => {
            reject(new Error('Failed to load Epub.js'));
        };
        document.head.appendChild(script);
    });
}

/**
 * EPUB 하이라이트 추가
 * @param {string} cfiRange - CFI 범위
 * @param {string} color - 색상
 * @param {Object} data - 추가 데이터
 */
export function addEpubHighlight(cfiRange, color = '#ffeb3b', data = {}) {
    const rendition = TextViewerState.epub.rendition;
    if (!rendition) return;
    
    rendition.annotations.add('highlight', cfiRange, data, null, 'hl', {
        fill: color,
        'fill-opacity': '0.3',
        'mix-blend-mode': 'multiply'
    });
}

/**
 * EPUB 하이라이트 제거
 * @param {string} cfiRange - CFI 범위
 */
export function removeEpubHighlight(cfiRange) {
    const rendition = TextViewerState.epub.rendition;
    if (!rendition) return;
    
    rendition.annotations.remove(cfiRange, 'highlight');
}

console.log('✅ EPUB Renderer loaded');
