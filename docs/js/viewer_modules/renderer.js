import { vState, currentBookList, currentBookIndex } from './state.js';
import { saveProgress, saveReadHistory, showToast, findVisibleAnchor } from './utils.js';
import { updateSliderUI } from './controls.js';
import { checkNextEpisodeTrigger, preloadNextEpisode } from './actions.js'; // Cyclic dep handling needed?

// Note: updateSliderUI imported from controls.js might create a cycle (controls -> renderer?)
// controls.js likely imports renderer for `navigateViewer` -> `renderCurrentSpread`.
// We will handle this by importing `preloadNextEpisode` and `checkNextEpisodeTrigger` from actions.js.

/**
 * 보기 모드(1쪽/2쪽)와 이미지 크기(가로/세로)에 따라 페이지(Spread)를 재구성합니다.
 * @param {boolean} [resetPage=false] - 현재 페이지 인덱스를 0으로 초기화할지 여부
 */
export function recalcSpreads(resetPage = false) {
    vState.spreads = [];
    const images = vState.images;
    
    if (vState.mode === '1page') {
        for(let i=0; i<images.length; i++) vState.spreads.push([i]);
    } else {
        // 2-page logic
        let i = 0;
        if (vState.coverPriority && images.length > 0) {
             vState.spreads.push([0]);
             i = 1;
        }
        while (i < images.length) {
            const current = images[i];
            // If landscape -> Single
            if (current.width > current.height) {
                vState.spreads.push([i]);
                i++;
                continue;
            }
            // Pair?
            if (i + 1 < images.length) {
                const next = images[i+1];
                if (next.width > next.height) { // Next is landscape -> break pair
                     vState.spreads.push([i]);
                     i++;
                } else {
                     vState.spreads.push([i, i+1]);
                     i += 2;
                }
            } else {
                vState.spreads.push([i]);
                i++;
            }
        }
    }
    
    if (resetPage) vState.currentSpreadIndex = 0;
    renderCurrentSpread();
}

/**
 * 모든 이미지의 실제 크기(naturalWidth/Height)를 비동기적으로 로드합니다.
 * 스마트 2쪽 보기(가로형 이미지 단독 표시 등)를 위해 필수적입니다.
 */
export function loadAllImageDimensions(images) {
    const promises = images.map(imgData => {
        return new Promise(resolve => {
             const img = new Image();
             img.onload = () => { imgData.width = img.naturalWidth; imgData.height = img.naturalHeight; imgData.loaded = true; resolve(); };
             img.onerror = resolve;
             img.src = imgData.src;
        });
    });
    return Promise.all(promises);
}

/**
 * 현재 Spread(vState.currentSpreadIndex)를 DOM에 그립니다.
 */
export function renderCurrentSpread() {
    if (!vState.spreads || vState.spreads.length === 0) return;
    
    const container = document.getElementById('viewerImageContainer');
    const counter = document.getElementById('pageCounter');
    const spreadIndices = vState.spreads[vState.currentSpreadIndex];
    if (!spreadIndices) {
        console.error(`Rendering Error: Invalid Spread Index ${vState.currentSpreadIndex} / ${vState.spreads.length}`);
        return;
    }
    
    // RTL
    const dirStyle = vState.rtlMode ? 'flex-direction:row-reverse;' : '';

    container.innerHTML = `<div class="viewer-spread ${vState.rtlMode ? 'is-rtl' : ''}" style="${dirStyle}">
        ${spreadIndices.map(idx => `
            <div class="${spreadIndices.length > 1 ? 'half' : ''}">
                <img src="${vState.images[idx].src}" class="viewer-page">
            </div>
        `).join('')}
    </div>`;
    
    // Counter
    const start = spreadIndices[0] + 1;
    const end = spreadIndices[spreadIndices.length-1] + 1;
    const total = vState.images.length;
    counter.innerText = (start === end) ? `${start} / ${total}` : `${start}-${end} / ${total}`;

    // Save Progress
    const currentImgIdx = spreadIndices[0]; // Use first image of spread as marker
    saveProgress(currentBookList[currentBookIndex].seriesId, currentBookList[currentBookIndex].id, currentImgIdx);

    // Check Finish (Mark Read if last page)
    if (vState.currentSpreadIndex === vState.spreads.length - 1) {
        saveReadHistory(currentBookList[currentBookIndex].seriesId, currentBookList[currentBookIndex].id);
        const modal = document.getElementById('episodeModal');
        if (modal && modal.style.display === 'flex') {
             // Refresh list if open behind
             // renderEpisodeList(currentBookList, currentBookList[currentBookIndex].seriesId); 
        }
    }

    // Preload Trigger
    if (vState.spreads.length - vState.currentSpreadIndex <= 4) {
         preloadNextEpisode();
    }
    
    // Update Slider
    updateSliderUI();
}


