/**
 * viewer_modules/text/text_controls.js
 * 텍스트 뷰어 컨트롤 UI (설정 패널)
 */

import { TextViewerState, setLayout, setTheme, setFontSize, setLineHeight } from './text_state.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { showToast } from '../core/utils.js';
import { Events } from '../core/events.js';

/**
 * 설정 패널 초기화
 */
export function initControls() {
    createSettingsPanel();
    console.log('⚙️ Controls initialized');
}

/**
 * 설정 패널 생성 (HTML)
 */
function createSettingsPanel() {
    // 기존 패널 제거
    const existing = document.getElementById('textViewerSettings');
    if (existing) existing.remove();
    
    const panel = document.createElement('div');
    panel.id = 'textViewerSettings';
    panel.style.cssText = `
        position: fixed;
        right: -320px;
        top: 0;
        width: 320px;
        height: 100vh;
        background: var(--bg-card, #1a1a1a);
        border-left: 1px solid var(--border-color, #2a2a2a);
        z-index: 5300;
        overflow-y: auto;
        transition: right 0.3s ease;
        padding: 20px;
        box-sizing: border-box;
    `;
    
 panel.innerHTML = `
    <div class="settings-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary, #e8e8e8);">Settings</h3>
        <button id="btnCloseSettings" style="background: none; border: none; font-size: 24px; color: var(--text-tertiary, #666); cursor: pointer;">×</button>
    </div>
    
    <!-- 읽기 모드 -->
    <div class="setting-group" style="margin-bottom: 24px;">
        <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">Mode</label>
        <div style="display: flex; gap: 8px;">
            <button id="btnModeScroll" class="setting-btn">Scroll</button>
            <button id="btnModeClick" class="setting-btn">Click</button>
        </div>
        <p style="font-size: 11px; color: var(--text-tertiary, #666); margin-top: 8px; line-height: 1.5;">
            Scroll: Free scrolling<br>
            Click: Tap left/right to turn pages
        </p>
    </div>
    
    <!-- 테마 -->
    <div class="setting-group" style="margin-bottom: 24px;">
        <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">Theme</label>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <button id="btnThemeDark" class="setting-btn" data-theme="dark">Dark</button>
            <button id="btnThemeLight" class="setting-btn" data-theme="light">Light</button>
            <button id="btnThemeSepia" class="setting-btn" data-theme="sepia">Sepia</button>
        </div>
    </div>
    
    <!-- 글꼴 크기 -->
    <div class="setting-group" style="margin-bottom: 24px;">
        <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">Font Size</label>
        <div style="display: flex; align-items: center; gap: 12px;">
            <button id="btnFontSizeMinus" style="
                background: var(--bg-input, #222);
                border: 1px solid var(--border-color, #333);
                color: var(--text-primary, #e8e8e8);
                width: 32px;
                height: 32px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            ">−</button>
            <span id="fontSizeValue" style="font-size: 14px; color: var(--text-primary, #e8e8e8); min-width: 45px; text-align: center;">18px</span>
            <button id="btnFontSizePlus" style="
                background: var(--bg-input, #222);
                border: 1px solid var(--border-color, #333);
                color: var(--text-primary, #e8e8e8);
                width: 32px;
                height: 32px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            ">+</button>
        </div>
    </div>
    
    <!-- 줄간격 -->
    <div class="setting-group" style="margin-bottom: 24px;">
        <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">
            Line Height: <span id="lineHeightValue">1.8</span>
        </label>
        <input type="range" id="lineHeightSlider" min="1.2" max="2.5" step="0.1" value="1.8" style="width: 100%; cursor: pointer;">
    </div>
`;
    document.body.appendChild(panel);
    
    // 이벤트 등록
    setupControlEvents();
}

/**
 * 컨트롤 이벤트 등록
 */
function setupControlEvents() {
    // 닫기
    const closeBtn = document.getElementById('btnCloseSettings');
    if (closeBtn) {
        closeBtn.onclick = closeSettings;
    }
    
    // 읽기 모드
    const scrollBtn = document.getElementById('btnModeScroll');
    const clickBtn = document.getElementById('btnModeClick');
    
    if (scrollBtn) {
        scrollBtn.onclick = () => {
            if (window.setTextReadMode) window.setTextReadMode('scroll');
            updateReadModeUI();
        };
    }
    if (clickBtn) {
        clickBtn.onclick = () => {
            if (window.setTextReadMode) window.setTextReadMode('click');
            updateReadModeUI();
        };
    }
    
    // 테마
document.querySelectorAll('button[data-theme]').forEach(btn => {
    btn.onclick = () => {
        changeTheme(btn.dataset.theme);
        updateThemeUI();
    };
});
    
    // 폰트 크기
    const fontMinus = document.getElementById('btnFontSizeMinus');
    const fontPlus = document.getElementById('btnFontSizePlus');
    
    if (fontMinus) {
        fontMinus.onclick = () => changeFontSize(-2);
    }
    if (fontPlus) {
        fontPlus.onclick = () => changeFontSize(2);
    }
    
    // 줄간격
    const lineSlider = document.getElementById('lineHeightSlider');
    if (lineSlider) {
        lineSlider.oninput = (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('lineHeightValue').innerText = value.toFixed(1);
            setLineHeight(value);
            applyTypography();
        };
    }
    
    // 초기 상태 업데이트
    updateReadModeUI();
    updateThemeUI();
    updateFontUI();
}

