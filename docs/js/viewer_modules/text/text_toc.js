/**
 * viewer_modules/text/text_toc.js
 * 목차 + 표지(cover.jpg) 처리
 */

import { TextViewerState } from './text_state.js';

/**
 * 표지 이미지 로드 (cover.jpg)
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 * @returns {Promise<string|null>} 표지 URL 또는 null
 */
export async function loadCover(seriesId, bookId) {
    try {
        // GAS API: 같은 폴더의 cover.jpg 검색
        const result = await API.request('get_sibling_file', {
            currentFileId: bookId,
            fileName: 'cover.jpg'
        });
        
        if (result && result.thumbnailLink) {
            TextViewerState.coverUrl = result.thumbnailLink;
            return result.thumbnailLink;
        }
        
        // cover.png도 시도
        const pngResult = await API.request('get_sibling_file', {
            currentFileId: bookId,
            fileName: 'cover.png'
        });
        
        if (pngResult && pngResult.thumbnailLink) {
            TextViewerState.coverUrl = pngResult.thumbnailLink;
            return pngResult.thumbnailLink;
        }
        
        return null;
        
    } catch (e) {
        console.warn('Cover image not found:', e);
        return null;
    }
}

/**
 * EPUB 목차 파싱
 * @param {Object} epubBook - Epub.js Book 인스턴스
 * @returns {Promise<Array>} 목차 배열 [{ title, href, page }, ...]
 */
export async function parseEpubTOC(epubBook) {
    try {
        await epubBook.ready;
        
        const navigation = await epubBook.loaded.navigation;
        const toc = navigation.toc;
        
        // 목차 정규화
        const normalizedTOC = toc.map((item, index) => ({
            id: `toc-${index}`,
            title: item.label,
            href: item.href,
            subitems: item.subitems || []
        }));
        
        TextViewerState.toc = normalizedTOC;
        return normalizedTOC;
        
    } catch (e) {
        console.error('Failed to parse EPUB TOC:', e);
        return [];
    }
}

/**
 * TXT 목차 생성 (제목 패턴 감지)
 * @param {string} textContent - 전체 텍스트 내용
 * @returns {Array} 목차 배열
 */
export function generateTxtTOC(textContent) {
    const toc = [];
    
    // 제목 패턴 (예: "# 제목", "## 제목", "1. 제목" 등)
    const patterns = [
        /^#{1,3}\s+(.+)$/gm,           // Markdown 스타일
        /^제\s*\d+\s*장[:\s]+(.+)$/gm,  // "제1장: 제목"
        /^\d+\.\s+(.+)$/gm,             // "1. 제목"
        /^-{3,}\s*$/gm                  // 구분선
    ];
    
    const lines = textContent.split('\n');
    let currentPage = 0;
    const linesPerPage = 30; // 임시 기준 (실제는 렌더링 후 계산)
    
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        
        // 제목 패턴 매칭
        patterns.forEach(pattern => {
            const match = trimmed.match(pattern);
            if (match && match[1]) {
                toc.push({
                    id: `toc-${toc.length}`,
                    title: match[1].trim(),
                    page: Math.floor(index / linesPerPage),
                    lineIndex: index
                });
            }
        });
    });
    
    TextViewerState.toc = toc;
    return toc;
}

/**
 * 목차 UI 렌더링
 * @param {HTMLElement} container - 목차를 표시할 컨테이너
 * @param {Function} onItemClick - 목차 항목 클릭 콜백 (item) => {}
 */
export function renderTOC(container, onItemClick) {
    if (!container) return;
    
    const toc = TextViewerState.toc;
    
    if (!toc || toc.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:var(--text-tertiary); text-align:center;">목차가 없습니다</div>';
        return;
    }
    
    container.innerHTML = '';
    
    toc.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'toc-item';
        itemEl.style.cssText = `
            padding: 10px 16px;
            cursor: pointer;
            border-bottom: 1px solid var(--border-color);
            transition: background 0.2s ease;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        
        itemEl.innerHTML = `
            <span style="font-size: 13px; color: var(--text-primary);">${item.title}</span>
            <span style="font-size: 11px; color: var(--text-tertiary);">${item.page !== undefined ? `${item.page + 1}p` : ''}</span>
        `;
        
        itemEl.addEventListener('mouseenter', () => {
            itemEl.style.background = 'var(--bg-hover)';
        });
        
        itemEl.addEventListener('mouseleave', () => {
            itemEl.style.background = 'transparent';
        });
        
        itemEl.addEventListener('click', () => {
            if (onItemClick) onItemClick(item);
        });
        
        container.appendChild(itemEl);
    });
}

/**
 * 표지 페이지 생성 (HTML)
 * @param {string} coverUrl - 표지 이미지 URL
 * @param {string} title - 책 제목
 * @returns {string} HTML
 */
export function createCoverPage(coverUrl, title) {
    return `
        <div class="cover-page" style="
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: var(--text-bg, #1a1a1a);
            padding: 40px;
        ">
            ${coverUrl ? `
                <img src="${coverUrl}" alt="Cover" style="
                    max-width: 80%;
                    max-height: 70%;
                    object-fit: contain;
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
                    margin-bottom: 30px;
                ">
            ` : ''}
            <h1 style="
                font-size: 24px;
                font-weight: 600;
                color: var(--text-color, #e8e8e8);
                text-align: center;
                margin-top: 20px;
            ">${title}</h1>
        </div>
    `;
}

/**
 * 목차 페이지 생성 (HTML)
 * @returns {string} HTML
 */
export function createTOCPage() {
    const toc = TextViewerState.toc;
    
    if (!toc || toc.length === 0) return '';
    
    const items = toc.map((item, index) => `
        <div class="toc-page-item" data-toc-index="${index}" style="
            padding: 12px 0;
            border-bottom: 1px solid var(--text-border, #2a2a2a);
            cursor: pointer;
            display: flex;
            justify-content: space-between;
        ">
            <span style="color: var(--text-color, #e8e8e8); font-size: 14px;">${item.title}</span>
            <span style="color: var(--text-secondary, #999); font-size: 12px;">${item.page !== undefined ? item.page + 1 : ''}</span>
        </div>
    `).join('');
    
    return `
        <div class="toc-page" style="
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
            background: var(--text-bg, #1a1a1a);
            color: var(--text-color, #e8e8e8);
        ">
            <h2 style="
                font-size: 20px;
                font-weight: 600;
                margin-bottom: 30px;
                text-align: center;
                border-bottom: 2px solid var(--text-border, #2a2a2a);
                padding-bottom: 16px;
            ">📚 목차</h2>
            <div class="toc-page-list">
                ${items}
            </div>
        </div>
    `;
}

console.log('✅ TOC module loaded');
