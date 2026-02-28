/**
 * viewer_modules/text/text_controls.js
 * 텍스트 뷰어 컨트롤 UI (설정 패널)
 */

import { TextViewerState, setLayout, setTheme, setFontSize, setLineHeight, setInputMethod } from './text_state.js';
import { applyTheme, applyTypography } from './text_theme.js';
import { renderPage } from './text_renderer.js';
import { changeEpubLayout } from './epub_renderer.js';
import { initNavigation } from './text_navigation.js';
import { showToast } from '../core/utils.js';
import { Events } from '../core/events.js';

/**
 * 설정 패널 초기화
 */
export function initControls() {
    createSettingsPanel();
    updateControlsUI();
    
    console.log('⚙️ Controls initialized');
}

/**
 * 설정 패널 생성 (HTML)
 */
function createSettingsPanel() {
    const viewer = document.getElementById('viewerOverlay');
    if (!viewer) return;
    
    // 기존 패널 제거
    const existing = document.getElementById('textViewerSettings');
    if (existing) existing.remove();
    
    const panel = document.createElement('div');
    panel.id = 'textViewerSettings';
    panel.className = 'text-settings-panel';
    panel.style.cssText = `
        position: fixed;
        right: -320px;
        top: 0;
        width: 320px;
        height: 100vh;
        background: var(--bg-card, #1a1a1a);
        border-left: 1px solid var(--border-color, #2a2a2a);
        z-index: 3500;
        overflow-y: auto;
        transition: right 0.3s ease;
        padding: 20px;
        box-sizing: border-box;
    `;
    
// createSettingsPanel() 함수 안의 panel.innerHTML 부분을 이걸로 교체:

panel.innerHTML = `
    <div class="settings-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary, #e8e8e8);">설정</h3>
        <button id="btnCloseSettings" style="background: none; border: none; font-size: 24px; color: var(--text-tertiary, #666); cursor: pointer;">×</button>
    </div>
    
    <!-- 읽기 모드 -->
    <div class="setting-group" style="margin-bottom: 24px;">
        <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">읽기 모드</label>
        <div style="display: flex; gap: 8px;">
            <button id="btnModeScroll" class="setting-btn" onclick="setTextReadMode('scroll')">📜 스크롤</button>
            <button id="btnModeClick" class="setting-btn" onclick="setTextReadMode('click')">👆 클릭</button>
        </div>
        <p style="font-size: 11px; color: var(--text-tertiary, #666); margin-top: 8px;">
            스크롤: 자유롭게 스크롤<br>
            클릭: 좌우 클릭으로 페이지 이동
        </p>
    </div>
    
    <!-- 테마 -->
    <div class="setting-group" style="margin-bottom: 24px;">
        <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">테마</label>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <button id="btnThemeDark" class="setting-btn" data-theme="dark">🌙 다크</button>
            <button id="btnThemeLight" class="setting-btn" data-theme="light">☀️ 라이트</button>
            <button id="btnThemeSepia" class="setting-btn" data-theme="sepia">📜 세피아</button>
        </div>
    </div>
    
    <!-- 글꼴 크기 -->
    <div class="setting-group" style="margin-bottom: 24px;">
        <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">글꼴 크기</label>
        <div style="display: flex; align-items: center; gap: 16px;">
            <button id="btnFontSizeMinus" style="
                background: var(--bg-input, #222);
                border: 1px solid var(--border-color, #333);
                color: var(--text-primary, #e8e8e8);
                width: 40px;
                height: 40px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 20px;
            ">−</button>
            <span id="fontSizeValue" style="font-size: 16px; color: var(--text-primary, #e8e8e8); min-width: 50px; text-align: center;">18px</span>
            <button id="btnFontSizePlus" style="
                background: var(--bg-input, #222);
                border: 1px solid var(--border-color, #333);
                color: var(--text-primary, #e8e8e8);
                width: 40px;
                height: 40px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 20px;
            ">+</button>
        </div>
    </div>
    
    <!-- 줄간격 -->
    <div class="setting-group" style="margin-bottom: 24px;">
        <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">
            줄간격: <span id="lineHeightValue">1.8</span>
        </label>
        <input type="range" id="lineHeightSlider" min="1.2" max="2.5" step="0.1" value="1.8" style="width: 100%;">
    </div>
`;
    viewer.appendChild(panel);
    
    // 이벤트 등록
    setupControlEvents();
}

/**
 * 컨트롤 이벤트 등록
 */
