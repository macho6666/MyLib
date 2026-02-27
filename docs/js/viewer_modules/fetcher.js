/**
 * viewer_modules/fetcher.js
 * 파일 다운로드 + 압축 해제 (TXT/EPUB/CBZ/PDF)
 */

import { showToast } from './core/utils.js';

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
 * 파일 크기 포맷
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 파일 다운로드 및 처리
 * @param {string} fileId - Google Drive 파일 ID
 * @param {number} totalSize - 파일 크기 (bytes)
 * @param {Function} onProgress - 진행률 콜백
 * @param {string} fileName - 파일명
 * @returns {Promise<Object>} 결과 객체
 */
export async function fetchAndUnzip(fileId, totalSize, onProgress, fileName = '') {
    let combinedBytes = null;
    const SAFE_THRESHOLD = 26 * 1024 * 1024; // 26MB
    const lowerName = (fileName || '').toLowerCase();

    // ✨ TXT 파일 처리
    if (lowerName.endsWith('.txt')) {
        console.log("📄 TXT File Detected");
        
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
                
                return { 
                    type: 'text', 
                    content: textContent 
                };
            } else {
                throw new Error("Empty Response");
            }
        } catch (e) {
            throw new Error("TXT 파일 로드 실패: " + e.message);
        }
    }

    // ✨ PDF 파일은 Google Drive로 열기
    if (lowerName.endsWith('.pdf')) {
        console.log("📕 PDF File Detected");
        window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank');
        return { type: 'external', message: 'PDF opened in new tab' };
    }

    // 다운로드
    if (totalSize > 0 && totalSize < SAFE_THRESHOLD) {
        // Single Fetch
        console.log(`📉 Small File (${formatSize(totalSize)})`);
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
                for (let i = 0; i < len; i++) {
                    combinedBytes[i] = binaryString.charCodeAt(i);
                }
                if (onProgress) onProgress(`다운로드 완료 (100%)`);
            } else {
                throw new Error("Empty Response");
            }
        } catch (e) {
            throw new Error("다운로드 실패: " + e.message);
        }
    } else {
        // Chunk Fetch
        console.log(`📈 Large File (${formatSize(totalSize)})`);
        
        const CHUNK_SIZE = 10 * 1024 * 1024;
        
        if (totalSize === 0) {
            throw new Error("파일 크기를 알 수 없습니다");
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
                
                let retries = 3;
                while(retries > 0) {
                    try {
                        const response = await API.request('view_get_chunk', {
                            fileId: fileId,
                            offset: task.start,
                            length: task.length
                        });
                        
                        if (!response) throw new Error("No response");
                        
                        const binaryString = atob(response.data);
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let k = 0; k < len; k++) {
                            bytes[k] = binaryString.charCodeAt(k);
                        }
                        
                        results[task.index] = bytes;
                        completed++;

                        if (onProgress) {
                            const percent = Math.round((completed / chunkCount) * 100);
                            onProgress(`다운로드 중... (${percent}%)`);
                        }
                        break;
                    } catch (e) {
                        retries--;
                        if (retries === 0) throw e;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }
        };

        const workers = [];
        for(let k=0; k<CONCURRENCY; k++) {
            workers.push(worker());
        }
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

    if (onProgress) onProgress('압축 해제 중...');

    // Unzip
    if (typeof JSZip === 'undefined') {
        throw new Error("JSZip 라이브러리가 없습니다");
    }
    
    const zip = await JSZip.loadAsync(combinedBytes);
    
    const files = Object.keys(zip.files).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    // EPUB 체크
    const isEpub = zip.file("OEBPS/content.opf") || 
                   zip.file("OPS/content.opf") || 
                   zip.file("mimetype");

    if (isEpub) {
        console.log("📘 EPUB Detected");
        
        // EPUB Blob 반환
        const epubBlob = new Blob([combinedBytes], { type: 'application/epub+zip' });
        return { type: 'epub', blob: epubBlob };
    }

    // 이미지 추출 (CBZ/ZIP)
    const imageUrls = [];
    for (const filename of files) {
        if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            const blob = await zip.files[filename].async('blob');
            imageUrls.push(URL.createObjectURL(blob));
        }
    }
    
    if (imageUrls.length > 0) {
        return { type: 'images', images: imageUrls };
    }
    
    throw new Error("지원되지 않는 파일 형식입니다");
}

console.log('✅ Fetcher loaded');
