/**
 * viewer_modules/core/utils.js
 * 공통 유틸리티 함수
 */

/**
 * 토스트 메시지 표시
 * @param {string} msg - 메시지
 * @param {number} duration - 지속 시간 (ms)
 */
export function showToast(msg, duration = 2000) {
    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.innerText = msg;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, duration);
}

/**
 * 파일 크기 포맷
 * @param {number} bytes - 바이트 크기
 * @returns {string} 포맷된 문자열
 */
export function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 읽은 기록 가져오기
 * @param {string} seriesId - 시리즈 ID
 * @returns {Object} { bookId: true, ... }
 */
export function getReadHistory(seriesId) {
    const json = localStorage.getItem(`read_${seriesId}`);
    return json ? JSON.parse(json) : {};
}

/**
 * 읽은 기록 저장
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 */
export function saveReadHistory(seriesId, bookId) {
    const history = getReadHistory(seriesId);
    history[bookId] = true;
    localStorage.setItem(`read_${seriesId}`, JSON.stringify(history));
}

/**
 * 진행도 가져오기 (페이지 번호 또는 위치)
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 * @returns {number|Object} 진행도
 */
export function getProgress(seriesId, bookId) {
    const json = localStorage.getItem(`prog_${seriesId}`);
    const data = json ? JSON.parse(json) : {};
    return data[bookId] || 0;
}

/**
 * 진행도 저장
 * @param {string} seriesId - 시리즈 ID
 * @param {string} bookId - 책 ID
 * @param {number|Object} progress - 진행도 (페이지 번호 또는 CFI)
 */
export function saveProgress(seriesId, bookId, progress) {
    const json = localStorage.getItem(`prog_${seriesId}`);
    const data = json ? JSON.parse(json) : {};
    data[bookId] = progress;
    localStorage.setItem(`prog_${seriesId}`, JSON.stringify(data));
}

/**
 * HTML 특수문자 이스케이프
 * @param {string} text - 원본 텍스트
 * @returns {string} 이스케이프된 텍스트
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 디바운스 (연속 호출 방지)
 * @param {Function} func - 실행할 함수
 * @param {number} wait - 대기 시간 (ms)
 * @returns {Function} 디바운스된 함수
 */
export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 스로틀 (일정 시간마다 한 번만 실행)
 * @param {Function} func - 실행할 함수
 * @param {number} limit - 제한 시간 (ms)
 * @returns {Function} 스로틀된 함수
 */
export function throttle(func, limit = 300) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 날짜 포맷
 * @param {Date|string} date - 날짜
 * @returns {string} YYYY-MM-DD 형식
 */
export function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 시간 포맷
 * @param {Date|string} date - 날짜
 * @returns {string} HH:MM 형식
 */
export function formatTime(date) {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * 랜덤 ID 생성
 * @returns {string} 랜덤 ID
 */
export function generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * 요소가 뷰포트에 보이는지 확인
 * @param {HTMLElement} element - 확인할 요소
 * @returns {boolean}
 */
export function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

/**
 * 스크롤을 부드럽게 이동
 * @param {HTMLElement} container - 스크롤 컨테이너
 * @param {number} targetY - 목표 Y 위치
 * @param {number} duration - 지속 시간 (ms)
 */
export function smoothScrollTo(container, targetY, duration = 500) {
    const startY = container.scrollTop;
    const distance = targetY - startY;
    const startTime = performance.now();
    
    function animation(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // easeInOutQuad
        const ease = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        container.scrollTop = startY + distance * ease;
        
        if (progress < 1) {
            requestAnimationFrame(animation);
        }
    }
    
    requestAnimationFrame(animation);
}

console.log('✅ Utils loaded');
