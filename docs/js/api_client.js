/**
 * 🚀 TokiSync API Client
 * GAS(Google Apps Script) Backend와 통신하는 전용 클라이언트
 */

class TokiApiClient {
    constructor() {
        // ⭐ 기본값 하드코딩 (설정 패널에서 변경 가능)
        this.DEFAULTS = {
            baseUrl: '',
            folderId: '',
            apiKey: ''
        };

        this._config = {
            baseUrl: '',
            folderId: '',
            apiKey: ''
        };

        this._loadConfig();
    }

    /**
     * 설정 로드 우선순위:
     * 1. localStorage (사용자가 설정에서 변경한 값)
     * 2. 기본값 (하드코딩)
     */
    _loadConfig() {
        this._config.baseUrl = localStorage.getItem('TOKI_API_URL') || this.DEFAULTS.baseUrl;
        this._config.folderId = localStorage.getItem('TOKI_ROOT_ID') || this.DEFAULTS.folderId;
        this._config.apiKey = localStorage.getItem('TOKI_API_KEY') || this.DEFAULTS.apiKey;

        if (this._config.baseUrl) {
            console.log('✅ Config loaded (localStorage > Defaults)');
        }
    }

    /**
     * API 설정 저장 (설정 패널 또는 UserScript에서 호출)
     */
    setConfig(url, id, apiKey) {
        if (url) {
            this._config.baseUrl = url;
            localStorage.setItem('TOKI_API_URL', url);
        }
        if (id) {
            this._config.folderId = id;
            localStorage.setItem('TOKI_ROOT_ID', id);
        }
        if (apiKey) {
            this._config.apiKey = apiKey;
            localStorage.setItem('TOKI_API_KEY', apiKey);
        }

        console.log('✅ Config updated & saved');
    }

    /**
     * 설정을 기본값으로 초기화
     */
    resetConfig() {
        localStorage.removeItem('TOKI_API_URL');
        localStorage.removeItem('TOKI_ROOT_ID');
        localStorage.removeItem('TOKI_API_KEY');
        this._loadConfig();
        console.log('🔄 Config reset to defaults');
    }

    /**
     * API 통신을 위한 필수 설정 확인
     */
    isConfigured() {
        return this._config.baseUrl && this._config.folderId;
    }

    /**
     * 통합 API 요청 함수
     */
    async request(type, payload = {}) {
        if (!this._config.baseUrl) throw new Error("API URL이 설정되지 않았습니다.");

        const bodyData = {
            ...payload,
            type: type,
            folderId: payload.folderId || this._config.folderId,
            apiKey: this._config.apiKey,
            protocolVersion: 3
        };

        try {
            const response = await fetch(this._config.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify(bodyData)
            });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const json = await response.json();

            if (json.status === 'error') {
                throw new Error(json.body || "Unknown Server Error");
            }

            return json.body;

        } catch (e) {
            console.error(`[API] Request Failed (${type}):`, e);
            throw e;
        }
    }
}

// 전역 인스턴스
window.API = new TokiApiClient();
const API = window.API;
