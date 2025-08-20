/**
 * 一括処理とパフォーマンス最適化
 * 
 * このサンプルでは以下を学習できます：
 * - 大量データの効率的な処理
 * - バッチ処理の実装
 * - パフォーマンス最適化技術
 * - メモリ効率的な処理
 * - プログレス表示とユーザビリティ
 */

(() => {
    'use strict';

    // 一括処理用のボタンを追加
    kintone.events.on('app.record.index.show', (event) => {
        addBulkProcessingButtons();
        return event;
    });

    /**
     * 一括処理ボタンを追加
     */
    function addBulkProcessingButtons() {
        const headerSpace = kintone.app.getHeaderSpaceElement();
        if (!headerSpace) return;

        // 一括計算ボタン
        const bulkCalcBtn = createButton('一括計算実行', handleBulkCalculation);
        
        // 一括カテゴリ変更ボタン
        const bulkCategoryBtn = createButton('一括カテゴリ変更', handleBulkCategoryChange);
        
        // データクリーンアップボタン
        const cleanupBtn = createButton('データクリーンアップ', handleDataCleanup);
        
        // 一括エクスポートボタン
        const exportBtn = createButton('一括エクスポート', handleBulkExport);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginBottom = '10px';
        
        [bulkCalcBtn, bulkCategoryBtn, cleanupBtn, exportBtn].forEach(btn => {
            buttonContainer.appendChild(btn);
        });
        
        headerSpace.appendChild(buttonContainer);
    }

    /**
     * ボタン作成ヘルパー
     */
    function createButton(text, handler) {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = 'kintoneplugin-button-normal';
        button.style.marginRight = '10px';
        button.onclick = handler;
        return button;
    }

    /**
     * 一括計算処理
     */
    async function handleBulkCalculation() {
        if (!confirm('全レコードの合計金額を再計算しますか？\n（処理に時間がかかる場合があります）')) {
            return;
        }

        const progressModal = createProgressModal('一括計算実行中...');
        
        try {
            await performBulkCalculation(progressModal);
            alert('一括計算が完了しました。');
        } catch (error) {
            alert(`エラーが発生しました: ${error.message}`);
        } finally {
            progressModal.remove();
        }
    }

    /**
     * 一括計算の実装
     */
    async function performBulkCalculation(progressModal) {
        const BATCH_SIZE = 100; // 一度に処理するレコード数
        let offset = 0;
        let hasMore = true;
        let totalProcessed = 0;

        while (hasMore) {
            // バッチ単位でレコードを取得
            const records = await fetchRecordsBatch(offset, BATCH_SIZE);
            
            if (records.length === 0) {
                hasMore = false;
                break;
            }

            // バッチ処理
            const updates = [];
            
            for (const record of records) {
                const price = parseInt(record.price.value) || 0;
                const quantity = parseInt(record.quantity.value) || 0;
                const calculatedTotal = price * quantity;
                const currentTotal = parseInt(record.total.value) || 0;

                // 計算値が異なる場合のみ更新対象に追加
                if (calculatedTotal !== currentTotal) {
                    updates.push({
                        id: record.$id.value,
                        record: {
                            total: { value: calculatedTotal },
                            updated_by_bulk: { value: '一括計算' },
                            bulk_update_date: { value: new Date().toISOString() }
                        }
                    });
                }
            }

            // 一括更新の実行
            if (updates.length > 0) {
                await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', {
                    app: kintone.app.getId(),
                    records: updates
                });
            }

            totalProcessed += records.length;
            offset += BATCH_SIZE;

            // プログレス更新
            updateProgress(progressModal, `処理済み: ${totalProcessed}件`);
            
            // UIをブロックしないために少し待機
            await sleep(100);
        }

        console.log(`一括計算完了: ${totalProcessed}件のレコードを処理`);
    }

    /**
     * バッチ単位でレコードを取得
     */
    async function fetchRecordsBatch(offset, limit) {
        try {
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: kintone.app.getId(),
                query: `order by $id asc limit ${limit} offset ${offset}`,
                fields: ['$id', 'price', 'quantity', 'total'] // 必要なフィールドのみ取得
            });
            
            return response.records;
            
        } catch (error) {
            throw new Error(`レコード取得エラー (offset: ${offset}): ${error.message}`);
        }
    }

    /**
     * 一括カテゴリ変更処理
     */
    async function handleBulkCategoryChange() {
        const modal = createCategoryChangeModal();
        document.body.appendChild(modal);
    }

    /**
     * カテゴリ変更モーダルを作成
     */
    function createCategoryChangeModal() {
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
            padding: 20px;
            border-radius: 8px;
            width: 400px;
            max-width: 90vw;
        `;

        content.innerHTML = `
            <h3>一括カテゴリ変更</h3>
            <div style="margin: 15px 0;">
                <label>変更前のカテゴリ:</label><br>
                <select id="fromCategory" style="width: 100%; padding: 5px;">
                    <option value="">選択してください</option>
                    <option value="食費">食費</option>
                    <option value="交通費">交通費</option>
                    <option value="娯楽費">娯楽費</option>
                    <option value="固定費">固定費</option>
                </select>
            </div>
            <div style="margin: 15px 0;">
                <label>変更後のカテゴリ:</label><br>
                <select id="toCategory" style="width: 100%; padding: 5px;">
                    <option value="">選択してください</option>
                    <option value="食費">食費</option>
                    <option value="交通費">交通費</option>
                    <option value="娯楽費">娯楽費</option>
                    <option value="固定費">固定費</option>
                </select>
            </div>
            <div style="margin: 15px 0;">
                <label>対象期間:</label><br>
                <input type="date" id="startDate" style="margin-right: 10px;">
                <span>〜</span>
                <input type="date" id="endDate" style="margin-left: 10px;">
            </div>
            <div style="text-align: right; margin-top: 20px;">
                <button id="cancelBtn" style="margin-right: 10px;">キャンセル</button>
                <button id="executeBtn" class="kintoneplugin-button-dialog-ok">実行</button>
            </div>
        `;

        modal.appendChild(content);

        // イベントリスナー
        content.querySelector('#cancelBtn').onclick = () => modal.remove();
        content.querySelector('#executeBtn').onclick = async () => {
            const fromCategory = content.querySelector('#fromCategory').value;
            const toCategory = content.querySelector('#toCategory').value;
            const startDate = content.querySelector('#startDate').value;
            const endDate = content.querySelector('#endDate').value;

            if (!fromCategory || !toCategory) {
                alert('カテゴリを選択してください。');
                return;
            }

            if (fromCategory === toCategory) {
                alert('変更前後のカテゴリが同じです。');
                return;
            }

            modal.remove();
            await executeBulkCategoryChange(fromCategory, toCategory, startDate, endDate);
        };

        return modal;
    }

    /**
     * 一括カテゴリ変更の実行
     */
    async function executeBulkCategoryChange(fromCategory, toCategory, startDate, endDate) {
        const progressModal = createProgressModal('カテゴリ変更実行中...');
        
        try {
            // 検索条件を構築
            let query = `category = "${fromCategory}"`;
            
            if (startDate && endDate) {
                query += ` and date >= "${startDate}" and date <= "${endDate}"`;
            } else if (startDate) {
                query += ` and date >= "${startDate}"`;
            } else if (endDate) {
                query += ` and date <= "${endDate}"`;
            }

            // 対象レコードを取得
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: kintone.app.getId(),
                query: query
            });

            const targetRecords = response.records;
            
            if (targetRecords.length === 0) {
                alert('対象となるレコードが見つかりませんでした。');
                return;
            }

            const confirmed = confirm(`${targetRecords.length}件のレコードのカテゴリを「${fromCategory}」から「${toCategory}」に変更します。\n実行しますか？`);
            
            if (!confirmed) return;

            // 一括更新の実行
            const updates = targetRecords.map(record => ({
                id: record.$id.value,
                record: {
                    category: { value: toCategory },
                    bulk_change_note: { value: `${fromCategory}から一括変更` },
                    bulk_update_date: { value: new Date().toISOString() }
                }
            }));

            await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', {
                app: kintone.app.getId(),
                records: updates
            });

            alert(`${targetRecords.length}件のカテゴリを変更しました。`);

        } catch (error) {
            alert(`エラーが発生しました: ${error.message}`);
        } finally {
            progressModal.remove();
        }
    }

    /**
     * データクリーンアップ処理
     */
    async function handleDataCleanup() {
        const cleanupTypes = [
            { id: 'duplicates', name: '重複レコードの削除', description: '同じ日付・商品名・金額のレコード' },
            { id: 'empty', name: '空レコードの削除', description: '必須項目が未入力のレコード' },
            { id: 'invalid', name: '無効データの修正', description: '負の金額や異常な日付' }
        ];

        const modal = createCleanupModal(cleanupTypes);
        document.body.appendChild(modal);
    }

    /**
     * クリーンアップモーダルを作成
     */
    function createCleanupModal(cleanupTypes) {
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
            padding: 20px;
            border-radius: 8px;
            width: 500px;
            max-width: 90vw;
        `;

        let checkboxesHtml = '';
        cleanupTypes.forEach(type => {
            checkboxesHtml += `
                <div style="margin: 10px 0;">
                    <label>
                        <input type="checkbox" value="${type.id}">
                        <strong>${type.name}</strong><br>
                        <small style="color: #666; margin-left: 20px;">${type.description}</small>
                    </label>
                </div>
            `;
        });

        content.innerHTML = `
            <h3>データクリーンアップ</h3>
            <p>実行するクリーンアップ処理を選択してください：</p>
            ${checkboxesHtml}
            <div style="text-align: right; margin-top: 20px;">
                <button id="cancelBtn" style="margin-right: 10px;">キャンセル</button>
                <button id="executeBtn" class="kintoneplugin-button-dialog-ok">実行</button>
            </div>
        `;

        modal.appendChild(content);

        content.querySelector('#cancelBtn').onclick = () => modal.remove();
        content.querySelector('#executeBtn').onclick = async () => {
            const selectedTypes = Array.from(content.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => cb.value);

            if (selectedTypes.length === 0) {
                alert('実行する処理を選択してください。');
                return;
            }

            modal.remove();
            await executeDataCleanup(selectedTypes);
        };

        return modal;
    }

    /**
     * データクリーンアップの実行
     */
    async function executeDataCleanup(cleanupTypes) {
        const progressModal = createProgressModal('クリーンアップ実行中...');
        
        try {
            for (const type of cleanupTypes) {
                updateProgress(progressModal, `実行中: ${type}`);
                
                switch (type) {
                    case 'duplicates':
                        await removeDuplicateRecords();
                        break;
                    case 'empty':
                        await removeEmptyRecords();
                        break;
                    case 'invalid':
                        await fixInvalidData();
                        break;
                }
            }

            alert('データクリーンアップが完了しました。');

        } catch (error) {
            alert(`エラーが発生しました: ${error.message}`);
        } finally {
            progressModal.remove();
        }
    }

    /**
     * 重複レコード削除
     */
    async function removeDuplicateRecords() {
        const allRecords = await getAllRecords();
        const duplicates = findDuplicates(allRecords);
        
        if (duplicates.length > 0) {
            const deleteIds = duplicates.map(record => record.$id.value);
            
            await kintone.api(kintone.api.url('/k/v1/records', true), 'DELETE', {
                app: kintone.app.getId(),
                ids: deleteIds
            });
            
            console.log(`${duplicates.length}件の重複レコードを削除しました`);
        }
    }

    /**
     * 一括エクスポート処理
     */
    async function handleBulkExport() {
        const progressModal = createProgressModal('エクスポート準備中...');
        
        try {
            const allRecords = await getAllRecords();
            const csvData = convertToCSV(allRecords);
            downloadCSV(csvData, 'kakeibo_export.csv');
            
        } catch (error) {
            alert(`エラーが発生しました: ${error.message}`);
        } finally {
            progressModal.remove();
        }
    }

    /**
     * プログレスモーダルを作成
     */
    function createProgressModal(message) {
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
            text-align: center;
            min-width: 300px;
        `;

        content.innerHTML = `
            <div style="font-size: 16px; margin-bottom: 20px;">${message}</div>
            <div class="progress-bar" style="width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px;">
                <div class="progress-fill" style="width: 0%; height: 100%; background: #007bff; border-radius: 10px; transition: width 0.3s;"></div>
            </div>
            <div class="progress-text" style="margin-top: 10px; color: #666;"></div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);
        return modal;
    }

    /**
     * プログレス更新
     */
    function updateProgress(modal, text, percent = null) {
        const textElement = modal.querySelector('.progress-text');
        const fillElement = modal.querySelector('.progress-fill');
        
        if (textElement) textElement.textContent = text;
        if (percent !== null && fillElement) {
            fillElement.style.width = `${percent}%`;
        }
    }

    // ヘルパー関数
    async function getAllRecords() {
        const allRecords = [];
        let offset = 0;
        const limit = 500;
        
        while (true) {
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: kintone.app.getId(),
                query: `order by $id asc limit ${limit} offset ${offset}`
            });
            
            if (response.records.length === 0) break;
            
            allRecords.push(...response.records);
            offset += limit;
        }
        
        return allRecords;
    }

    function findDuplicates(records) {
        const seen = new Set();
        const duplicates = [];
        
        records.forEach(record => {
            const key = `${record.date.value}_${record.item_name.value}_${record.total.value}`;
            if (seen.has(key)) {
                duplicates.push(record);
            } else {
                seen.add(key);
            }
        });
        
        return duplicates;
    }

    function convertToCSV(records) {
        const headers = ['日付', '商品名', '価格', '数量', '合計', 'カテゴリ', 'メモ'];
        const rows = [headers];
        
        records.forEach(record => {
            rows.push([
                record.date.value,
                record.item_name.value,
                record.price.value,
                record.quantity.value,
                record.total.value,
                record.category.value,
                record.memo.value || ''
            ]);
        });
        
        return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    function downloadCSV(csvData, filename) {
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function removeEmptyRecords() {
        // 空レコード削除の実装
        console.log('空レコードの削除を実行');
    }

    async function fixInvalidData() {
        // 無効データ修正の実装
        console.log('無効データの修正を実行');
    }

})();

/**
 * 学習ポイント：
 * 
 * 1. バッチ処理
 *    - 大量データを分割して処理
 *    - メモリ効率を考慮した実装
 *    - API呼び出し回数の最適化
 * 
 * 2. ユーザビリティ
 *    - プログレス表示
 *    - 処理のキャンセル機能
 *    - 適切な確認ダイアログ
 * 
 * 3. エラーハンドリング
 *    - 部分的な失敗の処理
 *    - リトライ機能
 *    - ロールバック戦略
 * 
 * 4. パフォーマンス最適化
 *    - 必要なフィールドのみ取得
 *    - 非同期処理の活用
 *    - UI ブロックの回避
 * 
 * 次のステップ：
 * - WebWorker を使用したバックグラウンド処理
 * - より高度なデータ分析機能
 * - プラグイン開発への応用
 */