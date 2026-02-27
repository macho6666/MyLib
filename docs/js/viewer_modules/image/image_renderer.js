/**
 * viewer_modules/image/image_renderer.js
 * 이미지 뷰어 렌더링 (스프레드 계산 + 표시)
 */

import { ImageViewerState, setCurrentSpreadIndex } from './image_state.js';
import { Events } from '../core/events.js';
import { saveProgress, saveReadHistory } from '../core/utils.js';

/**
 * 이미지 뷰어 초기화
 * @param {Array} imageUrls - Blob URL 배열
 * @param {Object} metadata - { bookId, name, seriesId }
 */
export async function renderImages(imageUrls, metadata) {
    ImageViewerState.currentBook = metadata;
    
    // 뷰어 표시
    const viewer = document.getElementById('viewerOverlay');
    viewer.style.display = 'flex';
    document.body.classList.add('no-scroll');
    
    // 컨테이너 준비
    let container = document.getElementById('imageViewerContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'imageViewerContainer';
        container.className = 'viewer-image-container';
        document.getElementById('viewerContent').appendChild(container);
    }
    
    container.innerHTML = '<div style="color:white; text-align:center; padding:40px;">이미지 로딩 중...</div>';
    
    // 이미지 데이터 구성
    ImageViewerState.images = imageUrls.map(url => ({
        src: url,
        width: 0,
        height: 0,
        loaded: false
    }));
    
    // 이미지 크기 로드
    await loadAllImageDimensions(ImageViewerState.images);
    
    // 스프레드 계산
    recalcSpreads();
    
    // 첫 페이지 렌더링
    ImageViewerState.currentSpreadIndex = 0;
    
    if (ImageViewerState.scrollMode) {
        renderScrollMode(container);
    } else {
        renderCurrentSpread(container);
    }
    
    // 이벤트 발생
    Events.emit('image:open', { bookId: metadata.bookId, metadata });
    
    console.log(`🖼️ Image Viewer: ${imageUrls.length} images`);
}

/**
 * 모든 이미지 크기 로드
 * @param {Array} images - 이미지 데이터 배열
 */
function loadAllImageDimensions(images) {
    const promises = images.map(imgData => {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                imgData.width = img.naturalWidth;
                imgData.height = img.naturalHeight;
                imgData.loaded = true;
                resolve();
            };
            img.onerror = resolve;
            img.src = imgData.src;
        });
    });
    return Promise.all(promises);
}

/**
 * 스프레드 계산 (1페이지/2페이지 모드)
 */
export function recalcSpreads() {
    ImageViewerState.spreads = [];
    const images = ImageViewerState.images;
    const mode = ImageViewerState.mode;
    const coverPriority = ImageViewerState.coverPriority;
    
    if (mode === '1page') {
        // 1페이지 모드: 각 이미지 개별
        for (let i = 0; i < images.length; i++) {
            ImageViewerState.spreads.push([i]);
        }
    } else {
        // 2페이지 모드
        let i = 0;
        
        // 표지 우선: 첫 페이지 단독
        if (coverPriority && images.length > 0) {
            ImageViewerState.spreads.push([0]);
            i = 1;
        }
        
        while (i < images.length) {
            const current = images[i];
            
            // 가로형 이미지 → 단독
            if (current.width > current.height) {
                ImageViewerState.spreads.push([i]);
                i++;
                continue;
            }
            
            // 다음 이미지와 묶기
            if (i + 1 < images.length) {
                const next = images[i + 1];
                
                // 다음도 가로형 → 현재 단독
                if (next.width > next.height) {
                    ImageViewerState.spreads.push([i]);
                    i++;
                } else {
                    // 둘 다 세로형 → 묶음
                    ImageViewerState.spreads.push([i, i + 1]);
                    i += 2;
                }
            } else {
                // 마지막 이미지 → 단독
                ImageViewerState.spreads.push([i]);
                i++;
            }
        }
    }
}

/**
 * 현재 스프레드 렌더링
 * @param {HTMLElement} container
 */
