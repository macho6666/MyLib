/**
 * viewer_modules/image/image_controls.js
 * 이미지 뷰어 컨트롤 UI
 */

import { ImageViewerState, setMode, setScrollMode, setCoverPriority, setRtlMode } from './image_state.js';
import { recalcSpreads, renderCurrentSpread, renderScrollMode } from './image_renderer.js';
import { showToast } from '../core/utils.js';
import { Events } from '../core/events.js';

/**
 * 컨트롤 초기화
 */
export function initImageControls() {
    createControlsUI();
    updateControlsUI();
    
    console.log('⚙️ Image Controls initialized');
}

/**
 * 컨트롤 UI 생성
 */
function createControlsUI() {
    const viewer = document.getElementById('viewerOverlay');
    if (!viewer) return;
    
    // 기존 컨트롤 확인
    let controls = document.getElementById('viewerControls');
    if (!controls) {
        controls = document.createElement('div');
        controls.id = 'viewerControls';
        controls.className = 'viewer-controls';
        viewer.appendChild(controls);
    }
    
    // 헤더
    let header = controls.querySelector('.viewer-header');
    if (!header) {
        header = document.createElement('div');
        header.className = 'viewer-header';
        header.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 52px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            background: rgba(0, 0, 0, 0.9);
            opacity: 0;
            transform: translateY(-100%);
            transition: all 0.3s ease;
            z-index: 20;
        `;
        controls.appendChild(header);
    }
    
    header.innerHTML = `
        <button id="btnCloseViewer" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">×</button>
        <span id="viewerTitle" style="color: white; font-size: 14px; font-weight: 500;"></span>
        <div></div>
    `;
    
    // 푸터
    let footer = controls.querySelector('.viewer-footer');
    if (!footer) {
        footer = document.createElement('div');
        footer.className = 'viewer-footer';
        footer.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            padding: 12px 16px;
            background: rgba(0, 0, 0, 0.9);
            opacity: 0;
            transform: translateY(100%);
            transition: all 0.3s ease;
            z-index: 20;
        `;
        controls.appendChild(footer);
    }
    
    footer.innerHTML = `
        <div class="footer-row" style="display: flex; align-items: center; justify-content: center; gap: 14px;">
            <div class="slider-container" style="display: flex; align-items: center; flex: 1; max-width: 500px; gap: 10px;">
                <span id="sliderCurrent" style="color: #888; font-size: 12px; min-width: 28px; text-align: center;">1</span>
                <input type="range" id="pageSlider" min="1" max="1" value="1" style="flex: 1;">
                <span id="sliderTotal" style="color: #888; font-size: 12px; min-width: 28px; text-align: center;">1</span>
            </div>
        </div>
        <div class="footer-row" style="display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 10px;">
            <button id="btn1Page" class="btn-toggle" data-mode="1page">1쪽</button>
            <button id="btn2Page" class="btn-toggle" data-mode="2page">2쪽</button>
            <div class="divider" style="width: 1px; height: 18px; background: #555;"></div>
            <button id="btnCover" class="btn-toggle">표지우선</button>
            <button id="btnRtl" class="btn-toggle">우→좌</button>
            <div class="divider" style="width: 1px; height: 18px; background: #555;"></div>
            <button id="btnScroll" class="btn-toggle">스크롤</button>
        </div>
    `;
    
    // 페이지 카운터
    let counter = document.getElementById('pageCounter');
    if (!counter) {
        counter = document.createElement('div');
        counter.id = 'pageCounter';
        counter.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.6);
            color: white;
            padding: 5px 14px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 100;
        `;
        counter.innerText = '1 / 1';
        viewer.appendChild(counter);
    }
    
    // 이벤트 등록
    setupControlEvents();
}

/**
 * 컨트롤 이벤트 등록
 */
function setupControlEvents() {
    // 닫기
    document.getElementById('btnCloseViewer').onclick = () => {
        if (typeof window.closeViewer === 'function') {
            window.closeViewer();
        }
    };
    
    // 모드 변경
    document.getElementById('btn1Page').onclick = () => changeMode('1page');
    document.getElementById('btn2Page').onclick = () => changeMode('2page');
    
    // 표지 우선
    document.getElementById('btnCover').onclick = toggleCover;
    
    // RTL
    document.getElementById('btnRtl').onclick = toggleRtl;
    
    // 스크롤 모드
    document.getElementById('btnScroll').onclick = toggleScroll;
    
    // 슬라이더
    const slider = document.getElementById('pageSlider');
    if (slider) {
        slider.oninput = (e) => {
            const el = document.getElementById('sliderCurrent');
            if (el) el.innerText = e.target.value;
        };
        
        slider.onchange = (e) => {
            const pageNum = parseInt(e.target.value);
            goToImagePage(pageNum);
        };
    }
    
    // 화면 클릭 → 컨트롤 토글
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        viewerContent.onclick = (e) => {
            // nav-zone 클릭은 무시
            if (e.target.classList.contains('nav-zone')) return;
            // 중앙 50% 클릭만 토글
            const rect = viewerContent.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;
            if (clickX > width * 0.25 && clickX < width * 0.75) {
                toggleControls();
            }
        };
    }
}

/**
 * 모드 변경
 * @param {string} mode - '1page' | '2page'
 */
function changeMode(mode) {
    setMode(mode);
    recalcSpreads();
    renderCurrentSpread();
    updateControlsUI();
    
    Events.emit('image:mode-change', { mode });
}

/**
 * 표지 우선 토글
 */
function toggleCover() {
    setCoverPriority(!ImageViewerState.coverPriority);
    recalcSpreads();
    renderCurrentSpread();
    updateControlsUI();
}

/**
 * RTL 토글
 */
function toggleRtl() {
    setRtlMode(!ImageViewerState.rtlMode);
    renderCurrentSpread();
    updateControlsUI();
}

/**
 * 스크롤 모드 토글
 */
function toggleScroll() {
    setScrollMode(!ImageViewerState.scrollMode);
    
    const container = document.getElementById('imageViewerContainer');
    
    if (ImageViewerState.scrollMode) {
        renderScrollMode(container);
    } else {
        recalcSpreads();
        renderCurrentSpread(container);
    }
    
    updateControlsUI();
}

/**
 * 페이지 이동 (슬라이더)
 * @param {number} pageNum
 */
function goToImagePage(pageNum) {
    const { goToImagePage } = require('./image_navigation.js');
    goToImagePage(pageNum);
}

/**
 * 컨트롤 UI 업데이트
 */
function updateControlsUI() {
    // 모드 버튼
    const btn1 = document.getElementById('btn1Page');
    const btn2 = document.getElementById('btn2Page');
    if (btn1) btn1.classList.toggle('active', ImageViewerState.mode === '1page');
    if (btn2) btn2.classList.toggle('active', ImageViewerState.mode === '2page');
    
    // 표지 우선
    const btnCover = document.getElementById('btnCover');
    if (btnCover) btnCover.classList.toggle('active', ImageViewerState.coverPriority);
    
    // RTL
    const btnRtl = document.getElementById('btnRtl');
    if (btnRtl) btnRtl.classList.toggle('active', ImageViewerState.rtlMode);
    
    // 스크롤
    const btnScroll = document.getElementById('btnScroll');
    if (btnScroll) btnScroll.classList.toggle('active', ImageViewerState.scrollMode);
    
    // 제목
    const title = document.getElementById('viewerTitle');
    if (title && ImageViewerState.currentBook) {
        title.innerText = ImageViewerState.currentBook.name || '';
    }
}

/**
 * 컨트롤 토글 (보이기/숨기기)
 */
export function toggleControls() {
    const controls = document.getElementById('viewerControls');
    if (!controls) return;
    
    controls.classList.toggle('show');
    ImageViewerState.ui.controlsVisible = controls.classList.contains('show');
}

/**
 * 컨트롤 정리
 */
export function cleanupImageControls() {
    const controls = document.getElementById('viewerControls');
    if (controls) {
        controls.classList.remove('show');
    }
}

// CSS 추가
const style = document.createElement('style');
style.textContent = `
    .viewer-controls.show .viewer-header,
    .viewer-controls.show .viewer-footer {
        opacity: 1;
        transform: translateY(0);
    }
    
    .btn-toggle {
        background: transparent;
        border: 1px solid #555;
        color: #888;
        padding: 5px 12px;
        font-size: 11px;
        border-radius: 20px;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.2s ease;
    }
    
    .btn-toggle:hover {
        border-color: #888;
        color: #ccc;
    }
    
    .btn-toggle.active {
        background: white;
        border-color: white;
        color: #000;
    }
`;
document.head.appendChild(style);

console.log('✅ Image Controls loaded');
