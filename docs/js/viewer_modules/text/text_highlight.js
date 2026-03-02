/**
 * viewer_modules/text/text_highlight.js
 * TXT 하이라이트/메모 + 캘린더 연동
 */

import { TextViewerState } from './text_state.js';
import { showToast, generateId } from '../core/utils.js';
import { Events } from '../core/events.js';

/**
 * 설정에서 하이라이트 색상 가져오기
 */
function getHighlightColor() {
    return localStorage.getItem('text_highlight_color') || '#ffeb3b';
}

/**
 * TXT 하이라이트 초기화
 */
export function initHighlights() {
    // 여러 번 중복 등록 방지
    if (window._txtHighlightInited) return;
    window._txtHighlightInited = true;

    document.addEventListener('mouseup', handleTxtSelection);
    console.log('✨ TXT Highlights initialized');
}

/**
 * 텍스트 선택 처리
 */
function handleTxtSelection(event) {
    // 버튼/메뉴 클릭은 무시
    if (event.target.closest('button, #highlightMenu')) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const text = selection.toString().trim();
    if (!text || text.length < 2) return;

    // 텍스트 뷰어 영역 안에서만 동작
    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    if (!container.contains(selection.anchorNode)) return;

    const range = selection.getRangeAt(0);
    showHighlightMenu(range, text);
}

/**
 * 하이라이트/메모 메뉴 표시
 * @param {Range} range - 선택 범위
 * @param {string} text - 선택된 텍스트
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
        padding: 8px 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        gap: 8px;
        z-index: 5300;
        animation: slideUp 0.2s ease;
    `;

    // 💡 하이라이트 버튼
    const hlBtn = document.createElement('button');
    hlBtn.innerHTML = '💡';
    hlBtn.title = 'Highlight';
    hlBtn.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid var(--border-color, #2a2a2a);
        background: var(--bg-input, #222);
        color: #ffd54f;
        cursor: pointer;
        font-size: 18px;
    `;
    hlBtn.onclick = () => {
        const color = getHighlightColor();
        createHighlight(range, text, color, '');
        menu.remove();
    };
    menu.appendChild(hlBtn);

    // 📝 메모 버튼
    const memoBtn = document.createElement('button');
    memoBtn.innerHTML = '📝';
    memoBtn.title = 'Memo';
    memoBtn.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid var(--border-color, #2a2a2a);
        background: var(--bg-input, #222);
        color: white;
        cursor: pointer;
        font-size: 16px;
    `;
    memoBtn.onclick = () => {
        showMemoDialog(range, text);
        menu.remove();
    };
    menu.appendChild(memoBtn);

    // 닫기 버튼
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid var(--border-color, #2a2a2a);
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
        const m = document.getElementById('highlightMenu');
        if (m) m.remove();
    }, 5000);
}

/**
 * Range에 실제로 <mark>로 색칠
 */
function applyRangeHighlight(range, color, highlightData) {
    if (!range || range.collapsed) return;

    const mark = document.createElement('mark');
    mark.style.backgroundColor = color;
    mark.style.color = '#000';
    mark.style.padding = '0 1px';
    mark.style.borderRadius = '2px';
    mark.style.cursor = 'pointer';
    if (highlightData && highlightData.id) {
        mark.dataset.highlightId = highlightData.id;
    }

    mark.onclick = (e) => {
        e.stopPropagation();
        if (highlightData) {
            showHighlightOptions(highlightData);
        }
    };

    try {
        range.surroundContents(mark);
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
    } catch (e) {
        console.warn('Highlight surroundContents failed:', e);
    }
}

/**
 * 하이라이트 생성 + 캘린더 기록
 */
