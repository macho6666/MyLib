/**
 * viewer_modules/text/index.js
 * 텍스트 뷰어 진입점 (TXT + EPUB)
 */

import { TextViewerState, resetViewerState } from './text_state.js';
import { Events } from '../core/events.js';
import { renderTxt, cleanupTextRenderer } from './text_renderer.js';
import { loadCover, generateTxtTOC } from './text_toc.js';
import { loadBookmark, saveOnClose, startAutoSave } from './text_bookmark.js';
import { initControls, openSettings } from './text_controls.js';
import { initNavigation, cleanupNavigation } from './text_navigation.js';
import { initHighlights } from './text_highlight.js';
import { applyTheme } from './text_theme.js';
import { showToast } from '../core/utils.js';
import { restoreOriginalTheme } from './text_theme.js';
import { renderEpub, cleanupEpubViewer } from './epub_renderer.js';
/**
 * 텍스트 뷰어 열기
 * @param {Object} result - fetcher.js 결과 { type, content/blob, ... }
 * @param {Object} metadata - { bookId, name, seriesId, size }
 */
export async function openTextViewer(result, metadata) {
    try {
        console.log('📖 Opening Text Viewer:', metadata.name);
        
        // 상태 초기화
        resetViewerState();
        TextViewerState.currentBook = metadata;
        
        // 표지 로드 시도
        const coverUrl = await loadCover(metadata.seriesId, metadata.bookId);
        metadata.coverUrl = coverUrl;
        
        // 타입에 따라 렌더링
        if (result.type === 'text' || result.type === 'txt') {
            // TXT 파일
            await openTxtFile(result.content, metadata);
        } else if (result.type === 'epub') {
            // EPUB 파일
            await openEpubFile(result.blob, metadata);
        } else {
            throw new Error('Unsupported file type: ' + result.type);
        }
        
        // UI 초기화
        initControls();
        initNavigation();
        initHighlights();
        
        // 테마 적용
        applyTheme();
        
        // 자동 저장 시작
        startAutoSave(metadata.seriesId, metadata.bookId);
        
        // 전역 함수 등록
        window.openTextSettings = openSettings;
        
        console.log('✅ Text Viewer opened');
        
    } catch (e) {
        console.error('Text Viewer open failed:', e);
        showToast('뷰어 열기 실패: ' + e.message, 3000);
        closeTextViewer();
    }
}

/**
 * TXT 파일 열기
 * @param {string} textContent - 텍스트 내용
 * @param {Object} metadata - 메타데이터
 */
async function openTxtFile(textContent, metadata) {
    console.log('📌 Opening with seriesId:', metadata.seriesId);
    console.log('📌 Opening with bookId:', metadata.bookId);
    
    // 목차 생성
    const toc = generateTxtTOC(textContent);
    metadata.toc = toc;
    
    // 렌더링
    await renderTxt(textContent, metadata);
    
    // 책갈피 불러오기 & 스크롤 복원
    const bookmark = loadBookmark(metadata.seriesId, metadata.bookId);
    console.log('📌 Loaded bookmark:', bookmark);
    
    if (bookmark && bookmark.position > 0) {
        const container = document.getElementById('textViewerContainer');
        if (container) {
            container.scrollTop = bookmark.position;
            console.log('📌 Restored position:', bookmark.position);
            showToast('Bookmark restored');
        }
    }
}
/**
 * EPUB 파일 열기
 * @param {Blob} epubBlob - EPUB Blob
 * @param {Object} metadata - 메타데이터
 */
async function openEpubFile(epubBlob, metadata) {
    // epub_renderer가 모든 처리 담당
    await renderEpub(epubBlob, metadata);
}

/**
 * 텍스트 뷰어 닫기
 */
export function closeTextViewer() {
    console.log('📖 Closing Text Viewer');
    
    // 마지막 저장
    if (TextViewerState.currentBook) {
        saveOnClose(
            TextViewerState.currentBook.seriesId,
            TextViewerState.currentBook.bookId
        );
    }
    
    // 원래 테마 복원
    restoreOriginalTheme();
    
    // 네비게이션 정리
    cleanupNavigation();
    
    // EPUB 정리
    if (TextViewerState.renderType === 'epub') {
        cleanupEpubViewer();
    }
    cleanupTextRenderer();

    // DOM 정리
    const textContainer = document.getElementById('textViewerContainer');
    if (textContainer) textContainer.remove();
    
    const epubContainer = document.getElementById('epubViewerContainer');
    if (epubContainer) epubContainer.remove();
    
    const settings = document.getElementById('textViewerSettings');
    if (settings) settings.remove();
    
    // 뷰어 오버레이 숨김
    const viewer = document.getElementById('viewerOverlay');
    if (viewer) {
        viewer.style.display = 'none';
        document.body.classList.remove('no-scroll');
    }
    
    // 상태 초기화
    resetViewerState();
    
    // 전역 함수 제거
    delete window.openTextSettings;
    
    // 이벤트 발생
    Events.emit('text:close');
    
    console.log('✅ Text Viewer closed');
}

/**
 * 뷰어 토글 (열기/닫기)
 * @param {Object} result - fetcher 결과
 * @param {Object} metadata - 메타데이터
 */
export function toggleTextViewer(result, metadata) {
    const viewer = document.getElementById('viewerOverlay');
    
    if (viewer && viewer.style.display === 'flex') {
        closeTextViewer();
    } else {
        openTextViewer(result, metadata);
    }
}

/**
 * 현재 뷰어 상태 확인
 * @returns {boolean} 열려있으면 true
 */
export function isTextViewerOpen() {
    const viewer = document.getElementById('viewerOverlay');
    return viewer && viewer.style.display === 'flex';
}

// 전역 함수 등록
window.openTextViewer = openTextViewer;
window.closeTextViewer = closeTextViewer;
window.toggleTextViewer = toggleTextViewer;

// 이벤트 리스너 (Escape 키로 닫기)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isTextViewerOpen()) {
        closeTextViewer();
    }
});

console.log('✅ Text Viewer Module loaded');
