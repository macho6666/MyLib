/**
 * 🚀 TokiSync API Client
 * GAS(Google Apps Script) Backend와 통신하는 전용 클라이언트
 */

class TokiApiClient {
    constructor() {
        this._config = {
            baseUrl: '',
            folderId: '',
            apiId: '',
            apiPassword: '',
            notifyEmail: ''
        };

        this._loadConfig();
    }

    /**
     * 설정 로드 (localStorage)
     */
_loadConfig() {
    this._config.baseUrl = localStorage.getItem('MYLIB_API_URL') || '';
    this._config.folderId = localStorage.getItem('MYLIB_ROOT_ID') || '';
    this._config.apiId = localStorage.getItem('MYLIB_API_ID') || '';
    this._config.apiPassword = localStorage.getItem('MYLIB_API_PASSWORD') || '';
    this._config.notifyEmail = localStorage.getItem('MYLIB_NOTIFY_EMAIL') || '';

        if (this._config.baseUrl) {
            console.log('✅ Config loaded from localStorage');
        }
    }

    /**
     * API 설정 저장
     */
setConfig(url, folderId, apiId, apiPassword, notifyEmail) {
    if (url) {
        this._config.baseUrl = url;
        localStorage.setItem('MYLIB_API_URL', url);
    }
    if (folderId) {
        this._config.folderId = folderId;
        localStorage.setItem('MYLIB_ROOT_ID', folderId);
    }
    if (apiId) {
        this._config.apiId = apiId;
        localStorage.setItem('MYLIB_API_ID', apiId);
    }
    if (apiPassword) {
        this._config.apiPassword = apiPassword;
        localStorage.setItem('MYLIB_API_PASSWORD', apiPassword);
    }
    if (notifyEmail) {
        this._config.notifyEmail = notifyEmail;
        localStorage.setItem('MYLIB_NOTIFY_EMAIL', notifyEmail);
    }

        console.log('✅ Config updated & saved');
    }

    /**
     * 로그아웃 (Password만 삭제)
     */
    logout() {
        this._config.apiPassword = '';
        localStorage.removeItem('MYLIB_API_PASSWORD');
        console.log('🔒 Logged out (password cleared)');
    }

    /**
     * 설정 전체 초기화
     */
resetConfig() {
    localStorage.removeItem('MYLIB_API_URL');
    localStorage.removeItem('MYLIB_ROOT_ID');
    localStorage.removeItem('MYLIB_API_ID');
    localStorage.removeItem('MYLIB_API_PASSWORD');
    localStorage.removeItem('MYLIB_NOTIFY_EMAIL');
        this._loadConfig();
        console.log('🔄 Config reset');
    }

    /**
     * API 통신을 위한 필수 설정 확인
     */
    isConfigured() {
        return this._config.baseUrl && this._config.folderId && this._config.apiId && this._config.apiPassword;
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
            apiId: this._config.apiId,
            apiPassword: this._config.apiPassword,
            notifyEmail: this._config.notifyEmail,
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
