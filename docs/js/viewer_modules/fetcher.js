/**
 * 파일 다운로드 및 처리 (메인 진입점)
 */
export async function fetchAndUnzip(fileId, totalSize, onProgress, fileName) {
    const startTime = performance.now();
    console.log('⏱️ [START] fetchAndUnzip');
    
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
    const cacheCheckStart = performance.now();
    console.log('🔍 Checking cache for:', fileId);
    var cached = await cacheGet(fileId);
    const cacheCheckTime = performance.now() - cacheCheckStart;
    console.log(`⏱️ [CACHE CHECK] ${cacheCheckTime.toFixed(2)}ms`);
    
    if (cached) {
        console.log('⚡ Cache hit:', fileName, '(' + formatSize(cached.size) + ')');
        
        // TXT: 캐시는 이미 문자열
        if (lowerName.endsWith('.txt')) {
            if (onProgress) onProgress('캐시 로드 완료 (100%)');
            const totalTime = performance.now() - startTime;
            console.log(`✅ [TOTAL TXT CACHE] ${totalTime.toFixed(2)}ms`);
            return { type: 'text', content: cached.data };
        } 
        // ZIP: 캐시된 바이트 처리
        else {
            if (onProgress) onProgress('파일 처리 중... (0%)');
            
            const processStart = performance.now();
            var result = await processZipBytesWithProgress(cached.data, onProgress, true);
            const processTime = performance.now() - processStart;
            console.log(`⏱️ [ZIP PROCESS] ${processTime.toFixed(2)}ms`);
            
            if (onProgress) onProgress('준비 완료 (100%)');
            const totalTime = performance.now() - startTime;
            console.log(`✅ [TOTAL ZIP CACHE] ${totalTime.toFixed(2)}ms`);
            return result;
        }
    }

    // ═══════════════════════════════════════
    // 🚀 직접 다운로드 URL 방식
    // ═══════════════════════════════════════
    console.log('🌐 Requesting direct download URL...');
    if (onProgress) onProgress('다운로드 준비 중... (0%)');

    var urlInfo;
    try {
        const urlStart = performance.now();
        var urlResponse = await API.request('view_get_direct_url', { fileId: fileId });
        const urlTime = performance.now() - urlStart;
        console.log(`⏱️ [GET URL] ${urlTime.toFixed(2)}ms`);
        
        urlInfo = urlResponse.body;
        console.log('✅ Direct URL received');
    } catch (e) {
        console.error('❌ Direct URL error:', e.message);
        return fallbackChunkedDownload(fileId, totalSize, onProgress, fileName, lowerName);
    }

    // fetch로 직접 다운로드
    var bytes;
    try {
        const downloadStart = performance.now();
        bytes = await downloadDirect(urlInfo.url, urlInfo.size || totalSize, onProgress);
        const downloadTime = performance.now() - downloadStart;
        console.log(`⏱️ [DOWNLOAD] ${downloadTime.toFixed(2)}ms (${formatSize(bytes.length)})`);
    } catch (e) {
        console.error('❌ Direct download failed:', e.message);
        return fallbackChunkedDownload(fileId, totalSize, onProgress, fileName, lowerName);
    }

    // ═══════════════════════════════════════
    // 💾 캐시 저장 + 처리
    // ═══════════════════════════════════════
    
    if (lowerName.endsWith('.txt')) {
        if (onProgress) onProgress('텍스트 변환 중... (90%)');
        
        const decodeStart = performance.now();
        var textContent = new TextDecoder('utf-8').decode(bytes);
        const decodeTime = performance.now() - decodeStart;
        console.log(`⏱️ [DECODE TEXT] ${decodeTime.toFixed(2)}ms`);
        
        // 백그라운드 캐시 저장 (비동기)
        cacheSet(fileId, textContent, bytes.length, fileName).catch(function (e) {
            console.warn('Cache save failed:', e);
        });
        
        if (onProgress) onProgress('준비 완료 (100%)');
        const totalTime = performance.now() - startTime;
        console.log(`✅ [TOTAL TXT NEW] ${totalTime.toFixed(2)}ms`);
        return { type: 'text', content: textContent };
    } 
    else {
        if (onProgress) onProgress('파일 처리 중... (85%)');
        
        // 백그라운드 캐시 저장
        cacheSet(fileId, bytes, bytes.length, fileName).catch(function (e) {
            console.warn('Cache save failed:', e);
        });
        
        const processStart = performance.now();
        var result = await processZipBytesWithProgress(bytes, onProgress, false);
        const processTime = performance.now() - processStart;
        console.log(`⏱️ [ZIP PROCESS] ${processTime.toFixed(2)}ms`);
        
        if (onProgress) onProgress('준비 완료 (100%)');
        const totalTime = performance.now() - startTime;
        console.log(`✅ [TOTAL ZIP NEW] ${totalTime.toFixed(2)}ms`);
        return result;
    }
}
