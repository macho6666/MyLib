/**
 * viewer_modules/cache.js
 * IndexedDB 파일 캐시 (2GB, LRU)
 */

const DB_NAME = 'mylib_viewer_cache';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

let dbInstance = null;

async function getDB() {
    if (dbInstance) return dbInstance;

    return new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = function (e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        req.onsuccess = function () {
            dbInstance = req.result;
            resolve(dbInstance);
        };

        req.onerror = function () { reject(req.error); };
    });
}

export async function cacheGet(fileId) {
    try {
        var db = await getDB();
        return new Promise(function (resolve) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            var store = tx.objectStore(STORE_NAME);
            var req = store.get(fileId);

            req.onsuccess = function () {
                if (req.result) {
                    req.result.lastAccess = Date.now();
                    store.put(req.result);
                    resolve(req.result);
                } else {
                    resolve(null);
                }
            };
            req.onerror = function () { resolve(null); };
        });
    } catch (e) {
        console.warn('Cache get failed:', e);
        return null;
    }
}

export async function cacheSet(fileId, data, fileSize, fileName) {
    try {
        await enforceSizeLimit(fileSize || 0);

        var db = await getDB();
        return new Promise(function (resolve) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            var store = tx.objectStore(STORE_NAME);

            // ✅ TXT는 이미 문자열, ZIP/EPUB은 Uint8Array
            var storedData = (typeof data === 'string') ? data : data;

            store.put({
                id: fileId,
                data: storedData,
                size: fileSize || 0,
                fileName: fileName || '',
                lastAccess: Date.now(),
                created: Date.now()
            });

            tx.oncomplete = function () {
                console.log('💾 Cached:', fileName || fileId, '(' + formatSize(fileSize || 0) + ')');
                resolve();
            };
            tx.onerror = function () { resolve(); };
        });
    } catch (e) {
        console.warn('Cache set failed:', e);
    }
}

async function enforceSizeLimit(newItemSize) {
    try {
        var db = await getDB();

        return new Promise(function (resolve) {
            var tx = db.transaction(STORE_NAME, 'readonly');
            var store = tx.objectStore(STORE_NAME);
            var entries = [];
            var totalSize = 0;

            var cursor = store.openCursor();
            cursor.onsuccess = function (e) {
                var c = e.target.result;
                if (c) {
                    entries.push({
                        id: c.value.id,
                        size: c.value.size || 0,
                        lastAccess: c.value.lastAccess || 0
                    });
                    totalSize += c.value.size || 0;
                    c.continue();
                } else {
                    if (totalSize + newItemSize <= MAX_SIZE) {
                        resolve();
                        return;
                    }

                    entries.sort(function (a, b) { return a.lastAccess - b.lastAccess; });

                    var delTx = db.transaction(STORE_NAME, 'readwrite');
                    var delStore = delTx.objectStore(STORE_NAME);
                    var freed = 0;

                    for (var i = 0; i < entries.length; i++) {
                        if (totalSize + newItemSize - freed <= MAX_SIZE) break;
                        delStore.delete(entries[i].id);
                        freed += entries[i].size;
                    }

                    delTx.oncomplete = function () {
                        if (freed > 0) console.log('🗑️ Cache freed:', formatSize(freed));
                        resolve();
                    };
                    delTx.onerror = function () { resolve(); };
                }
            };
            cursor.onerror = function () { resolve(); };
        });
    } catch (e) {
        console.warn('Cache limit check failed:', e);
    }
}

export async function cacheClear() {
    try {
        var db = await getDB();
        return new Promise(function (resolve) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
            tx.oncomplete = function () {
                console.log('🗑️ Cache cleared');
                resolve();
            };
            tx.onerror = function () { resolve(); };
        });
    } catch (e) {
        console.warn('Cache clear failed:', e);
    }
}

export async function cacheGetInfo() {
    try {
        var db = await getDB();
        return new Promise(function (resolve) {
            var tx = db.transaction(STORE_NAME, 'readonly');
            var store = tx.objectStore(STORE_NAME);
            var total = 0;
            var count = 0;

            var cursor = store.openCursor();
            cursor.onsuccess = function (e) {
                var c = e.target.result;
                if (c) {
                    total += c.value.size || 0;
                    count++;
                    c.continue();
                } else {
                    resolve({ size: total, count: count, maxSize: MAX_SIZE });
                }
            };
            cursor.onerror = function () {
                resolve({ size: 0, count: 0, maxSize: MAX_SIZE });
            };
        });
    } catch (e) {
        return { size: 0, count: 0, maxSize: MAX_SIZE };
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

window.clearViewerCache = cacheClear;
window.getViewerCacheInfo = cacheGetInfo;

console.log('✅ Cache module loaded');
