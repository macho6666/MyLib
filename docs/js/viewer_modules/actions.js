/**
 * viewer_modules/actions.js
 * 뷰어 열기/닫기 통합 (텍스트/이미지 분기)
 */

import { GlobalState } from './core/state.js';
import { openViewer as openUnifiedViewer, closeViewer as closeUnifiedViewer } from './index.js';
import { fetchAndUnzip } from './fetcher.js';
import { showToast } from './core/utils.js';

// 현재 열린 책 목록 (에피소드)
let currentBookList = [];
let currentBookIndex = -1;

/**
 * 에피소드 목록 업데이트
 * @param {Array} books - 책 목록
 */
export function updateCurrentBookList(books) {
    currentBookList = books || [];
}

/**
 * 현재 책 인덱스 업데이트
 * @param {number} index
 */
export function updateCurrentBookIndex(index) {
    currentBookIndex = index;
}

/**
 * 뷰어 열기 (통합)
 * @param {number} index - 책 목록에서의 인덱스
 * @param {boolean} isContinuous - 연속 보기 여부
 */
export async function loadViewer(index, isContinuous = false) {
    const book = currentBookList[index];
    if (!book) {
        showToast('책 정보를 찾을 수 없습니다');
        return;
    }
    
    updateCurrentBookIndex(index);
    
    // 로딩 표시
    showLoadingOverlay(true);
    
    try {
        console.log('📂 Loading:', book.name);
        
        // 파일 다운로드
        const result = await fetchAndUnzip(
            book.id,
            book.size || 0,
            (progress) => {
                updateLoadingProgress(progress);
            },
            book.name
        );
        
        // 메타데이터 준비
        const metadata = {
            bookId: book.id,
            name: book.name,
            seriesId: book.seriesId,
            size: book.size,
            index: index
        };
        
        // 통합 뷰어 열기
        await openUnifiedViewer(result, metadata);
        
        showLoadingOverlay(false);
        
    } catch (e) {
        console.error('Viewer load failed:', e);
        showToast('로드 실패: ' + e.message, 3000);
        showLoadingOverlay(false);
    }
}

/**
 * 뷰어 닫기
 */
export function closeViewer() {
    closeUnifiedViewer();
    
    // 뷰어 오버레이 숨김
    const viewer = document.getElementById('viewerOverlay');
    if (viewer) {
        viewer.style.display = 'none';
        document.body.classList.remove('no-scroll');
    }
}

/**
 * 다음/이전 에피소드 이동
 * @param {number} direction - 1: 다음, -1: 이전
 */
export function navigateEpisode(direction) {
    const newIndex = currentBookIndex + direction;
    
    if (newIndex < 0) {
        showToast('첫 번째 에피소드입니다');
        return;
    }
    
    if (newIndex >= currentBookList.length) {
        showToast('마지막 에피소드입니다');
        return;
    }
    
    // 현재 뷰어 닫고 새로 열기
    closeViewer();
    setTimeout(() => {
        loadViewer(newIndex, true);
    }, 300);
}

/**
 * 로딩 오버레이 표시/숨김
 * @param {boolean} show
 */
function showLoadingOverlay(show) {
    let overlay = document.getElementById('viewerLoadingOverlay');
    
    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'viewerLoadingOverlay';
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: var(--bg-primary, #0d0d0d);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 6000;
            `;
            overlay.innerHTML = `
                <div class="spinner" style="
                    width: 40px;
                    height: 40px;
                    border: 3px solid var(--border-color, #2a2a2a);
                    border-top-color: var(--accent, #71717a);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                "></div>
                <div id="loadingProgress" style="
                    margin-top: 20px;
                    font-size: 14px;
                    color: var(--text-secondary, #999);
                ">로딩 중...</div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    } else {
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
}

/**
 * 로딩 진행률 업데이트
 * @param {string} progress - 진행률 메시지
 */
function updateLoadingProgress(progress) {
    const progressEl = document.getElementById('loadingProgress');
    if (progressEl) {
        progressEl.innerText = progress;
    }
}

// 전역 함수 등록
window.loadViewer = loadViewer;
window.closeViewer = closeViewer;
window.updateCurrentBookList = updateCurrentBookList;
window.navigateEpisode = navigateEpisode;

// Export
export { currentBookList, currentBookIndex };

console.log('✅ Actions module loaded');
