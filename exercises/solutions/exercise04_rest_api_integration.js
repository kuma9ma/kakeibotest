/**
 * 練習問題4の解答例: REST API活用 - 月次集計機能
 * 
 * この解答では以下の機能を実装しています：
 * 1. 月次集計実行ボタンの追加
 * 2. 今月のレコード取得
 * 3. カテゴリ別集計計算
 * 4. 結果の別アプリへの保存
 */

(() => {
    'use strict';

    // 月次統計アプリのID（実際の環境に合わせて変更）
    const MONTHLY_STATS_APP_ID = 'YOUR_MONTHLY_STATS_APP_ID';

    // 一覧画面に月次集計ボタンを追加
    kintone.events.on('app.record.index.show', (event) => {
        addMonthlySummaryButton();
        return event;
    });

    /**
     * 月次集計ボタンを追加
     */
    function addMonthlySummaryButton() {
        const headerSpace = kintone.app.getHeaderSpaceElement();
        if (!headerSpace) return;

        // 既存のボタンがあれば削除
        const existingButton = document.getElementById('monthly-summary-btn');
        if (existingButton) {
            existingButton.remove();
        }

        // ボタンを作成
        const button = document.createElement('button');
        button.id = 'monthly-summary-btn';
        button.textContent = '📊 月次集計実行';
        button.className = 'kintoneplugin-button-normal';
        button.style.marginBottom = '10px';
        
        // クリックイベントを設定
        button.onclick = handleMonthlySummary;
        
        headerSpace.appendChild(button);
    }

    /**
     * 月次集計のメイン処理
     */
    async function handleMonthlySummary() {
        // 確認ダイアログ
        const confirmed = confirm('今月の家計簿データの集計を実行しますか？');
        if (!confirmed) return;

        // ローディング表示
        const loadingModal = createLoadingModal();
        
        try {
            // 今月の期間を取得
            const { startDate, endDate } = getCurrentMonthRange();
            
            updateLoadingMessage(loadingModal, '今月のレコードを取得中...');
            
            // 今月のレコードを取得
            const records = await fetchCurrentMonthRecords(startDate, endDate);
            
            if (records.length === 0) {
                alert('今月のレコードが見つかりませんでした。');
                return;
            }

            updateLoadingMessage(loadingModal, `${records.length}件のレコードを集計中...`);
            
            // カテゴリ別集計を実行
            const summary = calculateCategorySummary(records);
            
            updateLoadingMessage(loadingModal, '集計結果を保存中...');
            
            // 集計結果を月次統計アプリに保存
            await saveMonthlySummary(summary, startDate.getFullYear(), startDate.getMonth() + 1);
            
            // 結果を表示
            displaySummaryResults(summary);
            
        } catch (error) {
            console.error('月次集計エラー:', error);
            alert(`エラーが発生しました: ${error.message}`);
        } finally {
            loadingModal.remove();
        }
    }

    /**
     * 今月の期間を取得
     */
    function getCurrentMonthRange() {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        return { startDate, endDate };
    }

    /**
     * 今月のレコードを取得
     */
    async function fetchCurrentMonthRecords(startDate, endDate) {
        try {
            const startDateStr = formatDate(startDate);
            const endDateStr = formatDate(endDate);
            
            const query = `date >= "${startDateStr}" and date <= "${endDateStr}"`;
            
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: kintone.app.getId(),
                query: query,
                fields: ['date', 'category', 'total', 'item_name'] // 必要なフィールドのみ取得
            });
            
            return response.records;
            
        } catch (error) {
            throw new Error(`レコード取得に失敗しました: ${error.message}`);
        }
    }

    /**
     * カテゴリ別集計を計算
     */
    function calculateCategorySummary(records) {
        const summary = {};
        let totalAmount = 0;
        let recordCount = 0;

        records.forEach(record => {
            const category = record.category.value || 'その他';
            const amount = parseInt(record.total.value) || 0;
            
            if (!summary[category]) {
                summary[category] = {
                    amount: 0,
                    count: 0,
                    items: []
                };
            }
            
            summary[category].amount += amount;
            summary[category].count += 1;
            summary[category].items.push({
                name: record.item_name.value,
                amount: amount,
                date: record.date.value
            });
            
            totalAmount += amount;
            recordCount += 1;
        });

        // 全体のサマリー情報を追加
        summary._total = {
            amount: totalAmount,
            count: recordCount,
            categories: Object.keys(summary).length
        };

        return summary;
    }

    /**
     * 集計結果を月次統計アプリに保存
     */
    async function saveMonthlySummary(summary, year, month) {
        try {
            const records = [];
            
            // カテゴリ別のレコードを作成
            for (const [category, data] of Object.entries(summary)) {
                if (category === '_total') continue; // 全体サマリーは除外
                
                records.push({
                    record: {
                        年: { value: year },
                        月: { value: month },
                        カテゴリ: { value: category },
                        金額: { value: data.amount },
                        件数: { value: data.count },
                        平均金額: { value: Math.round(data.amount / data.count) },
                        作成日時: { value: new Date().toISOString() },
                        詳細: { value: JSON.stringify(data.items) }
                    }
                });
            }

            // 全体サマリーレコードも作成
            records.push({
                record: {
                    年: { value: year },
                    月: { value: month },
                    カテゴリ: { value: '【全体】' },
                    金額: { value: summary._total.amount },
                    件数: { value: summary._total.count },
                    平均金額: { value: Math.round(summary._total.amount / summary._total.count) },
                    作成日時: { value: new Date().toISOString() },
                    詳細: { value: `カテゴリ数: ${summary._total.categories}` }
                }
            });

            // 既存の同月データを削除（重複を防ぐため）
            await deleteExistingMonthlySummary(year, month);
            
            // 新しい集計データを保存
            await kintone.api(kintone.api.url('/k/v1/records', true), 'POST', {
                app: MONTHLY_STATS_APP_ID,
                records: records
            });
            
        } catch (error) {
            throw new Error(`集計結果の保存に失敗しました: ${error.message}`);
        }
    }

    /**
     * 既存の月次集計データを削除
     */
    async function deleteExistingMonthlySummary(year, month) {
        try {
            const query = `年 = ${year} and 月 = ${month}`;
            
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: MONTHLY_STATS_APP_ID,
                query: query,
                fields: ['$id']
            });
            
            if (response.records.length > 0) {
                const deleteIds = response.records.map(record => record.$id.value);
                
                await kintone.api(kintone.api.url('/k/v1/records', true), 'DELETE', {
                    app: MONTHLY_STATS_APP_ID,
                    ids: deleteIds
                });
            }
            
        } catch (error) {
            console.warn('既存データの削除に失敗:', error);
            // 削除失敗は処理を続行
        }
    }

    /**
     * 集計結果を表示
     */
    function displaySummaryResults(summary) {
        const modal = createResultModal();
        const content = modal.querySelector('.modal-content');
        
        let html = '<h3>📊 月次集計結果</h3>';
        
        // 全体サマリー
        html += `
            <div style="background: #f8f9fa; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <h4>全体サマリー</h4>
                <p>総支出: <strong>¥${summary._total.amount.toLocaleString()}</strong></p>
                <p>記録件数: <strong>${summary._total.count}件</strong></p>
                <p>平均支出: <strong>¥${Math.round(summary._total.amount / summary._total.count).toLocaleString()}</strong></p>
            </div>
        `;
        
        // カテゴリ別詳細
        html += '<h4>カテゴリ別詳細</h4>';
        html += '<table style="width: 100%; border-collapse: collapse;">';
        html += '<tr style="background: #e9ecef;"><th>カテゴリ</th><th>金額</th><th>件数</th><th>平均</th><th>割合</th></tr>';
        
        // カテゴリをソート（金額順）
        const sortedCategories = Object.entries(summary)
            .filter(([category]) => category !== '_total')
            .sort(([,a], [,b]) => b.amount - a.amount);
        
        sortedCategories.forEach(([category, data]) => {
            const percentage = Math.round((data.amount / summary._total.amount) * 100);
            const average = Math.round(data.amount / data.count);
            
            html += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${category}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">¥${data.amount.toLocaleString()}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${data.count}件</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">¥${average.toLocaleString()}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${percentage}%</td>
                </tr>
            `;
        });
        
        html += '</table>';
        
        content.innerHTML = html;
        document.body.appendChild(modal);
    }

    // ユーティリティ関数
    function formatDate(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function createLoadingModal() {
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
        
        modal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 8px; text-align: center;">
                <div class="loading-message">処理中...</div>
                <div style="margin-top: 20px;">
                    <div style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                </div>
            </div>
        `;
        
        // CSS アニメーションを追加
        if (!document.querySelector('#loading-animation-css')) {
            const style = document.createElement('style');
            style.id = 'loading-animation-css';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(modal);
        return modal;
    }

    function updateLoadingMessage(modal, message) {
        const messageElement = modal.querySelector('.loading-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }

    function createResultModal() {
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
        content.className = 'modal-content';
        content.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 8px;
            width: 80%;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '閉じる';
        closeBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; background: #ccc; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;';
        closeBtn.onclick = () => modal.remove();
        
        content.style.position = 'relative';
        content.appendChild(closeBtn);
        modal.appendChild(content);
        
        return modal;
    }

})();

/**
 * 解答のポイント:
 * 
 * 1. REST API の活用
 *    - 適切なクエリ条件でのデータ取得
 *    - 必要なフィールドのみ指定してパフォーマンス向上
 *    - 複数アプリへのデータ保存
 * 
 * 2. エラーハンドリング
 *    - try-catch による例外処理
 *    - ユーザーにわかりやすいエラーメッセージ
 *    - 部分的な失敗の適切な処理
 * 
 * 3. ユーザビリティ
 *    - ローディング表示による進捗報告
 *    - 確認ダイアログによる誤操作防止
 *    - 見やすい結果表示
 * 
 * 4. データ処理
 *    - 効率的な集計アルゴリズム
 *    - 重複データの防止
 *    - JSON形式での詳細データ保存
 */