export function renderCurrentSpread(container) {
    if (!container) {
        container = document.getElementById('imageViewerContainer');
    }
    if (!container) return;
    
    const spreads = ImageViewerState.spreads;
    const currentIndex = ImageViewerState.currentSpreadIndex;
    const spreadIndices = spreads[currentIndex];
    
    if (!spreadIndices) return;
    
    const rtl = ImageViewerState.rtlMode;
    const images = ImageViewerState.images;
    
    // HTML 생성
    const dirStyle = rtl ? 'flex-direction: row-reverse;' : '';
    
    container.innerHTML = `
        <div class="viewer-spread" style="
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
            ${dirStyle}
        ">
            ${spreadIndices.map(idx => `
                <div class="${spreadIndices.length > 1 ? 'half' : ''}" style="
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    ${spreadIndices.length > 1 ? 'width: 50%;' : 'width: 100%;'}
                    height: 100%;
                ">
                    <img src="${images[idx].src}" class="viewer-page" style="
                        max-width: 100%;
                        max-height: 100%;
                        object-fit: contain;
                    ">
                </div>
            `).join('')}
        </div>
    `;
    
    // UI 업데이트
    updatePageUI();
    
    // 진행도 저장
    saveCurrentProgress();
    
    // 마지막 페이지 체크
    if (currentIndex === spreads.length - 1) {
        markAsRead();
    }
    
    // 이벤트 발생
    Events.emit('image:page-change', {
        spreadIndex: currentIndex,
        totalSpreads: spreads.length
    });
}

/**
 * 스크롤 모드 렌더링 (웹툰)
 * @param {HTMLElement} container
 */
export function renderScrollMode(container) {
    if (!container) {
        container = document.getElementById('imageViewerContainer');
    }
    if (!container) return;
    
    const images = ImageViewerState.images;
    
    container.innerHTML = '';
    container.style.cssText = `
        width: 100%;
        height: 100%;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
    `;
    
    // Intersection Observer (현재 페이지 감지)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const index = parseInt(entry.target.getAttribute('data-index'));
                updateScrollProgress(index);
            }
        });
    }, { threshold: 0.5 });
    
    images.forEach((imgData, index) => {
        const img = document.createElement('img');
        img.src = imgData.src;
        img.className = 'viewer-page scroll-page';
        img.setAttribute('data-index', index);
        img.style.cssText = `
            max-width: 100%;
            width: auto;
            display: block;
        `;
        
        container.appendChild(img);
        observer.observe(img);
    });
    
    updatePageUI();
}

/**
 * 스크롤 진행도 업데이트
 * @param {number} index
 */
function updateScrollProgress(index) {
    ImageViewerState.currentSpreadIndex = index;
    
    // UI 업데이트
    const counter = document.getElementById('pageCounter');
    if (counter) {
        counter.innerText = `${index + 1} / ${ImageViewerState.images.length}`;
    }
    
    // 진행도 저장
    saveCurrentProgress();
    
    // 마지막 체크
    if (index === ImageViewerState.images.length - 1) {
        markAsRead();
    }
}

/**
 * 페이지 UI 업데이트
 */
function updatePageUI() {
    const spreads = ImageViewerState.spreads;
    const currentIndex = ImageViewerState.currentSpreadIndex;
    const spreadIndices = spreads[currentIndex];
    
    if (!spreadIndices) return;
    
    // 페이지 카운터
    const start = spreadIndices[0] + 1;
    const end = spreadIndices[spreadIndices.length - 1] + 1;
    const total = ImageViewerState.images.length;
    
    const counter = document.getElementById('pageCounter');
    if (counter) {
        counter.innerText = (start === end) 
            ? `${start} / ${total}` 
            : `${start}-${end} / ${total}`;
    }
    
    // 슬라이더
    const slider = document.getElementById('pageSlider');
    if (slider) {
        slider.min = 1;
        slider.max = total;
        slider.value = start;
    }
}

/**
 * 진행도 저장
 */
function saveCurrentProgress() {
    const book = ImageViewerState.currentBook;
    if (!book) return;
    
    const spreadIndices = ImageViewerState.spreads[ImageViewerState.currentSpreadIndex];
    const pageIndex = spreadIndices ? spreadIndices[0] : 0;
    
    saveProgress(book.seriesId, book.bookId, pageIndex);
}

/**
 * 읽음 처리
 */
function markAsRead() {
    const book = ImageViewerState.currentBook;
    if (!book) return;
    
    saveReadHistory(book.seriesId, book.bookId);
}

console.log('✅ Image Renderer loaded');
