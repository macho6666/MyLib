/**
 * viewer_modules/text/text_highlight.js
 * TXT 하이라이트/메모 + 캘린더 연동
 */

import { TextViewerState } from './text_state.js';
import { showToast, generateId } from '../core/utils.js';
import { Events } from '../core/events.js';

function getHighlightColor() {
    return localStorage.getItem('text_highlight_color') || '#ffeb3b';
}

/**
 * TXT 하이라이트 초기화
 */
export function initHighlights() {
    if (window._txtHighlightInited) return;
    window._txtHighlightInited = true;

    // PC: mouseup
    document.addEventListener('mouseup', handleTxtSelection);
    // 모바일: touchend + selectionchange
    document.addEventListener('selectionchange', handleMobileSelection);

    console.log('✨ TXT Highlights initialized');
}

let mobileSelectionTimer = null;

/**
 * PC 텍스트 선택 처리
 */
function handleTxtSelection(event) {
    if (event.target.closest('button, #highlightMenu, #textViewerSettings')) return;

    setTimeout(function() {
        checkSelection();
    }, 50);
}

/**
 * 모바일 텍스트 선택 처리
 */
function handleMobileSelection() {
    if (mobileSelectionTimer) clearTimeout(mobileSelectionTimer);
    
    mobileSelectionTimer = setTimeout(function() {
        checkSelection();
    }, 300);
}

/**
 * 선택 확인 및 메뉴 표시
 */
function checkSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const text = selection.toString().trim();
    if (!text || text.length < 2) return;

    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    if (!container.contains(selection.anchorNode)) return;

    // 이미 메뉴가 열려있으면 무시
    if (document.getElementById('highlightMenu')) return;

    const range = selection.getRangeAt(0);
    showHighlightMenu(range, text);
}

/**
 * 하이라이트/메모 메뉴 표시
 */
