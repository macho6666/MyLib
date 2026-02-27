/**
 * viewer_modules/core/events.js
 * 이벤트 버스 시스템 (순환 참조 해결)
 */

class ViewerEventBus {
    constructor() {
        this.listeners = new Map();
    }
    
    /**
     * 이벤트 리스너 등록
     * @param {string} event - 이벤트 이름
     * @param {Function} callback - 콜백 함수
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    /**
     * 이벤트 리스너 제거
     * @param {string} event - 이벤트 이름
     * @param {Function} callback - 제거할 콜백
     */
    off(event, callback) {
        if (!this.listeners.has(event)) return;
        
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }
    
    /**
     * 이벤트 발생
     * @param {string} event - 이벤트 이름
     * @param {*} data - 전달할 데이터
     */
    emit(event, data) {
        if (!this.listeners.has(event)) return;
        
        const callbacks = this.listeners.get(event);
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error(`[Event] Error in '${event}' listener:`, e);
            }
        });
    }
    
    /**
     * 한 번만 실행되는 리스너
     * @param {string} event - 이벤트 이름
     * @param {Function} callback - 콜백 함수
     */
    once(event, callback) {
        const onceWrapper = (data) => {
            callback(data);
            this.off(event, onceWrapper);
        };
        this.on(event, onceWrapper);
    }
    
    /**
     * 모든 리스너 제거
     * @param {string} event - 이벤트 이름 (선택)
     */
    clear(event) {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }
}

// 전역 이벤트 버스 인스턴스
export const Events = new ViewerEventBus();

// 전역 접근 (디버깅용)
window.ViewerEvents = Events;

/**
 * 주요 이벤트 목록
 * 
 * 📚 텍스트 뷰어:
 * - 'text:open'          - 텍스트 뷰어 열림 { bookId, metadata }
 * - 'text:close'         - 텍스트 뷰어 닫힘
 * - 'text:page-change'   - 페이지 변경 { page, totalPages }
 * - 'text:theme-change'  - 테마 변경 { mode, colors }
 * - 'text:layout-change' - 레이아웃 변경 { layout }
 * - 'text:highlight'     - 하이라이트 추가 { range, text, color }
 * 
 * 🎨 이미지 뷰어:
 * - 'image:open'         - 이미지 뷰어 열림 { bookId, metadata }
 * - 'image:close'        - 이미지 뷰어 닫힘
 * - 'image:page-change'  - 페이지 변경 { spreadIndex, totalSpreads }
 * - 'image:mode-change'  - 모드 변경 { mode }
 * 
 * 🔖 공통:
 * - 'bookmark:save'      - 책갈피 저장 { bookId, position }
 * - 'bookmark:load'      - 책갈피 불러오기 { bookId, position }
 * - 'progress:update'    - 진행도 업데이트 { bookId, progress }
 * - 'calendar:sync'      - 캘린더 동기화 { type, data }
 */

console.log('✅ Event Bus initialized');
