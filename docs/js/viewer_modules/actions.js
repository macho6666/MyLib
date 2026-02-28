/**
 * viewer_modules/actions.js
 * 뷰어 열기/닫기 (동적 로드)
 */

import { showToast } from './core/utils.js';

// 현재 열린 책 목록
let currentBookList = [];
let currentBookIndex = -1;

// 로드된 모듈 캐시
let textModule = null;
let imageModule = null;
let fetcherModule = null;

/**
 * 에피소드 목록 업데이트
 */
export function updateCurrentBookList(books) {
    currentBookList = books || [];
}

/**
 * 현재 책 인덱스 업데이트
 */
export function updateCurrentBookIndex(index) {
    currentBookIndex = index;
}

/**
 * Fetcher 모듈 로드
 */
async function loadFetcher() {
    if (!fetcherModule) {
        fetcherModule = await import('./fetcher.js');
        console.log('📦 Fetcher module loaded');
    }
    return fetcherModule;
}

/**
 * 텍스트 뷰어 모듈 로드
 */
async function loadTextViewer() {
    if (!textModule) {
        // 필요한 모듈들 순차 로드
        await import('./core/state.js');
        await import('./core/events.js');
        await import('./text/text_state.js');
        await import('./text/text_theme.js');
        await import('./text/text_toc.js');
        await import('./text/text_bookmark.js');
        await import('./text/text_renderer.js');
        await import('./text/epub_renderer.js');
        await import('./text/text_navigation.js');
        await import('./text/text_controls.js');
        await import('./text/text_highlight.js');
        textModule = await import('./text/index.js');
        console.log('📖 Text Viewer module loaded');
    }
    return textModule;
}

/**
 * 이미지 뷰어 모듈 로드
 */
async function loadImageViewer() {
    if (!imageModule) {
        await import('./core/state.js');
        await import('./core/events.js');
        await import('./image/image_state.js');
        await import('./image/image_renderer.js');
        await import('./image/image_navigation.js');
        await import('./image/image_controls.js');
        imageModule = await import('./image/index.js');
        console.log('🖼️ Image Viewer module loaded');
    }
    return imageModule;
}

/**
 * 뷰어 열기 (통합)
 */
export async function loadViewer(index, isContinuous = false) {
    const book = currentBookList[index];
    if (!book) {
        showToast('책 정보를 찾을 수 없습니다');
        return;
    }
    
    updateCurrentBookIndex(index);
    showLoadingOverlay(true);
    
    try {
        console.log('📂 Loading:', book.name);
        
        // Fetcher 로드 및 파일 다운로드
        const fetcher = await loadFetcher();
        const result = await fetcher.fetchAndUnzip(
            book.id,
            book.size || 0,
            (progress) => updateLoadingProgress(progress),
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
        
        // 파일 타입에 따라 뷰어 선택
        if (result.type === 'text' || result.type === 'txt' || result.type === 'epub') {
            // 텍스트 뷰어 로드 및 열기
            const textViewer = await loadTextViewer();
            await textViewer.openTextViewer(result, metadata);
            
        } else if (result.type === 'images') {
            // 이미지 뷰어 로드 및 열기
            const imageViewer = await loadImageViewer();
            await imageViewer.openImageViewer(result, metadata);
            
        } else if (result.type === 'external') {
            console.log('📄 External file opened in new tab');
            
        } else {
            throw new Error('Unknown file type: ' + result.type);
        }
        
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
    // 텍스트 뷰어 닫기
    if (textModule && textModule.closeTextViewer) {
        textModule.closeTextViewer();
    }
    
    // 이미지 뷰어 닫기
    if (imageModule && imageModule.closeImageViewer) {
        imageModule.closeImageViewer();
    }
    
    // 뷰어 오버레이 숨김
    const viewer = document.getElementById('viewerOverlay');
    if (viewer) {
        viewer.style.display = 'none';
        document.body.classList.remove('no-scroll');
    }
}

/**
 * 다음/이전 에피소드 이동
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
    
    closeViewer();
    setTimeout(() => {
        loadViewer(newIndex, true);
    }, 300);
}

/**
 * 로딩 오버레이 표시/숨김
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
                <div style="
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
                <style>
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                </style>
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

console.log('✅ Actions module loaded');
