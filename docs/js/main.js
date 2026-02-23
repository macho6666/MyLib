const NO_IMAGE_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%22%20y%3D%2250%22%20font-family%3D%22Arial%22%20font-size%3D%2212%22%20fill%3D%22%23666%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E";

const DEFAULT_DOMAINS = {
    newtoki: '469',
    manatoki: '469',
    booktoki: '469'
};

const VIEWER_VERSION = "v2.0.0";
window.TOKI_VIEWER_VERSION = VIEWER_VERSION;
// ===== Index Update 관련 =====
let indexRefreshInterval = null;
let indexLastLogRow = 2;
let indexLastKnownTotalRows = 0;
let indexLogFetching = false;
let indexIsRunning = false;
let allSeries = [];
const thumbnailQueue = [];
let isLoadingThumbnail = false;
const THUMBNAIL_DELAY_MS = 250;
let activeBlobUrls = [];

let customTags = [];
let seriesTags = {};
let calendarData = {};
let favorites = [];
let adultFilterEnabled = false;

let currentTab = 'all';
let currentTagFilter = null;
let currentCalendarMonth = new Date();
let selectedCalendarDate = null;

let editingSeriesIndex = -1;
let editingSeriesId = '';
let editCoverFile = null;
let editSelectedTags = [];

let _currentBooks = [];
let _currentSeriesId = '';
let _currentSeriesTitle = '';

window.currentDetailIndex = -1;
window.currentDetailSeries = null;

// ===== 초기화 =====
window.addEventListener('DOMContentLoaded', function() {
    window.addEventListener("message", handleMessage, false);
    
    loadSavedTheme();
    loadLocalData();
    
    const el = document.getElementById('viewerVersionDisplay');
    if(el) el.innerText = "Viewer " + VIEWER_VERSION;
    
    if (API.isConfigured()) {
        showToast("Connecting...");
        refreshDB(null, true);
        loadDomains();
    } else {
        setTimeout(function() {
            if (!API.isConfigured()) {
                document.getElementById('configModal').style.display = 'flex';
            } else {
                showToast("Connecting...");
                refreshDB(null, true);
            }
            loadDomains();
        }, 1000);
    }
});

function handleMessage(event) {
    if (event.data.type === 'TOKI_CONFIG') {
        var url = event.data.url;
        var folderId = event.data.folderId;
        var apiKey = event.data.apiKey;
        if (url && folderId) {
            API.setConfig(url, folderId, apiKey);
            document.getElementById('configModal').style.display = 'none';
            showToast("Auto-configured");
            refreshDB();
        }
    }
}

// ===== 로컬 데이터 =====
function loadLocalData() {
    try {
        customTags = JSON.parse(localStorage.getItem('toki_tags')) || [];
        seriesTags = JSON.parse(localStorage.getItem('toki_series_tags')) || {};
        calendarData = JSON.parse(localStorage.getItem('toki_calendar')) || {};
        favorites = JSON.parse(localStorage.getItem('toki_favorites')) || [];
        adultFilterEnabled = localStorage.getItem('toki_adult_filter') === 'true';
        
        updateAdultToggle();
        updateSidebarTags();
    } catch (e) {
        console.error('Local data load error:', e);
    }
}

function saveLocalData() {
    localStorage.setItem('toki_tags', JSON.stringify(customTags));
    localStorage.setItem('toki_series_tags', JSON.stringify(seriesTags));
    localStorage.setItem('toki_calendar', JSON.stringify(calendarData));
    localStorage.setItem('toki_favorites', JSON.stringify(favorites));
    localStorage.setItem('toki_adult_filter', adultFilterEnabled);
}

function clearBlobUrls() {
    activeBlobUrls.forEach(function(url) { URL.revokeObjectURL(url); });
    activeBlobUrls = [];
}

// ===== 사이드바 =====
function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var toggle = document.querySelector('.sidebar-toggle');
    
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
    if (toggle) toggle.classList.toggle('hidden');
}

// ===== 테마 =====
function toggleTheme() {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('toki_theme', next);
    
    var indicator = document.getElementById('themeIndicator');
    var headerIcon = document.getElementById('headerThemeIcon');
    var icon = next === 'dark' ? '🌙' : '☀️';
    
    if (indicator) indicator.textContent = icon;
    if (headerIcon) headerIcon.textContent = icon;
}

function loadSavedTheme() {
    var saved = localStorage.getItem('toki_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    
    var icon = saved === 'dark' ? '🌙' : '☀️';
    var indicator = document.getElementById('themeIndicator');
    var headerIcon = document.getElementById('headerThemeIcon');
    
    if (indicator) indicator.textContent = icon;
    if (headerIcon) headerIcon.textContent = icon;
}

// ===== 설정 아코디언 =====
function toggleSettingsAccordion() {
    var content = document.getElementById('settingsContent');
    var icon = document.getElementById('settingsIcon');
    
    if (content.style.maxHeight) {
        content.style.maxHeight = null;
        if (icon) icon.textContent = '▼';
    } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        if (icon) icon.textContent = '▲';
    }
}

