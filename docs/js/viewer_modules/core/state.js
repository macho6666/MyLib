/**
 * viewer_modules/core/state.js
 * 통합 상태 관리 (텍스트/이미지 뷰어 공통)
 */

export const GlobalState = {
    viewerType: null,  // 'text' | 'image' | null
    currentBook: null, // 현재 열린 책 정보
    
    // 공통 설정
    common: {
        autoSave: true,
        syncEnabled: true
    }
};

// 텍스트 뷰어 전용 상태
export const TextState = {
    // 레이아웃
    layout: '1page',              // '1page' | '2page'
    
    // 입력 방식
    inputMethods: {
        click: true,              // 좌우 클릭
        wheel: true,              // 마우스 휠
        scroll: false             // 스크롤 모드 (1페이지 전용)
    },
    
    // 테마
    theme: {
        mode: 'dark',             // 'light' | 'dark' | 'custom'
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
    pages: [],                    // [{ type, content }, ...]
    currentPage: 0,
    totalPages: 0,
    
    // 하이라이트
    highlights: [],
    
    // 표지/목차
    coverUrl: null,
    toc: [],
    
    // Epub.js 인스턴스
    epubBook: null,
    epubRendition: null
};

// 이미지 뷰어 전용 상태 (기존 유지)
export const ImageState = {
    mode: '1page',                // '1page' | '2page'
    scrollMode: false,            // 웹툰 모드
    coverPriority: true,
    rtlMode: false,
    
    images: [],
    spreads: [],
    currentSpreadIndex: 0,
    
    preload: true
};

/**
 * 설정 로드 (localStorage)
 */
export function loadSettings() {
    // 텍스트 뷰어 설정
    const savedLayout = localStorage.getItem('text_layout');
    if (savedLayout) TextState.layout = savedLayout;
    
    const savedTheme = localStorage.getItem('text_theme');
    if (savedTheme) TextState.theme.mode = savedTheme;
    
    const savedFontSize = localStorage.getItem('text_fontsize');
    if (savedFontSize) TextState.typography.fontSize = parseInt(savedFontSize);
    
    const savedLineHeight = localStorage.getItem('text_lineheight');
    if (savedLineHeight) TextState.typography.lineHeight = parseFloat(savedLineHeight);
    
    // 커스텀 색상
    const savedCustomBg = localStorage.getItem('text_custom_bg');
    if (savedCustomBg) TextState.theme.customBg = savedCustomBg;
    
    const savedCustomText = localStorage.getItem('text_custom_text');
    if (savedCustomText) TextState.theme.customText = savedCustomText;
    
    // 입력 방식
    const savedClick = localStorage.getItem('text_input_click');
    if (savedClick !== null) TextState.inputMethods.click = (savedClick === 'true');
    
    const savedWheel = localStorage.getItem('text_input_wheel');
    if (savedWheel !== null) TextState.inputMethods.wheel = (savedWheel === 'true');
    
    const savedScroll = localStorage.getItem('text_input_scroll');
    if (savedScroll !== null) TextState.inputMethods.scroll = (savedScroll === 'true');
    
    // 이미지 뷰어 설정 (기존)
    const savedImageMode = localStorage.getItem('image_mode');
    if (savedImageMode) ImageState.mode = savedImageMode;
    
    const savedRTL = localStorage.getItem('image_rtl');
    if (savedRTL !== null) ImageState.rtlMode = (savedRTL === 'true');
    
    const savedScrollMode = localStorage.getItem('image_scroll');
    if (savedScrollMode !== null) ImageState.scrollMode = (savedScrollMode === 'true');
    
    console.log('✅ Settings loaded from localStorage');
}

/**
 * 설정 저장 (localStorage)
 */
export function saveSettings() {
    // 텍스트 뷰어
    localStorage.setItem('text_layout', TextState.layout);
    localStorage.setItem('text_theme', TextState.theme.mode);
    localStorage.setItem('text_fontsize', TextState.typography.fontSize);
    localStorage.setItem('text_lineheight', TextState.typography.lineHeight);
    localStorage.setItem('text_custom_bg', TextState.theme.customBg);
    localStorage.setItem('text_custom_text', TextState.theme.customText);
    localStorage.setItem('text_input_click', TextState.inputMethods.click);
    localStorage.setItem('text_input_wheel', TextState.inputMethods.wheel);
    localStorage.setItem('text_input_scroll', TextState.inputMethods.scroll);
    
    // 이미지 뷰어
    localStorage.setItem('image_mode', ImageState.mode);
    localStorage.setItem('image_rtl', ImageState.rtlMode);
    localStorage.setItem('image_scroll', ImageState.scrollMode);
    
    console.log('💾 Settings saved to localStorage');
}

// 초기 로드
loadSettings();
