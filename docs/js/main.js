const NO_IMAGE_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%3E%3C%2Fsvg%3E";
const VIEWER_VERSION = "연두해요 v0.1";
window.MYLIB_VIEWER_VERSION = VIEWER_VERSION;
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
    
    var el = document.getElementById('viewerVersionDisplay');
    if(el) el.innerText = "MyLib " + VIEWER_VERSION;
    
    if (API.isConfigured()) {
        showToast("Connecting...");
        refreshDB(null, true).catch(function(e) {
            showSimpleLogin();
        });
    } else {
        setTimeout(function() {
            if (!API.isConfigured()) {
                showFullConfig();
            } else {
                showToast("Connecting...");
                refreshDB(null, true).catch(function(e) {
                    showSimpleLogin();
                });
            }
        }, 1000);
    }
});

function handleMessage(event) {
    if (event.data.type === 'mylib_CONFIG') {
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
        customTags = JSON.parse(localStorage.getItem('mylib_tags')) || [];
        seriesTags = JSON.parse(localStorage.getItem('mylib_series_tags')) || {};
        calendarData = JSON.parse(localStorage.getItem('mylib_calendar')) || {};
        favorites = JSON.parse(localStorage.getItem('mylib_favorites')) || [];
        adultFilterEnabled = localStorage.getItem('mylib_adult_filter') === 'true';
        
        updateAdultToggle();
        updateSidebarTags();
    } catch (e) {
        console.error('Local data load error:', e);
    }
}

function saveLocalData() {
    localStorage.setItem('mylib_tags', JSON.stringify(customTags));
    localStorage.setItem('mylib_series_tags', JSON.stringify(seriesTags));
    localStorage.setItem('mylib_calendar', JSON.stringify(calendarData));
    localStorage.setItem('mylib_favorites', JSON.stringify(favorites));
    localStorage.setItem('mylib_adult_filter', adultFilterEnabled);
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
    localStorage.setItem('mylib_theme', next);
    
    var indicator = document.getElementById('themeIndicator');
    var headerIcon = document.getElementById('headerThemeIcon');
    var icon = next === 'dark' ? '🌙' : '☀️';
    
    if (indicator) indicator.textContent = icon;
    if (headerIcon) headerIcon.textContent = icon;
}

