/**
 * viewer_modules/text/text_theme.js
 * 텍스트 뷰어 테마 시스템 (경량화)
 */

import { TextViewerState } from './text_state.js';

// 원래 테마 저장용
let originalThemeVars = null;

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
 * 원래 테마 저장
 */
function saveOriginalTheme() {
    if (originalThemeVars) return;
    
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    
    originalThemeVars = {
        '--text-primary': computedStyle.getPropertyValue('--text-primary').trim(),
        '--text-secondary': computedStyle.getPropertyValue('--text-secondary').trim(),
        '--text-tertiary': computedStyle.getPropertyValue('--text-tertiary').trim(),
        '--bg-primary': computedStyle.getPropertyValue('--bg-primary').trim(),
        '--bg-card': computedStyle.getPropertyValue('--bg-card').trim(),
        '--bg-input': computedStyle.getPropertyValue('--bg-input').trim(),
        '--border-color': computedStyle.getPropertyValue('--border-color').trim()
    };
}

/**
 * 원래 테마 복원
 */
export function restoreOriginalTheme() {
    if (!originalThemeVars) return;
    
    const root = document.documentElement;
    
    Object.keys(originalThemeVars).forEach(key => {
        if (originalThemeVars[key]) {
            root.style.setProperty(key, originalThemeVars[key]);
        } else {
            root.style.removeProperty(key);
        }
    });
    
    originalThemeVars = null;
    console.log('🎨 Original theme restored');
}

/**
 * 테마 적용
 */
export function applyTheme(mode = null) {
    saveOriginalTheme();
    
    const currentMode = mode || TextViewerState.theme.mode || 'dark';
    const colors = ThemePresets[currentMode] || ThemePresets.dark;
    
    const root = document.documentElement;
    root.style.setProperty('--text-primary', colors.text);
    root.style.setProperty('--text-secondary', colors.textSecondary);
    root.style.setProperty('--text-tertiary', colors.textTertiary);
    root.style.setProperty('--bg-primary', colors.background);
    root.style.setProperty('--bg-card', colors.bgCard);
    root.style.setProperty('--bg-input', colors.bgInput);
    root.style.setProperty('--border-color', colors.border);
    
    const container = document.getElementById('textViewerContainer');
    if (container) {
        container.style.backgroundColor = colors.background;
        container.style.color = colors.text;
    }
    
    const content = document.getElementById('textViewerContent');
    if (content) {
        content.style.backgroundColor = colors.background;
        content.style.color = colors.text;
        
        content.querySelectorAll('p').forEach(p => {
            p.style.color = colors.text;
        });
    }
    
    const header = document.getElementById('textViewerHeader');
    if (header) {
        header.style.backgroundColor = currentMode === 'dark' 
            ? 'rgba(20, 20, 20, 0.95)' 
            : currentMode === 'sepia'
                ? 'rgba(244, 236, 216, 0.95)'
                : 'rgba(250, 249, 245, 0.95)';
        header.style.color = colors.text;
        header.style.borderBottomColor = colors.border;
        
        const title = document.getElementById('textViewerTitle');
        if (title) {
            title.style.color = colors.text;
        }
        
        const progress = document.getElementById('textProgressIndicator');
        if (progress) {
            progress.style.color = colors.textSecondary;
        }
    }
    
    const toggleBtn = document.getElementById('textToggleBtn');
    if (toggleBtn) {
        toggleBtn.style.backgroundColor = currentMode === 'dark'
            ? 'rgba(0, 0, 0, 0.5)'
            : 'rgba(100, 100, 100, 0.3)';
        toggleBtn.style.color = colors.text;
    }
    
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

/**
 * ✅ 여백 적용 (상단/하단 패딩)
 */
export function applyPadding() {
    const paddingTop = localStorage.getItem('text_padding_top') || '24';
    const paddingBottom = localStorage.getItem('text_padding_bottom') || '24';
    
    const content = document.getElementById('textViewerContent');
    if (content) {
        content.style.paddingTop = paddingTop + 'px';
        content.style.paddingBottom = paddingBottom + 'px';
    }
}

/**
 * ✅ 저장된 여백 가져오기
 */
export function getSavedPadding() {
    return {
        top: parseInt(localStorage.getItem('text_padding_top') || '24'),
        bottom: parseInt(localStorage.getItem('text_padding_bottom') || '24')
    };
}

console.log('✅ Text Theme loaded');
