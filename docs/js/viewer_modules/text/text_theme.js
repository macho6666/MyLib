/**
 * viewer_modules/text/text_theme.js
 * 텍스트 뷰어 테마 시스템 (경량화)
 */

import { TextViewerState } from './text_state.js';

/**
 * 테마 프리셋
 */
const ThemePresets = {
    light: {
        background: '#faf9f5',
        text: '#2c2c2c'
    },
    dark: {
        background: '#1a1a1a',
        text: '#e8e8e8'
    },
    sepia: {
        background: '#f4ecd8',
        text: '#5b4636'
    }
};

/**
 * 테마 적용
 */
export function applyTheme(mode = null) {
    const currentMode = mode || TextViewerState.theme.mode || 'dark';
    const colors = ThemePresets[currentMode] || ThemePresets.dark;
    
    // 컨테이너
    const container = document.getElementById('textViewerContainer');
    if (container) {
        container.style.backgroundColor = colors.background;
        container.style.color = colors.text;
    }
    
    // 콘텐츠
    const content = document.getElementById('textViewerContent');
    if (content) {
        content.style.backgroundColor = colors.background;
        content.style.color = colors.text;
    }
    
    // 헤더
    const header = document.getElementById('textViewerHeader');
    if (header) {
        header.style.backgroundColor = currentMode === 'dark' 
            ? 'rgba(20, 20, 20, 0.95)' 
            : currentMode === 'sepia'
                ? 'rgba(244, 236, 216, 0.95)'
                : 'rgba(250, 249, 245, 0.95)';
        header.style.color = colors.text;
    }
    
    // 토글 버튼
    const toggleBtn = document.getElementById('textToggleBtn');
    if (toggleBtn) {
        toggleBtn.style.backgroundColor = currentMode === 'dark'
            ? 'rgba(0, 0, 0, 0.5)'
            : 'rgba(255, 255, 255, 0.5)';
        toggleBtn.style.color = colors.text;
    }
    
    console.log('🎨 Theme applied:', currentMode);
}

/**
 * 타이포그래피 적용
 */
export function applyTypography() {
    const { fontSize, lineHeight } = TextViewerState.typography;
    
    const content = document.getElementById('textViewerContent');
    if (content) {
        content.style.fontSize = `${fontSize}px`;
        content.style.lineHeight = lineHeight;
    }
}

console.log('✅ Text Theme loaded');
