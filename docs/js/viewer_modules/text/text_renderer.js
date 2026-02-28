/**
 * viewer_modules/text/text_renderer.js
 * TXT 렌더링 (페이지 계산 + 표시)
 */

import { TextViewerState, setCurrentPage } from './text_state.js';
import { Events } from '../core/events.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { createCoverPage, createTOCPage } from './text_toc.js';
import { updateProgress } from './text_bookmark.js';

/**
 * TXT 뷰어 초기화 및 렌더링
 * @param {string} textContent - 전체 텍스트 내용
 * @param {Object} metadata - { bookId, name, seriesId, coverUrl, toc }
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
    
    // 텍스트 뷰어 컨테이너 생성
    let container = document.getElementById('textViewerContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'textViewerContainer';
        container.className = 'text-viewer-container';
        viewer.insertBefore(container, document.getElementById('viewerControls'));
    }
    
    // 컨테이너 스타일
    container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 90px;
        background: var(--bg-primary, #0d0d0d);
        color: var(--text-primary, #e8e8e8);
        overflow-y: auto;
        z-index: 1;
    `;
    
    container.innerHTML = '<div style="color:white; text-align:center; padding:40px;">페이지 계산 중...</div>';
    
    // 페이지 구성
    const pages = [];
    
    // 0페이지: 표지 (있으면)
    if (metadata.coverUrl) {
        pages.push({
            type: 'cover',
            html: createCoverPage(metadata.coverUrl, metadata.name)
        });
    }
    
    // 1페이지: 목차 (있으면)
    if (metadata.toc && metadata.toc.length > 0) {
        pages.push({
            type: 'toc',
            html: createTOCPage()
        });
    }
    
    // 본문 페이지 생성
    const contentPages = await createTextPages(textContent);
    pages.push(...contentPages);
    
    TextViewerState.pages = pages;
    TextViewerState.totalPages = pages.length;
    TextViewerState.currentPage = 0;
    
    // 테마 적용
    applyTheme();
    applyTypography();
    
    // 첫 페이지 렌더링
    renderPage(0);
    
    // 컨트롤 표시
    showTextViewerControls();
    
    // 이벤트 발생
    Events.emit('text:open', { bookId: metadata.bookId, metadata });
    
    console.log(`📖 TXT Viewer: ${pages.length} pages`);
}

/**
 * 텍스트 뷰어 컨트롤 표시/설정
 */
function showTextViewerControls() {
    const controls = document.getElementById('viewerControls');
    if (controls) {
        controls.style.display = 'block';
    }
    
    // 뷰어 제목 업데이트
    const titleEl = document.getElementById('viewerTitle');
    if (titleEl && TextViewerState.currentBook) {
        titleEl.textContent = TextViewerState.currentBook.name || 'Text Viewer';
    }
    
    // 이미지 전용 버튼 숨기기
    document.querySelectorAll('.image-only').forEach(btn => {
        btn.style.display = 'none';
    });
    
    // EPUB 전용 버튼 숨기기 (TXT는 필요 없음)
    document.querySelectorAll('.epub-only').forEach(btn => {
        btn.style.display = 'none';
    });
}

/**
 * 텍스트를 페이지로 분할
 * @param {string} textContent - 전체 텍스트
 * @returns {Promise<Array>} 페이지 배열
 */
async function createTextPages(textContent) {
    const pages = [];
    const layout = TextViewerState.layout;
    
    // 문단 분리
    const paragraphs = textContent
        .split(/\n\n+/)
        .filter(p => p.trim())
        .map(p => `<p>${escapeHtml(p.trim())}</p>`);
    
    if (layout === '1page') {
        pages.push(...create1PageLayout(paragraphs));
    } else {
        pages.push(...create2PageLayout(paragraphs));
    }
    
    return pages;
}

/**
 * 1페이지 레이아웃 생성
 */
function create1PageLayout(paragraphs) {
    const pages = [];
    const CHARS_PER_PAGE = 1500;
    
    let currentPage = '';
    let charCount = 0;
    
    paragraphs.forEach(p => {
        const pLength = p.replace(/<[^>]*>/g, '').length;
        
        if (charCount + pLength > CHARS_PER_PAGE && currentPage) {
            pages.push({
                type: 'content',
                html: wrapContent(currentPage)
            });
            currentPage = p;
            charCount = pLength;
        } else {
            currentPage += p;
            charCount += pLength;
        }
    });
    
    if (currentPage) {
        pages.push({
            type: 'content',
            html: wrapContent(currentPage)
        });
    }
    
    return pages;
}

/**
 * 2페이지 레이아웃 생성
 */