// ===== 라이브러리 로드 =====
async function refreshDB(forceId, silent, bypassCache) {
    var loader = document.getElementById('pageLoader');

    if (!silent && loader) {
        loader.style.display = 'flex';
    }

    try {
        var payload = { folderId: forceId || API._config.folderId };
        if (bypassCache) payload.bypassCache = true;

        var response = await API.request('view_get_library', payload);
        var seriesList = [];

        if (Array.isArray(response)) {
            seriesList = response;
        } else if (response && response.list && Array.isArray(response.list)) {
            seriesList = response.list;
        }

        allSeries = seriesList;
        renderGrid(allSeries);
        showToast("Library loaded");

    } catch (e) {
        console.error("Library Fetch Error:", e);
        showToast("❌ Load failed: " + e.message, 5000);
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// ===== 그리드 렌더링 =====
function renderGrid(seriesList) {
    var grid = document.getElementById('grid');
    var calendarPage = document.getElementById('calendarPage');
    
    if (calendarPage) calendarPage.style.display = 'none';
    if (grid) grid.style.display = 'grid';
    
    clearBlobUrls();
    grid.innerHTML = '';

    if (!seriesList || seriesList.length === 0) {
        grid.innerHTML = '<div class="no-data">저장된 작품이 없습니다.</div>';
        return;
    }

    var observer = new IntersectionObserver(function(entries, obs) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                var img = entry.target;
                var url = img.dataset.thumb;
                if (url && url !== NO_IMAGE_SVG) {
                    queueThumbnail(img, url);
                }
                obs.unobserve(img);
            }
        });
    }, { rootMargin: '200px' });

    seriesList.forEach(function(series, index) {
        try {
            var card = document.createElement('div');
            card.className = 'card';
            card.dataset.index = index;

            var meta = series.metadata || {};
            var authors = meta.authors || [];
            var status = meta.status || '';
            var publisher = meta.publisher || '';
            var isAdult = meta.adult === true;
            
            var thumb = NO_IMAGE_SVG;
            if (series.thumbnail && series.thumbnail.startsWith("data:image")) {
                thumb = series.thumbnail;
            } else if (series.thumbnailId) {
                thumb = "https://lh3.googleusercontent.com/d/" + series.thumbnailId + "=s400";
            } else if (series.thumbnail && series.thumbnail.startsWith("http")) {
                thumb = series.thumbnail;
            }

            var statusClass = 'ongoing';
            var statusText = status;
            if (!status || status === 'Unknown') {
                statusText = '';
            } else if (status === 'COMPLETED' || status === '완결') {
                statusClass = 'completed';
            }

            var authorText = authors.join(', ') || '작가 미상';
            var authorClass = isAdult ? 'author adult' : 'author';

            card.innerHTML = 
                '<div class="thumb-wrapper">' +
                   '<img src="' + NO_IMAGE_SVG + '" data-thumb="' + thumb + '" class="thumb" loading="lazy" onerror="handleThumbnailError(this, \'' + NO_IMAGE_SVG + '\')" onload="this.dataset.loaded=\'true\'; this.parentElement.classList.add(\'loaded\');">' +
                    '<div class="no-image-text">No Image</div>' +
                '</div>' +
                '<div class="info">' +
                    '<div class="title" title="' + series.name + '">' + series.name + '</div>' +
                    '<span class="' + authorClass + '" title="' + authorText + '">' + authorText + '</span>' +
                    '<div class="meta">' +
                        (statusText ? '<span class="badge ' + statusClass + '">' + statusText + '</span>' : '') +
                        (publisher ? '<span class="publisher" data-platform="' + publisher + '">' + publisher + '</span>' : '') +
                    '</div>' +
                '</div>';

            card.addEventListener('click', function() {
                openDetailModal(index);
            });
            
            grid.appendChild(card);
            
            var img = card.querySelector('img.thumb');
            if (thumb !== NO_IMAGE_SVG) {
                observer.observe(img);
            }
        } catch (err) {
            console.error("Render Error:", err);
        }
    });
    
    applyFilters();
}
// ===== 필터 =====
function switchTab(tabName) {
    currentTab = tabName;
    currentTagFilter = null;
    
    document.querySelectorAll('.sidebar-item[data-tab]').forEach(function(item) {
        item.classList.remove('active');
        if (item.dataset.tab === tabName) item.classList.add('active');
    });
    
    document.querySelectorAll('.sidebar-tag').forEach(function(tag) {
        tag.classList.remove('active');
    });

    var calPage = document.getElementById('calendarPage');
    var grid = document.getElementById('grid');
    if (calPage) calPage.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }

    applyFilters();
}

function filterData() {
    applyFilters();
}

