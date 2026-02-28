/**
 * viewer_modules/text/text_bookmark.js
 * 책갈피 저장/불러오기 + 진행도 관리
 */

import { TextViewerState } from './text_state.js';
import { Events } from '../core/events.js';
import { showToast } from '../core/utils.js';

/**
 * 책갈피 저장
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 * @param {number|string} position - TXT: 페이지 번호, EPUB: CFI
 */
export function saveBookmark(seriesId, bookId, position) {
    const key = `bookmark_${seriesId}`;
    const bookmarks = getBookmarks(seriesId);
    
    bookmarks[bookId] = {
        position: position,
        timestamp: new Date().toISOString(),
        type: TextViewerState.renderType,
        page: TextViewerState.currentPage,
        totalPages: TextViewerState.totalPages
    };
    
    localStorage.setItem(key, JSON.stringify(bookmarks));
    
    // 이벤트 발생
    Events.emit('bookmark:save', { seriesId, bookId, position });
}

/**
 * 책갈피 불러오기
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 * @returns {Object|null} { position, timestamp, type, page, totalPages }
 */
export function loadBookmark(seriesId, bookId) {
    const bookmarks = getBookmarks(seriesId);
    const bookmark = bookmarks[bookId];
    
    if (bookmark) {
        Events.emit('bookmark:load', { seriesId, bookId, bookmark });
        return bookmark;
    }
    
    return null;
}

/**
 * 시리즈의 모든 책갈피 가져오기
 * @param {string} seriesId - 시리즈 ID
 * @returns {Object} { bookId: { position, timestamp, ... }, ... }
 */
export function getBookmarks(seriesId) {
    const key = `bookmark_${seriesId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : {};
}

/**
 * 책갈피 삭제
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 */
export function deleteBookmark(seriesId, bookId) {
    const bookmarks = getBookmarks(seriesId);
    delete bookmarks[bookId];
    localStorage.setItem(`bookmark_${seriesId}`, JSON.stringify(bookmarks));
    
    showToast('책갈피가 삭제되었습니다');
}

/**
 * 진행도 계산 (퍼센트)
 * @param {number} currentPage - 현재 페이지
 * @param {number} totalPages - 전체 페이지
 * @returns {number} 0~100
 */
export function calculateProgress(currentPage, totalPages) {
    if (totalPages === 0) return 0;
    return Math.round((currentPage / totalPages) * 100);
}

/**
 * 진행도 업데이트 (자동 저장)
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 */
export function updateProgress(seriesId, bookId) {
    const progress = calculateProgress(
        TextViewerState.currentPage,
        TextViewerState.totalPages
    );
    
    // 진행도 저장
    const key = `progress_${seriesId}`;
    const progressData = JSON.parse(localStorage.getItem(key) || '{}');
    
    progressData[bookId] = {
        page: TextViewerState.currentPage,
        totalPages: TextViewerState.totalPages,
        percent: progress,
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(key, JSON.stringify(progressData));
    
    // 이벤트 발생
    Events.emit('progress:update', { seriesId, bookId, progress });
    
    // 100% 완료 시 읽음 처리
    if (progress === 100) {
        markAsRead(seriesId, bookId);
    }
}

/**
 * 진행도 가져오기
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 * @returns {Object|null} { page, totalPages, percent, timestamp }
 */
export function getProgressData(seriesId, bookId) {
    const key = `progress_${seriesId}`;
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    return data[bookId] || null;
}

/**
 * 읽음 처리
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 */
export function markAsRead(seriesId, bookId) {
    const key = `read_${seriesId}`;
    const readData = JSON.parse(localStorage.getItem(key) || '{}');
    
    readData[bookId] = {
        completed: true,
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(key, JSON.stringify(readData));
    
    showToast('📚 읽음 처리되었습니다');
    
    Events.emit('book:read', { seriesId, bookId });
}

/**
 * 읽음 상태 확인
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 * @returns {boolean}
 */
export function isRead(seriesId, bookId) {
    const key = `read_${seriesId}`;
    const readData = JSON.parse(localStorage.getItem(key) || '{}');
    return readData[bookId]?.completed || false;
}

/**
 * 캘린더 동기화 (GAS API)
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 * @param {Object} data - { page, memo, highlight 등 }
 */
export async function syncToCalendar(seriesId, bookId, data) {
    try {
        const book = TextViewerState.currentBook;
        
        await API.request('save_reading_note', {
            type: 'reading_progress',
            seriesId: seriesId,
            bookId: bookId,
            bookTitle: book?.name || '제목 없음',
            page: data.page || TextViewerState.currentPage,
            totalPages: TextViewerState.totalPages,
            memo: data.memo || '',
            highlight: data.highlight || null,
            timestamp: new Date().toISOString()
        });
        
        showToast('📅 캘린더에 기록되었습니다');
        
        Events.emit('calendar:sync', { seriesId, bookId, data });
        
    } catch (e) {
        console.error('Calendar sync failed:', e);
        showToast('캘린더 동기화 실패: ' + e.message, 3000);
    }
}

/**
 * 자동 저장 타이머 시작
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 * @param {number} interval - 저장 간격 (ms), 기본 10초
 */
export function startAutoSave(seriesId, bookId, interval = 10000) {
    // 기존 타이머 정리
    stopAutoSave();
    
    window._bookmarkAutoSaveTimer = setInterval(() => {
        // 현재 위치 저장
        const position = TextViewerState.renderType === 'epub' 
            ? TextViewerState.epub.currentCfi 
            : TextViewerState.currentPage;
        
        if (position !== null && position !== undefined) {
            saveBookmark(seriesId, bookId, position);
            updateProgress(seriesId, bookId);
        }
    }, interval);
    
    console.log(`📌 Auto-save started (${interval}ms)`);
}

/**
 * 자동 저장 타이머 정지
 */
export function stopAutoSave() {
    if (window._bookmarkAutoSaveTimer) {
        clearInterval(window._bookmarkAutoSaveTimer);
        window._bookmarkAutoSaveTimer = null;
        console.log('📌 Auto-save stopped');
    }
}

/**
 * 뷰어 닫을 때 마지막 저장
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 */
export function saveOnClose(seriesId, bookId) {
    const position = TextViewerState.renderType === 'epub' 
        ? TextViewerState.epub.currentCfi 
        : TextViewerState.currentPage;
    
    if (position !== null && position !== undefined) {
        saveBookmark(seriesId, bookId, position);
        updateProgress(seriesId, bookId);
        console.log('💾 Saved on close');
    }
    
    stopAutoSave();
}
/**
 * 북마크 저장 (버튼 클릭용)
 */
/**
 * 북마크 저장 (버튼 클릭용)
 */
export function saveTextBookmark() {
    const book = TextViewerState.currentBook;
    if (!book) {
        showToast('No book opened');
        return;
    }
    
    // 현재 스크롤 위치 직접 가져오기
    const container = document.getElementById('textViewerContainer');
    const position = container ? container.scrollTop : 0;
    
    console.log('💾 Saving bookmark, position:', position);
    
    saveBookmark(book.seriesId, book.bookId, position);
    showToast('Bookmark saved: ' + position + 'px');
}
// 전역 등록
window.saveTextBookmark = saveTextBookmark;
console.log('✅ Bookmark module loaded');
