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
        text: '#2c2c2c',
        textSecondary: '#666',
        textTertiary: '#999',
        bgCard: '#fff',
        bgInput: '#eee',
        border: '#ddd'
    },
    dark: {
        background: '#1a1a1a',
        text: '#e8e8e8',
        textSecondary: '#aaa',
        textTertiary: '#666',
        bgCard: '#1a1a1a',
        bgInput: '#222',
        border: '#2a2a2a'
    },
    sepia: {
        background: '#f4ecd8',
        text: '#5b4636',
        textSecondary: '#7a6652',
        textTertiary: '#9a8672',
        bgCard: '#e8dcc8',
        bgInput: '#ddd0b8',
        border: '#c9b99a'
    }
};

/**
 * 테마 적용
 */
export function applyTheme(mode = null) {
    const currentMode = mode || TextViewerState.theme.mode || 'dark';
    const colors = ThemePresets[currentMode] || ThemePresets.dark;
    
    // CSS 변수 설정 (전역 적용)
    const root = document.documentElement;
    root.style.setProperty('--text-primary', colors.text);
    root.style.setProperty('--text-secondary', colors.textSecondary);
    root.style.setProperty('--text-tertiary', colors.textTertiary);
    root.style.setProperty('--bg-primary', colors.background);
    root.style.setProperty('--bg-card', colors.bgCard);
    root.style.setProperty('--bg-input', colors.bgInput);
    root.style.setProperty('--border-color', colors.border);
    
    // 컨테이너 (바깥)
    const container = document.getElementById('textViewerContainer');
    if (container) {
        container.style.backgroundColor = colors.background;
        container.style.color = colors.text;
    }
    
    // 콘텐츠 (본문) - p 태그도 변경!
    const content = document.getElementById('textViewerContent');
    if (content) {
        content.style.backgroundColor = colors.background;
        content.style.color = colors.text;
        
        content.querySelectorAll('p').forEach(p => {
            p.style.color = colors.text;
        });
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
    header.style.borderBottomColor = colors.border;
    
    // 제목 색상 적용
    const title = document.getElementById('textViewerTitle');
    if (title) {
        title.style.color = colors.text;
    }
    
    // 진행률 색상 적용
    const progress = document.getElementById('textProgressIndicator');
    if (progress) {
        progress.style.color = colors.textSecondary;
    }
}
    
    // 토글 버튼
    const toggleBtn = document.getElementById('textToggleBtn');
    if (toggleBtn) {
        toggleBtn.style.backgroundColor = currentMode === 'dark'
            ? 'rgba(0, 0, 0, 0.5)'
            : 'rgba(100, 100, 100, 0.3)';
        toggleBtn.style.color = colors.text;
    }
    
    // 설정 패널
    const settingsPanel = document.getElementById('textViewerSettings');
    if (settingsPanel) {
        settingsPanel.style.backgroundColor = colors.bgCard;
        settingsPanel.style.borderLeftColor = colors.border;
    }
    
    console.log('🎨 Theme applied:', currentMode);
    if (window.onTextThemeChange) window.onTextThemeChange();
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
        
        content.querySelectorAll('p').forEach(p => {
            p.style.fontSize = `${fontSize}px`;
            p.style.lineHeight = lineHeight;
        });
    }
}

console.log('✅ Text Theme loaded');
