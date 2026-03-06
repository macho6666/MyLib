/**
 * docs/js/include.js
 * 최소한만 로드 - 뷰어는 필요할 때 동적 로드
 */

import './api_client.js';
import './viewer_modules/core/utils.js';
import './viewer_modules/actions.js';
import './metadata_fetcher.js';  // ← ✅ 메타데이터
import './main.js';

console.log('✅ Core modules loaded');