function applyFilters() {
    var query = document.getElementById('search').value.toLowerCase();
    var cards = document.querySelectorAll('.card');
    
    cards.forEach(function(card) {
        var index = parseInt(card.dataset.index);
        var series = allSeries[index];
        if (!series) return;
        
        var meta = series.metadata || {};
        var authors = meta.authors || [];
        var isAdult = meta.adult === true;
        var text = (series.name + ' ' + authors.join(' ')).toLowerCase();
        
        var matchText = text.includes(query);
        
        var cat = series.category || meta.category || 'Unknown';
        var matchTab = (currentTab === 'all') || (cat === currentTab);
        
        var sTags = seriesTags[series.id] || [];
        var matchTag = !currentTagFilter || sTags.includes(currentTagFilter);
        
        var matchAdult = !adultFilterEnabled || !isAdult;

        if (matchText && matchTab && matchTag && matchAdult) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// ===== Adult 필터 =====
function toggleAdultFilter() {
    adultFilterEnabled = !adultFilterEnabled;
    saveLocalData();
    updateAdultToggle();
    applyFilters();
    
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function updateAdultToggle() {
    var toggle = document.getElementById('adultToggle');
    if (toggle) {
        if (adultFilterEnabled) {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    }
}

// ===== 태그 관리 =====
function showTags() {
    renderTagsList();
    document.getElementById('tagsModal').style.display = 'flex';
    
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function closeTagsModal() {
    document.getElementById('tagsModal').style.display = 'none';
}

function renderTagsList() {
    var list = document.getElementById('tagsList');
    list.innerHTML = '';
    
    if (customTags.length === 0) {
        list.innerHTML = '<div style="color: var(--text-tertiary); font-size: 13px;">태그가 없습니다.</div>';
        return;
    }
    
    customTags.forEach(function(tag) {
        var item = document.createElement('div');
        item.className = 'tag-item';
        item.innerHTML = '<span>#' + tag + '</span><span class="tag-delete" onclick="deleteTag(\'' + tag + '\')">×</span>';
        list.appendChild(item);
    });
}

function createTag() {
    var input = document.getElementById('newTagInput');
    var name = input.value.trim().replace(/^#/, '');
    
    if (!name) return;
    if (customTags.includes(name)) {
        showToast('이미 존재하는 태그입니다.');
        return;
    }
    
    customTags.push(name);
    saveLocalData();
    updateSidebarTags();
    renderTagsList();
    input.value = '';
    showToast('태그 "' + name + '" 추가됨');
}

function deleteTag(name) {
    if (!confirm('"' + name + '" 태그를 삭제하시겠습니까?')) return;
    
    customTags = customTags.filter(function(t) { return t !== name; });
    
    Object.keys(seriesTags).forEach(function(id) {
        seriesTags[id] = seriesTags[id].filter(function(t) { return t !== name; });
    });
    
    saveLocalData();
    updateSidebarTags();
    renderTagsList();
    showToast('태그 "' + name + '" 삭제됨');
}

function updateSidebarTags() {
    var section = document.getElementById('tagSection');
    var divider = document.getElementById('tagDivider');
    var list = document.getElementById('sidebarTagList');
    
    if (customTags.length === 0) {
        if (section) section.style.display = 'none';
        if (divider) divider.style.display = 'none';
        return;
    }
    
    if (section) section.style.display = 'block';
    if (divider) divider.style.display = 'block';
    
    list.innerHTML = '';
    customTags.forEach(function(tag) {
        var el = document.createElement('span');
        el.className = 'sidebar-tag' + (currentTagFilter === tag ? ' active' : '');
        el.textContent = '#' + tag;
        el.onclick = function() { filterByTag(tag); };
        list.appendChild(el);
    });
}

function filterByTag(tag) {
    if (currentTagFilter === tag) {
        currentTagFilter = null;
    } else {
        currentTagFilter = tag;
    }
    
    currentTab = 'all';
    document.querySelectorAll('.sidebar-item[data-tab]').forEach(function(item) {
        item.classList.remove('active');
        if (item.dataset.tab === 'all') item.classList.add('active');
    });
    
    updateSidebarTags();
    applyFilters();
    
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

// ===== 즐겨찾기 =====
function showFavorites() {
    currentTab = 'favorites';
    currentTagFilter = null;
    
    document.querySelectorAll('.sidebar-item[data-tab]').forEach(function(item) {
        item.classList.remove('active');
    });
    
    document.querySelectorAll('.sidebar-tag').forEach(function(tag) {
        tag.classList.remove('active');
    });

    var calPage = document.getElementById('calendarPage');
    var grid = document.getElementById('grid');
    if (calPage) calPage.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    var cards = document.querySelectorAll('.card');
    cards.forEach(function(card) {
        var index = parseInt(card.dataset.index);
        var series = allSeries[index];
        if (!series) return;
        
        if (favorites.includes(series.id)) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });

    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
    
    showToast('⭐ 즐겨찾기 목록');
}

function toggleFavorite() {
    var series = window.currentDetailSeries;
    if (!series) return;
    
    var idx = favorites.indexOf(series.id);
    if (idx >= 0) {
        favorites.splice(idx, 1);
        showToast('즐겨찾기에서 제거됨');
    } else {
        favorites.push(series.id);
        showToast('⭐ 즐겨찾기에 추가됨');
    }
    
    saveLocalData();
    updateFavoriteIcon();
}

function updateFavoriteIcon() {
    var series = window.currentDetailSeries;
    var icon = document.getElementById('favoriteIcon');
    if (!series || !icon) return;
    
    if (favorites.includes(series.id)) {
        icon.textContent = '♥';
        icon.classList.add('favorite-active');
    } else {
        icon.textContent = '♡';
        icon.classList.remove('favorite-active');
    }
}

// ===== 썸네일 =====
function loadNextThumbnail() {
    if (isLoadingThumbnail || thumbnailQueue.length === 0) return;
    
    isLoadingThumbnail = true;
    var item = thumbnailQueue.shift();
    var img = item.img;
    var url = item.url;
    
    img.onload = function() {
        img.dataset.loaded = 'true';
        img.parentElement.classList.add('loaded');  // ← 이거 추가!
        isLoadingThumbnail = false;
        setTimeout(loadNextThumbnail, THUMBNAIL_DELAY_MS);
    };
    img.onerror = function() {
        isLoadingThumbnail = false;
        setTimeout(loadNextThumbnail, THUMBNAIL_DELAY_MS);
    };
    img.src = url;
}

function queueThumbnail(img, url) {
    thumbnailQueue.push({ img: img, url: url });
    loadNextThumbnail();
}

function handleThumbnailError(img, fallbackSvg) {
    if (img.dataset.retried || img.src === fallbackSvg || img.src.startsWith('data:image/svg')) {
        img.src = fallbackSvg;
        return;
    }
    img.dataset.retried = 'true';
    var originalThumb = img.dataset.thumb;
    if (originalThumb && originalThumb !== fallbackSvg) {
        setTimeout(function() { img.src = originalThumb; }, 1000);
    } else {
        img.src = fallbackSvg;
    }
}

// ===== Toast =====
function showToast(msg, duration) {
    duration = duration || 3000;
    var toast = document.createElement('div');
    toast.className = 'toast show';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
    }, duration);
}

// ===== Detail Modal =====
function openDetailModal(index) {
    var series = allSeries[index];
    if (!series) return;

    var modal = document.getElementById('detailModal');
    if (!modal) return;

    var meta = series.metadata || {};
    var authors = meta.authors || [];
    var description = meta.description || '';
    var sTags = seriesTags[series.id] || [];
    var isAdult = meta.adult === true;

    document.getElementById('detailTitle').textContent = series.name || '제목 없음';

    var coverImg = document.getElementById('detailCover');
    var noImageEl = document.getElementById('detailCoverNoImage');
    
    var thumb = '';
    if (series.thumbnail && series.thumbnail.startsWith("data:image")) {
        thumb = series.thumbnail;
    } else if (series.thumbnailId) {
        thumb = "https://lh3.googleusercontent.com/d/" + series.thumbnailId + "=s400";
    } else if (series.thumbnail && series.thumbnail.startsWith("http")) {
        thumb = series.thumbnail;
    }
    
    if (thumb) {
        coverImg.src = thumb;
        coverImg.style.display = 'block';
        if (noImageEl) noImageEl.style.display = 'none';
    } else {
        coverImg.style.display = 'none';
        if (noImageEl) noImageEl.style.display = 'flex';
    }

    var tagsEl = document.getElementById('detailTags');
    if (tagsEl) {
        if (sTags.length > 0) {
            tagsEl.innerHTML = sTags.map(function(t) { return '<span class="detail-tag">#' + t + '</span>'; }).join('');
            tagsEl.style.display = 'flex';
        } else {
            tagsEl.innerHTML = '';
            tagsEl.style.display = 'none';
        }
    }

    document.getElementById('detailInfoTitle').textContent = series.name || '-';
    
    var authorText = isAdult ? '🔞 ' + (authors.join(', ') || '작가 미상') : (authors.join(', ') || '작가 미상');
    document.getElementById('detailInfoAuthor').textContent = authorText;
    
    document.getElementById('detailInfoStatus').textContent = meta.status || '-';
    document.getElementById('detailInfoPlatform').textContent = meta.publisher || '-';
    
    var descEl = document.getElementById('detailInfoDescription');
    var descWrapper = document.getElementById('descWrapper');
    
    if (descEl) {
        descEl.textContent = description || '소개 정보가 없습니다.';
    }
    if (descWrapper) {
        descWrapper.classList.remove('expanded');
    }

    var driveLink = document.getElementById('detailDriveLink');
    if (driveLink && series.id) {
        driveLink.href = "https://drive.google.com/drive/u/0/folders/" + series.id;
    }

    document.getElementById('detailEpisodes').style.display = 'none';

    window.currentDetailIndex = index;
    window.currentDetailSeries = series;
    
    updateFavoriteIcon();

    modal.style.display = 'flex';
}

function closeDetailModal() {
    var modal = document.getElementById('detailModal');
    if (modal) modal.style.display = 'none';
}

function toggleDescription() {
    var wrapper = document.getElementById('descWrapper');
    if (wrapper) {
        wrapper.classList.toggle('expanded');
    }
}

function toggleDetailEpisodes() {
    var episodes = document.getElementById('detailEpisodes');
    var series = window.currentDetailSeries;

    if (!episodes || !series) return;

    if (episodes.style.display === 'none') {
        episodes.style.display = 'block';
        loadDetailEpisodes(series.id, series.name);
    } else {
        episodes.style.display = 'none';
    }
}

async function loadDetailEpisodes(seriesId, title) {
    var listEl = document.getElementById('detailEpisodeList');
    if (!listEl) return;

    listEl.innerHTML = '<div class="detail-episode-loading">로딩 중...</div>';

    try {
        var books = await API.request('view_get_books', { seriesId: seriesId });

        if (!books || books.length === 0) {
            listEl.innerHTML = '<div class="detail-episode-loading">캐시 재생성 중...</div>';
            books = await API.request('view_refresh_cache', { seriesId: seriesId });
        }

        if (!books || books.length === 0) {
            listEl.innerHTML = '<div class="detail-episode-loading">회차가 없습니다</div>';
            return;
        }

        if (typeof updateCurrentBookList === 'function') {
            updateCurrentBookList(books);
        }

        _currentBooks = books;
        _currentSeriesId = seriesId;
        _currentSeriesTitle = title;

        listEl.innerHTML = '';
        books.forEach(function(book, index) {
            var item = document.createElement('div');
            item.className = 'detail-episode-item';
            item.innerHTML = '<span>' + book.name + '</span>';
            item.onclick = function() {
                closeDetailModal();
                if (typeof loadViewer === 'function') {
                    loadViewer(index);
                }
            };
            listEl.appendChild(item);
        });
    } catch (e) {
        listEl.innerHTML = '<div class="detail-episode-loading" style="color:var(--danger);">오류: ' + e.message + '</div>';
    }
}

async function refreshDetailEpisodes() {
    var series = window.currentDetailSeries;
    if (!series) return;
    
    var listEl = document.getElementById('detailEpisodeList');
    listEl.innerHTML = '<div class="detail-episode-loading">새로고침 중...</div>';
    
    try {
        var books = await API.request('view_refresh_cache', { seriesId: series.id });
        
        _currentBooks = books || [];
        _currentSeriesId = series.id;
        _currentSeriesTitle = series.name;
        
        if (!books || books.length === 0) {
            listEl.innerHTML = '<div class="detail-episode-loading">회차가 없습니다</div>';
            return;
        }
        
        listEl.innerHTML = '';
        books.forEach(function(book, index) {
            var item = document.createElement('div');
            item.className = 'detail-episode-item';
            item.innerHTML = '<span>' + book.name + '</span>';
            item.onclick = function() {
                closeDetailModal();
                if (typeof loadViewer === 'function') {
                    loadViewer(index);
                }
            };
            listEl.appendChild(item);
        });
        
        showToast('회차 목록 새로고침 완료');
    } catch (e) {
        listEl.innerHTML = '<div class="detail-episode-loading" style="color:var(--danger);">오류: ' + e.message + '</div>';
    }
}

function openPlatformSite() {
    var series = window.currentDetailSeries;
    if (!series) return;

    var meta = series.metadata || {};
    var url = series.platformUrl || meta.platformUrl || getDynamicLink(series);
    if (url && url !== '#') {
        window.open(url, '_blank');
    } else {
        showToast('플랫폼 링크가 설정되지 않았습니다.');
    }
}

function openEditFromDetail() {
    var index = window.currentDetailIndex;
    if (index >= 0) {
        closeDetailModal();
        openEditModal(index);
    }
}
// ===== Edit Modal =====
function openEditModal(index) {
    var series = allSeries[index];
    if (!series) return;

    editingSeriesIndex = index;
    editingSeriesId = series.id;
    editCoverFile = null;
    editSelectedTags = seriesTags[series.id] ? seriesTags[series.id].slice() : [];

    var meta = series.metadata || {};

    document.getElementById('editTitle').value = series.name || '';
    document.getElementById('editSourceId').value = series.sourceId || '';
    document.getElementById('editAuthor').value = (meta.authors || []).join(', ');
    document.getElementById('editStatus').value = meta.status || 'Unknown';
    document.getElementById('editPublisher').value = meta.publisher || '';
    document.getElementById('editCategory').value = series.category || meta.category || 'Manga';
    document.getElementById('editUrl').value = series.sourceUrl || '';
    document.getElementById('editPlatformUrl').value = series.platformUrl || meta.platformUrl || '';
    document.getElementById('editDescription').value = meta.description || '';
    document.getElementById('editAdult').checked = meta.adult === true;

    var preview = document.getElementById('editCoverPreview');
    var noImage = document.getElementById('editCoverNoImage');
    var filenameEl = document.getElementById('editCoverFilename');
    filenameEl.textContent = '';

    if (series.thumbnailId) {
        preview.src = "https://lh3.googleusercontent.com/d/" + series.thumbnailId + "=s400";
        preview.style.display = 'block';
        noImage.style.display = 'none';
    } else {
        preview.style.display = 'none';
        noImage.style.display = 'flex';
    }

    renderEditTags();

    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    editingSeriesIndex = -1;
    editingSeriesId = '';
    editCoverFile = null;
    editSelectedTags = [];
}

function renderEditTags() {
    var container = document.getElementById('editTagsContainer');
    var selectEl = document.getElementById('editTagsSelect');
    
    container.innerHTML = '';
    editSelectedTags.forEach(function(tag) {
        var el = document.createElement('span');
        el.className = 'edit-tag';
        el.innerHTML = '#' + tag + ' <span class="edit-tag-remove" onclick="removeEditTag(\'' + tag + '\')">×</span>';
        container.appendChild(el);
    });
    
    selectEl.innerHTML = '';
    var available = customTags.filter(function(t) { return !editSelectedTags.includes(t); });
    available.forEach(function(tag) {
        var el = document.createElement('span');
        el.className = 'edit-tag-option';
        el.textContent = '#' + tag;
        el.onclick = function() { addEditTag(tag); };
        selectEl.appendChild(el);
    });
}

function addEditTag(tag) {
    if (!editSelectedTags.includes(tag)) {
        editSelectedTags.push(tag);
        renderEditTags();
    }
}

function removeEditTag(tag) {
    editSelectedTags = editSelectedTags.filter(function(t) { return t !== tag; });
    renderEditTags();
}

function handleCoverSelect(event) {
    var file = event.target.files[0];
    if (!file) return;

    editCoverFile = file;
    document.getElementById('editCoverFilename').textContent = file.name;

    var reader = new FileReader();
    reader.onload = function(e) {
        var preview = document.getElementById('editCoverPreview');
        var noImage = document.getElementById('editCoverNoImage');
        preview.src = e.target.result;
        preview.style.display = 'block';
        noImage.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function saveEditInfo() {
    if (!editingSeriesId) return;

    showToast("저장 중...", 5000);

    var saveBtn = document.querySelector('.edit-btn-save');
    if (saveBtn) {
        saveBtn.textContent = '저장 중...';
        saveBtn.disabled = true;
    }

    try {
        var authorsRaw = document.getElementById('editAuthor').value.trim();
        var authors = authorsRaw ? authorsRaw.split(',').map(function(a) { return a.trim(); }).filter(function(a) { return a; }) : [];

        // ✅ 원본 형식으로 수정
        var infoData = {
            id: document.getElementById('editSourceId').value.trim(),
            title: document.getElementById('editTitle').value.trim(),
            metadata: {
                authors: authors.length > 0 ? authors : ['Unknown'],
                status: document.getElementById('editStatus').value,
                category: document.getElementById('editCategory').value,
                publisher: document.getElementById('editPublisher').value,
                description: document.getElementById('editDescription').value.trim(),
                adult: document.getElementById('editAdult').checked,
                platformUrl: document.getElementById('editPlatformUrl').value.trim()
            },
            url: document.getElementById('editUrl').value.trim(),
            author: authors.length > 0 ? authors[0] : 'Unknown',
            last_episode: 0,
            file_count: 0,
            last_updated: new Date().toISOString()
        };
                
        await API.request('edit_save_info', {
            folderId: editingSeriesId,
            infoData: infoData
        });

        if (editCoverFile) {
            var base64 = await fileToBase64(editCoverFile);
            await API.request('edit_upload_cover', {
                folderId: editingSeriesId,
                fileName: 'cover.jpg',
                base64Data: base64,
                mimeType: editCoverFile.type
            });
        }

        seriesTags[editingSeriesId] = editSelectedTags;
        saveLocalData();
        updateSidebarTags();

        if (editingSeriesIndex >= 0 && allSeries[editingSeriesIndex]) {
            var series = allSeries[editingSeriesIndex];
            series.name = infoData.title;
            series.sourceId = infoData.id;
            series.sourceUrl = infoData.url;
            series.platformUrl = infoData.metadata.platformUrl;
            series.category = infoData.metadata.category;
            series.metadata = {
                authors: infoData.metadata.authors,
                status: infoData.metadata.status,
                publisher: infoData.metadata.publisher,
                category: infoData.metadata.category,
                description: infoData.metadata.description,
                adult: infoData.metadata.adult,
                platformUrl: infoData.metadata.platformUrl
            };
        }

        renderGrid(allSeries);
        showToast("저장 완료");
        closeEditModal();

        setTimeout(function() { refreshDB(null, true, true); }, 1000);

    } catch (e) {
        console.error('Save Error:', e);
        showToast("저장 실패: " + e.message, 5000);
    } finally {
        if (saveBtn) {
            saveBtn.textContent = '저장';
            saveBtn.disabled = false;
        }
    }
}

function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result.split(',')[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===== Episode Modal =====
async function openEpisodeList(seriesId, title, seriesIndex) {
    document.getElementById('episodeModal').style.display = 'flex';
    document.querySelector('#episodeModal .modal-title').innerText = title;
    var listEl = document.getElementById('episodeList');
    listEl.innerHTML = '<div style="padding:20px; color:var(--text-tertiary);">로딩 중...</div>';

    try {
        var books = await API.request('view_get_books', { seriesId: seriesId });

        if (!books || books.length === 0) {
            listEl.innerHTML = '<div style="padding:20px; color:var(--warning);">캐시 재생성 중...</div>';
            books = await API.request('view_refresh_cache', { seriesId: seriesId });
        }

        document.querySelector('#episodeModal .modal-title').innerText = title + ' (' + (books ? books.length : 0) + ')';
        renderEpisodeList(books, seriesId, title);
    } catch (e) {
        listEl.innerHTML = '<div style="padding:20px; color:var(--danger);">오류: ' + e.message + '</div>';
    }
}

function closeEpisodeModal() {
    document.getElementById('episodeModal').style.display = 'none';
}

function renderEpisodeList(books, seriesId, title) {
    var listEl = document.getElementById('episodeList');
    listEl.innerHTML = '';

    if (!books || books.length === 0) {
        listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-tertiary);"><div>에피소드가 없습니다</div><button onclick="refreshEpisodeCache(\'' + seriesId + '\', \'' + (title || '') + '\')" style="margin-top:10px; padding:8px 16px; background:var(--warning); color:black; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">캐시 재생성</button></div>';
        return;
    }

    if (typeof updateCurrentBookList === 'function') {
        updateCurrentBookList(books);
    }

    _currentBooks = books;
    _currentSeriesId = seriesId;
    _currentSeriesTitle = title;

    books.forEach(function(book, index) {
        var size = book.size ? (book.size / 1024 / 1024).toFixed(1) + ' MB' : '';
        var item = document.createElement('div');
        item.className = 'episode-item';
        item.innerHTML = '<div><span class="ep-name">' + book.name + '</span></div><div style="display:flex; align-items:center; gap:8px;"><span class="ep-meta">' + size + '</span><button onclick="event.stopPropagation(); openEpisodeEdit(' + index + ')" class="ep-edit-btn" title="이름 변경">✏️</button></div>';
        item.onclick = function() {
            if (typeof loadViewer === 'function') {
                loadViewer(index);
            }
        };
        listEl.appendChild(item);
    });
}

async function refreshEpisodeCache(seriesId, title) {
    var listEl = document.getElementById('episodeList');
    listEl.innerHTML = '<div style="padding:20px; color:var(--warning);">폴더 스캔 중...</div>';

    try {
        var books = await API.request('view_refresh_cache', { seriesId: seriesId });
        document.querySelector('#episodeModal .modal-title').innerText = title + ' (' + (books ? books.length : 0) + ')';
        renderEpisodeList(books, seriesId, title);
        showToast('캐시 재생성 완료');
    } catch (e) {
        listEl.innerHTML = '<div style="padding:20px; color:var(--danger);">오류: ' + e.message + '</div>';
    }
}

function openEpisodeEdit(index) {
    var book = _currentBooks[index];
    if (!book) return;

    var lastDot = book.name.lastIndexOf('.');
    var nameOnly = lastDot > 0 ? book.name.substring(0, lastDot) : book.name;
    var ext = lastDot > 0 ? book.name.substring(lastDot) : '';

    var newName = prompt('파일 이름 수정:', nameOnly);
    if (newName === null || newName.trim() === '' || newName.trim() === nameOnly) return;

    var fullName = newName.trim() + ext;
    showToast("이름 변경 중...", 3000);

    API.request('view_rename_file', {
        fileId: book.id,
        newName: fullName,
        seriesId: _currentSeriesId
    }).then(function() {
        showToast('파일 이름 변경 완료');
        refreshEpisodeCache(_currentSeriesId, _currentSeriesTitle);
    }).catch(function(e) {
        showToast('수정 실패: ' + e.message, 5000);
    });
}

// ===== 캘린더 =====
function showCalendar() {
    document.getElementById('calendarModal').style.display = 'flex';
    renderCalendar();
    updateCalendarStats();
    
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function closeCalendarModal() {
    document.getElementById('calendarModal').style.display = 'none';
}

function changeMonth(delta) {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    var grid = document.getElementById('calendarGrid');
    var title = document.getElementById('calendarTitle');
    
    var year = currentCalendarMonth.getFullYear();
    var month = currentCalendarMonth.getMonth();
    
    title.textContent = year + '년 ' + (month + 1) + '월';
    
    grid.innerHTML = '';
    
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    days.forEach(function(d) {
        var el = document.createElement('div');
        el.className = 'cal-day-header';
        el.textContent = d;
        grid.appendChild(el);
    });
    
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);
    var startDay = firstDay.getDay();
    var totalDays = lastDay.getDate();
    var today = new Date();
    
    var prevLastDay = new Date(year, month, 0).getDate();
    for (var i = startDay - 1; i >= 0; i--) {
        var el = document.createElement('div');
        el.className = 'cal-day other-month';
        el.textContent = prevLastDay - i;
        grid.appendChild(el);
    }
    
    for (var i = 1; i <= totalDays; i++) {
        var el = document.createElement('div');
        el.className = 'cal-day';
        el.textContent = i;
        
        var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(i).padStart(2, '0');
        
        if (calendarData[dateStr] && calendarData[dateStr].length > 0) {
            el.classList.add('has-record');
        }
        
        if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === i) {
            el.classList.add('today');
        }
        
        if (selectedCalendarDate === dateStr) {
            el.classList.add('selected');
        }
        
        (function(ds) {
            el.onclick = function() { selectCalendarDate(ds); };
        })(dateStr);
        
        grid.appendChild(el);
    }
    
    var remaining = 42 - (startDay + totalDays);
    for (var i = 1; i <= remaining; i++) {
        var el = document.createElement('div');
        el.className = 'cal-day other-month';
        el.textContent = i;
        grid.appendChild(el);
    }
}

function selectCalendarDate(dateStr) {
    selectedCalendarDate = dateStr;
    renderCalendar();
    renderCalendarRecords(dateStr);
}

function renderCalendarRecords(dateStr) {
    var dateEl = document.getElementById('recordsDate');
    var listEl = document.getElementById('recordsList');
    
    var parts = dateStr.split('-');
    dateEl.textContent = parts[0] + '년 ' + parseInt(parts[1]) + '월 ' + parseInt(parts[2]) + '일';
    
    var records = calendarData[dateStr] || [];
    listEl.innerHTML = '';
    
    if (records.length === 0) {
        listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-tertiary);">기록이 없습니다</div>';
        return;
    }
    
    records.forEach(function(record) {
        var series = allSeries.find(function(s) { return s.id === record.seriesId; });
        var name = series ? series.name : '알 수 없는 작품';
        
        var statusIcon = record.status === '완독' ? '✅' : record.status === '포기' ? '❌' : '📖';
        
        var item = document.createElement('div');
        item.className = 'record-item';
        item.innerHTML = '<div class="record-title">' + statusIcon + ' ' + name + '</div><div class="record-meta">' + (record.progress || 0) + '% ' + record.status + (record.memo ? ' - ' + record.memo : '') + '</div>';
        listEl.appendChild(item);
    });
}

function updateCalendarStats() {
    var completed = 0, dropped = 0, reading = 0;
    
    Object.values(calendarData).forEach(function(records) {
        records.forEach(function(r) {
            if (r.status === '완독') completed++;
            else if (r.status === '포기') dropped++;
            else reading++;
        });
    });
    
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statDropped').textContent = dropped;
    document.getElementById('statReading').textContent = reading;
    document.getElementById('statTotal').textContent = completed + dropped + reading;
}

function addCalendarRecord() {
    if (!selectedCalendarDate) {
        showToast('날짜를 먼저 선택하세요');
        return;
    }
    
    var seriesName = prompt('작품 이름:');
    if (!seriesName) return;
    
    var series = allSeries.find(function(s) { return s.name.toLowerCase().includes(seriesName.toLowerCase()); });
    if (!series) {
        showToast('작품을 찾을 수 없습니다');
        return;
    }
    
    var status = prompt('상태 (읽는중/완독/포기):', '읽는중');
    var progress = parseInt(prompt('진행률 (0-100):', '0')) || 0;
    var memo = prompt('메모 (선택):') || '';
    
    if (!calendarData[selectedCalendarDate]) {
        calendarData[selectedCalendarDate] = [];
    }
    
    calendarData[selectedCalendarDate].push({
        seriesId: series.id,
        status: status,
        progress: progress,
        memo: memo
    });
    
    saveLocalData();
    renderCalendar();
    renderCalendarRecords(selectedCalendarDate);
    updateCalendarStats();
    showToast('기록 추가됨');
}

// ===== 백업/복원 =====
function showBackupRestore() {
    document.getElementById('backupModal').style.display = 'flex';
    
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function closeBackupModal() {
    document.getElementById('backupModal').style.display = 'none';
}

function downloadBackup() {
    var data = {
        version: VIEWER_VERSION,
        exportDate: new Date().toISOString(),
        tags: customTags,
        seriesTags: seriesTags,
        calendar: calendarData,
        favorites: favorites,
        settings: {
            adultFilter: adultFilterEnabled,
            theme: localStorage.getItem('toki_theme'),
            domains: JSON.parse(localStorage.getItem('toki_domains') || '{}')
        }
    };
    
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'toki_backup_' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('백업 다운로드 완료');
}

function uploadBackup(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            
            if (data.tags) customTags = data.tags;
            if (data.seriesTags) seriesTags = data.seriesTags;
            if (data.calendar) calendarData = data.calendar;
            if (data.favorites) favorites = data.favorites;
            if (data.settings) {
                if (data.settings.adultFilter !== undefined) {
                    adultFilterEnabled = data.settings.adultFilter;
                }
                if (data.settings.theme) {
                    localStorage.setItem('toki_theme', data.settings.theme);
                    loadSavedTheme();
                }
                if (data.settings.domains) {
                    localStorage.setItem('toki_domains', JSON.stringify(data.settings.domains));
                    loadDomains();
                }
            }
            
            saveLocalData();
            updateSidebarTags();
            updateAdultToggle();
            applyFilters();
            
            showToast('백업 복원 완료');
        } catch (err) {
            showToast('백업 파일 오류');
        }
    };
    reader.readAsText(file);
}

function syncToDrive() {
    showToast('Drive 동기화 - 아직 구현되지 않았습니다');
}

function syncFromDrive() {
    showToast('Drive 동기화 - 아직 구현되지 않았습니다');
}

// ===== 기타 함수들 =====
function toggleSettings() {
    var el = document.getElementById('domainPanel');
    if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

function getDynamicLink(series) {
    if (series.platformUrl) return series.platformUrl;
    
    var meta = series.metadata || {};
    if (meta.platformUrl) return meta.platformUrl;
    
    var contentId = series.sourceId;
    var cat = series.category || meta.category || '';

    if (!cat) {
        if ((series.name || "").includes("북토끼")) cat = "Novel";
        else if ((series.name || "").includes("마나토끼")) cat = "Manga";
        else cat = "Webtoon";
    }

    var saved = JSON.parse(localStorage.getItem('toki_domains')) || DEFAULT_DOMAINS;
    
    var baseUrl = "https://newtoki" + saved.newtoki + ".com";
    var path = "/webtoon/";

    if (cat === "Novel") { 
        baseUrl = "https://booktoki" + saved.booktoki + ".com"; 
        path = "/novel/"; 
    } else if (cat === "Manga") { 
        baseUrl = "https://manatoki" + saved.manatoki + ".net"; 
        path = "/comic/"; 
    }

    return contentId ? (baseUrl + path + contentId) : "#";
}

function saveActiveSettings() {
    var domains = {
        newtoki: document.getElementById('url_newtoki').value.trim() || DEFAULT_DOMAINS.newtoki,
        manatoki: document.getElementById('url_manatoki').value.trim() || DEFAULT_DOMAINS.manatoki,
        booktoki: document.getElementById('url_booktoki').value.trim() || DEFAULT_DOMAINS.booktoki
    };
    localStorage.setItem('toki_domains', JSON.stringify(domains));

    var folderId = document.getElementById('setting_folderId').value.trim();
    var deployId = document.getElementById('setting_deployId').value.trim();
    var apiId = document.getElementById('setting_apiId').value.trim();
    var apiPassword = document.getElementById('setting_apiPassword').value.trim();
    var notifyEmail = document.getElementById('setting_notifyEmail').value.trim();
    
    if (folderId && deployId) {
        var apiUrl = "https://script.google.com/macros/s/" + deployId + "/exec";
        API.setConfig(apiUrl, folderId, apiId, apiPassword, notifyEmail);
    }

    var vMode = document.getElementById('pref_2page').checked ? '2page' : '1page';
    var vCover = document.getElementById('pref_cover').checked;
    var vRtl = document.getElementById('pref_rtl').checked;
    var vEngine = document.querySelector('input[name="view_engine"]:checked');
    vEngine = vEngine ? vEngine.value : 'legacy';

    localStorage.setItem('toki_v_mode', vMode);
    localStorage.setItem('toki_v_cover', vCover);
    localStorage.setItem('toki_v_rtl', vRtl);
    localStorage.setItem('toki_v_engine', vEngine);

    showToast("Settings saved");
    
    if(folderId && deployId && apiId && apiPassword) refreshDB();
}

function loadDomains() {
    var saved = JSON.parse(localStorage.getItem('toki_domains')) || DEFAULT_DOMAINS;
    var elNew = document.getElementById('url_newtoki');
    var elMana = document.getElementById('url_manatoki');
    var elBook = document.getElementById('url_booktoki');
    
    if(elNew) elNew.value = saved.newtoki;
    if(elMana) elMana.value = saved.manatoki;
    if(elBook) elBook.value = saved.booktoki;

    var elFolder = document.getElementById('setting_folderId');
    var elDeploy = document.getElementById('setting_deployId');
    var elApiId = document.getElementById('setting_apiId');
    var elApiPassword = document.getElementById('setting_apiPassword');
    var elNotifyEmail = document.getElementById('setting_notifyEmail');
    
    if (API._config.folderId && elFolder) elFolder.value = API._config.folderId;
    if (API._config.baseUrl && elDeploy) {
        var match = API._config.baseUrl.match(/\/s\/([^\/]+)\/exec/);
        if (match && match[1]) elDeploy.value = match[1];
    }
    if (API._config.apiId && elApiId) elApiId.value = API._config.apiId;
    if (API._config.apiPassword && elApiPassword) elApiPassword.value = API._config.apiPassword;
    if (API._config.notifyEmail && elNotifyEmail) elNotifyEmail.value = API._config.notifyEmail;

    var vMode = localStorage.getItem('toki_v_mode') || '1page';
    var vCover = (localStorage.getItem('toki_v_cover') === 'true');
    var vRtl = (localStorage.getItem('toki_v_rtl') === 'true');
    var vEngine = localStorage.getItem('toki_v_engine') || 'legacy';

    var pref2page = document.getElementById('pref_2page');
    var prefCover = document.getElementById('pref_cover');
    var prefRtl = document.getElementById('pref_rtl');
    
    if(pref2page) pref2page.checked = (vMode === '2page');
    if(prefCover) prefCover.checked = vCover;
    if(prefRtl) prefRtl.checked = vRtl;
    
    var radios = document.getElementsByName('view_engine');
    for(var i = 0; i < radios.length; i++) {
        radios[i].checked = (radios[i].value === vEngine);
    }
}

function saveManualConfig() {
    var url = document.getElementById('configApiUrl').value.trim();
    var folderId = document.getElementById('configFolderId').value.trim();
    var apiId = document.getElementById('configApiId').value.trim();
    var apiPassword = document.getElementById('configApiPassword').value.trim();
    var notifyEmail = document.getElementById('configNotifyEmail').value.trim();
    
    if (!url || !folderId || !apiId || !apiPassword) {
        alert("URL, Folder ID, API ID, Password를 모두 입력해주세요.");
        return;
    }
    
    API.setConfig(url, folderId, apiId, apiPassword, notifyEmail);
    document.getElementById('configModal').style.display = 'none';
    refreshDB();
}
function logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    
    API.logout();
    
    // 화면 초기화
    document.getElementById('grid').innerHTML = '';
    allSeries = [];
    
    // 설정 모달 표시
    document.getElementById('configModal').style.display = 'flex';
    
    // 사이드바 닫기
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
    
    showToast('Logged out');
}
// ===== Window 등록 =====
window.refreshDB = refreshDB;
window.toggleSettings = toggleSettings;
window.switchTab = switchTab;
window.filterData = filterData;
window.saveActiveSettings = saveActiveSettings;
window.saveManualConfig = saveManualConfig;
window.showToast = showToast;
window.renderGrid = renderGrid;
window.handleThumbnailError = handleThumbnailError;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.handleCoverSelect = handleCoverSelect;
window.saveEditInfo = saveEditInfo;
window.openEpisodeList = openEpisodeList;
window.closeEpisodeModal = closeEpisodeModal;
window.renderEpisodeList = renderEpisodeList;
window.refreshEpisodeCache = refreshEpisodeCache;
window.openEpisodeEdit = openEpisodeEdit;
window.openDetailModal = openDetailModal;
window.closeDetailModal = closeDetailModal;
window.toggleDetailEpisodes = toggleDetailEpisodes;
window.loadDetailEpisodes = loadDetailEpisodes;
window.refreshDetailEpisodes = refreshDetailEpisodes;
window.openEditFromDetail = openEditFromDetail;
window.openPlatformSite = openPlatformSite;
window.toggleDescription = toggleDescription;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;
window.toggleSettingsAccordion = toggleSettingsAccordion;
window.toggleAdultFilter = toggleAdultFilter;
window.showTags = showTags;
window.closeTagsModal = closeTagsModal;
window.createTag = createTag;
window.deleteTag = deleteTag;
window.filterByTag = filterByTag;
window.addEditTag = addEditTag;
window.removeEditTag = removeEditTag;
window.showCalendar = showCalendar;
window.closeCalendarModal = closeCalendarModal;
window.changeMonth = changeMonth;
window.addCalendarRecord = addCalendarRecord;
window.showBackupRestore = showBackupRestore;
window.closeBackupModal = closeBackupModal;
window.downloadBackup = downloadBackup;
window.uploadBackup = uploadBackup;
window.syncToDrive = syncToDrive;
window.syncFromDrive = syncFromDrive;
window.showFavorites = showFavorites;
window.toggleFavorite = toggleFavorite;
