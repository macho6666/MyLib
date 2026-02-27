/**
 * viewer_modules/text/text_state.js
 * 텍스트 뷰어 전용 상태 관리 (상세)
 */

import { saveSettings } from '../core/state.js';

/**
 * 텍스트 뷰어 상태
 */
export const TextViewerState = {
    // 현재 열린 책 정보
    currentBook: null,        // { id, name, seriesId, ... }
    
    // 렌더링 타입
    renderType: null,         // 'txt' | 'epub'
    
    // 레이아웃
    layout: '1page',          // '1page' | '2page'
    
    // 입력 방식
    input: {
        click: true,
        wheel: true,
        scroll: false         // 1페이지 전용
    },
    
    // 테마
    theme: {
        mode: 'dark',         // 'light' | 'dark' | 'custom'
        customBg: '#1a1a1a',
        customText: '#e8e8e8'
    },
    
    // 타이포그래피
    typography: {
        fontSize: 18,
        lineHeight: 1.8,
        fontFamily: 'Noto Serif KR, serif'
    },
    
    // 페이지
    pages: [],                // TXT: [{ type: 'cover', url }, { type: 'content', html }, ...]
    currentPage: 0,
    totalPages: 0,
    
    // 하이라이트
    highlights: new Map(),    // bookId -> [{ id, range, text, color, memo }, ...]
    
    // 목차
    toc: [],                  // [{ title, page }, ...]
    coverUrl: null,
    
    // EPUB 전용
    epub: {
        book: null,           // Epub.js Book 인스턴스
        rendition: null,      // Epub.js Rendition 인스턴스
        currentCfi: null,     // 현재 위치 (CFI)
        isReady: false
    },
    
    // UI 상태
    ui: {
        controlsVisible: false,
        settingsOpen: false,
        progressBarVisible: true
    }
};

/**
 * 레이아웃 변경
 * @param {string} layout - '1page' | '2page'
 */
export function setLayout(layout) {
    TextViewerState.layout = layout;
    localStorage.setItem('text_layout', layout);
    saveSettings();
}

/**
 * 테마 변경
 * @param {string} mode - 'light' | 'dark' | 'custom'
 * @param {Object} customColors - { bg, text } (커스텀일 때)
 */
export function setTheme(mode, customColors = null) {
    TextViewerState.theme.mode = mode;
    
    if (mode === 'custom' && customColors) {
        TextViewerState.theme.customBg = customColors.bg;
        TextViewerState.theme.customText = customColors.text;
        localStorage.setItem('text_custom_bg', customColors.bg);
        localStorage.setItem('text_custom_text', customColors.text);
    }
    
    localStorage.setItem('text_theme', mode);
    saveSettings();
}

/**
 * 글꼴 크기 변경
 * @param {number} size - 폰트 크기 (px)
 */
export function setFontSize(size) {
    TextViewerState.typography.fontSize = Math.max(12, Math.min(48, size));
    localStorage.setItem('text_fontsize', TextViewerState.typography.fontSize);
    saveSettings();
}

/**
 * 줄 간격 변경
 * @param {number} height - 줄 간격
 */
export function setLineHeight(height) {
    TextViewerState.typography.lineHeight = Math.max(1.0, Math.min(3.0, height));
    localStorage.setItem('text_lineheight', TextViewerState.typography.lineHeight);
    saveSettings();
}

/**
 * 입력 방식 토글
 * @param {string} method - 'click' | 'wheel' | 'scroll'
 * @param {boolean} enabled - 활성화 여부
 */
export function setInputMethod(method, enabled) {
    TextViewerState.input[method] = enabled;
    localStorage.setItem(`text_input_${method}`, enabled);
    saveSettings();
}

/**
 * 페이지 이동
 * @param {number} page - 페이지 번호 (0-based)
 */
export function setCurrentPage(page) {
    TextViewerState.currentPage = Math.max(0, Math.min(page, TextViewerState.totalPages - 1));
}

/**
 * 하이라이트 추가
 * @param {string} bookId - 책 ID
 * @param {Object} highlight - { id, range, text, color, memo }
 */
export function addHighlight(bookId, highlight) {
    if (!TextViewerState.highlights.has(bookId)) {
        TextViewerState.highlights.set(bookId, []);
    }
    TextViewerState.highlights.get(bookId).push(highlight);
    
    // localStorage 저장
    const highlights = Array.from(TextViewerState.highlights.entries());
    localStorage.setItem('text_highlights', JSON.stringify(highlights));
}

/**
 * 하이라이트 삭제
 * @param {string} bookId - 책 ID
 * @param {string} highlightId - 하이라이트 ID
 */
export function removeHighlight(bookId, highlightId) {
    if (!TextViewerState.highlights.has(bookId)) return;
    
    const bookHighlights = TextViewerState.highlights.get(bookId);
    const index = bookHighlights.findIndex(h => h.id === highlightId);
    
    if (index > -1) {
        bookHighlights.splice(index, 1);
        
        // localStorage 저장
        const highlights = Array.from(TextViewerState.highlights.entries());
        localStorage.setItem('text_highlights', JSON.stringify(highlights));
    }
}

/**
 * 하이라이트 불러오기
 * @param {string} bookId - 책 ID
 * @returns {Array} 하이라이트 배열
 */
export function getHighlights(bookId) {
    return TextViewerState.highlights.get(bookId) || [];
}

/**
 * 상태 초기화 (뷰어 닫을 때)
 */
export function resetViewerState() {
    TextViewerState.currentBook = null;
    TextViewerState.renderType = null;
    TextViewerState.pages = [];
    TextViewerState.currentPage = 0;
    TextViewerState.totalPages = 0;
    TextViewerState.toc = [];
    TextViewerState.coverUrl = null;
    
    // EPUB 초기화
    TextViewerState.epub.book = null;
    TextViewerState.epub.rendition = null;
    TextViewerState.epub.currentCfi = null;
    TextViewerState.epub.isReady = false;
    
    // UI 초기화
    TextViewerState.ui.controlsVisible = false;
    TextViewerState.ui.settingsOpen = false;
}

/**
 * 하이라이트 전체 로드 (앱 시작 시)
 */
export function loadHighlights() {
    const saved = localStorage.getItem('text_highlights');
    if (saved) {
        try {
            const entries = JSON.parse(saved);
            TextViewerState.highlights = new Map(entries);
        } catch (e) {
            console.error('Failed to load highlights:', e);
        }
    }
}

// 초기 로드
loadHighlights();

console.log('✅ Text Viewer State initialized');
