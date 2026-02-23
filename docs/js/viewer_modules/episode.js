import { openEpisodeList } from './actions.js';
import { currentBookList, currentBookIndex, updateCurrentBookIndex, updateCurrentBookList } from './state.js';
import { getReadHistory, formatSize } from './utils.js';
import { loadViewer } from './actions.js'; 

/**
 * 회차 목록 UI를 렌더링합니다.
 */
export function renderEpisodeList(books, seriesId) {
    updateCurrentBookList(books || []);
    const listEl = document.getElementById('episodeList');
    listEl.innerHTML = '';
    const history = getReadHistory(seriesId);

    if (!books || books.length === 0) {
        listEl.innerHTML = '<div style="padding:20px; color:#888;">표시할 회차가 없습니다.</div>';
        return;
    }

    books.forEach((book, index) => {
        book.seriesId = seriesId; 
        const div = document.createElement('div');
        div.className = 'episode-item';

        let icon = '📁';
        let meta = '폴더';
        let isRead = history[book.id];
        let clickHandler = () => window.open(book.url, '_blank');

        // Check file type
        if (book.media && book.media.mediaType && !book.media.mediaType.includes('folder')) {
            icon = '📦';
            meta = formatSize(book.size);

            const name = book.name.toLowerCase();
            if (name.endsWith('.cbz') || name.endsWith('.zip') || name.endsWith('.epub')) {
                icon = '📖';
                clickHandler = () => loadViewer(index); // Launch Viewer
            }
        }

        div.innerHTML = `
            <div>
                <span style="margin-right:10px;">${icon}</span>
                <span class="ep-name" style="${isRead ? 'color:#888;' : ''}">${book.name}</span>
                ${isRead ? '<span class="read-badge active">READ</span>' : ''}
            </div>
            <span class="ep-meta">${meta}</span>
        `;
        div.onclick = clickHandler;
        listEl.appendChild(div);
    });
}
