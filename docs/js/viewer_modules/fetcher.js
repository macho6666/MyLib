/**
 * viewer_modules/fetcher.js
 * 파일 다운로드 + 압축 해제 (TXT/EPUB/CBZ/PDF)
 * ✅ Bridge 우선 다운로드 (CORS 우회) + 캐시 + 프로그레스
 * ✅ 설정 인코딩 우선 → 캐시 인코딩 비교 → 재디코딩
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
 * 현재 설정된 인코딩 읽기
 */
function getSelectedEncoding() {
    return localStorage.getItem('text_encoding') || 'utf-8';
}

/**
 * 지정된 인코딩으로 디코딩
 */
function decodeWithEncoding(bytes, encoding) {
    // BOM 제거
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        bytes = bytes.slice(3);
    } else if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        bytes = bytes.slice(2);
        if (encoding === 'utf-8') encoding = 'utf-16le'; // BOM이 UTF-16 LE인데 설정이 UTF-8이면 보정
    } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        bytes = bytes.slice(2);
        if (encoding === 'utf-8') encoding = 'utf-16be';
    }

    try {
        return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch (e) {
        console.warn('Decode failed with', encoding, '→ fallback to UTF-8');
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
}

/**
 * 파일 다운로드 및 처리 (메인 진입점)
 */
export async function fetchAndUnzip(fileId, totalSize, onProgress, fileName) {
    console.time('⏱️ 전체 로딩');
    var startTime = performance.now();

    fileName = fileName || '';
    var lowerName = fileName.toLowerCase();

    // PDF → 외부 열기
    if (lowerName.endsWith('.pdf')) {
        window.open('https://drive.google.com/file/d/' + fileId + '/view', '_blank');
        return { type: 'external', message: 'PDF opened in new tab' };
    }

    var isTxt = lowerName.endsWith('.txt');
    var currentEncoding = getSelectedEncoding();

    // ═══════════════════════════════════════
    // ✅ 캐시 확인
    // ═══════════════════════════════════════
    console.time('1️⃣ 캐시 읽기');
    var cached = await cacheGet(fileId);
    console.timeEnd('1️⃣ 캐시 읽기');

    if (cached) {
        if (isTxt) {
            var cachedEncoding = cached.encoding || 'utf-8';

            // 인코딩 같으면 바로 반환
            if (cachedEncoding === currentEncoding) {
                if (onProgress) onProgress('캐시 로드 완료 (100%)');
                console.timeEnd('⏱️ 전체 로딩');
                console.log('✅ 캐시 히트 (인코딩 동일)');
                return { type: 'text', content: cached.data };
            }

            // 인코딩 다르면 rawBytes로 재디코딩
            if (cached.rawBytes) {
                if (onProgress) onProgress('인코딩 변환 중... (50%)');

                console.time('2️⃣ rawBytes 변환');
                var rawBytes = cached.rawBytes instanceof Uint8Array
                    ? cached.rawBytes
                    : new Uint8Array(cached.rawBytes);
                console.timeEnd('2️⃣ rawBytes 변환');

                console.time('3️⃣ 재디코딩');
                var reDecoded = decodeWithEncoding(rawBytes, currentEncoding);
                console.timeEnd('3️⃣ 재디코딩');

                console.time('4️⃣ 캐시 덮어쓰기');
                cacheSet(fileId, reDecoded, cached.size, cached.fileName, currentEncoding, rawBytes).catch(function () {});
                console.timeEnd('4️⃣ 캐시 덮어쓰기');

                if (onProgress) onProgress('준비 완료 (100%)');
                console.timeEnd('⏱️ 전체 로딩');
                return { type: 'text', content: reDecoded };
            }

            console.log('⚠️ No rawBytes in cache, re-downloading...');
        } else {
            // ZIP/EPUB/CBZ
            if (onProgress) onProgress('파일 처리 중... (0%)');
            console.time('2️⃣ ZIP 처리');
            var result = await processZipBytesWithProgress(cached.data, onProgress, true);
            console.timeEnd('2️⃣ ZIP 처리');
            if (onProgress) onProgress('준비 완료 (100%)');
            console.timeEnd('⏱️ 전체 로딩');
            return result;
        }
    }

    // ═══════════════════════════════════════
    // 🚀 다운로드 URL 생성 + Bridge 다운로드
    // ═══════════════════════════════════════
    if (onProgress) onProgress('다운로드 준비 중... (0%)');

    var downloadUrl = null;
    var downloadSize = totalSize;

    console.time('5️⃣ URL 받기');
    try {
        var urlResponse = await API.request('view_get_direct_url', { fileId: fileId });
        var urlInfo = urlResponse.body || urlResponse;

        if (urlInfo && urlInfo.url) {
            downloadUrl = urlInfo.url;
            downloadSize = urlInfo.size || totalSize;
        }
    } catch (e) {
        downloadUrl = 'https://drive.google.com/uc?export=download&id=' + fileId + '&confirm=t';
    }
    console.timeEnd('5️⃣ URL 받기');

    // 2단계: Bridge로 다운로드 (CORS 우회)
    var bytes = null;

    if (downloadUrl && window.mylibBridge && window.mylibBridge.isConnected) {
        try {
            if (onProgress) onProgress('다운로드 중... (0%)');

            var progressHandler = function (e) {
                var detail = e.detail;
                if (detail && detail.total > 0 && onProgress) {
                    var percent = Math.round((detail.loaded / detail.total) * 85);
                    onProgress('다운로드 중... (' + percent + '%)');
                }
            };
            window.addEventListener('MYLIB_BRIDGE_PROGRESS', progressHandler);

            console.time('6️⃣ Bridge 다운로드');
            var bridgeResult = await window.mylibBridge.fetch(downloadUrl, {
                responseType: 'arraybuffer'
            });
            console.timeEnd('6️⃣ Bridge 다운로드');

            window.removeEventListener('MYLIB_BRIDGE_PROGRESS', progressHandler);

            if (bridgeResult && bridgeResult.base64) {
                console.time('7️⃣ base64 → bytes');
                var binaryString = atob(bridgeResult.base64);
                bytes = new Uint8Array(binaryString.length);
                for (var i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                console.timeEnd('7️⃣ base64 → bytes');
                if (onProgress) onProgress('다운로드 완료 (85%)');
            } else {
                throw new Error('Bridge returned empty result');
            }
        } catch (e) {
            bytes = null;
        }
    }

    // 3단계: Bridge 실패 시 Fallback (GAS 청크)
    if (!bytes) {
        console.timeEnd('⏱️ 전체 로딩');
        return fallbackChunkedDownload(fileId, totalSize, onProgress, fileName, lowerName, startTime);
    }

    // ═══════════════════════════════════════
    // 💾 디코딩 + 캐시 저장
    // ═══════════════════════════════════════

    if (isTxt) {
        if (onProgress) onProgress('텍스트 변환 중... (90%)');

        console.time('8️⃣ 텍스트 디코딩');
        var textContent = decodeWithEncoding(bytes, currentEncoding);
        console.timeEnd('8️⃣ 텍스트 디코딩');

        console.time('9️⃣ 캐시 저장');
        cacheSet(fileId, textContent, bytes.length, fileName, currentEncoding, bytes).catch(function () {});
        console.timeEnd('9️⃣ 캐시 저장');

        if (onProgress) onProgress('준비 완료 (100%)');
        console.timeEnd('⏱️ 전체 로딩');
        return { type: 'text', content: textContent };
    } else {
        if (onProgress) onProgress('파일 처리 중... (85%)');

        console.time('8️⃣ 캐시 저장');
        cacheSet(fileId, bytes, bytes.length, fileName).catch(function () {});
        console.timeEnd('8️⃣ 캐시 저장');

        console.time('9️⃣ ZIP 처리');
        var zipResult = await processZipBytesWithProgress(bytes, onProgress, false);
        console.timeEnd('9️⃣ ZIP 처리');

        if (onProgress) onProgress('준비 완료 (100%)');
        console.timeEnd('⏱️ 전체 로딩');
        return zipResult;
    }
}
/**
 * Fallback: 기존 청크 방식
 */
async function fallbackChunkedDownload(fileId, totalSize, onProgress, fileName, lowerName, startTime) {
    var isTxt = lowerName.endsWith('.txt');
    var currentEncoding = getSelectedEncoding();

    // TXT
    if (isTxt) {
        if (onProgress) onProgress('텍스트 다운로드 중... (0%)');

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

                if (onProgress) onProgress('텍스트 변환 중... (90%)');

                var textContent = decodeWithEncoding(bytes, currentEncoding);

                cacheSet(fileId, textContent, totalSize, fileName, currentEncoding, bytes).catch(function () {});

                if (onProgress) onProgress('준비 완료 (100%)');
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

    var result = await processZipBytesWithProgress(combinedBytes, onProgress, false);
    if (onProgress) onProgress('준비 완료 (100%)');
    return result;
}

/**
 * 청크 다운로드 (base64 방식)
 */
async function downloadBytesChunked(fileId, totalSize, onProgress) {
    var SAFE_THRESHOLD = 26 * 1024 * 1024;
    var combinedBytes;

    if (totalSize > 0 && totalSize < SAFE_THRESHOLD) {
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
                if (onProgress) onProgress('다운로드 완료 (85%)');
            } else {
                throw new Error('Empty Response');
            }
        } catch (e) {
            throw new Error('다운로드 실패: ' + e.message);
        }
    } else {
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
                            var percent = Math.round((completed / chunkCount) * 85);
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

        if (onProgress) onProgress('병합 중... (85%)');
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
 * ZIP 바이트 처리 (프로그레스 포함)
 */
async function processZipBytesWithProgress(bytes, onProgress, fromCache) {
    if (onProgress) onProgress('압축 파일 로드 중... (10%)');

    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip 라이브러리가 없습니다');
    }

    var zip = await JSZip.loadAsync(bytes);
    if (onProgress) onProgress('파일 분석 중... (25%)');

    var files = Object.keys(zip.files).sort(function (a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    // EPUB 감지
    var isEpub = zip.file('OEBPS/content.opf') ||
        zip.file('OPS/content.opf') ||
        zip.file('mimetype');

    if (isEpub) {
        if (onProgress) onProgress('EPUB 준비 중... (50%)');

        var blobData = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

        return {
            type: 'epub',
            zip: zip,
            blob: new Blob([blobData], { type: 'application/epub+zip' })
        };
    }

    // CBZ (이미지) 감지
    if (onProgress) onProgress('이미지 추출 중... (30%)');

    var imageUrls = [];
    var processedCount = 0;

    for (var i = 0; i < files.length; i++) {
        var filename = files[i];
        if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            try {
                var blob = await zip.files[filename].async('blob');
                imageUrls.push(URL.createObjectURL(blob));

                processedCount++;
                var percent = 30 + Math.round((processedCount / files.length) * 55);
                if (onProgress) onProgress('이미지 추출 중... (' + percent + '%)');
            } catch (e) {}
        }
    }

    if (imageUrls.length > 0) {
        if (onProgress) onProgress('준비 완료 (100%)');
        return { type: 'images', images: imageUrls };
    }

    throw new Error('지원되지 않는 파일 형식입니다');
}

console.log('✅ Fetcher loaded (encoding support)');
