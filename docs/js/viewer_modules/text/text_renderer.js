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
    
    // 컨테이너 준비
    const viewer = document.getElementById('viewerOverlay');
    viewer.style.display = 'flex';
    document.body.classList.add('no-scroll');
    
    // 기존 내용 정리
    let container = document.getElementById('textViewerContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'textViewerContainer';
        container.className = 'text-viewer-container';
        document.getElementById('viewerContent').appendChild(container);
    }
    
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
    
    // 이벤트 발생
    Events.emit('text:open', { bookId: metadata.bookId, metadata });
    
    console.log(`📖 TXT Viewer: ${pages.length} pages`);
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
        // 1페이지 모드: 세로로 긴 페이지
        pages.push(...create1PageLayout(paragraphs));
    } else {
        // 2페이지 모드: 양쪽 펼침
        pages.push(...create2PageLayout(paragraphs));
    }
    
    return pages;
}

/**
 * 1페이지 레이아웃 생성
 * @param {Array} paragraphs - 문단 배열
 * @returns {Array} 페이지 배열
 */
function create1PageLayout(paragraphs) {
    const pages = [];
    const CHARS_PER_PAGE = 1500; // 기준 글자 수
    
    let currentPage = '';
    let charCount = 0;
    
    paragraphs.forEach(p => {
        const pLength = p.replace(/<[^>]*>/g, '').length;
        
        if (charCount + pLength > CHARS_PER_PAGE && currentPage) {
            // 페이지 완성
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
    
    // 마지막 페이지
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
 * @param {Array} paragraphs - 문단 배열
 * @returns {Array} 페이지 배열
 */
function create2PageLayout(paragraphs) {
    const pages = [];
    const CHARS_PER_PAGE = 1000; // 2페이지는 공간이 좁으므로 적게
    
    let leftPage = '';
    let rightPage = '';
    let leftCharCount = 0;
    let rightCharCount = 0;
    let isLeft = true;
    
    paragraphs.forEach(p => {
        const pLength = p.replace(/<[^>]*>/g, '').length;
        
        if (isLeft) {
            if (leftCharCount + pLength > CHARS_PER_PAGE && leftPage) {
                // 왼쪽 완성, 오른쪽으로
                isLeft = false;
                rightPage = p;
                rightCharCount = pLength;
            } else {
                leftPage += p;
                leftCharCount += pLength;
            }
        } else {
            if (rightCharCount + pLength > CHARS_PER_PAGE && rightPage) {
                // 양쪽 완성, 페이지 저장
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
    
    // 마지막 페이지
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
 * @param {string} content - HTML 내용
 * @returns {string} 래핑된 HTML
 */
function wrapContent(content) {
    return `
        <div class="text-page text-page-single" style="
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 60px;
            height: calc(100vh - 90px);
            overflow-y: auto;
            box-sizing: border-box;
        ">
            ${content}
        </div>
    `;
}

/**
 * 2페이지 콘텐츠 래핑
 * @param {string} leftContent - 왼쪽 페이지
 * @param {string} rightContent - 오른쪽 페이지
 * @returns {string} 래핑된 HTML
 */
function wrap2Pages(leftContent, rightContent) {
    return `
        <div class="text-page text-page-double" style="
            display: flex;
            max-width: 1400px;
            margin: 0 auto;
            height: calc(100vh - 90px);
            gap: 40px;
        ">
            <div class="text-page-left" style="
                flex: 1;
                padding: 40px 30px;
                border-right: 1px solid var(--text-border, #2a2a2a);
                overflow-y: auto;
            ">
                ${leftContent}
            </div>
            <div class="text-page-right" style="
                flex: 1;
                padding: 40px 30px;
                overflow-y: auto;
            ">
                ${rightContent || '<div style="color:var(--text-secondary, #999); text-align:center; padding-top:50%;">빈 페이지</div>'}
            </div>
        </div>
    `;
}

/**
 * 현재 페이지 렌더링
 * @param {number} pageIndex - 페이지 번호 (0-based)
 */
export function renderPage(pageIndex) {
    const page = TextViewerState.pages[pageIndex];
    if (!page) return;
    
    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    
    // 페이지 표시
    container.innerHTML = page.html;
    
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
 * 페이지 UI 업데이트 (슬라이더, 진행바 등)
 */
function updatePageUI() {
    const currentPage = TextViewerState.currentPage + 1; // 1-based
    const totalPages = TextViewerState.totalPages;
    
    // 페이지 카운터
    const counter = document.getElementById('pageCounter');
    if (counter) {
        counter.innerText = `${currentPage} / ${totalPages}`;
    }
    
    // 슬라이더
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
    
    // 진행바
    const progressBar = document.querySelector('.index-progress-bar-fill');
    if (progressBar) {
        const percent = Math.round((currentPage / totalPages) * 100);
        progressBar.style.width = `${percent}%`;
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

console.log('✅ TXT Renderer loaded');
