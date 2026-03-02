/**
 * viewer_modules/text/text_highlight.js
 * 하이라이트/메모 + 캘린더 연동
 */

import { TextViewerState, addHighlight, removeHighlight, getHighlights } from './text_state.js';
import { addEpubHighlight, removeEpubHighlight } from './epub_renderer.js';
// import { syncToCalendar } from './text_bookmark.js'; // ❌ 사용 안 함
import { showToast, generateId } from '../core/utils.js';
import { Events } from '../core/events.js';

// ✅ 설정에서 저장한 하이라이트 색상 가져오기
function getHighlightColor() {
    return localStorage.getItem('text_highlight_color') || '#ffeb3b';
}
/**
 * 하이라이트 초기화
 */
export function initHighlights() {
    // TXT: 선택 이벤트
    if (TextViewerState.renderType === 'txt') {
        document.addEventListener('mouseup', handleTxtSelection);
    }
    
    // EPUB: Epub.js 이벤트는 epub_renderer에서 처리
    Events.on('text:selection', (data) => {
        showHighlightMenu(data.cfiRange, data.text);
    });
    
    console.log('✨ Highlights initialized');
}

/**
 * TXT 선택 처리
 */
function handleTxtSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (!text || text.length < 3) return;
    
    const container = document.getElementById('textViewerContainer');
    if (!container || !container.contains(selection.anchorNode)) return;
    
    // 선택 범위 정보
    const range = selection.getRangeAt(0);
    const rangeData = {
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        startContainer: getNodePath(range.startContainer),
        endContainer: getNodePath(range.endContainer)
    };
    
    showHighlightMenu(rangeData, text);
}

/**
 * 하이라이트 메뉴 표시
 * @param {Object} range - 선택 범위 (CFI 또는 DOM 정보)
 * @param {string} text - 선택한 텍스트
 */
