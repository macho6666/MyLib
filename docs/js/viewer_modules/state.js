export let currentBookList = [];
export let currentBookIndex = -1;

export function updateCurrentBookList(list) {
    currentBookList = list;
}

export function updateCurrentBookIndex(index) {
    currentBookIndex = index;
}

/**
 * 뷰어 상태 객체
 */
export const vState = {
    mode: '1page', // '1page' or '2page'
    coverPriority: true,
    rtlMode: false,
    images: [], 
    spreads: [], 
    currentSpreadIndex: 0,
    settingsTimer: null,
    preload: true,
    scrollMode: false, // Webtoon Mode
    epubMode: false, // Novel Mode
    textSettings: {
        fontSize: 18,
        lineHeight: 1.8
    },
    // Text Mode Pagination
    textPage: 0,
    totalTextPages: 0,
    // Adding optional properties that might be used
    foliateView: null 
};

export let nextBookPreload = null;
export function setNextBookPreload(val) { nextBookPreload = val; }

// Data Reuse Cache
export let cachedFileId = null;
export let cachedBytes = null;
export function setCachedData(fileId, bytes) {
    cachedFileId = fileId;
    cachedBytes = bytes;
}
