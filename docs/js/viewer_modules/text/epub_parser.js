/**
 * viewer_modules/text/epub_parser.js
 * EPUB 파일 파싱 (JSZip 기반) - Lazy Loading 최적화
 */

export async function parseEpub(zip) {
    const opfPath = await findOpfPath(zip);
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

    const { spine, manifest, metadata } = await parseOpf(zip, opfPath);

    // ✅ 수정: TOC 파싱 시 opfDir 전달
    const toc = await parseToc(zip, opfDir, manifest);

    // ✅ 수정: 챕터 경로 정규화
    const chapterPaths = spine.map(function(item) {
        const fullPath = opfDir + item.href;
        return {
            id: item.id,
            href: fullPath,  // ✅ 전체 경로로 통일
            path: fullPath
        };
    });

    const imagePaths = {};
    for (const id in manifest) {
        const item = manifest[id];
        if (item.mediaType && item.mediaType.startsWith('image/')) {
            const fullPath = opfDir + item.href;
            imagePaths[fullPath] = {  // ✅ 키도 전체 경로
                path: fullPath,
                mediaType: item.mediaType
            };
        }
    }

    return {
        metadata,
        toc,
        chapterPaths,
        imagePaths,
        zip,
        opfDir
    };
}

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

async function parseOpf(zip, opfPath) {
    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error('OPF 파일 없음: ' + opfPath);

    const opfXml = await opfFile.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(opfXml, 'application/xml');

    const metadata = {
        title: getXmlText(doc, 'dc\\:title, title') || '',
        author: getXmlText(doc, 'dc\\:creator, creator') || '',
        language: getXmlText(doc, 'dc\\:language, language') || '',
    };

    const manifest = {};
    doc.querySelectorAll('manifest item').forEach(function(item) {
        manifest[item.getAttribute('id')] = {
            href: item.getAttribute('href'),
            mediaType: item.getAttribute('media-type')
        };
    });

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
 * ✅ 수정: TOC href도 전체 경로로 정규화
 */
async function parseToc(zip, opfDir, manifest) {
    const navItem = Object.values(manifest).find(function(item) {
        return item.mediaType === 'application/xhtml+xml' &&
               item.href.includes('nav');
    });

    if (navItem) {
        const navPath = opfDir + navItem.href;
        const navDir = navPath.substring(0, navPath.lastIndexOf('/') + 1);
        const navFile = zip.file(navPath);
        if (navFile) {
            return await parseNavToc(navFile, navDir);
        }
    }

    const ncxItem = Object.values(manifest).find(function(item) {
        return item.mediaType === 'application/x-dtbncx+xml';
    });

    if (ncxItem) {
        const ncxPath = opfDir + ncxItem.href;
        const ncxDir = ncxPath.substring(0, ncxPath.lastIndexOf('/') + 1);
        const ncxFile = zip.file(ncxPath);
        if (ncxFile) {
            return await parseNcxToc(ncxFile, ncxDir);
        }
    }

    return [];
}

/**
 * ✅ 수정: NAV 목차 - 전체 경로 반환
 */
async function parseNavToc(navFile, navDir) {
    const navXml = await navFile.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(navXml, 'application/xhtml+xml');

    const toc = [];
    const navEl = doc.querySelector('nav[epub\\:type="toc"], nav[role="doc-toc"], nav');
    
    if (navEl) {
        let navPoints = navEl.querySelectorAll('li > a');
        if (navPoints.length === 0) {
            navPoints = navEl.querySelectorAll('a');
        }
        
        navPoints.forEach(function(a) {
            const href = a.getAttribute('href') || '';
            const text = a.textContent.trim();
            if (text && href) {
                // ✅ 상대경로를 전체경로로 변환
                const fullHref = resolveHref(navDir, href.split('#')[0]);
                toc.push({
                    label: text,
                    href: fullHref,
                    anchor: href.includes('#') ? href.split('#')[1] : null
                });
            }
        });
    }

    return toc;
}

/**
 * ✅ 수정: NCX 목차 - 전체 경로 반환
 */
async function parseNcxToc(ncxFile, ncxDir) {
    const ncxXml = await ncxFile.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(ncxXml, 'application/xml');

    const toc = [];
    doc.querySelectorAll('navPoint').forEach(function(navPoint) {
        const label = navPoint.querySelector('navLabel text');
        const content = navPoint.querySelector('content');

        if (label && content) {
            const src = content.getAttribute('src') || '';
            // ✅ 상대경로를 전체경로로 변환
            const fullHref = resolveHref(ncxDir, src.split('#')[0]);
            toc.push({
                label: label.textContent.trim(),
                href: fullHref,
                anchor: src.includes('#') ? src.split('#')[1] : null
            });
        }
    });

    return toc;
}

/**
 * ✅ 새로 추가: 상대경로 → 절대경로 변환
 */
function resolveHref(baseDir, relativePath) {
    if (!relativePath) return '';
    if (relativePath.startsWith('/')) return relativePath.substring(1);
    
    const combined = baseDir + relativePath;
    const parts = combined.split('/');
    const resolved = [];
    
    for (const part of parts) {
        if (part === '..') {
            resolved.pop();
        } else if (part !== '.' && part !== '') {
            resolved.push(part);
        }
    }
    
    return resolved.join('/');
}

function getXmlText(doc, selector) {
    const el = doc.querySelector(selector);
    return el ? el.textContent.trim() : '';
}

console.log('✅ EPUB Parser loaded (Lazy mode)');
