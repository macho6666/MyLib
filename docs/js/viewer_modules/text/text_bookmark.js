/**
 * viewer_modules/text/text_bookmark.js
 * 책갈피 저장/불러오기 + 진행도 관리
 */

import { TextViewerState } from './text_state.js';
import { Events } from '../core/events.js';
import { showToast } from '../core/utils.js';

/**
 * 책갈피 저장
 */
export function saveBookmark(seriesId, bookId, position) {
    const key = `bookmark_${seriesId}`;
    const bookmarks = getBookmarks(seriesId);
    
    bookmarks[bookId] = {
        position: position,
        progress: TextViewerState.scrollProgress || 0,  // 진행률(%) 추가
        timestamp: new Date().toISOString(),
        type: TextViewerState.renderType,
        page: TextViewerState.currentPage,
        totalPages: TextViewerState.totalPages
    };
    
    localStorage.setItem(key, JSON.stringify(bookmarks));
    
    Events.emit('bookmark:save', { seriesId, bookId, position });
}

/**
 * 책갈피 불러오기
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
 */
export function getBookmarks(seriesId) {
    const key = `bookmark_${seriesId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : {};
}

/**
 * 책갈피 삭제
 */
export function deleteBookmark(seriesId, bookId) {
    const bookmarks = getBookmarks(seriesId);
    delete bookmarks[bookId];
    localStorage.setItem(`bookmark_${seriesId}`, JSON.stringify(bookmarks));
    
    showToast('책갈피가 삭제되었습니다');
}

/**
 * 진행도 계산 (퍼센트)
 */
export function calculateProgress(currentPage, totalPages) {
    if (totalPages === 0) return 0;
    return Math.round((currentPage / totalPages) * 100);
}

/**
 * 진행도 업데이트 (자동 저장)
 */
export function updateProgress(seriesId, bookId) {
    // scrollProgress 사용 (1페이지/2페이지 모드 공통)
    const progress = TextViewerState.scrollProgress || 0;
    
    const key = `progress_${seriesId}`;
    const progressData = JSON.parse(localStorage.getItem(key) || '{}');
    
    progressData[bookId] = {
        progress: progress,  // 진행률(%) 저장
        page: TextViewerState.currentPage,
        totalPages: TextViewerState.totalPages,
        percent: progress,
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(key, JSON.stringify(progressData));
    
    Events.emit('progress:update', { seriesId, bookId, progress });
    
    if (progress === 100) {
        markAsRead(seriesId, bookId);
    }
}

/**
 * 진행도 가져오기
 */
export function getProgressData(seriesId, bookId) {
    const key = `progress_${seriesId}`;
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    return data[bookId] || null;
}

/**
 * 읽음 처리
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
 */
export function isRead(seriesId, bookId) {
    const key = `read_${seriesId}`;
    const readData = JSON.parse(localStorage.getItem(key) || '{}');
    return readData[bookId]?.completed || false;
}

/**
 * 캘린더 동기화 (GAS API)
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
 */
export function startAutoSave(seriesId, bookId, interval = 10000) {
    stopAutoSave();
    
    window._bookmarkAutoSaveTimer = setInterval(() => {
        const progress = TextViewerState.scrollProgress || 0;
        
        if (progress > 0) {
            saveBookmark(seriesId, bookId, progress);
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
 */
export function saveOnClose(seriesId, bookId) {
    const progress = TextViewerState.scrollProgress || 0;
    
    if (progress > 0) {
        saveBookmark(seriesId, bookId, progress);
        updateProgress(seriesId, bookId);
        console.log('💾 Saved on close, progress:', progress + '%');
    }
    
    stopAutoSave();
}

/**
 * 북마크 저장 (버튼 클릭용)
 */
export function saveTextBookmark() {
    const book = TextViewerState.currentBook;
    if (!book) {
        showToast('No book opened');
        return;
    }
    
    const progress = TextViewerState.scrollProgress || 0;
    
    console.log('💾 Saving bookmark, progress:', progress + '%');
    
    saveBookmark(book.seriesId, book.bookId, progress);
    showToast('Bookmark saved: ' + progress + '%');
}

/**
 * 북마크 위치로 이동
 */
export function restoreBookmark(seriesId, bookId) {
    const bookmark = loadBookmark(seriesId, bookId);
    
    if (bookmark) {
        // progress 값 사용 (호환성: 없으면 position에서 계산 시도)
        const progress = bookmark.progress !== undefined 
            ? bookmark.progress 
            : 0;
        
        if (progress > 0 && window.scrollToProgress) {
            window.scrollToProgress(progress);
            showToast('Restored to ' + progress + '%');
        }
        
        return bookmark;
    }
    
    return null;
}

// 전역 등록
window.saveTextBookmark = saveTextBookmark;
window.restoreBookmark = restoreBookmark;

console.log('✅ Bookmark module loaded');
