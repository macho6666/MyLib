/**
 * viewer_modules/text/epub_parser.js
 * EPUB 파일 파싱 (JSZip 기반)
 */

/**
 * EPUB 파싱 메인 함수
 * @param {Blob} epubBlob - EPUB Blob
 * @returns {Promise<Object>} 파싱 결과
 */
export async function parseEpub(epubBlob) {
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip 라이브러리가 없습니다');
    }

    const arrayBuffer = await epubBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. OPF 파일 경로 찾기
    const opfPath = await findOpfPath(zip);
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

    // 2. OPF 파싱 → 챕터 순서, 매니페스트
    const { spine, manifest, metadata } = await parseOpf(zip, opfPath);

    // 3. 목차 파싱 (NCX 또는 NAV)
    const toc = await parseToc(zip, opfDir, manifest);

    // 4. 챕터 HTML 추출 + 이미지 base64 변환
    const chapters = await extractChapters(zip, opfDir, spine, manifest);

    return {
        metadata,
        toc,
        chapters,
        opfDir
    };
}

/**
 * OPF 파일 경로 찾기 (container.xml 파싱)
 */
async function findOpfPath(zip) {
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) {
        throw new Error('META-INF/container.xml 없음');
    }

    const containerXml = await containerFile.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(containerXml, 'application/xml');
    const rootfile = doc.querySelector('rootfile');

    if (!rootfile) {
        throw new Error('rootfile 찾기 실패');
    }

    return rootfile.getAttribute('full-path');
}

/**
 * OPF 파일 파싱
 */
async function parseOpf(zip, opfPath) {
    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error('OPF 파일 없음: ' + opfPath);

    const opfXml = await opfFile.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(opfXml, 'application/xml');

    // 메타데이터
    const metadata = {
        title: getXmlText(doc, 'dc\\:title, title') || '',
        author: getXmlText(doc, 'dc\\:creator, creator') || '',
        language: getXmlText(doc, 'dc\\:language, language') || '',
    };

    // 매니페스트 (id → href, media-type 매핑)
    const manifest = {};
    doc.querySelectorAll('manifest item').forEach(function(item) {
        manifest[item.getAttribute('id')] = {
            href: item.getAttribute('href'),
            mediaType: item.getAttribute('media-type')
        };
    });

    // 스파인 (읽기 순서)
    const spine = [];
    doc.querySelectorAll('spine itemref').forEach(function(itemref) {
        const idref = itemref.getAttribute('idref');
        if (manifest[idref]) {
            spine.push({
                id: idref,
                href: manifest[idref].href,
                mediaType: manifest[idref].mediaType
            });
        }
    });

    return { spine, manifest, metadata };
}

/**
 * 목차 파싱 (NAV 또는 NCX)
 */
async function parseToc(zip, opfDir, manifest) {
    // NAV 파일 먼저 시도 (EPUB3)
    const navItem = Object.values(manifest).find(function(item) {
        return item.mediaType === 'application/xhtml+xml' &&
               item.href.includes('nav');
    });

    if (navItem) {
        const navFile = zip.file(opfDir + navItem.href);
        if (navFile) {
            return await parseNavToc(navFile);
        }
    }

    // NCX 파일 시도 (EPUB2)
    const ncxItem = Object.values(manifest).find(function(item) {
        return item.mediaType === 'application/x-dtbncx+xml';
    });

    if (ncxItem) {
        const ncxFile = zip.file(opfDir + ncxItem.href);
        if (ncxFile) {
            return await parseNcxToc(ncxFile);
        }
    }

    return [];
}

/**
 * NAV 목차 파싱 (EPUB3)
 */
async function parseNavToc(navFile) {
    const navXml = await navFile.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(navXml, 'application/xhtml+xml');

    const toc = [];
    const navPoints = doc.querySelectorAll('nav[epub\\:type="toc"] a, nav a');

    navPoints.forEach(function(a) {
        const href = a.getAttribute('href') || '';
        const text = a.textContent.trim();
        if (text && href) {
            toc.push({
                label: text,
                href: href.split('#')[0],
                anchor: href.includes('#') ? href.split('#')[1] : null
            });
        }
    });

    return toc;
}