function createHighlight(range, text, color, memo) {
    const book = TextViewerState.currentBook;
    if (!book) {
        showToast('No book opened');
        return;
    }

    const highlightData = {
        id: generateId(),
        text: text,
        memo: memo || '',
        color: color,
        page: TextViewerState.currentPage || 0,
        progress: TextViewerState.scrollProgress || 0,
        timestamp: new Date().toISOString()
    };

    // 1) 화면에 색칠
    applyRangeHighlight(range, color, highlightData);

    // 2) 캘린더에 기록 요청 (main.js 쪽에서 calendarData에 넣는 함수)
    if (window.addCalendarHighlightFromViewer) {
        try {
            window.addCalendarHighlightFromViewer({
                seriesId: book.seriesId,
                bookId: book.bookId,
                text: text,
                memo: memo || '',
                color: color,
                page: highlightData.page,
                progress: highlightData.progress,
                timestamp: highlightData.timestamp
            });
        } catch (e) {
            console.error('Calendar highlight add failed:', e);
        }
    }

    showToast(memo ? '📝 Memo saved' : '✨ Highlight saved');
    Events.emit('text:highlight', highlightData);
}

/**
 * 메모 다이얼로그
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
        z-index: 5400;
    `;
    
    dialog.innerHTML = `
        <div style="
            background: var(--bg-card, #1a1a1a);
            border-radius: 12px;
            padding: 24px;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        ">
            <h3 style="font-size: 16px; margin-bottom: 12px; color: var(--text-primary, #e8e8e8);">📝 메모 추가</h3>
            <div style="background: var(--bg-input, #222); padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; color: var(--text-secondary, #aaa); font-size: 13px; max-height: 80px; overflow-y: auto;">
                "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"
            </div>
            <textarea id="memoText" placeholder="메모를 입력하세요..." style="
                width: 100%;
                min-height: 100px;
                background: var(--bg-input, #222);
                border: 1px solid var(--border-color, #2a2a2a);
                border-radius: 8px;
                padding: 10px 12px;
                color: var(--text-primary, #e8e8e8);
                font-size: 14px;
                font-family: inherit;
                resize: vertical;
                margin-bottom: 16px;
            "></textarea>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="btnCancelMemo" style="padding: 8px 16px; background: var(--bg-input, #222); border: 1px solid var(--border-color, #2a2a2a); border-radius: 8px; color: var(--text-secondary, #999); cursor: pointer;">취소</button>
                <button id="btnSaveMemo" style="padding: 8px 16px; background: var(--accent, #4a9eff); border: none; border-radius: 8px; color: white; cursor: pointer;">저장</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const memoInput = dialog.querySelector('#memoText');
    memoInput.focus();

    dialog.querySelector('#btnCancelMemo').onclick = () => dialog.remove();
    dialog.querySelector('#btnSaveMemo').onclick = () => {
        const memo = memoInput.value.trim();
        if (!memo) {
            showToast('메모를 입력하세요');
            return;
        }
        const color = getHighlightColor();
        createHighlight(range, text, color, memo);
        dialog.remove();
    };
}

/**
 * 하이라이트 클릭 시 옵션 (지금은 삭제만)
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
        z-index: 5300;
    `;

    if (highlight.memo) {
        const memoDiv = document.createElement('div');
        memoDiv.style.cssText = `
            padding: 6px 10px;
            color: var(--text-primary, #e8e8e8);
            font-size: 12px;
            max-width: 300px;
            border-bottom: 1px solid var(--border-color, #2a2a2a);
            margin-bottom: 4px;
        `;
        memoDiv.innerText = highlight.memo;
        menu.appendChild(memoDiv);
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '닫기';
    closeBtn.style.cssText = `
        width: 100%;
        padding: 6px 10px;
        background: none;
        border: none;
        color: var(--text-secondary, #aaa);
        cursor: pointer;
        font-size: 12px;
        text-align: center;
    `;
    closeBtn.onclick = () => menu.remove();
    menu.appendChild(closeBtn);

    document.body.appendChild(menu);
    setTimeout(() => menu.remove(), 3000);
}

// CSS 애니메이션
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { transform: translateX(-50%) translateY(10px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

console.log('✅ TXT Highlight module loaded');