function loadSavedTheme() {
    var saved = localStorage.getItem('mylib_theme') || 'dark';
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
// Config Modal 상세 설정 토글
function toggleConfigDetails() {
  var details = document.getElementById('configDetails');
  var toggle = document.getElementById('configToggle');
  
  if (details.classList.contains('open')) {
    details.classList.remove('open');
    toggle.classList.remove('open');
  } else {
    details.classList.add('open');
    toggle.classList.add('open');
  }
}
function showSimpleLogin() {
  var details = document.getElementById('configDetails');
  var toggle = document.getElementById('configToggle');

  details.classList.remove('open');
  toggle.classList.remove('open');
  
  document.getElementById('configApiPassword').value = '';
  document.getElementById('configApiUrl').value = API._config.baseUrl || '';
  document.getElementById('configFolderId').value = API._config.folderId || '';
  document.getElementById('configApiId').value = API._config.apiId || '';
  document.getElementById('configNotifyEmail').value = API._config.notifyEmail || '';
  
  document.getElementById('configModal').style.display = 'flex';
}

// 전체 설정 모드 (최초 접속 시)
function showFullConfig() {
  var details = document.getElementById('configDetails');
  var toggle = document.getElementById('configToggle');
  
  details.classList.add('open');
  toggle.classList.add('open');
  
  document.getElementById('configModal').style.display = 'flex';
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
    throw e;
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
    
var authorText = authors.join(', ') || '작가 미상';
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
var adultBadge = document.getElementById('detailAdultBadge');
if (adultBadge) {
  if (meta.adult === true) {
    adultBadge.style.display = 'inline';
  } else {
    adultBadge.style.display = 'none';
  }
}
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
var selectedRecordBookId = '';
var selectedRecordBookName = '';
function showCalendar() {
    document.getElementById('calendarModal').style.display = 'flex';
    
    if (!selectedCalendarDate) {
        selectedCalendarDate = formatDateStr(new Date());
    }
    
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
function renderCalendar() {
    var grid = document.getElementById('calendarGrid');
    var titleEl = document.getElementById('calendarTitle');
    
    if (!grid || !titleEl) return;
    
    var year = currentCalendarMonth.getFullYear();
    var month = currentCalendarMonth.getMonth();
    
    titleEl.textContent = year + '년 ' + (month + 1) + '월';
    grid.innerHTML = '';
    
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    days.forEach(function(day) {
        var header = document.createElement('div');
        header.className = 'cal-day-header';
        header.textContent = day;
        grid.appendChild(header);
    });
    
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);
    var startDayOfWeek = firstDay.getDay();
    var totalDays = lastDay.getDate();
    
    var today = new Date();
    var todayStr = formatDateStr(today);
    
    var prevMonthLastDay = new Date(year, month, 0).getDate();
    for (var i = startDayOfWeek - 1; i >= 0; i--) {
        var dayNum = prevMonthLastDay - i;
        var dayEl = document.createElement('div');
        dayEl.className = 'cal-day other-month';
        dayEl.textContent = dayNum;
        grid.appendChild(dayEl);
    }
    
    for (var d = 1; d <= totalDays; d++) {
        var dateStr = year + '-' + padZero(month + 1) + '-' + padZero(d);
        var dayEl = document.createElement('div');
        dayEl.className = 'cal-day';
        dayEl.textContent = d;
        dayEl.dataset.date = dateStr;
        
        if (dateStr === todayStr) {
            dayEl.classList.add('today');
        }
        if (dateStr === selectedCalendarDate) {
            dayEl.classList.add('selected');
        }
        if (calendarData[dateStr] && calendarData[dateStr].length > 0) {
            dayEl.classList.add('has-record');
        }
        
        dayEl.onclick = function() {
            selectCalendarDate(this.dataset.date);
        };
        
        grid.appendChild(dayEl);
    }
    
    var totalCells = startDayOfWeek + totalDays;
    var remainingCells = (7 - (totalCells % 7)) % 7;
    for (var n = 1; n <= remainingCells; n++) {
        var dayEl = document.createElement('div');
        dayEl.className = 'cal-day other-month';
        dayEl.textContent = n;
        grid.appendChild(dayEl);
    }
}

function changeMonth(delta) {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + delta);
    renderCalendar();
}

function selectCalendarDate(dateStr) {
    selectedCalendarDate = dateStr;
    
    document.querySelectorAll('.cal-day.selected').forEach(function(el) {
        el.classList.remove('selected');
    });
    
    var dayEl = document.querySelector('.cal-day[data-date="' + dateStr + '"]');
    if (dayEl) {
        dayEl.classList.add('selected');
    }
}

function formatDateStr(date) {
    var year = date.getFullYear();
    var month = padZero(date.getMonth() + 1);
    var day = padZero(date.getDate());
    return year + '-' + month + '-' + day;
}

function padZero(num) {
    return num < 10 ? '0' + num : '' + num;
}

function addCalendarRecord() {
    openRecordModal();
}

function updateCalendarStats() {
    var completed = 0, dropped = 0, reading = 0;
    var countedBooks = {};
    
    Object.values(calendarData).forEach(function(records) {
        records.forEach(function(r) {
            if (!countedBooks[r.seriesId]) {
                countedBooks[r.seriesId] = r.status;
                if (r.status === 'completed') completed++;
                else if (r.status === 'dropped') dropped++;
                else reading++;
            } else {
                var prevStatus = countedBooks[r.seriesId];
                if (prevStatus !== r.status) {
                    if (prevStatus === 'completed') completed--;
                    else if (prevStatus === 'dropped') dropped--;
                    else reading--;
                    
                    if (r.status === 'completed') completed++;
                    else if (r.status === 'dropped') dropped++;
                    else reading++;
                    
                    countedBooks[r.seriesId] = r.status;
                }
            }
        });
    });
    
    var read = completed + dropped + reading;
    var total = allSeries.length;
    var remaining = total - read;
    var readPercent = total > 0 ? Math.round((read / total) * 100) : 0;
    var remainPercent = total > 0 ? Math.round((remaining / total) * 100) : 0;
    
    // 클릭 가능하게 수정
    document.getElementById('statCompleted').innerHTML = '<span class="stat-clickable" onclick="showRecordsByStatus(\'completed\')">' + completed + '</span>';
    document.getElementById('statDropped').innerHTML = '<span class="stat-clickable" onclick="showRecordsByStatus(\'dropped\')">' + dropped + '</span>';
    document.getElementById('statReading').innerHTML = '<span class="stat-clickable" onclick="showRecordsByStatus(\'reading\')">' + reading + '</span>';
    document.getElementById('statRead').innerHTML = read + ' <small>(' + readPercent + '%)</small>';
    document.getElementById('statRemaining').innerHTML = remaining + ' <small>(' + remainPercent + '%)</small>';
    document.getElementById('statTotal').textContent = total;
}

function deleteCalendarRecord(dateStr, index) {
    if (!confirm('Delete this record?')) return;
    
    if (calendarData[dateStr] && calendarData[dateStr][index]) {
        calendarData[dateStr].splice(index, 1);
        
        // 빈 배열이면 삭제
        if (calendarData[dateStr].length === 0) {
            delete calendarData[dateStr];
        }
        
        saveLocalData();
        renderCalendar();
        updateCalendarStats();
        showToast('Record deleted');
    }
}
// Record Modal
function openRecordModal() {
  if (!selectedCalendarDate) {
    showToast('Select a date first');
    return;
  }
  
  document.getElementById('recordModalTitle').textContent = selectedCalendarDate;
  document.getElementById('recordBookSearch').value = '';
  document.getElementById('recordBookResults').innerHTML = '';
  document.getElementById('recordBookResults').classList.remove('show');
  document.getElementById('recordSelectedBook').style.display = 'none';
  document.getElementById('recordBookId').value = '';
  document.getElementById('recordProgress').value = 0;
  document.getElementById('recordProgressValue').textContent = '0';
  document.querySelector('input[name="recordStatus"][value="reading"]').checked = true;
  
  // 메모 필드 초기화
  document.getElementById('recordMemosContainer').innerHTML = 
    '<div class="record-memo-row">' +
      '<input type="text" class="config-input record-memo-input" placeholder="Add memo...">' +
    '</div>';
  
  selectedRecordBookId = '';
  selectedRecordBookName = '';
  
  document.getElementById('recordModal').style.display = 'flex';
}
function closeRecordModal() {
    document.getElementById('recordModal').style.display = 'none';
}

function searchBooks(query) {
    var resultsEl = document.getElementById('recordBookResults');
    
    if (!query || query.length < 2) {
        resultsEl.classList.remove('show');
        return;
    }
    
    var matches = allSeries.filter(function(s) {
        return s.name.toLowerCase().includes(query.toLowerCase());
    }).slice(0, 10);
    
    if (matches.length === 0) {
        resultsEl.innerHTML = '<div class="record-book-item" style="color: var(--text-tertiary);">No results</div>';
    } else {
        resultsEl.innerHTML = matches.map(function(s) {
            return '<div class="record-book-item" onclick="selectBook(\'' + s.id + '\', \'' + s.name.replace(/'/g, "\\'") + '\')">' + s.name + '</div>';
        }).join('');
    }
    
    resultsEl.classList.add('show');
}

function selectBook(id, name) {
  selectedRecordBookId = id;
  selectedRecordBookName = name;
  
  document.getElementById('recordBookId').value = id;
  document.getElementById('recordBookSearch').value = '';
  document.getElementById('recordBookResults').classList.remove('show');
  
  // 커버 이미지 표시
  var series = allSeries.find(function(s) { return s.id === id; });
  var thumb = '';
  if (series) {
    if (series.thumbnail && series.thumbnail.startsWith('data:image')) {
      thumb = series.thumbnail;
    } else if (series.thumbnailId) {
      thumb = 'https://lh3.googleusercontent.com/d/' + series.thumbnailId + '=s200';
    }
  }
  
  var coverEl = document.getElementById('recordSelectedCover');
  if (thumb) {
    coverEl.innerHTML = '<img src="' + thumb + '" alt="">';
  } else {
    coverEl.innerHTML = '';
  }
  
  document.getElementById('recordSelectedName').textContent = name;
  document.getElementById('recordSelectedBook').style.display = 'flex';
}

function updateProgressValue(value) {
    document.getElementById('recordProgressValue').textContent = value;
}

function saveRecord() {
  if (!selectedRecordBookId) {
    showToast('Please select a book');
    return;
  }
  
  var progress = parseInt(document.getElementById('recordProgress').value);
  var status = document.querySelector('input[name="recordStatus"]:checked').value;
  
  // 모든 메모 수집
  var memos = [];
  var memoInputs = document.querySelectorAll('.record-memo-input');
  memoInputs.forEach(function(input) {
    var memo = input.value.trim();
    if (memo) {
      memos.push(memo);
    }
  });
  
  if (!calendarData[selectedCalendarDate]) {
    calendarData[selectedCalendarDate] = [];
  }
  
  // 같은 책 기록 있으면 업데이트
  var existingIndex = calendarData[selectedCalendarDate].findIndex(function(r) {
    return r.seriesId === selectedRecordBookId;
  });
  
  var record = {
    seriesId: selectedRecordBookId,
    status: status,
    progress: progress,
    memos: memos
  };
  
  if (existingIndex >= 0) {
    // 기존 메모에 추가
    var existingMemos = calendarData[selectedCalendarDate][existingIndex].memos || [];
    record.memos = existingMemos.concat(memos);
    calendarData[selectedCalendarDate][existingIndex] = record;
  } else {
    calendarData[selectedCalendarDate].push(record);
  }
  
  saveLocalData();
  renderCalendar();
  updateCalendarStats();
  closeRecordModal();
  showToast('Record saved');
  
  // 완독 선택 시 폴더 이동 여부 묻기
  if (status === 'completed') {
    var series = allSeries.find(function(s) { return s.id === selectedRecordBookId; });
    if (series && series.category !== 'Completed') {
      setTimeout(function() {
        if (confirm('Move "' + series.name + '" to Completed folder?')) {
          moveToCompletedById(selectedRecordBookId);
        }
      }, 500);
    }
  }
}
async function moveToCompletedById(seriesId) {
  showToast('Moving...');
  
  try {
    var result = await API.request('move_to_completed', { seriesId: seriesId });
    showToast('Moved to Completed');
    refreshDB(null, true);
  } catch (e) {
    showToast('Error: ' + e.message, 5000);
  }
}
// ===== 기타 함수들 =====
function toggleSettings() {
    var el = document.getElementById('domainPanel');
    if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
function saveActiveSettings() {
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

    localStorage.setItem('mylib_v_mode', vMode);
    localStorage.setItem('mylib_v_cover', vCover);
    localStorage.setItem('mylib_v_rtl', vRtl);
    localStorage.setItem('mylib_v_engine', vEngine);

    showToast("Settings saved");
    
    if(folderId && deployId && apiId && apiPassword) refreshDB();
}

function loadDomains() {
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

    var vMode = localStorage.getItem('mylib_v_mode') || '1page';
    var vCover = (localStorage.getItem('mylib_v_cover') === 'true');
    var vRtl = (localStorage.getItem('mylib_v_rtl') === 'true');
    var vEngine = localStorage.getItem('mylib_v_engine') || 'legacy';

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

async function saveManualConfig() {
    var url = document.getElementById('configApiUrl').value.trim();
    var folderId = document.getElementById('configFolderId').value.trim();
    var apiId = document.getElementById('configApiId').value.trim();
    var apiPassword = document.getElementById('configApiPassword').value.trim();
    var notifyEmail = document.getElementById('configNotifyEmail').value.trim();
    
    if (!url || !folderId || !apiId || !apiPassword) {
        showToast("Please fill in all required fields.");
        return;
    }
    
    API.setConfig(url, folderId, apiId, apiPassword, notifyEmail);
    document.getElementById('configModal').style.display = 'none';
    
    try {
        await refreshDB();
        showToast("✅ Login successful!");
    } catch (e) {
        showToast("❌ Login failed: " + e.message, 5000);
        showSimpleLogin();
    }
}

function logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    
    API.logout();
    document.getElementById('grid').innerHTML = '';
    allSeries = [];
    
    showSimpleLogin();
    
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
    
    showToast('Logged out');
}
// =======================================================
// 📊 Index Update 함수들
// =======================================================

function openIndexModal(mode) {
    document.getElementById('indexModal').style.display = 'flex';
    
    // 사이드바 닫기
    var sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
    
    // 상태 새로고침 시작
    refreshIndexStatus();
    startIndexAutoRefresh();
    
    // 모드에 따라 바로 시작할지 확인
    if (mode === 'quick' || mode === 'full') {
        setTimeout(function() {
            startIndexUpdate(mode);
        }, 500);
    }
}

function closeIndexModal() {
    document.getElementById('indexModal').style.display = 'none';
    stopIndexAutoRefresh();
}

function startIndexAutoRefresh() {
    stopIndexAutoRefresh();
    indexRefreshInterval = setInterval(function() {
        refreshIndexStatus();
        refreshIndexLogs();
    }, 1500);
}

function stopIndexAutoRefresh() {
    if (indexRefreshInterval) {
        clearInterval(indexRefreshInterval);
        indexRefreshInterval = null;
    }
}

async function refreshIndexStatus() {
    try {
        var data = await API.request('index_get_status', {});
        updateIndexUI(data);
    } catch (e) {
        console.error('Index status error:', e);
    }
}

function updateIndexUI(data) {
    var wasRunning = indexIsRunning;
    indexIsRunning = data.running;
    
    // 완료 알림
    if (wasRunning && !indexIsRunning) {
        showToast('✅ Index update complete!');
        refreshDB(null, true); // 라이브러리 새로고침
    }
    
// 상태 배지
var badge = document.getElementById('indexStatusBadge');
if (data.running) {
    badge.className = 'index-status-badge running';
    badge.textContent = 'Running';
} else if (data.mode && data.processed > 0 && data.processed < data.totalSeries) {
    badge.className = 'index-status-badge paused';
    badge.textContent = 'Paused';
} else {
    badge.className = 'index-status-badge idle';
    badge.textContent = 'Idle';
}
    
    // 모드 라벨
    var modeLabel = document.getElementById('indexModeLabel');
    if (data.mode === 'full') modeLabel.textContent = 'Full Rebuild';
    else if (data.mode === 'quick') modeLabel.textContent = 'Quick Update';
    else modeLabel.textContent = '';
    
    // 통계
    document.getElementById('indexProcessed').textContent = data.processed || 0;
    document.getElementById('indexTotal').textContent = data.totalSeries || 0;
    document.getElementById('indexMissing').textContent = data.missingCovers || 0;
    
    // 진행률
    var progressSection = document.getElementById('indexProgressSection');
    if ((data.running || data.mode) && data.totalSeries > 0) {
        progressSection.style.display = 'block';
        var pct = data.percent || 0;
        document.getElementById('indexProgressText').textContent = pct + '%';
        document.getElementById('indexProgressDetail').textContent = data.processed + ' / ' + data.totalSeries;
        document.getElementById('indexProgressBar').style.width = pct + '%';
    } else {
        progressSection.style.display = 'none';
    }
    
    // 카테고리 목록
    var catList = document.getElementById('indexCategories');
    catList.innerHTML = '';
    if (data.categories && data.categories.length > 0) {
        for (var i = 0; i < data.categories.length; i++) {
            var cat = data.categories[i];
            var catTotal = (data.categorySeriesCounts && data.categorySeriesCounts[cat.name]) || 0;
            var catDone = (data.categoryDoneCounts && data.categoryDoneCounts[cat.name]) || 0;
            if (catTotal === 0) continue;
            
            var pct = Math.floor((catDone / catTotal) * 100);
            var cls = catDone >= catTotal ? 'done' : (catDone > 0 ? 'wip' : 'wait');
            
            var item = document.createElement('div');
            item.className = 'index-category-item';
            item.innerHTML =
                '<span class="index-category-name">' + cat.name + '</span>' +
                '<div class="index-category-bar-bg"><div class="index-category-bar-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
                '<span class="index-category-count">' + catDone + '/' + catTotal + '</span>';
            catList.appendChild(item);
        }
    }
    
    // 버튼 상태
    var isPaused = !data.running && data.mode && data.processed > 0 && data.processed < data.totalSeries;
    
    document.getElementById('indexBtnFull').disabled = data.running;
    document.getElementById('indexBtnQuick').disabled = data.running;
    document.getElementById('indexBtnPause').disabled = !data.running;
    
    var btnFull = document.getElementById('indexBtnFull');
    var btnQuick = document.getElementById('indexBtnQuick');
    
    if (isPaused && data.mode === 'full') {
        btnFull.innerHTML = '▶ 재개 (Full)';
        btnFull.disabled = false;
        btnQuick.disabled = true;
    } else if (isPaused && data.mode === 'quick') {
        btnQuick.innerHTML = '▶ 재개 (Quick)';
        btnQuick.disabled = false;
        btnFull.disabled = true;
    } else {
        btnFull.innerHTML = '🔨 Full Rebuild';
        btnQuick.innerHTML = '⚡ Quick Update';
    }
}

async function refreshIndexLogs() {
    if (indexLogFetching) return;
    indexLogFetching = true;
    
    try {
        var data = await API.request('index_get_logs', { startRow: indexLastLogRow });
        updateIndexLogs(data);
    } catch (e) {
        console.error('Index logs error:', e);
    } finally {
        indexLogFetching = false;
    }
}

function updateIndexLogs(data) {
    if (!data) return;
    
    // 로그 초기화 감지
    if (data.totalRows < indexLastKnownTotalRows) {
        indexLastLogRow = 2;
        indexLastKnownTotalRows = 0;
        var container = document.getElementById('indexLogContainer');
        container.innerHTML = '';
        document.getElementById('indexLogCount').textContent = '0 줄';
        return;
    }
    
    indexLastKnownTotalRows = data.totalRows;
    
    if (!data.logs || data.logs.length === 0) return;
    
    var container = document.getElementById('indexLogContainer');
    
    // 대기 중 메시지 제거
    var placeholder = container.querySelector('.index-log-msg');
    if (placeholder && placeholder.textContent === '대기 중...') {
        container.innerHTML = '';
    }
    
    // 로그 추가
    for (var i = 0; i < data.logs.length; i++) {
        var entry = document.createElement('div');
        entry.className = 'index-log-entry';
        entry.innerHTML =
            '<span class="index-log-time">' + escapeHtml(data.logs[i].time) + '</span>' +
            '<span class="index-log-msg">' + escapeHtml(data.logs[i].message) + '</span>';
        container.appendChild(entry);
    }
    
    indexLastLogRow = indexLastLogRow + data.logs.length;
    document.getElementById('indexLogCount').textContent = (indexLastLogRow - 2) + ' 줄';
    
    // 자동 스크롤
    if (document.getElementById('indexAutoScroll').checked) {
        container.scrollTop = container.scrollHeight;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function startIndexUpdate(mode) {
    if (indexIsRunning) {
        showToast('이미 작업이 진행 중입니다.', 5000);
        return;
    }
    
    var msg = mode === 'full' 
        ? 'Full Rebuild를 시작하시겠습니까?\n모든 폴더를 처음부터 스캔합니다.'
        : 'Quick Update를 시작하시겠습니까?\n변경사항만 업데이트합니다.';
    
    if (!confirm(msg)) return;
    
    // 로그 초기화
    clearIndexLogDisplay();
    
    showToast(mode === 'full' ? '🔨 Full Rebuild 시작...' : '⚡ Quick Update 시작...');
    
    try {
        // 1. 초기화
        var initType = mode === 'full' ? 'index_start_full' : 'index_start_quick';
        var initResult = await API.request(initType, {});
        
        if (!initResult.success) {
            showToast('❌ ' + initResult.message, 5000);
            return;
        }
        
        // 2. 실행
        var runType = mode === 'full' ? 'index_run_full' : 'index_run_quick';
        API.request(runType, {}).catch(function(e) {
            console.log('Index run started (async)');
        });
        
        showToast('✅ ' + initResult.message);
        
    } catch (e) {
        showToast('❌ 오류: ' + e.message, 5000);
    }
}

async function pauseIndexUpdate() {
    if (!indexIsRunning) {
        showToast('실행 중인 작업이 없습니다.');
        return;
    }
    
    if (!confirm('작업을 일시정지하시겠습니까?')) return;
    
    try {
        var result = await API.request('index_pause', {});
        if (result.success) {
            showToast('⏸ 일시정지 완료');
        } else {
            showToast(result.message, 5000);
        }
    } catch (e) {
        showToast('❌ 오류: ' + e.message, 5000);
    }
}

function clearIndexLogDisplay() {
    indexLastLogRow = 2;
    indexLastKnownTotalRows = 0;
    indexLogFetching = false;
    var container = document.getElementById('indexLogContainer');
    container.innerHTML = '<div class="index-log-entry"><span class="index-log-time">--:--:--</span><span class="index-log-msg">대기 중...</span></div>';
    document.getElementById('indexLogCount').textContent = '0 줄';
}
// ===== Data Sync =====
async function dataSync() {
  var choice = confirm(
    "Drive 동기화 옵션:\n\n" +
    "확인 = Drive에 저장\n" +
    "취소 = Drive에서 불러오기"
  );
  
  if (choice) {
    // Drive에 저장
    await saveToDrive();
  } else {
    // Drive에서 불러오기
    await loadFromDrive();
  }
}

async function saveToDrive() {
  showToast("Drive에 저장 중...");
  
  try {
          var bookmarkData = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.startsWith('bookmark_') || key.startsWith('progress_')) {
        bookmarkData[key] = JSON.parse(localStorage.getItem(key));
      }
    }
    
    var userData = {
      version: VIEWER_VERSION,
      exportDate: new Date().toISOString(),
      tags: customTags,
      seriesTags: seriesTags,
      calendar: calendarData,
      favorites: favorites,
      settings: {
        adultFilter: adultFilterEnabled,
        theme: localStorage.getItem('mylib_theme'),
        domains: JSON.parse(localStorage.getItem('mylib_domains') || '{}')
      }
    };
    
    await API.request('save_user_data', { userData: userData });
    showToast("✅ Drive에 저장 완료!");
    
  } catch (e) {
    showToast("❌ 저장 실패: " + e.message, 5000);
  }
}

async function loadFromDrive() {
  if (!confirm("Drive에서 불러오면 현재 데이터가 덮어씌워집니다. 계속하시겠습니까?")) {
    return;
  }
  
  showToast("Drive에서 불러오는 중...");
  
  try {
    var userData = await API.request('load_user_data', {});
    
    if (userData.tags) customTags = userData.tags;
    if (userData.seriesTags) seriesTags = userData.seriesTags;
    if (userData.calendar) calendarData = userData.calendar;
    if (userData.favorites) favorites = userData.favorites;
    
    if (userData.settings) {
      if (userData.settings.adultFilter !== undefined) {
        adultFilterEnabled = userData.settings.adultFilter;
      }
      if (userData.settings.theme) {
        localStorage.setItem('mylib_theme', userData.settings.theme);
        loadSavedTheme();
      }
      if (userData.settings.domains) {
        localStorage.setItem('mylib_domains', JSON.stringify(userData.settings.domains));
        loadDomains();
      }
    }
    
    saveLocalData();
    updateSidebarTags();
    updateAdultToggle();
    applyFilters();
    
    showToast("✅ Drive에서 불러오기 완료!");
    
  } catch (e) {
    showToast("❌ 불러오기 실패: " + e.message, 5000);
  }
}

// ===== Completed 카테고리 =====
async function moveToCompleted() {
  var series = window.currentDetailSeries;
  if (!series) return;
  
  if (series.category === 'Completed') {
    openRestoreModal();
    return;
  }
  
  if (!confirm('Move "' + series.name + '" to Completed?')) return;
  
  showToast('Moving...');
  
  try {
    var result = await API.request('move_to_completed', { seriesId: series.id });
    showToast('Moved to Completed');
    closeDetailModal();
    refreshDB(null, true);
  } catch (e) {
    showToast('Error: ' + e.message, 5000);
  }
}

function openRestoreModal() {
  document.getElementById('restoreModal').style.display = 'flex';
}

function closeRestoreModal() {
  document.getElementById('restoreModal').style.display = 'none';
}

async function restoreToCategory(category) {
  var series = window.currentDetailSeries;
  if (!series) return;
  
  showToast('Restoring...');
  
  try {
    var result = await API.request('restore_from_completed', { 
      seriesId: series.id,
      targetCategory: category
    });
    showToast('Restored to ' + category);
    closeRestoreModal();
    closeDetailModal();
    refreshDB(null, true);
  } catch (e) {
    showToast('Error: ' + e.message, 5000);
  }
}
// ===== 미니 책장 모달 =====
function showRecordsByStatus(status) {
  var statusLabel = status === 'completed' ? 'Completed' : 
                    status === 'dropped' ? 'Dropped' : 'Reading';
  
  // 해당 상태의 책들 수집
  var latestRecords = {};
  
  Object.keys(calendarData).forEach(function(dateStr) {
    calendarData[dateStr].forEach(function(record) {
      latestRecords[record.seriesId] = {
        record: record,
        date: dateStr
      };
    });
  });
  
  // 상태 필터링
  var filtered = Object.values(latestRecords).filter(function(item) {
    return item.record.status === status;
  });
  
  document.getElementById('bookshelfTitle').textContent = statusLabel + ' (' + filtered.length + ')';
  
  var grid = document.getElementById('bookshelfGrid');
  grid.innerHTML = '';
  
  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-tertiary); padding: 40px; display: flex; align-items: center; justify-content: center; height: 100%; min-height: 300px;">No records</div>';
    document.getElementById('bookshelfModal').style.display = 'flex';
    return;
  }
  
  filtered.forEach(function(item) {
    var series = allSeries.find(function(s) { return s.id === item.record.seriesId; });
    if (!series) return;
    
    var thumb = '';
    if (series.thumbnail && series.thumbnail.startsWith('data:image')) {
      thumb = series.thumbnail;
    } else if (series.thumbnailId) {
      thumb = 'https://lh3.googleusercontent.com/d/' + series.thumbnailId + '=s200';
    }
    
    var bookItem = document.createElement('div');
    bookItem.className = 'bookshelf-item';
    bookItem.innerHTML = 
      '<div class="bookshelf-cover">' +
        (thumb ? '<img src="' + thumb + '" alt="">' : '<div class="bookshelf-cover-noimage">No Image</div>') +
      '</div>' +
      '<button class="bookshelf-delete" onclick="event.stopPropagation(); deleteBookRecords(\'' + series.id + '\')" title="Delete">x</button>' +
      '<div class="bookshelf-name">' + series.name + '</div>';
    
    bookItem.onclick = function() {
      openBookRecords(series.id);
    };
    
    grid.appendChild(bookItem);
  });
  
  document.getElementById('bookshelfModal').style.display = 'flex';
}

function closeBookshelfModal() {
  document.getElementById('bookshelfModal').style.display = 'none';
}

function deleteBookRecords(seriesId) {
  var series = allSeries.find(function(s) { return s.id === seriesId; });
  var name = series ? series.name : 'Unknown';
  
  if (!confirm('Delete all records for "' + name + '"?')) return;
  
  // 모든 날짜에서 해당 책 기록 삭제
  Object.keys(calendarData).forEach(function(dateStr) {
    calendarData[dateStr] = calendarData[dateStr].filter(function(r) {
      return r.seriesId !== seriesId;
    });
    if (calendarData[dateStr].length === 0) {
      delete calendarData[dateStr];
    }
  });
  
  saveLocalData();
  updateCalendarStats();
  
  // 현재 상태 다시 로드
  var currentStatus = document.getElementById('bookshelfTitle').textContent.toLowerCase();
  if (currentStatus.includes('completed')) {
    showRecordsByStatus('completed');
  } else if (currentStatus.includes('dropped')) {
    showRecordsByStatus('dropped');
  } else {
    showRecordsByStatus('reading');
  }
  
  showToast('Records deleted');
}

// ===== 상세 기록 모달 =====
function openBookRecords(seriesId) {
  var series = allSeries.find(function(s) { return s.id === seriesId; });
  if (!series) return;
  
  document.getElementById('bookRecordsTitle').textContent = series.name;
  
  // 헤더 (커버 + 정보)
  var thumb = '';
  if (series.thumbnail && series.thumbnail.startsWith('data:image')) {
    thumb = series.thumbnail;
  } else if (series.thumbnailId) {
    thumb = 'https://lh3.googleusercontent.com/d/' + series.thumbnailId + '=s200';
  }
  
  // 최신 상태 찾기
  var latestStatus = 'reading';
  var latestProgress = 0;
  Object.keys(calendarData).sort().forEach(function(dateStr) {
    calendarData[dateStr].forEach(function(r) {
      if (r.seriesId === seriesId) {
        latestStatus = r.status;
        latestProgress = r.progress;
      }
    });
  });
  
  var statusText = latestStatus === 'completed' ? 'Completed' : 
                   latestStatus === 'dropped' ? 'Dropped' : 'Reading';
  
  document.getElementById('bookRecordsHeader').innerHTML = 
    '<div class="book-records-cover">' +
      (thumb ? '<img src="' + thumb + '" alt="">' : '') +
    '</div>' +
    '<div class="book-records-info">' +
      '<div class="book-records-name">' + series.name + '</div>' +
      '<div class="book-records-status">Progress: ' + latestProgress + '% / ' + statusText + '</div>' +
    '</div>';
  
  // 기록 목록
  var recordsList = document.getElementById('bookRecordsList');
  recordsList.innerHTML = '';
  
  var dates = Object.keys(calendarData).sort().reverse();
  var hasRecords = false;
  
  dates.forEach(function(dateStr) {
    var dayRecords = calendarData[dateStr].filter(function(r) {
      return r.seriesId === seriesId;
    });
    
    dayRecords.forEach(function(record, recordIndex) {
      hasRecords = true;
      
      var item = document.createElement('div');
      item.className = 'book-record-item';
      
      var memosHtml = '';
      if (record.memos && record.memos.length > 0) {
        record.memos.forEach(function(memo, memoIndex) {
          memosHtml += 
            '<div class="book-record-memo">' +
              '<span>' + memo + '</span>' +
              '<button class="book-record-memo-delete" onclick="deleteMemo(\'' + dateStr + '\', \'' + seriesId + '\', ' + memoIndex + ')">x</button>' +
            '</div>';
        });
      }
      
      item.innerHTML = 
        '<div class="book-record-date">' +
          '<span class="book-record-date-text">' + dateStr + '</span>' +
          '<button class="book-record-delete" onclick="deleteRecord(\'' + dateStr + '\', \'' + seriesId + '\')">x</button>' +
        '</div>' +
        '<div class="book-record-progress">' + record.progress + '%</div>' +
        '<div class="book-record-memos">' + memosHtml + '</div>';
      
      recordsList.appendChild(item);
    });
  });
  
  if (!hasRecords) {
    recordsList.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 20px;">No records</div>';
  }
  
  document.getElementById('bookRecordsModal').style.display = 'flex';
}

function closeBookRecordsModal() {
  document.getElementById('bookRecordsModal').style.display = 'none';
}

function deleteRecord(dateStr, seriesId) {
  if (!confirm('Delete this record?')) return;
  
  calendarData[dateStr] = calendarData[dateStr].filter(function(r) {
    return r.seriesId !== seriesId;
  });
  
  if (calendarData[dateStr].length === 0) {
    delete calendarData[dateStr];
  }
  
  saveLocalData();
  updateCalendarStats();
  openBookRecords(seriesId);
  showToast('Record deleted');
}

function deleteMemo(dateStr, seriesId, memoIndex) {
  if (!confirm('Delete this memo?')) return;
  
  var record = calendarData[dateStr].find(function(r) {
    return r.seriesId === seriesId;
  });
  
  if (record && record.memos) {
    record.memos.splice(memoIndex, 1);
    saveLocalData();
    openBookRecords(seriesId);
    showToast('Memo deleted');
  }
}
function addMemoField() {
  var container = document.getElementById('recordMemosContainer');
  var row = document.createElement('div');
  row.className = 'record-memo-row';
  row.innerHTML = '<input type="text" class="config-input record-memo-input" placeholder="Add memo...">';
  container.appendChild(row);
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
window.showFavorites = showFavorites;
window.toggleFavorite = toggleFavorite;
window.logout = logout;
window.openIndexModal = openIndexModal;
window.closeIndexModal = closeIndexModal;
window.startIndexUpdate = startIndexUpdate;
window.pauseIndexUpdate = pauseIndexUpdate;
window.dataSync = dataSync;
window.saveToDrive = saveToDrive;
window.loadFromDrive = loadFromDrive;
window.toggleConfigDetails = toggleConfigDetails;
window.showSimpleLogin = showSimpleLogin;
window.showFullConfig = showFullConfig;
window.openRecordModal = openRecordModal;
window.closeRecordModal = closeRecordModal;
window.searchBooks = searchBooks;
window.selectBook = selectBook;
window.updateProgressValue = updateProgressValue;
window.saveRecord = saveRecord;
window.renderCalendar = renderCalendar;
window.selectCalendarDate = selectCalendarDate;
window.formatDateStr = formatDateStr;
window.padZero = padZero;
window.deleteCalendarRecord = deleteCalendarRecord;
window.showRecordsByStatus = showRecordsByStatus;
window.moveToCompleted = moveToCompleted;
window.openRestoreModal = openRestoreModal;
window.closeRestoreModal = closeRestoreModal;
window.restoreToCategory = restoreToCategory;
window.showRecordsByStatus = showRecordsByStatus;
window.closeBookshelfModal = closeBookshelfModal;
window.deleteBookRecords = deleteBookRecords;
window.openBookRecords = openBookRecords;
window.closeBookRecordsModal = closeBookRecordsModal;
window.deleteRecord = deleteRecord;
window.deleteMemo = deleteMemo;
window.addMemoField = addMemoField;
window.moveToCompletedById = moveToCompletedById;
