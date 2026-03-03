/**
 * viewer_modules/text/text_highlight.js
 * TXT 하이라이트/메모 + 캘린더 연동 + localStorage 저장
 */

import { TextViewerState } from './text_state.js';
import { showToast, generateId } from '../core/utils.js';
import { Events } from '../core/events.js';

function getHighlightColor() {
    return localStorage.getItem('text_highlight_color') || '#ffeb3b';
}

/**
 * 하이라이트 localStorage 키 생성
 */
function getHighlightKey(seriesId, bookId) {
    return 'highlights_' + seriesId + '_' + bookId;
}

/**
 * 하이라이트 저장
 */
function saveHighlights(seriesId, bookId, highlights) {
    var key = getHighlightKey(seriesId, bookId);
    localStorage.setItem(key, JSON.stringify(highlights));
}

/**
 * 하이라이트 불러오기
 */
function loadHighlights(seriesId, bookId) {
    var key = getHighlightKey(seriesId, bookId);
    var saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
}

/**
 * 저장된 하이라이트를 텍스트에 복원
 */
export function restoreHighlights() {
    var book = TextViewerState.currentBook;
    if (!book) return;
    
    var highlights = loadHighlights(book.seriesId, book.bookId);
    if (highlights.length === 0) return;
    
    // ✅ 기존 하이라이트 제거 (중복 방지)
    var existingMarks = document.querySelectorAll('mark[data-highlighted="true"]');
    existingMarks.forEach(function(mark) {
        var parent = mark.parentNode;
        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize(); // 텍스트 노드 병합
    });
    
    // ✅ 하이라이트 재적용
    highlights.forEach(function(hl) {
        applyHighlightToText(hl.text, hl.color);
    });
    
    console.log('✨ Restored ' + highlights.length + ' highlights');
}

/**
 * 텍스트에 하이라이트 표시 (DOM 탐색)
 */
function applyHighlightToText(text, color) {
    var container = document.getElementById('textViewerContent') || 
                    document.getElementById('textLeftPage') || 
                    document.getElementById('textRightPage');
    
    if (!container) return;
    
    var walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    var textNodes = [];
    var node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }
    
    // ✅ 모든 일치 항목 찾기
    textNodes.forEach(function(textNode) {
        var content = textNode.textContent;
        var searchStart = 0;
        
        while (true) {
            var index = content.indexOf(text, searchStart);
            if (index < 0) break;
            
            // 이미 하이라이트된 노드는 건너뛰기
            if (textNode.parentElement && textNode.parentElement.tagName === 'MARK') {
                break;
            }
            
            var range = document.createRange();
            range.setStart(textNode, index);
            range.setEnd(textNode, index + text.length);
            
            var mark = document.createElement('mark');
            mark.style.backgroundColor = color;
            mark.style.color = '#000';
            mark.style.padding = '0 1px';
            mark.style.borderRadius = '2px';
            mark.dataset.highlighted = 'true';
            
            try {
                range.surroundContents(mark);
                // surroundContents 성공 시 textNode가 분할되므로 중단
                break;
            } catch (e) {
                console.warn('Highlight apply failed:', e);
                searchStart = index + text.length;
            }
        }
    });
}

/**
 * TXT 하이라이트 초기화
 */
export function initHighlights() {
    if (window._txtHighlightInited) return;
    window._txtHighlightInited = true;

    document.addEventListener('mouseup', handleTxtSelection);
    document.addEventListener('selectionchange', handleMobileSelection);

    console.log('✨ TXT Highlights initialized');
}

let mobileSelectionTimer = null;

function handleTxtSelection(event) {
    if (event.target.closest('button, #highlightMenu, #textViewerSettings')) return;

    setTimeout(function() {
        checkSelection();
    }, 50);
}

function handleMobileSelection() {
    if (mobileSelectionTimer) clearTimeout(mobileSelectionTimer);
    
    mobileSelectionTimer = setTimeout(function() {
        checkSelection();
    }, 300);
}

function checkSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const text = selection.toString().trim();
    if (!text || text.length < 2) return;

    const container = document.getElementById('textViewerContainer');
    if (!container) return;
    if (!container.contains(selection.anchorNode)) return;

    if (document.getElementById('highlightMenu')) return;

    const range = selection.getRangeAt(0);
    showHighlightMenu(range, text);
}

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
        'background: rgba(30, 30, 30, 0.98);' +
        'border: 1px solid #444;' +
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

    var hlBtn = document.createElement('button');
    hlBtn.textContent = 'Highlight';
    hlBtn.className = 'hl-menu-btn';
    hlBtn.onclick = function() {
        var color = getHighlightColor();
        createHighlight(range, text, color, '');
        menu.remove();
    };
    menu.appendChild(hlBtn);

    var divider = document.createElement('div');
    divider.style.cssText = 'height: 1px; background: #444;';
    menu.appendChild(divider);

    var memoBtn = document.createElement('button');
    memoBtn.textContent = 'Memo';
    memoBtn.className = 'hl-menu-btn';
    memoBtn.onclick = function() {
        showMemoDialog(range, text);
        menu.remove();
    };
    menu.appendChild(memoBtn);

    var divider2 = document.createElement('div');
    divider2.style.cssText = 'height: 1px; background: #444;';
    menu.appendChild(divider2);

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'hl-menu-btn hl-menu-btn-cancel';
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

