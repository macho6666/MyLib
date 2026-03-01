/**
 * viewer_modules/text/text_state.js
 * 텍스트 뷰어 전용 상태 관리 (경량화)
 */

/**
 * 텍스트 뷰어 상태
 */
export const TextViewerState = {
    currentBook: null,
    renderType: null,
    layout: '1page', 
    
    input: {
        click: true,
        wheel: true,
        scroll: false
    },
    
    theme: {
        mode: 'dark',
        customBg: '#1a1a1a',
        customText: '#e8e8e8'
    },
    
    typography: {
        fontSize: 18,
        lineHeight: 1.8,
        fontFamily: 'Pretendard, sans-serif'
    },
    
    pages: [],
    currentPage: 0,
    totalPages: 0,
    scrollProgress: 0,
    scrollPosition: 0,
    
    highlights: new Map(),
    toc: [],
    coverUrl: null,
    
    epub: {
        book: null,
        rendition: null,
        currentCfi: null,
        isReady: false
    },
    
    ui: {
        controlsVisible: false,
        settingsOpen: false,
        progressBarVisible: true
    }
};

// 초기값 로드 (한 번만)
(function loadSavedSettings() {
    const layout = localStorage.getItem('text_layout');
    if (layout) TextViewerState.layout = layout;
    
    const fontSize = localStorage.getItem('text_fontsize');
    if (fontSize) TextViewerState.typography.fontSize = parseInt(fontSize);
    
    const lineHeight = localStorage.getItem('text_lineheight');
    if (lineHeight) TextViewerState.typography.lineHeight = parseFloat(lineHeight);
    
    const customBg = localStorage.getItem('text_custom_bg');
    if (customBg) TextViewerState.theme.customBg = customBg;
    
    const customText = localStorage.getItem('text_custom_text');
    if (customText) TextViewerState.theme.customText = customText;
})();

/**
 * 레이아웃 변경
 */
export function setLayout(layout) {
    TextViewerState.layout = layout;
    localStorage.setItem('text_layout', layout);
}

/**
 * 레이아웃 불러오기
 */
export function getLayout() {
    return TextViewerState.layout;
}
/**
 * 테마 변경
 */
export function setTheme(mode, customColors = null) {
    TextViewerState.theme.mode = mode;
    localStorage.setItem('text_theme', mode);
    
    if (mode === 'custom' && customColors) {
        TextViewerState.theme.customBg = customColors.bg;
        TextViewerState.theme.customText = customColors.text;
        localStorage.setItem('text_custom_bg', customColors.bg);
        localStorage.setItem('text_custom_text', customColors.text);
    }
}

/**
 * 글꼴 크기 변경
 */
export function setFontSize(size) {
    TextViewerState.typography.fontSize = Math.max(12, Math.min(48, size));
    localStorage.setItem('text_fontsize', TextViewerState.typography.fontSize);
}

/**
 * 줄 간격 변경
 */
export function setLineHeight(height) {
    TextViewerState.typography.lineHeight = Math.max(1.0, Math.min(3.0, height));
    localStorage.setItem('text_lineheight', TextViewerState.typography.lineHeight);
}

/**
 * 입력 방식 토글
 */
export function setInputMethod(method, enabled) {
    TextViewerState.input[method] = enabled;
    localStorage.setItem(`text_input_${method}`, enabled);
}

/**
 * 페이지 이동
 */
export function setCurrentPage(page) {
    TextViewerState.currentPage = Math.max(0, Math.min(page, TextViewerState.totalPages - 1));
}

/**
 * 하이라이트 추가
 */
export function addHighlight(bookId, highlight) {
    if (!TextViewerState.highlights.has(bookId)) {
        TextViewerState.highlights.set(bookId, []);
    }
    TextViewerState.highlights.get(bookId).push(highlight);
    saveHighlights();
}

/**
 * 하이라이트 삭제
 */
export function removeHighlight(bookId, highlightId) {
    if (!TextViewerState.highlights.has(bookId)) return;
    
    const bookHighlights = TextViewerState.highlights.get(bookId);
    const index = bookHighlights.findIndex(h => h.id === highlightId);
    
    if (index > -1) {
        bookHighlights.splice(index, 1);
        saveHighlights();
    }
}

/**
 * 하이라이트 불러오기
 */
export function getHighlights(bookId) {
    return TextViewerState.highlights.get(bookId) || [];
}

/**
 * 하이라이트 저장
 */
function saveHighlights() {
    const highlights = Array.from(TextViewerState.highlights.entries());
    localStorage.setItem('text_highlights', JSON.stringify(highlights));
}

/**
 * 하이라이트 로드
 */
function loadHighlights() {
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

/**
 * 상태 초기화 (뷰어 닫을 때)
 */
export function resetViewerState() {
    TextViewerState.currentBook = null;
    TextViewerState.renderType = null;
    TextViewerState.pages = [];
    TextViewerState.currentPage = 0;
    TextViewerState.totalPages = 0;
    TextViewerState.scrollProgress = 0;
    TextViewerState.scrollPosition = 0;
    TextViewerState.toc = [];
    TextViewerState.coverUrl = null;
    
    TextViewerState.epub.book = null;
    TextViewerState.epub.rendition = null;
    TextViewerState.epub.currentCfi = null;
    TextViewerState.epub.isReady = false;
    
    TextViewerState.ui.controlsVisible = false;
    TextViewerState.ui.settingsOpen = false;
}

// 초기 로드
loadHighlights();

console.log('✅ Text State loaded');
