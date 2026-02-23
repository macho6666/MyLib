import { vState, currentBookList, currentBookIndex } from './state.js';
import { loadViewer, checkNextEpisodeTrigger } from './actions.js'; // Circular dep check
import { renderCurrentSpread } from './renderer.js';
import { showToast } from './utils.js';

/**
 * 뷰어 페이지를 이동합니다.
 * @param {number} dir - 이동 방향 (1: 다음, -1: 이전)
 */
export function navigateViewer(dir) {
    if (window.isViewerLoading) return; // Block input during load
    
    if (vState.scrollMode) {
        navigateScrollMode(dir);
        return;
    }
    
    if (vState.epubMode && !vState.foliateView) {
        // Text Page Mode Navigation (Legacy Paged)
        navigateTextPage(dir);
        return;
    }

    const nextIdx = vState.currentSpreadIndex + dir;
    if (nextIdx >= vState.spreads.length) {
        if (currentBookIndex < currentBookList.length - 1) {
             if (confirm("다음 화로 이동하시겠습니까?")) loadViewer(currentBookIndex + 1, true);
        } else {
             showToast("마지막 화입니다.");
        }
        return;
    }
    if (nextIdx < 0) {
        showToast("첫 페이지입니다.");
        return;
    }
    vState.currentSpreadIndex = nextIdx;
    renderCurrentSpread();
}

/**
 * 스크롤 모드에서의 페이지 이동 (키보드/버튼)
 * 화면의 90%만큼 스크롤하고, 끝에 도달하면 다음 화로 이동합니다.
 */
export function navigateScrollMode(dir) {
    if (window.isViewerLoading) return;

    // 1. Identify Scroll Container
    let container = null;
    if (vState.epubMode) {
        container = document.querySelector('.epub-content.scroll-view');
        // Fallback or Image mode
        if (!container) container = document.getElementById('viewerScrollContainer'); 
    } else {
        container = document.getElementById('viewerScrollContainer');
    }
    
    if (!container) {
        console.warn("[ScrollNav] No Container Found!");
        return;
    }

    // 2. Calculate Scroll
    const clientHeight = container.clientHeight > 0 ? container.clientHeight : window.innerHeight;
    const scrollAmount = clientHeight * 0.9;
    const currentScroll = container.scrollTop;
    const maxScroll = container.scrollHeight - clientHeight;

    console.log(`[ScrollNav] Dir: ${dir}, Scroll: ${currentScroll} / ${maxScroll}`);
    
    if (dir === 1) { // Next (Down)
        if (Math.abs(currentScroll - maxScroll) < 10 || currentScroll >= maxScroll) {
             // Double-Tap Logic
             if (!window.scrollBottomTriggered) {
                 window.scrollBottomTriggered = true;
                 window.scrollBottomTimestamp = Date.now();
                 showToast("마지막입니다. 한번 더 내리면 다음 화로 이동합니다.");
                 return;
             }
             
             checkNextEpisodeTrigger();
             return;
        }
        // Reset trigger if scrolling normally
        window.scrollBottomTriggered = false;
        container.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    } else { // Prev (Up)
        window.scrollBottomTriggered = false; // Reset on up scroll
        if (currentScroll <= 10) {
            showToast("첫 부분입니다.");
            return;
        }
        container.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
    }
}

/**
 * 텍스트 뷰어(페이지 모드) 페이지 이동
 */
/**
 * 텍스트 뷰어(페이지 모드) 페이지 이동 (Transform Based)
 */
export function navigateTextPage(dir) {
    const textBody = document.getElementById('textBody');
    if (!textBody) return;

    const newPage = vState.textPage + dir;
    
    // Boundary Check: Previous
    if (newPage < 0) {
        showToast("첫 페이지입니다.");
        return;
    }
    
    // Boundary Check: Next
    if (newPage >= vState.totalTextPages) {
        // Trigger Next Episode
        // Since we cannot dynamically import easily without async, 
        // rely on global checkNextEpisodeTrigger if available or import at top.
        // But to avoid cycles, we use dynamic import pattern or assume global availability if modules set it up.
        // Actually, let's use the imported function from top if possible, but cycle risk exists.
        // We will try dynamic import for action triggers.
        import('./actions.js').then(module => {
             module.checkNextEpisodeTrigger();
        });
        return;
    }

    // Valid Page Move
    vState.textPage = newPage;
    
    // Update UI
    import('./renderer.js').then(module => {
        if(module.updateTextUI) module.updateTextUI();
    });
}
