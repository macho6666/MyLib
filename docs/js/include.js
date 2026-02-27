/**
 * docs/js/include.js
 * 모든 뷰어 모듈 통합 로드
 */

// ===== Core =====
import './viewer_modules/core/state.js';
import './viewer_modules/core/events.js';
import './viewer_modules/core/utils.js';

// ===== Text Viewer =====
import './viewer_modules/text/text_state.js';
import './viewer_modules/text/text_theme.js';
import './viewer_modules/text/text_toc.js';
import './viewer_modules/text/text_bookmark.js';
import './viewer_modules/text/text_renderer.js';
import './viewer_modules/text/epub_renderer.js';
import './viewer_modules/text/text_navigation.js';
import './viewer_modules/text/text_controls.js';
import './viewer_modules/text/text_highlight.js';
import './viewer_modules/text/index.js';

// ===== Image Viewer =====
import './viewer_modules/image/image_state.js';
import './viewer_modules/image/image_renderer.js';
import './viewer_modules/image/image_navigation.js';
import './viewer_modules/image/image_controls.js';
import './viewer_modules/image/index.js';

// ===== Fetcher & Actions =====
import './viewer_modules/fetcher.js';
import './viewer_modules/actions.js';

// ===== Main Index =====
import './viewer_modules/index.js';

// ===== 기존 파일들 =====
import './api_client.js';
import './main.js';

console.log('✅ All Modules Loaded via include.js');