/* Scroll Mode Logic */
export function renderScrollMode() {
    const container = document.getElementById('viewerScrollContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Intersection Observer for Current Page
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if(entry.isIntersecting) {
                const index = parseInt(entry.target.getAttribute('data-index'));
                updateScrollProgress(index);
            }
        });
    }, { threshold: 0.5 }); // 50% visible

    vState.images.forEach((imgData, index) => {
        const img = document.createElement('img');
        img.src = imgData.src;
        // img.loading = 'lazy'; // Removed to ensure dimension calculation for scroll
        img.className = 'viewer-page';
        img.setAttribute('data-index', index);
        
        container.appendChild(img);
        observer.observe(img);
    });

    // Initial update
    updateSliderUI();
    
    // Add Infinite Scroll Trigger with Double-Tap Protection
    container.onscroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        
        if (scrollTop + clientHeight >= scrollHeight - 50) {
             // Double-Tap Logic
             if (!window.scrollBottomTriggered) {
                 window.scrollBottomTriggered = true;
                 window.scrollBottomTimestamp = Date.now();
                 showToast("마지막입니다. 계속 내리면 다음 화로 이동합니다.");
                 return;
             }
             
             // Time Latch (1s)
             if (Date.now() - window.scrollBottomTimestamp < 1000) {
                 return;
             }

             if (!window.isLoadingNext) checkNextEpisodeTrigger();
        } else {
            // Reset if user scrolls up
            if (scrollHeight - (scrollTop + clientHeight) > 100) {
                window.scrollBottomTriggered = false;
                window.scrollBottomTimestamp = 0;
            }
        }
    };
}

export function updateScrollProgress(index) {
    if (vState.currentSpreadIndex === index) return;
    vState.currentSpreadIndex = index;
    
    // Update Counter
    const counter = document.getElementById('pageCounter');
    const total = vState.images.length;
    if(counter) counter.innerText = `${index + 1} / ${total}`;
    
    // Save Progress
    if(currentBookList[currentBookIndex]) {
        saveProgress(currentBookList[currentBookIndex].seriesId, currentBookList[currentBookIndex].id, index);
    }
    
    // Slider
    const slider = document.getElementById('pageSlider');
    if(slider) slider.value = index + 1;
    const currentLabel = document.getElementById('sliderCurrent');
    if(currentLabel) currentLabel.innerText = index + 1;

    // Check Finish (Last Page)
    if (index === total - 1) {
        saveReadHistory(currentBookList[currentBookIndex].seriesId, currentBookList[currentBookIndex].id);
    }
    
    // Preload Trigger (Last 3 images)
    if (total - index <= 3) {
        preloadNextEpisode();
    }
}

export function scrollToPage(index) {
    const container = document.getElementById('viewerScrollContainer');
    if(!container) return;
    
    const target = container.children[index];
    if(target) {
        target.scrollIntoView({ block: 'start' });
    }
}

