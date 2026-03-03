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
        
        <!-- 레이아웃 (PC 전용) -->
        <div class="setting-group" id="layoutGroup" style="margin-bottom: 24px; display: none;">
            <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">Layout (PC only)</label>
            <div style="display: flex; gap: 8px;">
                <button id="btnLayout1Page" class="setting-btn">1 Page</button>
                <button id="btnLayout2Page" class="setting-btn">2 Page</button>
            </div>
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
        
        <!-- Calendar Settings -->
        <div class="setting-group" style="margin-bottom: 24px;">
            <label style="display: block; font-size: 13px; color: var(--text-tertiary, #888); margin-bottom: 10px;">Calendar Settings</label>
            
            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; cursor: pointer;">
                <input type="checkbox" id="chkSaveProgress" style="width: 18px; height: 18px; cursor: pointer;">
                <span style="font-size: 13px; color: var(--text-secondary, #aaa);">Save progress to calendar</span>
            </label>
            
            <label style="display: block; font-size: 12px; color: var(--text-tertiary, #666); margin-bottom: 8px;">Highlight Color:</label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <label class="color-option" style="cursor: pointer;">
                    <input type="radio" name="highlightColor" value="#ffeb3b" style="display: none;">
                    <span class="color-circle" style="display: block; width: 28px; height: 28px; background: #ffeb3b; border-radius: 50%; border: 2px solid transparent; transition: all 0.2s;"></span>
                </label>
                <label class="color-option" style="cursor: pointer;">
                    <input type="radio" name="highlightColor" value="#4caf50" style="display: none;">
                    <span class="color-circle" style="display: block; width: 28px; height: 28px; background: #4caf50; border-radius: 50%; border: 2px solid transparent; transition: all 0.2s;"></span>
                </label>
                <label class="color-option" style="cursor: pointer;">
                    <input type="radio" name="highlightColor" value="#2196f3" style="display: none;">
                    <span class="color-circle" style="display: block; width: 28px; height: 28px; background: #2196f3; border-radius: 50%; border: 2px solid transparent; transition: all 0.2s;"></span>
                </label>
                <label class="color-option" style="cursor: pointer;">
                    <input type="radio" name="highlightColor" value="#e91e63" style="display: none;">
                    <span class="color-circle" style="display: block; width: 28px; height: 28px; background: #e91e63; border-radius: 50%; border: 2px solid transparent; transition: all 0.2s;"></span>
                </label>
                <label class="color-option" style="cursor: pointer;">
                    <input type="radio" name="highlightColor" value="#ff9800" style="display: none;">
                    <span class="color-circle" style="display: block; width: 28px; height: 28px; background: #ff9800; border-radius: 50%; border: 2px solid transparent; transition: all 0.2s;"></span>
                </label>
            </div>
        </div>
        
