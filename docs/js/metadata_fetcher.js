/**
 * docs/js/metadata_fetcher.js
 * Tampermonkey와 통신하여 웹에서 메타정보 자동 수집
 */

// ===== 전역 변수 =====
window._searchResults = [];

// ===== 메타정보 자동 가져오기 시작 =====
function fetchMetadataFromWeb() {
    const keyword = document.getElementById('editTitle').value.trim();
    if (!keyword) {
        showToast('작품명을 먼저 입력하세요');
        return;
    }
    
    showToast('검색 중... (최대 30초 소요)', 3000);
    
    // Tampermonkey에게 검색 요청
    window.dispatchEvent(new CustomEvent('SEARCH_METADATA_REQUEST', {
        detail: { keyword: keyword }
    }));
}

// ===== Tampermonkey로부터 검색 결과 받기 =====
window.addEventListener('SEARCH_METADATA_RESULTS', function(e) {
    console.log('🎯 검색 결과 받음!', e.detail);
    
    const results = e.detail.results;
    
    console.log('📊 결과 개수:', results.length);  // ← 추가
    
    if (!results || results.length === 0) {
        console.log('❌ 결과 없음');  // ← 추가
        showToast('검색 결과가 없습니다');
        return;
    }
    
    console.log('✅ 모달 표시 시작');  // ← 추가
    showSearchResultsModal(results);
    console.log('✅ 모달 표시 완료');  // ← 추가
});
// ===== 검색 결과 선택 모달 =====
function showSearchResultsModal(results) {
    // 기존 모달 제거
    const existingModal = document.querySelector('.metadata-search-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay metadata-search-modal';
    modal.style.zIndex = '10001'; // Edit Modal보다 위
    
    const resultItems = results.map((r, i) => `
        <div class="search-result-item" onclick="selectSearchResult(${i})" style="
            padding: 12px;
            margin: 8px 0;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        " onmouseover="this.style.borderColor='#6366f1'; this.style.background='#252525';" 
           onmouseout="this.style.borderColor='#333'; this.style.background='#1a1a1a';">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1;">
                    <div style="font-weight:600; color:#6366f1; font-size:12px; margin-bottom:4px;">${r.site}</div>
                    <div style="font-size:14px; color:#e5e5e5; margin-bottom:4px;">${r.title}</div>
                    <div style="font-size:12px; color:#999;">${r.author || '작가 미상'}</div>
                </div>
            </div>
            <div style="font-size:11px; color:#666; margin-top:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${r.url}
            </div>
        </div>
    `).join('');
    
    modal.innerHTML = `
        <div class="modal" style="max-width:700px; max-height:80vh; overflow-y:auto; background:#0d0d0d;">
            <div class="modal-header">
                <div class="modal-title">🔍 검색 결과 (${results.length}개)</div>
                <button class="modal-close" onclick="this.closest('.metadata-search-modal').remove()">×</button>
            </div>
            <div class="modal-body" style="padding:20px;">
                <div style="color:#999; font-size:13px; margin-bottom:16px;">
                    원하는 작품을 선택하세요
                </div>
                <div id="searchResultsList">${resultItems}</div>
                <div style="margin-top:20px; text-align:center;">
                    <button class="btn" onclick="this.closest('.metadata-search-modal').remove()" 
                            style="background:#444; padding:10px 24px;">취소</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 결과 저장 (선택용)
    window._searchResults = results;
}

// ===== 검색 결과 선택 =====
function selectSearchResult(index) {
    const result = window._searchResults[index];
    
    if (!result) {
        showToast('선택한 결과를 찾을 수 없습니다');
        return;
    }
    
    // 선택 모달 닫기
    const modal = document.querySelector('.metadata-search-modal');
    if (modal) modal.remove();
    
    showToast('메타정보 가져오는 중...', 5000);
    
    // Tampermonkey에게 스크래핑 요청
    window.dispatchEvent(new CustomEvent('SCRAPE_METADATA_REQUEST', {
        detail: { 
            url: result.url, 
            site: result.site 
        }
    }));
}

// ===== Tampermonkey로부터 스크래핑된 메타정보 받기 =====
window.addEventListener('METADATA_SCRAPED', function(e) {
    const meta = e.detail;
    
    if (meta.error) {
        showToast('메타정보 가져오기 실패: ' + meta.error, 5000);
        return;
    }
    
    fillEditFormWithMetadata(meta);
    showToast('✅ 메타정보를 가져왔습니다!', 3000);
});

// ===== 폼 자동 채우기 =====
function fillEditFormWithMetadata(meta) {
    console.log('📝 Filling form with metadata:', meta);
    
    // 제목
    if (meta.title) {
        document.getElementById('editTitle').value = meta.title;
    }
    
    // 작가
    if (meta.author) {
        document.getElementById('editAuthor').value = meta.author;
    }
    
    // 연재상태
    if (meta.status) {
        const statusSelect = document.getElementById('editStatus');
        // 매핑
        const statusMap = {
            '연재중': '연재중',
            '완결': '완결',
            '휴재': '휴재',
            'ongoing': '연재중',
            'completed': '완결',
            'hiatus': '휴재'
        };
        const mappedStatus = statusMap[meta.status] || meta.status;
        
        // select 옵션에 있는지 확인
        const option = Array.from(statusSelect.options).find(opt => opt.value === mappedStatus);
        if (option) {
            statusSelect.value = mappedStatus;
        }
    }
    
    // 플랫폼
    if (meta.publisher) {
        const publisherSelect = document.getElementById('editPublisher');
        const option = Array.from(publisherSelect.options).find(opt => opt.value === meta.publisher);
        if (option) {
            publisherSelect.value = meta.publisher;
        }
    }
    
    // 작품 소개
    if (meta.description) {
        document.getElementById('editDescription').value = meta.description;
    }
    
    // 플랫폼 링크
    if (meta.platformUrl) {
        document.getElementById('editPlatformUrl').value = meta.platformUrl;
    }
    
    // 성인 작품 여부
    if (meta.adult !== undefined) {
        document.getElementById('editAdult').checked = meta.adult;
    }
    
    // 커버 이미지 (URL만 표시, 실제 업로드는 사용자 선택)
    if (meta.coverUrl) {
        const preview = document.getElementById('editCoverPreview');
        const noImage = document.getElementById('editCoverNoImage');
        
        // 프록시 또는 직접 로드 (CORS 문제 가능)
        preview.src = meta.coverUrl;
        preview.style.display = 'block';
        noImage.style.display = 'none';
        
        // 선택사항: 커버 이미지를 File 객체로 변환하여 자동 업로드
        // downloadCoverAsFile(meta.coverUrl);
    }
}

// ===== 전역 함수로 노출 =====
window.fetchMetadataFromWeb = fetchMetadataFromWeb;
window.selectSearchResult = selectSearchResult;

console.log('✅ Metadata Fetcher loaded');
