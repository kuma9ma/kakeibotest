/**
 * 外部API連携とプラグイン開発の基礎
 * 
 * このサンプルでは以下を学習できます：
 * - 外部API（銀行API、決済API等）との連携
 * - OAuth認証の実装
 * - プラグイン開発の基本構造
 * - 設定画面の作成
 * - セキュアな認証情報の管理
 * - エラーハンドリングとリトライ機能
 */

(() => {
    'use strict';

    // プラグイン設定の取得
    const config = kintone.plugin?.getConfig() || {};
    
    // 外部API設定
    const API_ENDPOINTS = {
        bank: config.bank_api_url || 'https://api.bank.example.com',
        payment: config.payment_api_url || 'https://api.payment.example.com',
        receipt: config.receipt_api_url || 'https://api.receipt.example.com'
    };

    // レコード保存時の外部API連携
    kintone.events.on(['app.record.create.submit.success', 'app.record.edit.submit.success'], async (event) => {
        try {
            const record = event.record;
            
            // 銀行取引データとの照合
            if (record.auto_import && record.auto_import.value === '有効') {
                await matchBankTransaction(record);
            }
            
            // レシート画像の自動解析
            if (record.receipt_image && record.receipt_image.value.length > 0) {
                await analyzeReceiptImage(record);
            }
            
            // 家計簿共有アプリへの同期
            if (record.share_with_family && record.share_with_family.value === '有効') {
                await syncToFamilyApp(record);
            }
            
        } catch (error) {
            console.error('外部API連携エラー:', error);
            // エラーが発生してもレコード保存は成功させる
        }
        
        return event;
    });

    // アプリ画面表示時の初期化
    kintone.events.on('app.record.index.show', async (event) => {
        try {
            // 外部連携機能のボタンを追加
            addExternalIntegrationButtons();
            
            // 銀行取引データの自動取込状況を表示
            await displayImportStatus();
            
        } catch (error) {
            console.error('画面初期化エラー:', error);
        }
        
        return event;
    });

    /**
     * 外部連携ボタンを追加
     */
    function addExternalIntegrationButtons() {
        const headerSpace = kintone.app.getHeaderSpaceElement();
        if (!headerSpace) return;

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px;';

        // 銀行データ取込ボタン
        const bankImportBtn = createIntegrationButton('🏦 銀行データ取込', handleBankImport);
        
        // レシート一括解析ボタン
        const receiptAnalysisBtn = createIntegrationButton('🧾 レシート一括解析', handleBulkReceiptAnalysis);
        
        // 予算連携ボタン
        const budgetSyncBtn = createIntegrationButton('💰 予算アプリ連携', handleBudgetSync);
        
        // 設定ボタン
        const settingsBtn = createIntegrationButton('⚙️ API設定', openApiSettings);

        [bankImportBtn, receiptAnalysisBtn, budgetSyncBtn, settingsBtn].forEach(btn => {
            buttonContainer.appendChild(btn);
        });

        headerSpace.appendChild(buttonContainer);
    }

    /**
     * 連携ボタン作成ヘルパー
     */
    function createIntegrationButton(text, handler) {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = 'kintoneplugin-button-normal';
        button.style.marginRight = '10px';
        button.onclick = handler;
        return button;
    }

    /**
     * 銀行データ取込処理
     */
    async function handleBankImport() {
        const modal = createProgressModal('銀行データを取得中...');
        
        try {
            // OAuth認証の確認
            const accessToken = await ensureAuthentication('bank');
            if (!accessToken) {
                throw new Error('銀行APIの認証が必要です');
            }

            // 銀行取引データの取得
            const transactions = await fetchBankTransactions(accessToken);
            
            updateProgress(modal, `${transactions.length}件の取引データを取得しました`, 50);

            // kintoneレコードとのマッチング
            const matches = await matchTransactionsWithRecords(transactions);
            
            updateProgress(modal, 'データを保存中...', 80);

            // 新規レコードの作成
            const newRecords = await createRecordsFromTransactions(matches.unmatched);
            
            updateProgress(modal, '完了', 100);

            // 結果表示
            showImportResults(matches, newRecords);

        } catch (error) {
            console.error('銀行データ取込エラー:', error);
            alert(`エラーが発生しました: ${error.message}`);
        } finally {
            modal.remove();
        }
    }

    /**
     * OAuth認証の確認・実行
     */
    async function ensureAuthentication(service) {
        const storageKey = `${service}_access_token`;
        let accessToken = localStorage.getItem(storageKey);
        
        // トークンの有効性確認
        if (accessToken && !(await isTokenValid(service, accessToken))) {
            accessToken = null;
            localStorage.removeItem(storageKey);
        }

        // 新規認証が必要な場合
        if (!accessToken) {
            accessToken = await performOAuthFlow(service);
            if (accessToken) {
                localStorage.setItem(storageKey, accessToken);
            }
        }

        return accessToken;
    }

    /**
     * OAuth認証フローの実行
     */
    async function performOAuthFlow(service) {
        return new Promise((resolve, reject) => {
            const authUrl = buildAuthUrl(service);
            const authWindow = window.open(authUrl, 'auth', 'width=600,height=600');
            
            // 認証完了の監視
            const checkClosed = setInterval(() => {
                if (authWindow.closed) {
                    clearInterval(checkClosed);
                    
                    // 認証結果の確認
                    const token = localStorage.getItem('temp_auth_token');
                    if (token) {
                        localStorage.removeItem('temp_auth_token');
                        resolve(token);
                    } else {
                        reject(new Error('認証がキャンセルされました'));
                    }
                }
            }, 1000);
        });
    }

    /**
     * 認証URLの構築
     */
    function buildAuthUrl(service) {
        const baseUrls = {
            bank: `${API_ENDPOINTS.bank}/oauth/authorize`,
            payment: `${API_ENDPOINTS.payment}/oauth/authorize`,
            receipt: `${API_ENDPOINTS.receipt}/oauth/authorize`
        };

        const params = new URLSearchParams({
            client_id: config[`${service}_client_id`],
            response_type: 'code',
            redirect_uri: `${location.origin}/k/oauth_callback.html`,
            scope: getRequiredScopes(service),
            state: generateRandomState()
        });

        return `${baseUrls[service]}?${params}`;
    }

    /**
     * 銀行取引データの取得
     */
    async function fetchBankTransactions(accessToken) {
        const response = await fetchWithRetry(`${API_ENDPOINTS.bank}/api/v1/transactions`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`銀行API エラー: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.transactions || [];
    }

    /**
     * 取引データとレコードのマッチング
     */
    async function matchTransactionsWithRecords(transactions) {
        const existingRecords = await getAllExistingRecords();
        const matched = [];
        const unmatched = [];

        for (const transaction of transactions) {
            const matchedRecord = findMatchingRecord(transaction, existingRecords);
            
            if (matchedRecord) {
                matched.push({
                    transaction: transaction,
                    record: matchedRecord,
                    confidence: calculateMatchConfidence(transaction, matchedRecord)
                });
            } else {
                unmatched.push(transaction);
            }
        }

        return { matched, unmatched };
    }

    /**
     * レコードマッチングのロジック
     */
    function findMatchingRecord(transaction, records) {
        const transactionDate = new Date(transaction.date);
        const transactionAmount = Math.abs(transaction.amount);

        return records.find(record => {
            const recordDate = new Date(record.date.value);
            const recordAmount = parseInt(record.total.value) || 0;

            // 日付の差が3日以内、金額が一致
            const dateDiff = Math.abs(transactionDate - recordDate) / (1000 * 60 * 60 * 24);
            return dateDiff <= 3 && transactionAmount === recordAmount;
        });
    }

    /**
     * 取引データからレコードを作成
     */
    async function createRecordsFromTransactions(transactions) {
        const newRecords = transactions.map(transaction => ({
            record: {
                date: { value: transaction.date },
                item_name: { value: transaction.description || '自動取込' },
                price: { value: Math.abs(transaction.amount) },
                quantity: { value: 1 },
                total: { value: Math.abs(transaction.amount) },
                category: { value: categorizeTransaction(transaction) },
                memo: { value: `銀行取引: ${transaction.reference_number}` },
                imported_from: { value: '銀行API' },
                transaction_id: { value: transaction.id }
            }
        }));

        if (newRecords.length > 0) {
            await kintone.api(kintone.api.url('/k/v1/records', true), 'POST', {
                app: kintone.app.getId(),
                records: newRecords
            });
        }

        return newRecords;
    }

    /**
     * レシート画像の自動解析
     */
    async function analyzeReceiptImage(record) {
        const receiptFiles = record.receipt_image.value;
        if (receiptFiles.length === 0) return;

        try {
            for (const file of receiptFiles) {
                const analysisResult = await analyzeReceiptFile(file);
                await updateRecordWithReceiptData(record, analysisResult);
            }
        } catch (error) {
            console.error('レシート解析エラー:', error);
        }
    }

    /**
     * レシートファイルの解析
     */
    async function analyzeReceiptFile(file) {
        const accessToken = await ensureAuthentication('receipt');
        
        const formData = new FormData();
        
        // kintoneファイルのダウンロード
        const fileBlob = await downloadKintoneFile(file.fileKey);
        formData.append('image', fileBlob, file.name);
        formData.append('options', JSON.stringify({
            extract_items: true,
            extract_total: true,
            extract_date: true,
            extract_store: true
        }));

        const response = await fetchWithRetry(`${API_ENDPOINTS.receipt}/api/v1/analyze`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`レシート解析API エラー: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * 一括レシート解析処理
     */
    async function handleBulkReceiptAnalysis() {
        const modal = createProgressModal('レシート画像を検索中...');
        
        try {
            // レシート画像があるレコードを取得
            const recordsWithReceipts = await getRecordsWithReceipts();
            
            updateProgress(modal, `${recordsWithReceipts.length}件のレシートを解析します`, 10);

            let processed = 0;
            const results = [];

            for (const record of recordsWithReceipts) {
                try {
                    const analysisResult = await analyzeReceiptImage(record);
                    results.push({ record: record, result: analysisResult, success: true });
                } catch (error) {
                    results.push({ record: record, error: error.message, success: false });
                }
                
                processed++;
                const progress = Math.round((processed / recordsWithReceipts.length) * 90) + 10;
                updateProgress(modal, `処理中: ${processed}/${recordsWithReceipts.length}`, progress);
            }

            showBulkAnalysisResults(results);

        } catch (error) {
            alert(`エラーが発生しました: ${error.message}`);
        } finally {
            modal.remove();
        }
    }

    /**
     * API設定画面を開く
     */
    function openApiSettings() {
        const modal = createApiSettingsModal();
        document.body.appendChild(modal);
    }

    /**
     * API設定モーダルの作成
     */
    function createApiSettingsModal() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 8px;
            width: 600px;
            max-width: 90vw;
            max-height: 80vh;
            overflow-y: auto;
        `;

        content.innerHTML = `
            <h3>API連携設定</h3>
            
            <div class="api-section">
                <h4>🏦 銀行API</h4>
                <div style="margin: 10px 0;">
                    <label>API URL:</label><br>
                    <input type="text" id="bankApiUrl" value="${config.bank_api_url || ''}" style="width: 100%; padding: 5px;">
                </div>
                <div style="margin: 10px 0;">
                    <label>Client ID:</label><br>
                    <input type="text" id="bankClientId" value="${config.bank_client_id || ''}" style="width: 100%; padding: 5px;">
                </div>
                <div style="margin: 10px 0;">
                    <label>Client Secret:</label><br>
                    <input type="password" id="bankClientSecret" value="${config.bank_client_secret || ''}" style="width: 100%; padding: 5px;">
                </div>
            </div>

            <div class="api-section" style="margin-top: 20px;">
                <h4>🧾 レシート解析API</h4>
                <div style="margin: 10px 0;">
                    <label>API URL:</label><br>
                    <input type="text" id="receiptApiUrl" value="${config.receipt_api_url || ''}" style="width: 100%; padding: 5px;">
                </div>
                <div style="margin: 10px 0;">
                    <label>API Key:</label><br>
                    <input type="password" id="receiptApiKey" value="${config.receipt_api_key || ''}" style="width: 100%; padding: 5px;">
                </div>
            </div>

            <div style="text-align: right; margin-top: 30px;">
                <button id="testConnectionBtn" style="margin-right: 10px;">接続テスト</button>
                <button id="cancelBtn" style="margin-right: 10px;">キャンセル</button>
                <button id="saveBtn" class="kintoneplugin-button-dialog-ok">保存</button>
            </div>
        `;

        modal.appendChild(content);

        // イベントリスナー
        content.querySelector('#cancelBtn').onclick = () => modal.remove();
        content.querySelector('#testConnectionBtn').onclick = () => testApiConnections(content);
        content.querySelector('#saveBtn').onclick = () => saveApiSettings(content, modal);

        return modal;
    }

    /**
     * リトライ機能付きフェッチ
     */
    async function fetchWithRetry(url, options, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.ok || response.status < 500) {
                    return response;
                }
                throw new Error(`HTTP ${response.status}`);
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                await sleep(Math.pow(2, i) * 1000); // 指数バックオフ
            }
        }
    }

    // ユーティリティ関数
    function getRequiredScopes(service) {
        const scopes = {
            bank: 'read:transactions read:accounts',
            payment: 'read:payments',
            receipt: 'analyze:images'
        };
        return scopes[service] || '';
    }

    function generateRandomState() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    function categorizeTransaction(transaction) {
        const description = transaction.description.toLowerCase();
        
        if (description.includes('食') || description.includes('コンビニ') || description.includes('スーパー')) {
            return '食費';
        } else if (description.includes('交通') || description.includes('電車') || description.includes('バス')) {
            return '交通費';
        } else if (description.includes('水道') || description.includes('電気') || description.includes('ガス')) {
            return '固定費';
        }
        
        return 'その他';
    }

    function calculateMatchConfidence(transaction, record) {
        // マッチング信頼度の計算ロジック
        return 0.8; // 簡略化
    }

    async function isTokenValid(service, token) {
        // トークンの有効性確認
        return true; // 簡略化
    }

    async function getAllExistingRecords() {
        // 既存レコードの取得
        return []; // 簡略化
    }

    async function downloadKintoneFile(fileKey) {
        // kintoneファイルのダウンロード
        return new Blob(); // 簡略化
    }

    async function getRecordsWithReceipts() {
        // レシート画像があるレコードの取得
        return []; // 簡略化
    }

    function showImportResults(matches, newRecords) {
        alert(`取込完了\n新規: ${newRecords.length}件\nマッチ: ${matches.matched.length}件`);
    }

    function showBulkAnalysisResults(results) {
        const successful = results.filter(r => r.success).length;
        alert(`解析完了\n成功: ${successful}件\n失敗: ${results.length - successful}件`);
    }

    function testApiConnections(content) {
        alert('API接続テスト機能は開発中です');
    }

    function saveApiSettings(content, modal) {
        // 設定の保存（実際の実装ではプラグイン設定APIを使用）
        alert('設定を保存しました');
        modal.remove();
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // プログレス関連の関数は前のサンプルと同じ
    function createProgressModal(message) {
        // 前のサンプルと同じ実装
        return document.createElement('div');
    }

    function updateProgress(modal, text, percent = null) {
        // 前のサンプルと同じ実装
    }

})();

/**
 * 学習ポイント：
 * 
 * 1. 外部API連携
 *    - OAuth認証フローの実装
 *    - セキュアな認証情報管理
 *    - API呼び出しのエラーハンドリング
 * 
 * 2. プラグイン開発
 *    - 設定画面の作成
 *    - プラグイン設定の管理
 *    - 再利用可能なコンポーネント設計
 * 
 * 3. 高度な機能
 *    - 画像解析API連携
 *    - 自動データマッチング
 *    - 一括処理との組み合わせ
 * 
 * 4. セキュリティ考慮
 *    - 認証トークンの安全な管理
 *    - API通信の暗号化
 *    - 入力値のバリデーション
 * 
 * 次のステップ：
 * - WebSocket を使用したリアルタイム連携
 * - 機械学習APIとの連携
 * - マイクロサービス architecture での活用
 */