function setupControlEvents() {
    // 닫기
    document.getElementById('btnCloseSettings').onclick = closeSettings;
    
    // 레이아웃
    document.querySelectorAll('[data-layout]').forEach(btn => {
        btn.onclick = () => changeLayout(btn.dataset.layout);
    });
    
    // 테마
    document.querySelectorAll('[data-theme]').forEach(btn => {
        btn.onclick = () => changeTheme(btn.dataset.theme);
    });
    
    // 커스텀 색상
    document.getElementById('customBgColor').oninput = (e) => {
        if (TextViewerState.theme.mode === 'custom') {
            applyCustomColors();
        }
    };
    document.getElementById('customTextColor').oninput = (e) => {
        if (TextViewerState.theme.mode === 'custom') {
            applyCustomColors();
        }
    };
    
    // 폰트 크기
    document.getElementById('btnFontSizeMinus').onclick = () => changeFontSize(-2);
    document.getElementById('btnFontSizePlus').onclick = () => changeFontSize(2);
    
    // 줄간격
    document.getElementById('lineHeightSlider').oninput = (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('lineHeightValue').innerText = value.toFixed(1);
        setLineHeight(value);
        applyTypography();
    };
    
    // 입력 방식
    document.getElementById('chkInputClick').onchange = (e) => {
        setInputMethod('click', e.target.checked);
        initNavigation();
    };
    document.getElementById('chkInputWheel').onchange = (e) => {
        setInputMethod('wheel', e.target.checked);
        initNavigation();
    };
    document.getElementById('chkInputScroll').onchange = (e) => {
        setInputMethod('scroll', e.target.checked);
        initNavigation();
    };
}

/**
 * 레이아웃 변경
 */
function changeLayout(layout) {
    setLayout(layout);
    
    if (TextViewerState.renderType === 'epub') {
        changeEpubLayout(layout);
    } else {
        // TXT: 페이지 재계산 필요 (나중에 구현)
        showToast('레이아웃 변경됨 (재로드 필요)', 2000);
    }
    
    updateControlsUI();
    Events.emit('text:layout-change', { layout });
}

/**
 * 테마 변경
 */
function changeTheme(mode) {
    setTheme(mode);
    applyTheme(mode);
    updateControlsUI();
    
    // 커스텀 색상 입력 표시
    const customGroup = document.getElementById('customColorGroup');
    if (customGroup) {
        customGroup.style.display = mode === 'custom' ? 'block' : 'none';
    }
}

/**
 * 커스텀 색상 적용
 */
function applyCustomColors() {
    const bg = document.getElementById('customBgColor').value;
    const text = document.getElementById('customTextColor').value;
    
    setTheme('custom', { bg, text });
    applyTheme('custom', { bg, text });
}

/**
 * 폰트 크기 변경
 */
function changeFontSize(delta) {
    const newSize = TextViewerState.typography.fontSize + delta;
    setFontSize(newSize);
    applyTypography();
    
    document.getElementById('fontSizeValue').innerText = `${newSize}px`;
}

/**
 * 설정 UI 업데이트
 */
function updateControlsUI() {
    // 레이아웃 버튼
    document.querySelectorAll('[data-layout]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.layout === TextViewerState.layout);
    });
    
    // 테마 버튼
    document.querySelectorAll('[data-theme]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === TextViewerState.theme.mode);
    });
    
    // 입력 방식
    document.getElementById('chkInputClick').checked = TextViewerState.input.click;
    document.getElementById('chkInputWheel').checked = TextViewerState.input.wheel;
    document.getElementById('chkInputScroll').checked = TextViewerState.input.scroll;
    
    // 입력 방식 그룹 표시 (1페이지일 때만)
    const inputGroup = document.getElementById('inputMethodGroup');
    if (inputGroup) {
        inputGroup.style.display = TextViewerState.layout === '1page' ? 'block' : 'none';
    }
    
    // 폰트
    document.getElementById('fontSizeValue').innerText = `${TextViewerState.typography.fontSize}px`;
    document.getElementById('lineHeightSlider').value = TextViewerState.typography.lineHeight;
    document.getElementById('lineHeightValue').innerText = TextViewerState.typography.lineHeight.toFixed(1);
    
    // 커스텀 색상
    document.getElementById('customBgColor').value = TextViewerState.theme.customBg;
    document.getElementById('customTextColor').value = TextViewerState.theme.customText;
}

/**
 * 설정 패널 열기
 */
export function openSettings() {
    const panel = document.getElementById('textViewerSettings');
    if (panel) {
        panel.style.right = '0';
        TextViewerState.ui.settingsOpen = true;
    }
}

/**
 * 설정 패널 닫기
 */
export function closeSettings() {
    const panel = document.getElementById('textViewerSettings');
    if (panel) {
        panel.style.right = '-320px';
        TextViewerState.ui.settingsOpen = false;
    }
}

/**
 * 설정 패널 토글
 */
export function toggleSettings() {
    if (TextViewerState.ui.settingsOpen) {
        closeSettings();
    } else {
        openSettings();
    }
}

// CSS 추가
const style = document.createElement('style');
style.textContent = `
    .setting-btn {
        flex: 1;
        padding: 8px 12px;
        background: var(--bg-input, #222);
        border: 1px solid var(--border-color, #2a2a2a);
        border-radius: 4px;
        color: var(--text-secondary, #999);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .setting-btn:hover {
        background: var(--bg-hover, #2a2a2a);
        color: var(--text-primary, #e8e8e8);
    }
    .setting-btn.active {
        background: var(--accent, #71717a);
        color: white;
        border-color: var(--accent, #71717a);
    }
`;
document.head.appendChild(style);

console.log('✅ Text Controls loaded');
