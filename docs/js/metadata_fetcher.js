/**
 * docs/js/metadata_fetcher.js
 * Tampermonkey와 통신하여 웹에서 메타정보 자동 수집
 */

// ===== 전역 변수 =====
window._searchResults = [];
window._siteOrder = JSON.parse(localStorage.getItem('metadataSiteOrder') || '["리디","네이버","노벨피아","카카오"]');

// ===== 사이트 색상 =====
const SITE_COLORS = {
    '리디': '#1F8CE6',
    '네이버': '#00C73C',
    '노벨피아': '#7B2FF7',
    '카카오': '#FFCD00'
};

const SITE_TEXT_COLORS = {
    '리디': '#fff',
    '네이버': '#fff',
    '노벨피아': '#fff',
    '카카오': '#3C1E1E'
};

// ===== 메타정보 자동 가져오기 시작 =====
function fetchMetadataFromWeb() {
    const keyword = document.getElementById('editTitle').value.trim();
    if (!keyword) {
        showToast('작품명을 먼저 입력하세요');
        return;
    }
    
    showToast('Searching...', 3000);
    
    window.dispatchEvent(new CustomEvent('SEARCH_METADATA_REQUEST', {
        detail: { keyword: keyword }
    }));
}

// ===== Tampermonkey로부터 검색 결과 받기 =====
window.addEventListener('SEARCH_METADATA_RESULTS', function(e) {
    const results = e.detail.results;
    
    if (!results || results.length === 0) {
        showToast('검색 결과가 없습니다');
        return;
    }
    
    showSearchResultsModal(results);
});

// ===== 검색 결과 선택 모달 (탭 방식) =====
function showSearchResultsModal(results) {
    const existingModal = document.querySelector('.metadata-search-modal');
    if (existingModal) existingModal.remove();
    
    // 사이트별로 그룹화
    const grouped = {};
    results.forEach(r => {
        if (!grouped[r.site]) grouped[r.site] = [];
        grouped[r.site].push(r);
    });
    
    // 결과 있는 사이트만 필터링 & 우선순위 순서로 정렬
    const availableSites = window._siteOrder.filter(site => grouped[site] && grouped[site].length > 0);
    
    if (availableSites.length === 0) {
        showToast('검색 결과가 없습니다');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay metadata-search-modal';
    modal.style.display = 'flex';
    
    // 탭 HTML 생성
    const tabsHTML = availableSites.map((site, i) => `
        <div class="search-tab ${i === 0 ? 'active' : ''}" 
             data-site="${site}" 
             draggable="true"
             style="--tab-color: ${SITE_COLORS[site]}; --tab-text: ${SITE_TEXT_COLORS[site]};">
            <span class="tab-name">${site}</span>
            <span class="tab-count">(${grouped[site].length})</span>
        </div>
    `).join('');
    
    // 첫 번째 탭의 결과
    const firstSite = availableSites[0];
    const resultsHTML = buildResultsHTML(grouped[firstSite]);
    
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <div class="modal-title">검색 결과</div>
                <button class="modal-close" onclick="this.closest('.metadata-search-modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="search-tabs-container">
                    <div class="search-tabs" id="searchTabs">
                        ${tabsHTML}
                    </div>
                </div>
                <div class="search-results-content" id="searchResultsContent">
                    ${resultsHTML}
                </div>
                <div class="search-results-actions">
                    <button class="btn edit-btn-cancel" onclick="this.closest('.metadata-search-modal').remove()">취소</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    window._searchResults = results;
    window._groupedResults = grouped;
    
    // 탭 클릭 이벤트
    setupTabEvents(modal);
    
    // 드래그 앤 드롭 이벤트
    setupDragAndDrop(modal);
}

// ===== 결과 HTML 빌드 =====
function buildResultsHTML(siteResults) {
    return siteResults.map((r, i) => {
        const globalIndex = window._searchResults.findIndex(sr => sr.url === r.url);
        return `
            <div class="search-result-item" onclick="selectSearchResult(${globalIndex})">
                <div class="search-result-title">${r.title}</div>
                <div class="search-result-author">${r.author || '작가 미상'}</div>
                <div class="search-result-url">${r.url}</div>
            </div>
        `;
    }).join('');
}

// ===== 탭 클릭 이벤트 =====
function setupTabEvents(modal) {
    const tabs = modal.querySelectorAll('.search-tab');
    const content = modal.querySelector('#searchResultsContent');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // 활성 탭 변경
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // 결과 표시
            const site = this.dataset.site;
            const siteResults = window._groupedResults[site] || [];
            content.innerHTML = buildResultsHTML(siteResults);
        });
    });
}

