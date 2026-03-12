/**
 * viewer_modules/text/text_bookmark.js
 * 책갈피 저장/불러오기 + 진행도 관리
 * ✅ TXT: 정확한 문자 위치 기반 복원
 * ✅ EPUB: 기존 방식 유지
 */

import { TextViewerState } from './text_state.js';
import { Events } from '../core/events.js';
import { showToast } from '../core/utils.js';

/**
 * 진행도 업데이트 (메인 저장 함수)
 * ✅ TXT: 문자 위치 저장
 * ✅ EPUB: 기존 방식
 */
export function updateProgress(seriesId, bookId, isManual = false) {
    const progress = TextViewerState.scrollProgress || 0;
    const container = document.getElementById('textViewerContainer');
    
    let charIndex = 0;  // ✅ TXT용: 전체 텍스트에서의 문자 위치
    
    // TXT일 때만 정확한 위치 계산
    if (TextViewerState.renderType === 'txt' && container) {
        const pageLayout = localStorage.getItem('text_layout') || '1page';
        
        if (pageLayout === '1page') {
            // 1page 모드: scrollTop 비율로 계산
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight - container.clientHeight;
            
            if (scrollHeight > 0) {
                const ratio = scrollTop / scrollHeight;
                charIndex = Math.floor(currentTextContent.length * ratio);
            }
        } else if (pageLayout === '2page') {
            // 2page 모드: 페이지 인덱스로 계산
            const currentSpreadIndex = TextViewerState.currentSpreadIndex || 0;
            charIndex = currentSpreadIndex * 500;  // 대략 페이지당 500자
        }
    }
    
    const key = `progress_${seriesId}`;
    const progressData = JSON.parse(localStorage.getItem(key) || '{}');
    
    progressData[bookId] = {
        progress: progress,
        charIndex: charIndex,           // ✅ TXT용
        renderType: TextViewerState.renderType,
        timestamp: new Date().toISOString()
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
 * 북마크 위치로 이동 (정확한 문자 위치 기반)
 * ✅ TXT: charIndex로 복원
 * ✅ EPUB: 기존 진행률 방식
 */
export function restoreBookmark(seriesId, bookId) {
    const bookmark = getProgressData(seriesId, bookId);
    
    if (!bookmark) return null;
    
    // ✅ TXT 복원 (정확한 위치)
    if (bookmark.renderType === 'txt' && bookmark.charIndex !== undefined) {
        const container = document.getElementById('textViewerContainer');
        
        if (container) {
            const pageLayout = localStorage.getItem('text_layout') || '1page';
            
            if (pageLayout === '1page') {
                requestAnimationFrame(() => {
                    const scrollHeight = container.scrollHeight - container.clientHeight;
                    const currentTextContent = window.currentTextContent || '';
                    
                    if (currentTextContent.length > 0) {
                        const ratio = Math.min(1, bookmark.charIndex / currentTextContent.length);
                        container.scrollTop = scrollHeight * ratio;
                        
                        console.log('📌 TXT Restored:', {
                            charIndex: bookmark.charIndex,
                            ratio: ratio,
                            scrollTop: container.scrollTop
                        });
                    }
                });
                return bookmark;
            }
        }
    }
    
    // Fallback: 퍼센트로 복원 (EPUB 또는 charIndex 없을 때)
    if (bookmark.progress > 0 && window.scrollToProgress) {
        window.scrollToProgress(bookmark.progress);
    }
    
    return bookmark;
}

// 전역 등록
window.saveTextBookmark = saveTextBookmark;
window.restoreBookmark = restoreBookmark;

console.log('✅ Bookmark module loaded (TXT precision improved)');
