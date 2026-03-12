/**
 * viewer_modules/text/index.js
 * 텍스트 뷰어 진입점 (TXT + EPUB)
 * ✅ 타이밍 측정 추가
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
    const totalStart = performance.now();
    
    try {
        console.log('📖 Opening Text Viewer:', metadata.name);
      
        // 상태 초기화
        const resetStart = performance.now();
        resetViewerState();
        TextViewerState.currentBook = metadata;
        console.log(`⏱️ [RESET STATE] ${(performance.now() - resetStart).toFixed(2)}ms`);
        
        // ✅ 표지 로드 - 백그라운드 (기다리지 않음!)
        loadCover(metadata.seriesId, metadata.bookId, metadata)
            .then(coverUrl => {
                metadata.coverUrl = coverUrl;
                console.log('📷 Cover loaded (background):', coverUrl ? 'found' : 'none');
                
                // 이미 렌더링된 커버 이미지 업데이트
                const coverImg = document.querySelector('img[alt="cover"]');
                if (coverImg && coverUrl) {
                    coverImg.src = coverUrl;
                }
            })
            .catch(() => {
                console.log('📷 No cover found');
            });

        // 타입에 따라 렌더링 (바로 시작!)
        const renderStart = performance.now();
        if (result.type === 'text' || result.type === 'txt') {
            await openTxtFile(result.content, metadata);
        } else if (result.type === 'epub') {
            await openEpubFile(result, metadata); 
        } else {
            throw new Error('Unsupported file type: ' + result.type);
        }
        console.log(`⏱️ [RENDER FILE] ${(performance.now() - renderStart).toFixed(2)}ms`);
        
        // UI 초기화
        const uiStart = performance.now();
        initControls();
        initNavigation();
        initHighlights();
        console.log(`⏱️ [INIT UI] ${(performance.now() - uiStart).toFixed(2)}ms`);
        
        // 테마 적용
        const themeStart = performance.now();
        applyTheme();
        console.log(`⏱️ [APPLY THEME] ${(performance.now() - themeStart).toFixed(2)}ms`);
        
        // 자동 저장 시작
        startAutoSave(metadata.seriesId, metadata.bookId);
        
        // 전역 함수 등록
        window.openTextSettings = openSettings;
        
        const totalTime = performance.now() - totalStart;
        console.log(`✅ [TEXT VIEWER TOTAL] ${totalTime.toFixed(2)}ms`);
        
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
    const txtStart = performance.now();
    
    console.log('📌 Opening with seriesId:', metadata.seriesId);
    console.log('📌 Opening with bookId:', metadata.bookId);
    console.log('📌 Text length:', textContent.length, 'chars');
    
    // 목차 생성
    const tocStart = performance.now();
    const toc = generateTxtTOC(textContent);
    metadata.toc = toc;
    console.log(`⏱️ [GENERATE TOC] ${(performance.now() - tocStart).toFixed(2)}ms`);
    
    // ✅ 커버 플레이스홀더 표시
    if (metadata.coverUrl) {
        // 1page 모드에서만 표시
        if (pageLayout === '1page') {
            const content = document.getElementById('textViewerContent');
            if (content) {
                const coverPlaceholder = document.createElement('div');
                coverPlaceholder.id = 'coverPlaceholder';
                coverPlaceholder.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: calc(100vh - 100px);
                    padding: 20px;
                    box-sizing: border-box;
                    background: var(--bg-primary, #0d0d0d);
                `;
                coverPlaceholder.innerHTML = `
                    <div style="
                        width: 250px;
                        height: 350px;
                        background: var(--bg-input, #222);
                        border: 2px dashed var(--border-color, #333);
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: var(--text-tertiary, #666);
                        font-size: 14px;
                    ">
                        커버 로딩 중...
                    </div>
                `;
                content.insertBefore(coverPlaceholder, content.firstChild);
            }
        }
    }
    
    // 렌더링
    const renderStart = performance.now();
    await renderTxt(textContent, metadata);
    const renderTime = performance.now() - renderStart;
    console.log(`⏱️ [RENDER TXT] ${renderTime.toFixed(2)}ms`);
    
    // ✅ 커버 로드 완료 후 플레이스홀더 교체
    if (metadata.coverUrl && pageLayout === '1page') {
        loadCover(metadata.seriesId, metadata.bookId, metadata)
            .then(coverUrl => {
                metadata.coverUrl = coverUrl;
                const placeholder = document.getElementById('coverPlaceholder');
                if (placeholder && coverUrl) {
                    const coverDiv = document.createElement('div');
                    coverDiv.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: calc(100vh - 100px);
                        padding: 20px;
                        box-sizing: border-box;
                    `;
                    coverDiv.innerHTML = `
                        <img src="${coverUrl}" alt="cover" style="
                            max-width: 90%;
                            max-height: 70vh;
                            object-fit: contain;
                            border-radius: 8px;
                            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        ">
                    `;
                    placeholder.replaceWith(coverDiv);
                    console.log('📷 Cover loaded and displayed');
                }
            })
            .catch(() => {
                const placeholder = document.getElementById('coverPlaceholder');
                if (placeholder) {
                    placeholder.remove();
                }
            });
    }
    
    // 책갈피 불러오기
    const bookmarkStart = performance.now();
    const bookmark = loadBookmark(metadata.seriesId, metadata.bookId);
    console.log('📌 Loaded bookmark:', bookmark);
    
    if (bookmark && bookmark.progress > 0) {
        const container = document.getElementById('textViewerContainer');
        if (container) {
            container.scrollTop = bookmark.position || 0;
            console.log('📌 Restored position:', bookmark.position);
            showToast('Bookmark restored');
        }
    }
    console.log(`⏱️ [RESTORE BOOKMARK] ${(performance.now() - bookmarkStart).toFixed(2)}ms`);
    
    console.log(`⏱️ [OPEN TXT TOTAL] ${(performance.now() - txtStart).toFixed(2)}ms`);
}

/**
 * EPUB 파일 열기
 * @param {Blob} epubBlob - EPUB Blob
 * @param {Object} metadata - 메타데이터
 */
async function openEpubFile(epubResult, metadata) {
    const epubStart = performance.now();
    await renderEpub(epubResult, metadata);
    console.log(`⏱️ [RENDER EPUB] ${(performance.now() - epubStart).toFixed(2)}ms`);
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