function applyRangeHighlight(range, color) {
    if (!range || range.collapsed) return;

    var mark = document.createElement('mark');
    mark.style.backgroundColor = color;
    mark.style.color = '#000';
    mark.style.padding = '0 1px';
    mark.style.borderRadius = '2px';
    mark.dataset.highlighted = 'true';

    try {
        range.surroundContents(mark);
        var sel = window.getSelection();
        if (sel) sel.removeAllRanges();
    } catch (e) {
        console.warn('Highlight surroundContents failed:', e);
    }
}

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

    applyRangeHighlight(range, color);

    // ✅ localStorage에 저장
    var highlights = loadHighlights(book.seriesId, book.bookId);
    highlights.push(highlightData);
    saveHighlights(book.seriesId, book.bookId, highlights);

    // ✅ 캘린더 연동 (기존 유지)
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
            'background: #1a1a1a;' +
            'border-radius: 12px;' +
            'padding: 24px;' +
            'max-width: 420px;' +
            'width: 90%;' +
            'box-shadow: 0 12px 40px rgba(0,0,0,0.6);' +
        '">' +
            '<h3 style="font-size: 16px; margin: 0 0 12px 0; color: #e8e8e8;">Memo</h3>' +
            '<div style="background: #222; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; color: #aaa; font-size: 13px; max-height: 80px; overflow-y: auto;">' +
                '"' + text.substring(0, 80) + (text.length > 80 ? '...' : '') + '"' +
            '</div>' +
            '<textarea id="memoText" placeholder="Add your memo..." style="' +
                'width: 100%;' +
                'min-height: 100px;' +
                'background: #222;' +
                'border: 1px solid #333;' +
                'border-radius: 8px;' +
                'padding: 10px 12px;' +
                'color: #e8e8e8;' +
                'font-size: 14px;' +
                'font-family: inherit;' +
                'resize: vertical;' +
                'margin-bottom: 16px;' +
                'box-sizing: border-box;' +
            '"></textarea>' +
            '<div style="display: flex; gap: 8px; justify-content: flex-end;">' +
                '<button id="btnCancelMemo" class="hl-dialog-btn">Cancel</button>' +
                '<button id="btnSaveMemo" class="hl-dialog-btn hl-dialog-btn-save">Save</button>' +
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

var hlStyle = document.createElement('style');
hlStyle.textContent = 
    '@keyframes hlSlideUp {' +
        'from { transform: translateX(-50%) translateY(10px); opacity: 0; }' +
        'to { transform: translateX(-50%) translateY(0); opacity: 1; }' +
    '}' +
    '.hl-menu-btn {' +
        'display: block;' +
        'width: 100%;' +
        'padding: 12px 16px;' +
        'background: none;' +
        'border: none;' +
        'color: #e8e8e8;' +
        'font-size: 14px;' +
        'cursor: pointer;' +
        'text-align: left;' +
        'transition: all 0.15s ease;' +
    '}' +
    '.hl-menu-btn:hover {' +
        'background: rgba(255,255,255,0.15);' +
        'color: #fff;' +
    '}' +
    '.hl-menu-btn-cancel {' +
        'color: #888;' +
    '}' +
    '.hl-menu-btn-cancel:hover {' +
        'color: #ccc;' +
    '}' +
    '.hl-dialog-btn {' +
        'padding: 10px 18px;' +
        'background: #333;' +
        'border: 1px solid #444;' +
        'border-radius: 8px;' +
        'color: #aaa;' +
        'cursor: pointer;' +
        'font-size: 13px;' +
        'transition: all 0.15s ease;' +
    '}' +
    '.hl-dialog-btn:hover {' +
        'background: #444;' +
        'color: #fff;' +
    '}' +
    '.hl-dialog-btn-save {' +
        'background: #4a9eff;' +
        'border-color: #4a9eff;' +
        'color: #fff;' +
    '}' +
    '.hl-dialog-btn-save:hover {' +
        'background: #3a8eef;' +
    '}';
document.head.appendChild(hlStyle);

console.log('✅ TXT Highlight module loaded');
