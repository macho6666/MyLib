/**
 * viewer_modules/text/text_bookmark.js
 * 책갈피 저장/불러오기 + 진행도 관리
 * (bookmark_ → progress_ 통합)
 */

import { TextViewerState } from './text_state.js';
import { Events } from '../core/events.js';
import { showToast } from '../core/utils.js';

/**
 * 진행도 업데이트 (메인 저장 함수)
 */
export function updateProgress(seriesId, bookId, isManual = false) {
    const progress = TextViewerState.scrollProgress || 0;
    
    const key = `progress_${seriesId}`;
    const progressData = JSON.parse(localStorage.getItem(key) || '{}');
    
    progressData[bookId] = {
        progress: progress,
        page: TextViewerState.currentPage,
        totalPages: TextViewerState.totalPages,
        timestamp: new Date().toISOString(),
        type: TextViewerState.renderType
    };
    
    localStorage.setItem(key, JSON.stringify(progressData));
    
    Events.emit('progress:update', { seriesId, bookId, progress, isManual });
    
    if (progress === 100) {
        markAsRead(seriesId, bookId);
    }
}

/**
 * 책갈피 저장 (자동 저장용 - updateProgress 호출)
 */
export function saveBookmark(seriesId, bookId, position) {
    updateProgress(seriesId, bookId, false);
    Events.emit('bookmark:save', { seriesId, bookId, position });
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
 * 시리즈의 모든 진행도 가져오기
 */
export function getBookmarks(seriesId) {
    const key = `progress_${seriesId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : {};
}

/**
 * 책갈피 불러오기 (호환성 유지)
 */
export function loadBookmark(seriesId, bookId) {
    return getProgressData(seriesId, bookId);
}

/**
 * 책갈피 삭제
 */
export function deleteBookmark(seriesId, bookId) {
    const key = `progress_${seriesId}`;
    const progressData = JSON.parse(localStorage.getItem(key) || '{}');
    delete progressData[bookId];
    localStorage.setItem(key, JSON.stringify(progressData));
    
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
            updateProgress(seriesId, bookId, false);
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
        updateProgress(seriesId, bookId, false);
        console.log('💾 Saved on close, progress:', progress + '%');
    }
    
    stopAutoSave();
}

/**
 * 북마크 저장 (버튼 클릭용 - 수동 저장)
 */
export function saveTextBookmark() {
    const book = TextViewerState.currentBook;
    if (!book) {
        showToast('No book opened');
        return;
    }
    
    const progress = TextViewerState.scrollProgress || 0;
    
    console.log('💾 Manual save, progress:', progress + '%');
    
    updateProgress(book.seriesId, book.bookId, true);
    showToast('💾 Saved: ' + progress + '%');
}

/**
 * 북마크 위치로 이동
 */
export function restoreBookmark(seriesId, bookId) {
    const bookmark = getProgressData(seriesId, bookId);
    
    if (bookmark) {
        const progress = bookmark.progress || 0;
        
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
