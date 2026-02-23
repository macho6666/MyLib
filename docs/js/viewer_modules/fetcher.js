import { cachedFileId, cachedBytes, setCachedData } from './state.js';
import { formatSize } from './utils.js';

/**
 * HTML 특수문자 이스케이프
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 파일을 다운로드하고 처리합니다.
 * 
 * [Adaptive Strategy]
 * 1. TXT File: Direct Text Mode
 * 2. Small File (< 26MB): Single Fetch
 * 3. Large File (>= 26MB): Concurrent Chunk Fetch
 * 
 * @param {string} fileId - 파일 ID
 * @param {number} totalSize - 파일 전체 크기 (bytes)
 * @param {Function} onProgress - 진행률 콜백
 * @param {string} fileName - 파일명 (TXT 감지용)
 * @returns {Promise<Object>} 결과 객체
 */
export async function fetchAndUnzip(fileId, totalSize, onProgress, fileName = '') {
    let combinedBytes = null;
    const SAFE_THRESHOLD = 26 * 1024 * 1024; // 26MB
    const lowerName = (fileName || '').toLowerCase();

    // ✨ TXT 파일 처리
    if (lowerName.endsWith('.txt')) {
        console.log("📄 TXT File Detected - Direct Text Mode");
        
        if (onProgress) onProgress('텍스트 다운로드 중...');
        
        try {
            const response = await API.request('view_get_chunk', {
                fileId: fileId,
                offset: 0,
                length: totalSize || 10 * 1024 * 1024
            });
            
            if (response && response.data) {
                const binaryString = atob(response.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const textContent = new TextDecoder('utf-8').decode(bytes);
                
                const htmlContent = `<pre style="white-space: pre-wrap; word-wrap: break-word; font-family: 'Noto Sans KR', sans-serif; font-size: 16px; line-height: 1.8; padding: 20px;">${escapeHtml(textContent)}</pre>`;
                
                return { type: 'epub_legacy', content: htmlContent };
            } else {
                throw new Error("Empty Response");
            }
        } catch (e) {
            throw new Error("TXT 파일 로드 실패: " + e.message);
        }
    }

    // ✨ PDF 파일은 Google Drive로 열기
    if (lowerName.endsWith('.pdf')) {
        console.log("📕 PDF File Detected - Opening in Google Drive");
        window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank');
        return { type: 'external', message: 'PDF opened in new tab' };
    }

    // Check Reuse Cache
    if (cachedFileId === fileId && cachedBytes) {
        console.log("♻️ Using cached data for re-render");
        combinedBytes = cachedBytes;
    } else {
        // Clear old cache
        setCachedData(null, null);

        if (totalSize > 0 && totalSize < SAFE_THRESHOLD) {
            // [Mode A] Single Fetch
            console.log(`📉 Small File detected (${formatSize(totalSize)}). using Single Fetch.`);
            if (onProgress) onProgress(`다운로드 중... (0%)`);
            
            try {
                const response = await API.request('view_get_chunk', {
                    fileId: fileId,
                    offset: 0,
                    length: totalSize 
                });
                if (response && response.data) {
                    const binaryString = atob(response.data);
                    const len = binaryString.length;
                    combinedBytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) combinedBytes[i] = binaryString.charCodeAt(i);
                    if (onProgress) onProgress(`다운로드 완료 (100%)`);
                } else {
                    throw new Error("Empty Response");
                }
            } catch (e) {
                console.warn("Single Fetch failed, falling back to Chunk mode", e);
                throw new Error("다운로드 실패: " + e.message);
            }

        } else {
            // [Mode B] Concurrent Chunk Fetch
            console.log(`📈 Large File detected (${formatSize(totalSize)}). using Concurrent Chunk Fetch.`);
            
            const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
            
            if (totalSize === 0) {
                return fetchAndUnzipSequentialFallback(fileId, onProgress);
            }

            const chunkCount = Math.ceil(totalSize / CHUNK_SIZE);
            const tasks = [];
            
            for (let i = 0; i < chunkCount; i++) {
                tasks.push({ index: i, start: i * CHUNK_SIZE, length: CHUNK_SIZE });
            }

            let completed = 0;
            const results = new Array(chunkCount); 

            const CONCURRENCY = 3;
            
            const worker = async () => {
                while (tasks.length > 0) {
                    const task = tasks.shift();
                    const currentOffset = task.start;
                    
                    let retries = 3;
                    while(retries > 0) {
                        try {
                            const response = await API.request('view_get_chunk', {
                                fileId: fileId,
                                offset: currentOffset,
                                length: task.length
                            });
                            
                            if (!response) throw new Error("No response");
                            
                            const binaryString = atob(response.data);
                            const len = binaryString.length;
                            const bytes = new Uint8Array(len);
                            for (let k = 0; k < len; k++) bytes[k] = binaryString.charCodeAt(k);
                            
                            results[task.index] = bytes;
                            completed++;

                            if (onProgress) {
                                const percent = Math.round((completed / chunkCount) * 100);
                                onProgress(`다운로드 중... (${percent}%)`);
                            }
                            break;
                        } catch (e) {
                            console.warn(`Chunk ${task.index} failed, retrying...`, e);
                            retries--;
                            if (retries === 0) throw e;
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                }
            };

            const workers = [];
            for(let k=0; k<CONCURRENCY; k++) workers.push(worker());
            await Promise.all(workers);

            if (onProgress) onProgress('병합 중...');
            let totalLen = 0;
            results.forEach(r => totalLen += r.length);
            combinedBytes = new Uint8Array(totalLen);
            let pos = 0;
            results.forEach(r => {
                combinedBytes.set(r, pos);
                pos += r.length;
            });
        }
    }

    // Update Cache
    if (combinedBytes) {
        setCachedData(fileId, combinedBytes);
    }

    if (onProgress) onProgress('압축 해제 중...');

    // Unzip
    if (typeof JSZip === 'undefined') throw new Error("JSZip 라이브러리가 없습니다.");
    const zip = await JSZip.loadAsync(combinedBytes);
    
    const files = Object.keys(zip.files).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Check for EPUB
    const isEpub = zip.file("OEBPS/content.opf") || zip.file("OPS/content.opf") || zip.file("mimetype");

    if (isEpub) {
        const imageFiles = files.filter(f => f.match(/\.(jpg|jpeg|png|webp|gif)$/i));
        const textFiles = files.filter(f => f.match(/\.(xhtml|html)$/i));

        if (imageFiles.length > 5 && imageFiles.length >= textFiles.length) {
            console.log("📘 Comic EPUB Detected -> Using Image Mode");
        } else {
            console.log(`📘 Text EPUB Detected (Using Built-in Viewer)`);
    
            let htmlContent = "";
            let targetFile = zip.file("OEBPS/Text/chapter.xhtml");
            if (!targetFile) {
                const htmlFiles = files.filter(f => f.match(/\.(xhtml|html)$/i));
                if (htmlFiles.length > 0) targetFile = zip.file(htmlFiles[0]);
            }
            if (targetFile) {
                htmlContent = await targetFile.async("string");
                return { type: 'epub_legacy', content: htmlContent };
            }
            throw new Error("EPUB 내에서 텍스트 파일을 찾을 수 없습니다.");
        }
    }

    const imageUrls = [];
    for (const filename of files) {
        if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            const blob = await zip.files[filename].async('blob');
            imageUrls.push(URL.createObjectURL(blob));
        }
    }
    return { type: 'images', images: imageUrls };
}

// Fallback for unknown size (Sequential)
export async function fetchAndUnzipSequentialFallback(fileId, onProgress) {
    const chunks = [];
    let offset = 0;
    let totalLength = 0;
    const CHUNK_SIZE = 10 * 1024 * 1024; 

    while (true) {
        const response = await API.request('view_get_chunk', {
            fileId: fileId,
            offset: offset,
            length: CHUNK_SIZE
        });

        if (!response) break;

        const binaryString = atob(response.data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        chunks.push(bytes);
        totalLength += len;
        offset = response.nextOffset;

        if (onProgress) {
            const percent = Math.round((offset / response.totalSize) * 100);
            onProgress(`다운로드 중... (${percent}%)`);
        }

        if (!response.hasMore) break;
    }
    
    const combinedBytes = new Uint8Array(totalLength);
    let position = 0;
    for (const chunk of chunks) {
        combinedBytes.set(chunk, position);
        position += chunk.length;
    }

    const zip = await JSZip.loadAsync(combinedBytes);
    const files = Object.keys(zip.files).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const imageUrls = [];
    for (const filename of files) {
        if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            const blob = await zip.files[filename].async('blob');
            imageUrls.push(URL.createObjectURL(blob));
        }
    }
    return { type: 'images', images: imageUrls };
}