<!-- 북마크 초기화 -->
        <div class="setting-group" style="margin-bottom: 24px;">
            <button id="btnResetBookmark" class="setting-btn" style="width: 100%;">Reset Bookmark</button>
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
    closeBtn.onmouseenter = function() { this.style.color = '#4a9eff'; };
    closeBtn.onmouseleave = function() { this.style.color = '#888'; };
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
    
    // 레이아웃 (PC 전용)
    const layout1Btn = document.getElementById('btnLayout1Page');
    const layout2Btn = document.getElementById('btnLayout2Page');
    
    if (layout1Btn) {
        layout1Btn.onclick = () => {
            if (window.setTextLayout) window.setTextLayout('1page');
            updateLayoutUI();
        };
    }
    if (layout2Btn) {
        layout2Btn.onclick = () => {
            if (window.setTextLayout) window.setTextLayout('2page');
            updateLayoutUI();
        };
    }
    
    // PC인지 확인 후 레이아웃 그룹 표시
    const layoutGroup = document.getElementById('layoutGroup');
    if (layoutGroup && window.innerWidth >= 1024) {
        layoutGroup.style.display = 'block';
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
    
    // Calendar Settings - 진행도 저장 체크박스
    const chkSaveProgress = document.getElementById('chkSaveProgress');
    if (chkSaveProgress) {
        // 초기값 로드
        chkSaveProgress.checked = localStorage.getItem('text_save_progress_to_calendar') !== 'false';
        
        chkSaveProgress.onchange = () => {
            localStorage.setItem('text_save_progress_to_calendar', chkSaveProgress.checked);
            if (window.showToast) {
                window.showToast(chkSaveProgress.checked ? 'Progress will be saved' : 'Progress won\'t be saved');
            }
        };
    }
    
    // Calendar Settings - 하이라이트 색상
    const savedColor = localStorage.getItem('text_highlight_color') || '#ffeb3b';
    document.querySelectorAll('input[name="highlightColor"]').forEach(radio => {
        const colorCircle = radio.parentElement.querySelector('.color-circle');
        
        // 초기값 설정
        if (radio.value === savedColor) {
            radio.checked = true;
            if (colorCircle) {
                colorCircle.style.border = '2px solid var(--text-primary, #fff)';
                colorCircle.style.boxShadow = '0 0 0 2px var(--bg-card, #1a1a1a)';
            }
        }
        
        radio.onchange = () => {
            localStorage.setItem('text_highlight_color', radio.value);
            
            // UI 업데이트 - 모든 색상 원 초기화
            document.querySelectorAll('.color-circle').forEach(circle => {
                circle.style.border = '2px solid transparent';
                circle.style.boxShadow = 'none';
            });
            
            // 선택된 색상 표시
            if (colorCircle) {
                colorCircle.style.border = '2px solid var(--text-primary, #fff)';
                colorCircle.style.boxShadow = '0 0 0 2px var(--bg-card, #1a1a1a)';
            }
            
            if (window.showToast) window.showToast('Highlight color changed');
        };
    });
    
// 북마크 초기화
const resetBtn = document.getElementById('btnResetBookmark');
if (resetBtn) {
    resetBtn.onclick = resetCurrentBookmark;
}
    
    // 초기 상태 업데이트
    updateReadModeUI();
    updateLayoutUI();
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
 * 레이아웃 UI 업데이트
 */
function updateLayoutUI() {
    const currentLayout = window.getTextLayout ? window.getTextLayout() : '1page';
    const btn1 = document.getElementById('btnLayout1Page');
    const btn2 = document.getElementById('btnLayout2Page');
    
    if (btn1) btn1.classList.toggle('active', currentLayout === '1page');
    if (btn2) btn2.classList.toggle('active', currentLayout === '2page');
}

/**
 * 테마 UI 업데이트
 */
function updateThemeUI() {
    const currentTheme = TextViewerState.theme?.mode || 'dark';
    
    document.querySelectorAll('button[data-theme]').forEach(btn => {
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
        const names = { dark: 'Dark', light: 'Light', sepia: 'Sepia' };
        window.showToast(names[mode] + ' theme applied');
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
 * 북마크 초기화
 */
function resetCurrentBookmark() {
    const book = TextViewerState.currentBook;
    if (!book) {
        if (window.showToast) window.showToast('No book opened');
        return;
    }
    
    if (!confirm('Reset bookmark for this book?')) return;
    
    // progress_ 키 사용 (bookmark_ → progress_ 통합됨)
    const key = `progress_${book.seriesId}`;
    const progressData = JSON.parse(localStorage.getItem(key) || '{}');
    
    if (progressData[book.bookId]) {
        delete progressData[book.bookId];
        localStorage.setItem(key, JSON.stringify(progressData));
        if (window.showToast) window.showToast('Bookmark reset');
    } else {
        if (window.showToast) window.showToast('No bookmark found');
    }
}

/**
 * 설정 패널 열기
 */
export function openSettings() {
    const panel = document.getElementById('textViewerSettings');
    const toggleBtn = document.getElementById('textToggleBtn');
    
    if (panel) {
        panel.style.right = '0';
        TextViewerState.ui = TextViewerState.ui || {};
        TextViewerState.ui.settingsOpen = true;
        
        // 토글 버튼 숨김
        if (toggleBtn) toggleBtn.style.display = 'none';
        
        // 현재 상태 반영
        updateReadModeUI();
        updateLayoutUI();
        updateThemeUI();
        updateFontUI();
        updateCalendarUI();
    }
}

/**
 * Calendar 설정 UI 업데이트
 */
function updateCalendarUI() {
    const chkSaveProgress = document.getElementById('chkSaveProgress');
    if (chkSaveProgress) {
        chkSaveProgress.checked = localStorage.getItem('text_save_progress_to_calendar') !== 'false';
    }
    
    const savedColor = localStorage.getItem('text_highlight_color') || '#ffeb3b';
    document.querySelectorAll('input[name="highlightColor"]').forEach(radio => {
        const colorCircle = radio.parentElement.querySelector('.color-circle');
        
        if (radio.value === savedColor) {
            radio.checked = true;
            if (colorCircle) {
                colorCircle.style.border = '2px solid var(--text-primary, #fff)';
                colorCircle.style.boxShadow = '0 0 0 2px var(--bg-card, #1a1a1a)';
            }
        } else {
            if (colorCircle) {
                colorCircle.style.border = '2px solid transparent';
                colorCircle.style.boxShadow = 'none';
            }
        }
    });
}

/**
 * 설정 패널 닫기
 */
export function closeSettings() {
    const panel = document.getElementById('textViewerSettings');
    const toggleBtn = document.getElementById('textToggleBtn');
    
    if (panel) {
        panel.style.right = '-320px';
        if (TextViewerState.ui) {
            TextViewerState.ui.settingsOpen = false;
        }
        
        // 토글 버튼 다시 표시
        if (toggleBtn) toggleBtn.style.display = 'flex';
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

/**
 * 하이라이트 색상 가져오기 (외부 사용)
 */
export function getHighlightColor() {
    return localStorage.getItem('text_highlight_color') || '#ffeb3b';
}

/**
 * 진행도 저장 설정 가져오기 (외부 사용)
 */
export function getSaveProgressSetting() {
    return localStorage.getItem('text_save_progress_to_calendar') !== 'false';
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
    
    .settings-reset-btn {
        width: 100%;
        padding: 12px;
        background: var(--bg-input, #222);
        border: 1px solid var(--border-color, #333);
        color: #888;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s ease;
    }
    .settings-reset-btn:hover {
        background: #333;
        border-color: #4a9eff;
        color: #4a9eff;
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
    
    .color-option:hover .color-circle {
        transform: scale(1.1);
    }
    
    .color-circle {
        transition: all 0.2s ease;
    }
`;
document.head.appendChild(style);
console.log('✅ Text Controls loaded');