function create2PageLayout(paragraphs) {
    const pages = [];
    const CHARS_PER_PAGE = 1000;
    
    let leftPage = '';
    let rightPage = '';
    let leftCharCount = 0;
    let rightCharCount = 0;
    let isLeft = true;
    
    paragraphs.forEach(p => {
        const pLength = p.replace(/<[^>]*>/g, '').length;
        
        if (isLeft) {
            if (leftCharCount + pLength > CHARS_PER_PAGE && leftPage) {
                isLeft = false;
                rightPage = p;
                rightCharCount = pLength;
            } else {
                leftPage += p;
                leftCharCount += pLength;
            }
        } else {
            if (rightCharCount + pLength > CHARS_PER_PAGE && rightPage) {
                pages.push({
                    type: 'content',
                    html: wrap2Pages(leftPage, rightPage)
                });
                leftPage = p;
                rightPage = '';
                leftCharCount = pLength;
                rightCharCount = 0;
                isLeft = true;
            } else {
                rightPage += p;
                rightCharCount += pLength;
            }
        }
    });
    
    if (leftPage || rightPage) {
        pages.push({
            type: 'content',
            html: wrap2Pages(leftPage, rightPage)
        });
    }
    
    return pages;
}

/**
 * 1페이지 콘텐츠 래핑
 */
function wrapContent(content) {
    return `
        <div class="text-page text-page-single" style="
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            min-height: 100%;
            box-sizing: border-box;
            font-size: 18px;
            line-height: 1.8;
            word-break: keep-all;
        ">
            ${content}
        </div>
    `;
}

/**
 * 2페이지 콘텐츠 래핑
 */
function wrap2Pages(leftContent, rightContent) {
    return `
        <div class="text-page text-page-double" style="
            display: flex;
            max-width: 1400px;
            margin: 0 auto;
            min-height: 100%;
            gap: 40px;
            padding: 20px;
            box-sizing: border-box;
        ">
            <div class="text-page-left" style="
                flex: 1;
                padding: 20px;
                border-right: 1px solid var(--border-color, #2a2a2a);
                font-size: 16px;
                line-height: 1.8;
            ">
                ${leftContent}
            </div>
            <div class="text-page-right" style="
                flex: 1;
                padding: 20px;
                font-size: 16px;
                line-height: 1.8;
            ">
                ${rightContent || '<div style="color:var(--text-secondary, #999); text-align:center; padding-top:50%;">빈 페이지</div>'}
            </div>
        </div>
    `;
}

/**
 * 현재 페이지 렌더링
 */
export function renderPage(pageIndex) {
    const page = TextViewerState.pages[pageIndex];
    if (!page) return;
    
    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    
    // 페이지 표시
    container.innerHTML = page.html;
    container.scrollTop = 0;
    
    // 상태 업데이트
    setCurrentPage(pageIndex);
    
    // 클릭 이벤트 등록 (목차 페이지)
    if (page.type === 'toc') {
        container.querySelectorAll('.toc-page-item').forEach(item => {
            item.addEventListener('click', () => {
                const tocIndex = parseInt(item.getAttribute('data-toc-index'));
                const tocItem = TextViewerState.toc[tocIndex];
                if (tocItem && tocItem.page !== undefined) {
                    renderPage(tocItem.page);
                }
            });
        });
    }
    
    // UI 업데이트
    updatePageUI();
    
    // 진행도 저장
    if (TextViewerState.currentBook) {
        updateProgress(
            TextViewerState.currentBook.seriesId,
            TextViewerState.currentBook.bookId
        );
    }
    
    // 이벤트 발생
    Events.emit('text:page-change', {
        page: pageIndex,
        totalPages: TextViewerState.totalPages
    });
}

/**
 * 페이지 UI 업데이트
 */
function updatePageUI() {
    const currentPage = TextViewerState.currentPage + 1;
    const totalPages = TextViewerState.totalPages;
    
    const counter = document.getElementById('pageCounter');
    if (counter) {
        counter.innerText = `${currentPage} / ${totalPages}`;
        counter.style.display = 'block';
    }
    
    const slider = document.getElementById('pageSlider');
    if (slider) {
        slider.min = 1;
        slider.max = totalPages;
        slider.value = currentPage;
    }
    
    const sliderCurrent = document.getElementById('sliderCurrent');
    if (sliderCurrent) {
        sliderCurrent.innerText = currentPage;
    }
    
    const sliderTotal = document.getElementById('sliderTotal');
    if (sliderTotal) {
        sliderTotal.innerText = totalPages;
    }
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 텍스트 뷰어 닫을 때 정리
 */
export function cleanupTextRenderer() {
    // 이미지 뷰어 요소 다시 표시
    const imageContent = document.getElementById('viewerContent');
    if (imageContent) {
        imageContent.style.display = '';
    }
    
    // 이미지 전용 버튼 다시 표시
    document.querySelectorAll('.image-only').forEach(btn => {
        btn.style.display = '';
    });
}

console.log('✅ TXT Renderer loaded');
