/**
 * viewer_modules/fetcher.js
 * 파일 다운로드 + 압축 해제 (TXT/EPUB/CBZ/PDF)
 * ✅ 직접 다운로드 + IndexedDB 캐싱
 */

import { showToast } from './core/utils.js';
import { cacheGet, cacheSet } from './cache.js';

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 파일 다운로드 및 처리
 */
export async function fetchAndUnzip(fileId, totalSize, onProgress, fileName) {
    fileName = fileName || '';
    var lowerName = fileName.toLowerCase();

    // PDF → 외부 열기
    if (lowerName.endsWith('.pdf')) {
        console.log('📕 PDF File Detected');
        window.open('https://drive.google.com/file/d/' + fileId + '/view', '_blank');
        return { type: 'external', message: 'PDF opened in new tab' };
    }

    // ═══════════════════════════════════════
    // ✅ 캐시 확인
    // ═══════════════════════════════════════
    var cached = await cacheGet(fileId);
    if (cached) {
        console.log('⚡ Cache hit:', fileName, '(' + formatSize(cached.size) + ')');
        if (onProgress) onProgress('캐시에서 로드 중...');

        if (lowerName.endsWith('.txt')) {
            return { type: 'text', content: cached.data };
        } else {
            return processZipBytes(cached.data, onProgress);
        }
    }

    // ═══════════════════════════════════════
    // 🚀 직접 다운로드 URL 방식
    // ═══════════════════════════════════════
    console.log('🌐 Requesting direct download URL...');
    if (onProgress) onProgress('다운로드 준비 중...');

    var urlInfo;
    try {
        var urlResponse = await API.request('view_get_direct_url', { fileId: fileId });
        urlInfo = urlResponse.body;
        console.log('✅ Direct URL received:', urlInfo.url.substring(0, 60) + '...');
    } catch (e) {
        console.error('❌ Direct URL error:', e.message, e);  // ← 이걸로 변경
        console.error('❌ Failed to get direct URL, falling back to chunked method');
        return fallbackChunkedDownload(fileId, totalSize, onProgress, fileName, lowerName);
    }

    // fetch로 직접 다운로드
    var bytes;
    try {
        bytes = await downloadDirect(urlInfo.url, urlInfo.size, onProgress);
    } catch (e) {
        console.error('❌ Direct download failed, falling back to chunked method');
        return fallbackChunkedDownload(fileId, totalSize, onProgress, fileName, lowerName);
    }

    // ✅ 캐시 저장 (백그라운드)
    if (lowerName.endsWith('.txt')) {
        var textContent = new TextDecoder('utf-8').decode(bytes);
        cacheSet(fileId, textContent, bytes.length, fileName).catch(function () {});
        return { type: 'text', content: textContent };
    } else {
        cacheSet(fileId, bytes, bytes.length, fileName).catch(function () {});
        return processZipBytes(bytes, onProgress);
    }
}

/**
 * 직접 다운로드 (fetch + 프로그레스)
 */
// downloadDirect() 개선
async function downloadDirect(url, totalSize, onProgress) {
    var response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);

    var reader = response.body.getReader();
    var chunks = [];
    var receivedLength = 0;

    while (true) {
        var result = await reader.read();
        if (result.done) break;

        chunks.push(result.value);
        receivedLength += result.value.length;

        if (totalSize && onProgress) {
            var percent = Math.round((receivedLength / totalSize) * 100);
            onProgress('다운로드 중... (' + percent + '%)');  // ✅ 정확한 형식
        }
    }

    if (onProgress) onProgress('병합 중...');

    var allChunks = new Uint8Array(receivedLength);
    var position = 0;
    for (var chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
    }

    return allChunks;
}

/**
 * Fallback: 기존 청크 방식
 */
