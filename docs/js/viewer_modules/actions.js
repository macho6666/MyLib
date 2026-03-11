/**
 * 뷰어 열기 (통합)
 */
export async function loadViewer(index, isContinuous = false) {
    const viewerStartTime = performance.now();
    console.log('⏱️ [VIEWER START] loadViewer');
    
    const book = currentBookList[index];
    if (!book) {
        showToast('책 정보를 찾을 수 없습니다');
        return;
    }
    
    updateCurrentBookIndex(index);
    showLoadingOverlay(true);
    
    try {
        console.log('📂 Loading:', book.name);
        
        // Fetcher 로드 및 파일 다운로드
        const fetcherStart = performance.now();
        const fetcher = await loadFetcher();
        const fetcherLoadTime = performance.now() - fetcherStart;
        console.log(`⏱️ [LOAD FETCHER] ${fetcherLoadTime.toFixed(2)}ms`);
        
        const fileStart = performance.now();
        const result = await fetcher.fetchAndUnzip(
            book.id,
            book.size || 0,
            (progress) => updateLoadingProgress(progress),
            book.name
        );
        const fileTime = performance.now() - fileStart;
        console.log(`⏱️ [FETCH FILE] ${fileTime.toFixed(2)}ms`);
        
        // 메타데이터 준비
        const metadata = {
            bookId: book.id,
            name: book.name,
            seriesId: book.seriesId,
            size: book.size,
            index: index
        };
        
        // 파일 타입에 따라 뷰어 선택
        if (result.type === 'text' || result.type === 'txt' || result.type === 'epub') {
            // 텍스트 뷰어 로드 및 열기
            const textViewerStart = performance.now();
            const textViewer = await loadTextViewer();
            const textViewerLoadTime = performance.now() - textViewerStart;
            console.log(`⏱️ [LOAD TEXT VIEWER] ${textViewerLoadTime.toFixed(2)}ms`);
            
            const openTextStart = performance.now();
            await textViewer.openTextViewer(result, metadata);
            const openTextTime = performance.now() - openTextStart;
            console.log(`⏱️ [OPEN TEXT VIEWER] ${openTextTime.toFixed(2)}ms`);
            
        } else if (result.type === 'images') {
            // 이미지 뷰어 로드 및 열기
            const imageViewerStart = performance.now();
            const imageViewer = await loadImageViewer();
            const imageViewerLoadTime = performance.now() - imageViewerStart;
            console.log(`⏱️ [LOAD IMAGE VIEWER] ${imageViewerLoadTime.toFixed(2)}ms`);
            
            const openImageStart = performance.now();
            await imageViewer.openImageViewer(result, metadata);
            const openImageTime = performance.now() - openImageStart;
            console.log(`⏱️ [OPEN IMAGE VIEWER] ${openImageTime.toFixed(2)}ms`);
            
        } else if (result.type === 'external') {
            console.log('📄 External file opened in new tab');
        } else {
            throw new Error('Unknown file type: ' + result.type);
        }
        
        showLoadingOverlay(false);
        
        const totalViewerTime = performance.now() - viewerStartTime;
        console.log(`✅ [TOTAL VIEWER TIME] ${totalViewerTime.toFixed(2)}ms`);
        
    } catch (e) {
        console.error('Viewer load failed:', e);
        showToast('로드 실패: ' + e.message, 3000);
        showLoadingOverlay(false);
    }
}