/* Legacy EPUB Rendering (New Text Layout) */
export function renderLegacyMode(htmlContent) {
    const container = document.getElementById('viewerImageContainer');
    const scrollContainer = document.getElementById('viewerScrollContainer'); 

    // Hide Image Scroll Container
    if (scrollContainer) scrollContainer.style.display = 'none';
    
    // Show Unified Container
    container.style.display = 'flex';
    container.innerHTML = '';
    container.classList.add('epub-mode');

    // 1. Inject Structure (Book Container)
    container.innerHTML = `
        <div class="book-container" id="bookContainer" style="display:block;">
            <div class="side-tap left-tap" onclick="navigateViewer(-1)"></div>
            <div class="side-tap right-tap" onclick="navigateViewer(1)"></div>

            <div class="text-columns" id="textBody">
                <div class="inner-content" style="font-size:${vState.textSettings.fontSize}px; line-height:${vState.textSettings.lineHeight};">
                    ${htmlContent}
                </div>
            </div>

            <div class="floating-controls" id="floatControls">
                <button class="nav-btn float" onclick="navigateViewer(-1)">‹</button>
                <div class="page-indicator-float" id="pageIndicatorFloat">1 / 1</div>
                <button class="nav-btn float" onclick="navigateViewer(1)">›</button>
            </div>
        </div>
    `;

    // 2. Initialize Pagination
    // Need to wait for DOM render
    setTimeout(() => {
        initTextPagination();
    }, 100);

    // 3. Add Resize Listener
    window.addEventListener('resize', initTextPagination);
}

export function initTextPagination() {
    const textBody = document.getElementById('textBody');
    const container = document.getElementById('bookContainer');
    
    if (!textBody || !container) return;

    // Reset Transform
    textBody.style.transform = `translateX(0)`;
    
    const totalWidth = textBody.scrollWidth;
    const viewWidth = container.clientWidth;
    
    // Calculate Total Pages
    vState.totalTextPages = Math.max(1, Math.round(totalWidth / viewWidth));
    vState.textPage = 0; // Reset to start
    
    updateTextUI();
}

export function updateTextUI() {
    const textBody = document.getElementById('textBody');
    const indicator = document.getElementById('pageIndicatorFloat');
    const prevBtn = document.querySelector('.nav-btn.float:first-child'); // Quick select
    // Actually selectors via onclick might be safer or IDs
    
    if (textBody) {
        textBody.style.transform = `translateX(-${vState.textPage * 100}%)`;
    }
    
    if (indicator) {
        indicator.innerText = `${vState.textPage + 1} / ${vState.totalTextPages}`;
    }
    
    // Update Global Counter too
    const globalCounter = document.getElementById('pageCounter');
    if (globalCounter) {
        globalCounter.innerText = `${vState.textPage + 1} / ${vState.totalTextPages}`;
    }
}


export function applyTextSettings() {
    // 1. Text Mode Support - New Structure
    if (vState.epubMode && !vState.foliateView) {
        const el = document.querySelector('.inner-content');
        if(el) {
            el.style.fontSize = `${vState.textSettings.fontSize}px`;
            el.style.lineHeight = vState.textSettings.lineHeight;
        }
        // Force Re-pagination on settings change
        // We need to re-calculate columns
        const { initTextPagination } = require('./renderer.js'); // Self-import? Or just call if in scope.
        // It is in scope (same file).
        initTextPagination();
        return;
    }

    // 2. Foliate Mode
    if (!vState.foliateView || !vState.foliateView.renderer) return;
    
    // Foliate manages content in iframes (renderer.getContents())
    const contents = vState.foliateView.renderer.getContents();
    for (const content of contents) {
        if (content.doc) {
            content.doc.body.style.fontSize = `${vState.textSettings.fontSize}px`;
            content.doc.body.style.lineHeight = vState.textSettings.lineHeight;
            content.doc.body.style.color = '#333';
            content.doc.body.style.backgroundColor = '#fff';
        }
    }
}