function showHighlightMenu(range, text) {
    const existing = document.getElementById('highlightMenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'highlightMenu';
    menu.style.cssText = 
        'position: fixed;' +
        'bottom: 80px;' +
        'left: 50%;' +
        'transform: translateX(-50%);' +
        'background: rgba(20, 20, 20, 0.95);' +
        'border: 1px solid var(--border-color, #2a2a2a);' +
        'border-radius: 8px;' +
        'padding: 0;' +
        'box-shadow: 0 4px 12px rgba(0,0,0,0.3);' +
        'display: flex;' +
        'flex-direction: column;' +
        'min-width: 140px;' +
        'z-index: 5300;' +
        'backdrop-filter: blur(10px);' +
        'animation: hlSlideUp 0.2s ease;' +
        'overflow: hidden;';

    // Highlight 버튼
    var hlBtn = document.createElement('button');
    hlBtn.textContent = 'Highlight';
    hlBtn.className = 'hl-menu-btn';
    hlBtn.onclick = function() {
        var color = getHighlightColor();
        createHighlight(range, text, color, '');
        menu.remove();
    };
    menu.appendChild(hlBtn);

    // 구분선
    var divider = document.createElement('div');
    divider.style.cssText = 'height: 1px; background: var(--border-color, #2a2a2a);';
    menu.appendChild(divider);

    // Memo 버튼
    var memoBtn = document.createElement('button');
    memoBtn.textContent = 'Memo';
    memoBtn.className = 'hl-menu-btn';
    memoBtn.onclick = function() {
        showMemoDialog(range, text);
        menu.remove();
    };
    menu.appendChild(memoBtn);

    // 구분선
    var divider2 = document.createElement('div');
    divider2.style.cssText = 'height: 1px; background: var(--border-color, #2a2a2a);';
    menu.appendChild(divider2);

    // Cancel 버튼
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'hl-menu-btn';
    cancelBtn.style.color = 'var(--text-tertiary, #666)';
    cancelBtn.onclick = function() {
        menu.remove();
        var sel = window.getSelection();
        if (sel) sel.removeAllRanges();
    };
    menu.appendChild(cancelBtn);

    document.body.appendChild(menu);

    setTimeout(function() {
        var m = document.getElementById('highlightMenu');
        if (m) m.remove();
    }, 5000);
}

/**
 * Range에 실제로 <mark>로 색칠 (클릭 이벤트 없음)
 */
function applyRangeHighlight(range, color) {
    if (!range || range.collapsed) return;

    var mark = document.createElement('mark');
    mark.style.backgroundColor = color;
    mark.style.color = '#000';
    mark.style.padding = '0 1px';
    mark.style.borderRadius = '2px';

    try {
        range.surroundContents(mark);
        var sel = window.getSelection();
        if (sel) sel.removeAllRanges();
    } catch (e) {
        console.warn('Highlight surroundContents failed:', e);
    }
}

/**
 * 하이라이트 생성 + 캘린더 기록
 */
function createHighlight(range, text, color, memo) {
    var book = TextViewerState.currentBook;
    if (!book) {
        showToast('No book opened');
        return;
    }

    var highlightData = {
        id: generateId(),
        text: text,
        memo: memo || '',
        color: color,
        page: TextViewerState.currentPage || 0,
        progress: TextViewerState.scrollProgress || 0,
        timestamp: new Date().toISOString()
    };

    // 1) 화면에 색칠
    applyRangeHighlight(range, color);

    // 2) 캘린더에 기록 요청
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

    showToast(memo ? 'Memo saved' : 'Highlight saved');
    Events.emit('text:highlight', highlightData);
}

/**
 * 메모 다이얼로그
 */
function showMemoDialog(range, text) {
    var dialog = document.createElement('div');
    dialog.style.cssText = 
        'position: fixed;' +
        'inset: 0;' +
        'background: rgba(0,0,0,0.7);' +
        'display: flex;' +
        'justify-content: center;' +
        'align-items: center;' +
        'z-index: 5400;';
    
    dialog.innerHTML = 
        '<div style="' +
            'background: var(--bg-card, #1a1a1a);' +
            'border-radius: 12px;' +
            'padding: 24px;' +
            'max-width: 420px;' +
            'width: 90%;' +
            'box-shadow: 0 12px 40px rgba(0,0,0,0.6);' +
        '">' +
            '<h3 style="font-size: 16px; margin: 0 0 12px 0; color: var(--text-primary, #e8e8e8);">Memo</h3>' +
            '<div style="background: var(--bg-input, #222); padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; color: var(--text-secondary, #aaa); font-size: 13px; max-height: 80px; overflow-y: auto;">' +
                '"' + text.substring(0, 80) + (text.length > 80 ? '...' : '') + '"' +
            '</div>' +
            '<textarea id="memoText" placeholder="Add your memo..." style="' +
                'width: 100%;' +
                'min-height: 100px;' +
                'background: var(--bg-input, #222);' +
                'border: 1px solid var(--border-color, #2a2a2a);' +
                'border-radius: 8px;' +
                'padding: 10px 12px;' +
                'color: var(--text-primary, #e8e8e8);' +
                'font-size: 14px;' +
                'font-family: inherit;' +
                'resize: vertical;' +
                'margin-bottom: 16px;' +
                'box-sizing: border-box;' +
            '"></textarea>' +
            '<div style="display: flex; gap: 8px; justify-content: flex-end;">' +
                '<button id="btnCancelMemo" class="hl-dialog-btn" style="color: var(--text-secondary, #999);">Cancel</button>' +
                '<button id="btnSaveMemo" class="hl-dialog-btn" style="background: var(--accent, #4a9eff); color: white;">Save</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(dialog);

    var memoInput = dialog.querySelector('#memoText');
    memoInput.focus();

    dialog.querySelector('#btnCancelMemo').onclick = function() { dialog.remove(); };
    dialog.querySelector('#btnSaveMemo').onclick = function() {
        var memo = memoInput.value.trim();
        if (!memo) {
            showToast('Please enter a memo');
            return;
        }
        var color = getHighlightColor();
        createHighlight(range, text, color, memo);
        dialog.remove();
    };
}

/**
 * 하이라이트 cleanup (뷰어 닫을 때)
 */
export function cleanupHighlights() {
    if (window._txtHighlightInited) {
        document.removeEventListener('mouseup', handleTxtSelection);
        document.removeEventListener('selectionchange', handleMobileSelection);
        window._txtHighlightInited = false;
    }
    if (mobileSelectionTimer) {
        clearTimeout(mobileSelectionTimer);
        mobileSelectionTimer = null;
    }
    var menu = document.getElementById('highlightMenu');
    if (menu) menu.remove();
}

// CSS
var hlStyle = document.createElement('style');
hlStyle.textContent = 
    '@keyframes hlSlideUp {' +
        'from { transform: translateX(-50%) translateY(10px); opacity: 0; }' +
        'to { transform: translateX(-50%) translateY(0); opacity: 1; }' +
    '}' +
    '.hl-menu-btn {' +
        'display: block;' +
        'width: 100%;' +
        'padding: 10px 16px;' +
        'background: none;' +
        'border: none;' +
        'color: var(--text-primary, #e8e8e8);' +
        'font-size: 14px;' +
        'cursor: pointer;' +
        'text-align: left;' +
        'transition: all 0.15s ease;' +
    '}' +
    '.hl-menu-btn:hover {' +
        'background: rgba(255,255,255,0.1);' +
        'color: #fff;' +
    '}' +
    '.hl-dialog-btn {' +
        'padding: 8px 16px;' +
        'background: var(--bg-input, #222);' +
        'border: 1px solid var(--border-color, #2a2a2a);' +
        'border-radius: 8px;' +
        'cursor: pointer;' +
        'font-size: 13px;' +
        'transition: all 0.15s ease;' +
    '}' +
    '.hl-dialog-btn:hover {' +
        'opacity: 0.85;' +
    '}';
document.head.appendChild(hlStyle);

console.log('✅ TXT Highlight module loaded');
