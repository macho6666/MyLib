/**
 * Utility functions for Viewer
 */

export function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + ['B','KB','MB','GB'][i];
}

/**
 * 토스트 메시지를 화면에 표시합니다.
 * @param {string} msg - 표시할 메시지
 * @param {number} [duration=2000] - 지속 시간 (ms)
 */
export function showToast(msg, duration = 2000) {
    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.innerText = msg;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
             if(toast.parentNode) toast.remove();
        }, 300);
    }, duration);
}

/**
 * 읽은 기록 반환 (Key: `read_{seriesId}`)
 * @returns {Object} 읽은 기록 객체 { bookId: true, ... }
 */
export function getReadHistory(seriesId) {
    const json = localStorage.getItem(`read_${seriesId}`);
    return json ? JSON.parse(json) : {};
}

/**
 * 에피소드 읽음 처리 및 저장
 */
export function saveReadHistory(seriesId, bookId) {
    let history = getReadHistory(seriesId);
    history[bookId] = true;
    localStorage.setItem(`read_${seriesId}`, JSON.stringify(history));
}

/**
 * 저장된 진행도(페이지 인덱스)를 반환합니다.
 */
export function getProgress(seriesId, bookId) {
    const json = localStorage.getItem(`prog_${seriesId}`);
    const data = json ? JSON.parse(json) : {}; 
    return data[bookId] || 0;
}

/**
 * 현재 읽고 있는 페이지 인덱스(또는 앵커 객체)를 저장합니다.
 * @param {string} seriesId
 * @param {string} bookId
 * @param {number|Object} pageIndexOrAnchor - 페이지 번호(이미지) 또는 앵커 객체(텍스트)
 */
export function saveProgress(seriesId, bookId, pageIndexOrAnchor) {
    const json = localStorage.getItem(`prog_${seriesId}`);
    const data = json ? JSON.parse(json) : {};
    data[bookId] = pageIndexOrAnchor;
    localStorage.setItem(`prog_${seriesId}`, JSON.stringify(data));
}

/**
 * 텍스트 뷰어용: 화면 상단에 보이는 첫 번째 문단(Anchor)을 찾습니다.
 * @param {HTMLElement} container - 스크롤 컨테이너
 * @returns {Object|null} { pIndex: number, offset: number }
 */
export function findVisibleAnchor(container) {
    if (!container) return null;
    
    // Find all potential anchors (paragraphs, divs, headings)
    const candidates = container.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6');
    const scrollTop = container.scrollTop;
    
    // Linear scan
    for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (el.offsetTop + el.clientHeight > scrollTop) {
            return { index: i, id: el.id, tagName: el.tagName };
        }
    }
    return null;
}
