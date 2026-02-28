/**
 * viewer_modules/text/text_theme.js
 * 텍스트 뷰어 테마 시스템 (TXT + EPUB 통합)
 */

import { TextViewerState, setTheme } from './text_state.js';
import { Events } from '../core/events.js';

/**
 * 테마 프리셋
 */
export const ThemePresets = {
    light: {
        background: '#faf9f5',
        text: '#2c2c2c',
        secondary: '#525252',
        border: '#e5e5e5'
    },
    dark: {
        background: '#1a1a1a',
        text: '#e8e8e8',
        secondary: '#999999',
        border: '#2a2a2a'
    },
    sepia: {
        background: '#f4ecd8',
        text: '#5b4636',
        secondary: '#8b7355',
        border: '#d4c5a9'
    }
};

/**
 * 테마 적용 (TXT + EPUB 통합)
 * @param {string} mode - 'light' | 'dark' | 'sepia' | 'custom'
 * @param {Object} customColors - { bg, text } (커스텀일 때)
 */
export function applyTheme(mode = null, customColors = null) {
    const currentMode = mode || TextViewerState.theme.mode;
    
    let colors;
    
    if (currentMode === 'custom') {
        colors = {
            background: customColors?.bg || TextViewerState.theme.customBg,
            text: customColors?.text || TextViewerState.theme.customText,
            secondary: adjustBrightness(customColors?.text || TextViewerState.theme.customText, 0.6),
            border: adjustBrightness(customColors?.bg || TextViewerState.theme.customBg, 1.2)
        };
    } else {
        colors = ThemePresets[currentMode] || ThemePresets.dark;
    }
    
    // TXT 뷰어 적용
    if (TextViewerState.renderType === 'txt') {
        applyThemeToTxt(colors);
    }
    
    // EPUB 뷰어 적용
    if (TextViewerState.renderType === 'epub' && TextViewerState.epub.rendition) {
        applyThemeToEpub(colors);
    }
    
    // 상태 저장
    if (mode) {
        setTheme(mode, customColors);
    }
    
    // 이벤트 발생
    Events.emit('text:theme-change', { mode: currentMode, colors });
}

/**
 * TXT 뷰어에 테마 적용
 * @param {Object} colors - 색상 객체
 */
function applyThemeToTxt(colors) {
    const viewer = document.getElementById('textViewerContainer');
    if (!viewer) return;
    
    viewer.style.setProperty('--text-bg', colors.background);
    viewer.style.setProperty('--text-color', colors.text);
    viewer.style.setProperty('--text-secondary', colors.secondary);
    viewer.style.setProperty('--text-border', colors.border);
    
    // 직접 스타일 적용 (fallback)
    viewer.style.backgroundColor = colors.background;
    viewer.style.color = colors.text;
}

/**
 * EPUB 뷰어에 테마 적용 (Epub.js)
 * @param {Object} colors - 색상 객체
 */
function applyThemeToEpub(colors) {
    const rendition = TextViewerState.epub.rendition;
    if (!rendition) return;
    
    // Epub.js Themes API
    rendition.themes.register('custom-theme', {
        'body': {
            'background': `${colors.background} !important`,
            'color': `${colors.text} !important`,
            'line-height': TextViewerState.typography.lineHeight
        },
        'p': {
            'color': `${colors.text} !important`,
            'margin-bottom': '1em'
        },
        'h1, h2, h3, h4, h5, h6': {
            'color': `${colors.text} !important`
        },
        'a': {
            'color': `${adjustBrightness(colors.text, 1.3)} !important`
        },
        'img': {
            'max-width': '100%',
            'height': 'auto'
        }
    });
    
    rendition.themes.select('custom-theme');
    
    // 폰트 크기 적용
    rendition.themes.fontSize(`${TextViewerState.typography.fontSize}px`);
    
    // 폰트 패밀리 적용
    rendition.themes.override('font-family', TextViewerState.typography.fontFamily);
}

/**
 * 타이포그래피 적용 (폰트 크기, 줄 간격)
 */
export function applyTypography() {
    const { fontSize, lineHeight, fontFamily } = TextViewerState.typography;
    
    // TXT 뷰어
    if (TextViewerState.renderType === 'txt') {
        const viewer = document.getElementById('textViewerContainer');
        if (viewer) {
            viewer.style.fontSize = `${fontSize}px`;
            viewer.style.lineHeight = lineHeight;
            viewer.style.fontFamily = fontFamily;
        }
    }
    
    // EPUB 뷰어
    if (TextViewerState.renderType === 'epub' && TextViewerState.epub.rendition) {
        const rendition = TextViewerState.epub.rendition;
        rendition.themes.fontSize(`${fontSize}px`);
        rendition.themes.override('line-height', lineHeight);
        rendition.themes.override('font-family', fontFamily);
    }
}

/**
 * 색상 밝기 조절
 * @param {string} color - HEX 색상 (#RRGGBB)
 * @param {number} factor - 배율 (1.0 = 원본, >1 = 밝게, <1 = 어둡게)
 * @returns {string} 조절된 HEX 색상
 */
function adjustBrightness(color, factor) {
    // #RRGGBB 파싱
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // 밝기 조절
    const newR = Math.min(255, Math.floor(r * factor));
    const newG = Math.min(255, Math.floor(g * factor));
    const newB = Math.min(255, Math.floor(b * factor));
    
    // HEX 변환
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

/**
 * 색상 반전 (다크↔라이트 전환 시)
 * @param {string} color - HEX 색상
 * @returns {string} 반전된 색상
 */
export function invertColor(color) {
    const hex = color.replace('#', '');
    const r = 255 - parseInt(hex.substr(0, 2), 16);
    const g = 255 - parseInt(hex.substr(2, 2), 16);
    const b = 255 - parseInt(hex.substr(4, 2), 16);
    
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 메인 앱 테마와 동기화
 * (document.body에 [data-theme] 속성 읽기)
 */
export function syncWithMainTheme() {
    const mainTheme = document.body.getAttribute('data-theme') || 'dark';
    
    // 메인 테마에 맞춰 뷰어 테마 자동 설정
    if (TextViewerState.theme.mode !== 'custom') {
        applyTheme(mainTheme);
    }
}

console.log('✅ Text Theme System loaded');