async function fallbackChunkedDownload(fileId, totalSize, onProgress, fileName, lowerName) {
    // TXT
    if (lowerName.endsWith('.txt')) {
        console.log('📄 TXT (Fallback)');
        if (onProgress) onProgress('텍스트 다운로드 중...');

        try {
            var response = await API.request('view_get_chunk', {
                fileId: fileId,
                offset: 0,
                length: totalSize || 10 * 1024 * 1024
            });

            if (response && response.data) {
                var binaryString = atob(response.data);
                var bytes = new Uint8Array(binaryString.length);
                for (var i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                var textContent = new TextDecoder('utf-8').decode(bytes);

                cacheSet(fileId, textContent, totalSize, fileName).catch(function () {});

                return { type: 'text', content: textContent };
            } else {
                throw new Error('Empty Response');
            }
        } catch (e) {
            throw new Error('TXT 파일 로드 실패: ' + e.message);
        }
    }

    // ZIP/EPUB/CBZ
    var combinedBytes = await downloadBytesChunked(fileId, totalSize, onProgress);
    cacheSet(fileId, combinedBytes, totalSize, fileName).catch(function () {});
    return processZipBytes(combinedBytes, onProgress);
}

/**
 * 청크 다운로드 (base64 방식)
 */
async function downloadBytesChunked(fileId, totalSize, onProgress) {
    var SAFE_THRESHOLD = 26 * 1024 * 1024;
    var combinedBytes;

    if (totalSize > 0 && totalSize < SAFE_THRESHOLD) {
        // Single
        console.log('📉 Small File (' + formatSize(totalSize) + ')');
        if (onProgress) onProgress('다운로드 중... (0%)');

        try {
            var response = await API.request('view_get_chunk', {
                fileId: fileId,
                offset: 0,
                length: totalSize
            });
            if (response && response.data) {
                var binaryString = atob(response.data);
                var len = binaryString.length;
                combinedBytes = new Uint8Array(len);
                for (var i = 0; i < len; i++) {
                    combinedBytes[i] = binaryString.charCodeAt(i);
                }
                if (onProgress) onProgress('다운로드 완료 (100%)');
            } else {
                throw new Error('Empty Response');
            }
        } catch (e) {
            throw new Error('다운로드 실패: ' + e.message);
        }
    } else {
        // Chunked
        console.log('📈 Large File (' + formatSize(totalSize) + ')');

        var CHUNK_SIZE = 10 * 1024 * 1024;

        if (totalSize === 0) {
            throw new Error('파일 크기를 알 수 없습니다');
        }

        var chunkCount = Math.ceil(totalSize / CHUNK_SIZE);
        var tasks = [];

        for (var j = 0; j < chunkCount; j++) {
            tasks.push({ index: j, start: j * CHUNK_SIZE, length: CHUNK_SIZE });
        }

        var completed = 0;
        var results = new Array(chunkCount);
        var CONCURRENCY = 3;

        var worker = async function () {
            while (tasks.length > 0) {
                var task = tasks.shift();
                var retries = 3;

                while (retries > 0) {
                    try {
                        var resp = await API.request('view_get_chunk', {
                            fileId: fileId,
                            offset: task.start,
                            length: task.length
                        });

                        if (!resp) throw new Error('No response');

                        var bin = atob(resp.data);
                        var bLen = bin.length;
                        var bBytes = new Uint8Array(bLen);
                        for (var k = 0; k < bLen; k++) {
                            bBytes[k] = bin.charCodeAt(k);
                        }

                        results[task.index] = bBytes;
                        completed++;

                        if (onProgress) {
                            var percent = Math.round((completed / chunkCount) * 100);
                            onProgress('다운로드 중... (' + percent + '%)');
                        }
                        break;
                    } catch (e) {
                        retries--;
                        if (retries === 0) throw e;
                        await new Promise(function (r) { setTimeout(r, 1000); });
                    }
                }
            }
        };

        var workers = [];
        for (var w = 0; w < CONCURRENCY; w++) {
            workers.push(worker());
        }
        await Promise.all(workers);

        if (onProgress) onProgress('병합 중...');
        var totalLen = 0;
        results.forEach(function (r) { totalLen += r.length; });
        combinedBytes = new Uint8Array(totalLen);
        var pos = 0;
        results.forEach(function (r) {
            combinedBytes.set(r, pos);
            pos += r.length;
        });
    }

    return combinedBytes;
}

/**
 * ZIP 바이트 → EPUB/CBZ 분기
 */
async function processZipBytes(bytes, onProgress) {
    if (onProgress) onProgress('압축 해제 중...');

    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip 라이브러리가 없습니다');
    }

    var zip = await JSZip.loadAsync(bytes);

    var files = Object.keys(zip.files).sort(function (a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    // EPUB
    var isEpub = zip.file('OEBPS/content.opf') ||
                 zip.file('OPS/content.opf') ||
                 zip.file('mimetype');

    if (isEpub) {
        console.log('📘 EPUB Detected');
        var blobData = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        return {
            type: 'epub',
            zip: zip,
            blob: new Blob([blobData], { type: 'application/epub+zip' })
        };
    }

    // CBZ
    var imageUrls = [];
    for (var i = 0; i < files.length; i++) {
        var filename = files[i];
        if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            var blob = await zip.files[filename].async('blob');
            imageUrls.push(URL.createObjectURL(blob));
        }
    }

    if (imageUrls.length > 0) {
        return { type: 'images', images: imageUrls };
    }

    throw new Error('지원되지 않는 파일 형식입니다');
}

console.log('✅ Fetcher loaded');
