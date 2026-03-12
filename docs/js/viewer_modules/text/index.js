/**
 * viewer_modules/text/index.js
 * 텍스트 뷰어 진입점 (TXT + EPUB)
 */

import { TextViewerState, resetViewerState } from './text_state.js';
import { Events } from '../core/events.js';
import { renderTxt, cleanupTextRenderer, updateCoverImage, updateCoverFailed } from './text_renderer.js';
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
 */
export async function openTextViewer(result, metadata) {
    try {
        resetViewerState();
        TextViewerState.currentBook = metadata;

        // ✅ Cover 백그라운드 로드 (비동기)
// ✅ Cover 백그라운드 로드 (비동기)
loadCover(metadata.seriesId, metadata.bookId, metadata)
    .then(function(coverUrl) {
        if (coverUrl) {
            metadata.coverUrl = coverUrl;
            updateCoverImage(coverUrl);  // ← import된 함수 직접 호출
        } else {
            updateCoverFailed();  // ← 실패 처리
        }
    })
    .catch(function() {
        updateCoverFailed();  // ← 에러 처리
    });


        // 타입에 따라 렌더링
        if (result.type === 'text' || result.type === 'txt') {
            await openTxtFile(result.content, metadata);
        } else if (result.type === 'epub') {
            await openEpubFile(result, metadata);
        } else {
            throw new Error('Unsupported file type: ' + result.type);
        }

        initControls();
        initNavigation();
        initHighlights();
        applyTheme();
        startAutoSave(metadata.seriesId, metadata.bookId);

        window.openTextSettings = openSettings;

    } catch (e) {
        console.error('Text Viewer open failed:', e);
        showToast('뷰어 열기 실패: ' + e.message, 3000);
        closeTextViewer();
    }
}

/**
 * TXT 파일 열기
 */
async function openTxtFile(textContent, metadata) {
    var toc = generateTxtTOC(textContent);
    metadata.toc = toc;

    await renderTxt(textContent, metadata);

    var bookmark = loadBookmark(metadata.seriesId, metadata.bookId);
    if (bookmark && bookmark.progress > 0) {
        var container = document.getElementById('textViewerContainer');
        if (container) {
            container.scrollTop = bookmark.position || 0;
            showToast('Bookmark restored');
        }
    }
}

/**
 * EPUB 파일 열기
 */
async function openEpubFile(epubResult, metadata) {
    await renderEpub(epubResult, metadata);
}

/**
 * 텍스트 뷰어 닫기
 */
export function closeTextViewer() {
    if (TextViewerState.currentBook) {
        saveOnClose(
            TextViewerState.currentBook.seriesId,
            TextViewerState.currentBook.bookId
        );
    }

    restoreOriginalTheme();
    cleanupNavigation();

    if (TextViewerState.renderType === 'epub') {
        cleanupEpubViewer();
    }
    cleanupTextRenderer();

    var textContainer = document.getElementById('textViewerContainer');
    if (textContainer) textContainer.remove();

    var epubContainer = document.getElementById('epubViewerContainer');
    if (epubContainer) epubContainer.remove();

    var settings = document.getElementById('textViewerSettings');
    if (settings) settings.remove();

    var viewer = document.getElementById('viewerOverlay');
    if (viewer) {
        viewer.style.display = 'none';
        document.body.classList.remove('no-scroll');
    }

    resetViewerState();
    delete window.openTextSettings;
    Events.emit('text:close');
}

/**
 * 뷰어 토글 (열기/닫기)
 */
export function toggleTextViewer(result, metadata) {
    var viewer = document.getElementById('viewerOverlay');

    if (viewer && viewer.style.display === 'flex') {
        closeTextViewer();
    } else {
        openTextViewer(result, metadata);
    }
}

/**
 * 현재 뷰어 상태 확인
 */
export function isTextViewerOpen() {
    var viewer = document.getElementById('viewerOverlay');
    return viewer && viewer.style.display === 'flex';
}

window.openTextViewer = openTextViewer;
window.closeTextViewer = closeTextViewer;
window.toggleTextViewer = toggleTextViewer;

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isTextViewerOpen()) {
        closeTextViewer();
    }
});

console.log('✅ Text Viewer Module loaded');