// ===== 드래그 앤 드롭 =====
function setupDragAndDrop(modal) {
    const tabsContainer = modal.querySelector('#searchTabs');
    let draggedTab = null;
    
    tabsContainer.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('search-tab')) {
            draggedTab = e.target;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        }
    });
    
    tabsContainer.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('search-tab')) {
            e.target.classList.remove('dragging');
            draggedTab = null;
            
            // 순서 저장
            saveSiteOrder(tabsContainer);
        }
    });
    
    tabsContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(tabsContainer, e.clientX);
        
        if (draggedTab) {
            if (afterElement == null) {
                tabsContainer.appendChild(draggedTab);
            } else {
                tabsContainer.insertBefore(draggedTab, afterElement);
            }
        }
    });
}

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.search-tab:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function saveSiteOrder(tabsContainer) {
    const tabs = tabsContainer.querySelectorAll('.search-tab');
    const order = Array.from(tabs).map(tab => tab.dataset.site);
    
    // 결과 없는 사이트도 순서에 포함
    const allSites = ['리디', '네이버', '노벨피아', '카카오'];
    const fullOrder = [...order, ...allSites.filter(s => !order.includes(s))];
    
    window._siteOrder = fullOrder;
    localStorage.setItem('metadataSiteOrder', JSON.stringify(fullOrder));
}

// ===== 검색 결과 선택 =====
function selectSearchResult(index) {
    const result = window._searchResults[index];
    
    if (!result) {
        showToast('결과를 찾을 수 없습니다');
        return;
    }
    
    const modal = document.querySelector('.metadata-search-modal');
    if (modal) modal.remove();
    
    showToast('메타정보 가져오는 중...', 10000);
    
    window.dispatchEvent(new CustomEvent('SCRAPE_METADATA_REQUEST', {
        detail: { 
            url: result.url, 
            site: result.site 
        }
    }));
}

// ===== 스크래핑된 메타정보 받기 =====
window.addEventListener('METADATA_SCRAPED', function(e) {
    const meta = e.detail;
    
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    if (meta.error) {
        showToast('메타정보 가져오기 실패: ' + meta.error, 5000);
        return;
    }
    
    fillEditFormWithMetadata(meta);
    showToast('✅ 메타정보 적용 완료!', 3000);
});

// ===== 폼 자동 채우기 =====
function fillEditFormWithMetadata(meta) {
    if (meta.title) document.getElementById('editTitle').value = meta.title;
    if (meta.author) document.getElementById('editAuthor').value = meta.author;
    
    if (meta.status) {
        const statusSelect = document.getElementById('editStatus');
        const statusMap = {
            '연재중': '연재중',
            '완결': '완결',
            '휴재': '휴재'
        };
        const mappedStatus = statusMap[meta.status] || meta.status;
        const option = Array.from(statusSelect.options).find(opt => opt.value === mappedStatus);
        if (option) statusSelect.value = mappedStatus;
    }
    
    if (meta.publisher) {
        const publisherSelect = document.getElementById('editPublisher');
        const option = Array.from(publisherSelect.options).find(opt => opt.value === meta.publisher);
        if (option) publisherSelect.value = meta.publisher;
    }
    
    if (meta.description) document.getElementById('editDescription').value = meta.description;
    if (meta.platformUrl) document.getElementById('editPlatformUrl').value = meta.platformUrl;
    if (meta.adult !== undefined) document.getElementById('editAdult').checked = meta.adult;
    
    // 커버 이미지 처리
    if (meta.coverBase64 && meta.coverMimeType) {
        const byteString = atob(meta.coverBase64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: meta.coverMimeType });
        const file = new File([blob], 'cover.jpg', { type: meta.coverMimeType });
        
        window.editCoverFile = file;
        
        const preview = document.getElementById('editCoverPreview');
        const noImage = document.getElementById('editCoverNoImage');
        const filenameEl = document.getElementById('editCoverFilename');
        
        preview.src = 'data:' + meta.coverMimeType + ';base64,' + meta.coverBase64;
        preview.style.display = 'block';
        noImage.style.display = 'none';
        filenameEl.textContent = '자동 다운로드됨';
    } else if (meta.coverUrl) {
        const preview = document.getElementById('editCoverPreview');
        const noImage = document.getElementById('editCoverNoImage');
        preview.src = meta.coverUrl;
        preview.style.display = 'block';
        noImage.style.display = 'none';
    }
}

// ===== 전역 함수로 노출 =====
window.fetchMetadataFromWeb = fetchMetadataFromWeb;
window.selectSearchResult = selectSearchResult;

console.log('✅ Metadata Fetcher loaded');