/**
 * 읽기 모드 UI 업데이트
 */
function updateReadModeUI() {
    const currentMode = window.getTextReadMode ? window.getTextReadMode() : 'scroll';
    const scrollBtn = document.getElementById('btnModeScroll');
    const clickBtn = document.getElementById('btnModeClick');
    
    if (scrollBtn) {
        scrollBtn.classList.toggle('active', currentMode === 'scroll');
    }
    if (clickBtn) {
        clickBtn.classList.toggle('active', currentMode === 'click');
    }
}

/**
 * 테마 UI 업데이트
 */
function updateThemeUI() {
    const currentTheme = TextViewerState.theme?.mode || 'dark';
    
    document.querySelectorAll('[data-theme]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    });
}

/**
 * 폰트 UI 업데이트
 */
function updateFontUI() {
    const fontSize = TextViewerState.typography?.fontSize || 18;
    const lineHeight = TextViewerState.typography?.lineHeight || 1.8;
    
    const fontValue = document.getElementById('fontSizeValue');
    if (fontValue) {
        fontValue.innerText = fontSize + 'px';
    }
    
    const lineSlider = document.getElementById('lineHeightSlider');
    const lineValue = document.getElementById('lineHeightValue');
    if (lineSlider) {
        lineSlider.value = lineHeight;
    }
    if (lineValue) {
        lineValue.innerText = lineHeight.toFixed(1);
    }
}

/**
 * 테마 변경
 */
function changeTheme(mode) {
    setTheme(mode);
    applyTheme(mode);
    
    if (window.showToast) {
        const names = { dark: '다크', light: '라이트', sepia: '세피아' };
        window.showToast(names[mode] + ' 테마 적용');
    }
}

/**
 * 폰트 크기 변경
 */
function changeFontSize(delta) {
    const currentSize = TextViewerState.typography?.fontSize || 18;
    const newSize = Math.max(12, Math.min(32, currentSize + delta));
    
    setFontSize(newSize);
    applyTypography();
    
    const fontValue = document.getElementById('fontSizeValue');
    if (fontValue) {
        fontValue.innerText = newSize + 'px';
    }
}

/**
 * 설정 패널 열기
 */
export function openSettings() {
    const panel = document.getElementById('textViewerSettings');
    if (panel) {
        panel.style.right = '0';
        TextViewerState.ui = TextViewerState.ui || {};
        TextViewerState.ui.settingsOpen = true;
        
        // 현재 상태 반영
        updateReadModeUI();
        updateThemeUI();
        updateFontUI();
    }
}

/**
 * 설정 패널 닫기
 */
export function closeSettings() {
    const panel = document.getElementById('textViewerSettings');
    if (panel) {
        panel.style.right = '-320px';
        if (TextViewerState.ui) {
            TextViewerState.ui.settingsOpen = false;
        }
    }
}

/**
 * 설정 패널 토글
 */
export function toggleSettings() {
    const panel = document.getElementById('textViewerSettings');
    if (panel && panel.style.right === '0px') {
        closeSettings();
    } else {
        openSettings();
    }
}

// CSS 스타일 추가
const style = document.createElement('style');
style.textContent = `
    .setting-btn {
        flex: 1;
        padding: 10px 14px;
        background: var(--bg-input, #222);
        border: 1px solid var(--border-color, #333);
        border-radius: 8px;
        color: var(--text-secondary, #999);
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .setting-btn:hover {
        background: var(--bg-hover, #2a2a2a);
        color: var(--text-primary, #e8e8e8);
    }
    .setting-btn.active {
        background: var(--accent, #4a9eff);
        color: white;
        border-color: var(--accent, #4a9eff);
    }
    
    #lineHeightSlider {
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        background: var(--bg-input, #333);
        border-radius: 3px;
        outline: none;
    }
    #lineHeightSlider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        background: var(--accent, #4a9eff);
        border-radius: 50%;
        cursor: pointer;
    }
    #lineHeightSlider::-moz-range-thumb {
        width: 18px;
        height: 18px;
        background: var(--accent, #4a9eff);
        border-radius: 50%;
        cursor: pointer;
        border: none;
    }
`;
document.head.appendChild(style);

console.log('✅ Text Controls loaded');