function showHighlightMenu(range, text) {
    // 기존 메뉴 제거
    const existing = document.getElementById('highlightMenu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.id = 'highlightMenu';
    menu.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-card, #1a1a1a);
        border: 1px solid var(--border-color, #2a2a2a);
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        gap: 8px;
        z-index: 4000;
        animation: slideUp 0.2s ease;
    `;

    // ✅ 하이라이트 버튼 (설정 색상 사용)
    const hlBtn = document.createElement('button');
    hlBtn.innerHTML = '💡';
    hlBtn.title = 'Highlight';
    hlBtn.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid var(--border-color, #2a2a2a);
        background: var(--bg-input, #222);
        color: #ffd54f;
        cursor: pointer;
        font-size: 18px;
    `;
    hlBtn.onclick = () => {
        const color = getHighlightColor();
        createHighlight(range, text, color);
        menu.remove();
    };
    menu.appendChild(hlBtn);
    
    // ✅ 메모 버튼 (기존 그대로)
    const memoBtn = document.createElement('button');
    memoBtn.innerHTML = '📝';
    memoBtn.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid var(--border-color, #2a2a2a);
        background: var(--bg-input, #222);
        color: white;
        cursor: pointer;
        font-size: 16px;
    `;
    memoBtn.title = '메모 추가';
    memoBtn.onclick = () => {
        showMemoDialog(range, text);
        menu.remove();
    };
    menu.appendChild(memoBtn);
    
    // 닫기 버튼 (기존 그대로)
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid var(--border-color, #2a2a2a);
        background: var(--bg-input, #222);
        color: var(--text-tertiary, #666);
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
    `;
    closeBtn.onclick = () => menu.remove();
    menu.appendChild(closeBtn);
    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        if (document.getElementById('highlightMenu')) {
            menu.remove();
        }
    }, 5000);
}

/**
 * 하이라이트 생성
 * @param {Object} range - 범위
 * @param {string} text - 텍스트
 * @param {string} color - 색상
 */
function createHighlight(range, text, color) {
    const book = TextViewerState.currentBook;
    const bookId = book?.bookId;
    const seriesId = book?.seriesId;
    if (!bookId || !seriesId) return;
    
    const highlightData = {
        id: generateId(),
        range: range,
        text: text,
        color: color,
        timestamp: new Date().toISOString(),
        page: TextViewerState.currentPage
    };
    
    // 상태에 저장
    addHighlight(bookId, highlightData);
    
    // 렌더링
    if (TextViewerState.renderType === 'epub') {
        addEpubHighlight(range, color, highlightData);
    } else {
        applyTxtHighlight(highlightData);
    }
    
    // ✅ 캘린더에 기록 요청 (main.js 쪽에서 처리)
    if (window.addCalendarHighlightFromViewer) {
        window.addCalendarHighlightFromViewer({
            seriesId,
            bookId,
            text,
            memo: '', // 메모 없음
            color,
            page: TextViewerState.currentPage,
            progress: TextViewerState.scrollProgress || 0
        });
    }
    
    showToast('✨ 하이라이트 추가됨');
    
    Events.emit('text:highlight', highlightData);
}

/**
 * TXT 하이라이트 적용
 * @param {Object} highlight - 하이라이트 데이터
 */
function applyTxtHighlight(highlight) {
    // DOM 범위 복원 및 스타일 적용
    // (간단한 구현, 실제로는 더 복잡함)
    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    
    // 하이라이트 마크 추가
    const mark = document.createElement('mark');
    mark.style.backgroundColor = highlight.color;
    mark.style.cursor = 'pointer';
    mark.dataset.highlightId = highlight.id;
    mark.onclick = () => showHighlightOptions(highlight);
    
    // 실제 적용은 렌더링 시점에서 처리 필요
}

/**
 * 메모 다이얼로그 표시
 * @param {Object} range - 범위
 * @param {string} text - 텍스트
 */
function showMemoDialog(range, text) {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 5000;
    `;
    
    dialog.innerHTML = `
        <div style="
            background: var(--bg-card, #1a1a1a);
            border-radius: 12px;
            padding: 24px;
            max-width: 400px;
            width: 90%;
        ">
            <h3 style="font-size: 16px; margin-bottom: 12px; color: var(--text-primary, #e8e8e8);">📝 메모 추가</h3>
            <div style="background: var(--bg-input, #222); padding: 12px; border-radius: 8px; margin-bottom: 12px; color: var(--text-secondary, #999); font-size: 13px; max-height: 80px; overflow-y: auto;">
                "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"
            </div>
            <textarea id="memoText" placeholder="메모를 입력하세요..." style="
                width: 100%;
                min-height: 100px;
                background: var(--bg-input, #222);
                border: 1px solid var(--border-color, #2a2a2a);
                border-radius: 8px;
                padding: 12px;
                color: var(--text-primary, #e8e8e8);
                font-size: 14px;
                font-family: inherit;
                resize: vertical;
                margin-bottom: 12px;
            "></textarea>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="btnCancelMemo" style="padding: 10px 20px; background: var(--bg-input, #222); border: 1px solid var(--border-color, #2a2a2a); border-radius: 8px; color: var(--text-secondary, #999); cursor: pointer;">취소</button>
                <button id="btnSaveMemo" style="padding: 10px 20px; background: var(--accent, #71717a); border: none; border-radius: 8px; color: white; cursor: pointer;">저장</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const memoInput = document.getElementById('memoText');
    memoInput.focus();
    
    document.getElementById('btnCancelMemo').onclick = () => dialog.remove();
    
    document.getElementById('btnSaveMemo').onclick = () => {
        const memo = memoInput.value.trim();
        if (!memo) {
            showToast('메모를 입력하세요');
            return;
        }
        
        const book = TextViewerState.currentBook;
        const bookId = book?.bookId;
        const seriesId = book?.seriesId;
        if (!bookId || !seriesId) {
            showToast('책 정보가 없습니다');
            return;
        }

        const color = getHighlightColor();
        
        // 하이라이트 + 메모 데이터
        const highlightData = {
            id: generateId(),
            range: range,
            text: text,
            color: color,
            memo: memo,
            timestamp: new Date().toISOString(),
            page: TextViewerState.currentPage
        };
        
        // 뷰어 상태에 저장
        addHighlight(bookId, highlightData);
        
        if (TextViewerState.renderType === 'epub') {
            addEpubHighlight(range, color, highlightData);
        } else {
            applyTxtHighlight(highlightData);
        }
        
        // ✅ 캘린더에 기록 요청
        if (window.addCalendarHighlightFromViewer) {
            window.addCalendarHighlightFromViewer({
                seriesId,
                bookId,
                text,
                memo,
                color,
                page: TextViewerState.currentPage,
                progress: TextViewerState.scrollProgress || 0
            });
        }
        
        showToast('📝 메모가 저장되었습니다');
        dialog.remove();
        
        Events.emit('text:memo', highlightData);
    };
}

/**
 * 하이라이트 옵션 표시 (클릭 시)
 * @param {Object} highlight - 하이라이트 데이터
 */
function showHighlightOptions(highlight) {
    const menu = document.createElement('div');
    menu.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-card, #1a1a1a);
        border: 1px solid var(--border-color, #2a2a2a);
        border-radius: 8px;
        padding: 8px;
        z-index: 4000;
    `;
    
    if (highlight.memo) {
        const memoDiv = document.createElement('div');
        memoDiv.style.cssText = `
            padding: 8px 12px;
            color: var(--text-primary, #e8e8e8);
            font-size: 13px;
            max-width: 300px;
            border-bottom: 1px solid var(--border-color, #2a2a2a);
        `;
        memoDiv.innerText = highlight.memo;
        menu.appendChild(memoDiv);
    }
    
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '🗑️ 삭제';
    deleteBtn.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        background: none;
        border: none;
        color: var(--danger, #f87171);
        cursor: pointer;
        text-align: left;
        font-size: 13px;
    `;
    deleteBtn.onclick = () => {
        deleteHighlight(highlight.id);
        menu.remove();
    };
    menu.appendChild(deleteBtn);
    
    document.body.appendChild(menu);
    
    setTimeout(() => menu.remove(), 3000);
}

/**
 * 하이라이트 삭제
 * @param {string} highlightId - 하이라이트 ID
 */
function deleteHighlight(highlightId) {
    const bookId = TextViewerState.currentBook?.bookId;
    if (!bookId) return;
    
    removeHighlight(bookId, highlightId);
    
    if (TextViewerState.renderType === 'epub') {
        // EPUB 하이라이트 제거 (CFI 필요)
        // removeEpubHighlight(cfiRange);
    }
    
    showToast('🗑️ 하이라이트 삭제됨');
}

/**
 * DOM 노드 경로 추출
 */
function getNodePath(node) {
    const path = [];
    while (node && node.nodeType === Node.ELEMENT_NODE) {
        let index = 0;
        let sibling = node.previousSibling;
        while (sibling) {
            if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === node.nodeName) {
                index++;
            }
            sibling = sibling.previousSibling;
        }
        path.unshift(`${node.nodeName}[${index}]`);
        node = node.parentNode;
    }
    return path.join('/');
}

// CSS 애니메이션
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { transform: translateX(-50%) translateY(20px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

console.log('✅ Highlight module loaded');