/**
 * NCX 목차 파싱 (EPUB2)
 */
async function parseNcxToc(ncxFile) {
    const ncxXml = await ncxFile.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(ncxXml, 'application/xml');

    const toc = [];
    doc.querySelectorAll('navPoint').forEach(function(navPoint) {
        const label = navPoint.querySelector('navLabel text');
        const content = navPoint.querySelector('content');

        if (label && content) {
            const src = content.getAttribute('src') || '';
            toc.push({
                label: label.textContent.trim(),
                href: src.split('#')[0],
                anchor: src.includes('#') ? src.split('#')[1] : null
            });
        }
    });

    return toc;
}

/**
 * 챕터 HTML 추출 + 이미지 base64 변환
 */
async function extractChapters(zip, opfDir, spine, manifest) {
    const chapters = [];

    // 이미지 캐시
    const imageCache = {};

    // 이미지 먼저 base64 변환
    for (const id in manifest) {
        const item = manifest[id];
        if (item.mediaType && item.mediaType.startsWith('image/')) {
            const imgFile = zip.file(opfDir + item.href);
            if (imgFile) {
                try {
                    const base64 = await imgFile.async('base64');
                    imageCache[item.href] = 'data:' + item.mediaType + ';base64,' + base64;
                } catch (e) {
                    console.warn('Image load failed:', item.href);
                }
            }
        }
    }

    // 챕터 순서대로 HTML 추출
    for (const spineItem of spine) {
        const filePath = opfDir + spineItem.href;
        const file = zip.file(filePath);

        if (!file) {
            console.warn('Chapter file not found:', filePath);
            continue;
        }

        try {
            const html = await file.async('string');
            const content = parseChapterHtml(html, spineItem.href, imageCache, opfDir);

            chapters.push({
                id: spineItem.id,
                href: spineItem.href,
                content: content.html,
                css: content.css,
                title: content.title
            });
        } catch (e) {
            console.warn('Chapter parse failed:', spineItem.href, e);
        }
    }

    return chapters;
}

/**
 * 챕터 HTML 파싱
 */
function parseChapterHtml(html, href, imageCache, opfDir) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'application/xhtml+xml');

    // CSS 추출
    const cssTexts = [];
    doc.querySelectorAll('style').forEach(function(style) {
        cssTexts.push(style.textContent);
    });

    // 제목 추출
    const title = doc.querySelector('title') ?
                  doc.querySelector('title').textContent.trim() : '';

    // body 내용 추출
    const body = doc.querySelector('body');
    if (!body) return { html: '', css: cssTexts.join('\n'), title };

    // 이미지 src 교체 (상대경로 → base64)
    body.querySelectorAll('img').forEach(function(img) {
        const src = img.getAttribute('src') || '';
        // 상대경로 정규화
        const normalizedSrc = normalizePath(href, src);
        if (imageCache[normalizedSrc]) {
            img.setAttribute('src', imageCache[normalizedSrc]);
        }
    });

    // 배경색/글자색/폰트크기/줄간격 관련 인라인 스타일 처리
    body.querySelectorAll('[style]').forEach(function(el) {
        const style = el.getAttribute('style');
        el.setAttribute('data-epub-style', style);
    });

    return {
        html: body.innerHTML,
        css: cssTexts.join('\n'),
        title
    };
}

/**
 * 상대경로 정규화
 */
function normalizePath(basePath, relativePath) {
    if (relativePath.startsWith('http') || relativePath.startsWith('data:')) {
        return relativePath;
    }

    const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1);
    const combined = baseDir + relativePath;

    // ../ 처리
    const parts = combined.split('/');
    const resolved = [];
    for (const part of parts) {
        if (part === '..') {
            resolved.pop();
        } else if (part !== '.') {
            resolved.push(part);
        }
    }

    return resolved.join('/');
}

/**
 * XML/HTML에서 텍스트 추출
 */
function getXmlText(doc, selector) {
    const el = doc.querySelector(selector);
    return el ? el.textContent.trim() : '';
}

console.log('✅ EPUB Parser loaded');
