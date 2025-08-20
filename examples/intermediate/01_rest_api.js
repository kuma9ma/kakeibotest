/**
 * kintone REST API の活用
 * 
 * このサンプルでは以下を学習できます：
 * - kintone REST API の基本的な使用方法
 * - レコードの取得・更新・削除
 * - 複数アプリ間の連携
 * - 非同期処理の実装
 * - エラーハンドリング
 */

(() => {
    'use strict';

    // アプリIDの設定（実際の使用時は環境に応じて変更）
    const HOUSEHOLD_APP_ID = kintone.app.getId(); // 現在のアプリ（家計簿）
    const BUDGET_APP_ID = '123'; // 予算管理アプリ（例）
    const CATEGORY_APP_ID = '124'; // カテゴリマスターアプリ（例）

    // レコード保存後の処理（統計データの更新）
    kintone.events.on(['app.record.create.submit.success', 'app.record.edit.submit.success'], async (event) => {
        try {
            const record = event.record;
            
            // 月次統計の更新
            await updateMonthlyStatistics(record);
            
            // 予算チェックと通知
            await checkBudgetAndNotify(record);
            
            // 関連レコードの更新
            await updateRelatedRecords(record);
            
        } catch (error) {
            console.error('レコード保存後の処理でエラーが発生:', error);
            // エラーが発生してもレコード保存は成功させる
        }
        
        return event;
    });

    // レコード作成画面表示時にマスターデータを取得
    kintone.events.on('app.record.create.show', async (event) => {
        try {
            // カテゴリマスターから最新のカテゴリ一覧を取得
            await loadCategoryMaster();
            
            // ユーザーの過去の入力履歴を取得して入力補助
            await loadUserInputHistory();
            
            // 今月の予算情報を取得して表示
            await displayCurrentBudget();
            
        } catch (error) {
            console.error('画面初期化でエラーが発生:', error);
        }
        
        return event;
    });

    // 商品名変更時に過去の類似レコードを検索
    kintone.events.on(['app.record.create.change.item_name', 'app.record.edit.change.item_name'], async (event) => {
        const record = event.record;
        const itemName = record.item_name.value;
        
        if (itemName && itemName.length >= 2) {
            try {
                // 過去の類似商品を検索
                const similarItems = await searchSimilarItems(itemName);
                
                if (similarItems.length > 0) {
                    // 類似商品の価格とカテゴリを提案
                    showSimilarItemSuggestions(similarItems);
                }
                
            } catch (error) {
                console.error('類似商品検索でエラーが発生:', error);
            }
        }
        
        return event;
    });

    /**
     * 月次統計データを更新する関数
     */
    async function updateMonthlyStatistics(record) {
        const date = new Date(record.date.value);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const category = record.category.value;
        const amount = parseInt(record.total.value) || 0;

        // 現在の月次統計レコードを取得
        const query = `年 = ${year} and 月 = ${month} and カテゴリ = "${category}"`;
        
        try {
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: HOUSEHOLD_APP_ID,
                query: query
            });

            let statisticsRecord;
            
            if (response.records.length > 0) {
                // 既存レコードの更新
                statisticsRecord = response.records[0];
                const currentTotal = parseInt(statisticsRecord.月次合計.value) || 0;
                const currentCount = parseInt(statisticsRecord.件数.value) || 0;
                
                await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
                    app: HOUSEHOLD_APP_ID,
                    id: statisticsRecord.$id.value,
                    record: {
                        月次合計: { value: currentTotal + amount },
                        件数: { value: currentCount + 1 },
                        最終更新: { value: new Date().toISOString() }
                    }
                });
                
            } else {
                // 新規統計レコードの作成
                await kintone.api(kintone.api.url('/k/v1/record', true), 'POST', {
                    app: HOUSEHOLD_APP_ID,
                    record: {
                        年: { value: year },
                        月: { value: month },
                        カテゴリ: { value: category },
                        月次合計: { value: amount },
                        件数: { value: 1 },
                        作成日: { value: new Date().toISOString() }
                    }
                });
            }
            
            console.log(`月次統計を更新しました: ${year}年${month}月 ${category}`);
            
        } catch (error) {
            throw new Error(`月次統計の更新に失敗: ${error.message}`);
        }
    }

    /**
     * 予算チェックと通知
     */
    async function checkBudgetAndNotify(record) {
        const date = new Date(record.date.value);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const category = record.category.value;
        const amount = parseInt(record.total.value) || 0;

        try {
            // 予算アプリから該当する予算を取得
            const budgetQuery = `年 = ${year} and 月 = ${month} and カテゴリ = "${category}"`;
            const budgetResponse = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: BUDGET_APP_ID,
                query: budgetQuery
            });

            if (budgetResponse.records.length === 0) {
                console.log(`予算が設定されていません: ${category}`);
                return;
            }

            const budgetRecord = budgetResponse.records[0];
            const budgetAmount = parseInt(budgetRecord.予算額.value) || 0;

            // 現在月の実績を取得
            const actualQuery = `date >= "${year}-${month.toString().padStart(2, '0')}-01" and date <= "${year}-${month.toString().padStart(2, '0')}-31" and category = "${category}"`;
            const actualResponse = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: HOUSEHOLD_APP_ID,
                query: actualQuery
            });

            // 実績合計を計算
            const totalActual = actualResponse.records.reduce((sum, rec) => {
                return sum + (parseInt(rec.total.value) || 0);
            }, 0);

            // 予算超過チェック
            const usagePercent = (totalActual / budgetAmount) * 100;
            
            if (usagePercent >= 100) {
                showBudgetAlert('danger', category, budgetAmount, totalActual, usagePercent);
            } else if (usagePercent >= 80) {
                showBudgetAlert('warning', category, budgetAmount, totalActual, usagePercent);
            }

            // 予算アプリの実績フィールドも更新
            await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
                app: BUDGET_APP_ID,
                id: budgetRecord.$id.value,
                record: {
                    実績額: { value: totalActual },
                    使用率: { value: Math.round(usagePercent) },
                    最終更新: { value: new Date().toISOString() }
                }
            });

        } catch (error) {
            throw new Error(`予算チェックに失敗: ${error.message}`);
        }
    }

    /**
     * 類似商品を検索する関数
     */
    async function searchSimilarItems(itemName) {
        try {
            // 部分一致で過去のレコードを検索
            const query = `item_name like "${itemName}" order by date desc limit 10`;
            
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: HOUSEHOLD_APP_ID,
                query: query
            });

            // 重複を除去して類似商品リストを作成
            const uniqueItems = [];
            const seenItems = new Set();

            response.records.forEach(record => {
                const name = record.item_name.value;
                if (!seenItems.has(name)) {
                    seenItems.add(name);
                    uniqueItems.push({
                        name: name,
                        price: record.price.value,
                        category: record.category.value,
                        date: record.date.value
                    });
                }
            });

            return uniqueItems;
            
        } catch (error) {
            throw new Error(`類似商品検索に失敗: ${error.message}`);
        }
    }

    /**
     * カテゴリマスターを読み込む関数
     */
    async function loadCategoryMaster() {
        try {
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: CATEGORY_APP_ID,
                query: 'order by 表示順 asc'
            });

            // カテゴリ選択肢を動的に更新
            const categoryOptions = response.records.map(record => ({
                label: record.カテゴリ名.value,
                value: record.カテゴリ名.value
            }));

            // 実際の実装では、フィールドの選択肢を動的に更新
            console.log('カテゴリマスターを読み込みました:', categoryOptions);
            
        } catch (error) {
            console.error('カテゴリマスター読み込みエラー:', error);
        }
    }

    /**
     * ユーザーの入力履歴を読み込む関数
     */
    async function loadUserInputHistory() {
        try {
            const currentUser = kintone.getLoginUser();
            const query = `作成者 in ("${currentUser.code}") order by 作成日時 desc limit 20`;
            
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: HOUSEHOLD_APP_ID,
                query: query
            });

            // よく使う商品名と価格をリストアップ
            const frequentItems = analyzeFrequentItems(response.records);
            
            // 入力補助UIに反映
            displayInputSuggestions(frequentItems);
            
        } catch (error) {
            console.error('入力履歴読み込みエラー:', error);
        }
    }

    /**
     * 現在の予算情報を表示する関数
     */
    async function displayCurrentBudget() {
        try {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            
            const query = `年 = ${year} and 月 = ${month}`;
            
            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: BUDGET_APP_ID,
                query: query
            });

            if (response.records.length > 0) {
                createBudgetDisplayWidget(response.records);
            }
            
        } catch (error) {
            console.error('予算情報取得エラー:', error);
        }
    }

    /**
     * 関連レコードを更新する関数
     */
    async function updateRelatedRecords(record) {
        // 例: 支出レコード作成時に、銀行口座残高を更新
        try {
            const amount = parseInt(record.total.value) || 0;
            const paymentMethod = record.payment_method?.value;
            
            if (paymentMethod === '銀行引き落とし') {
                // 銀行口座アプリの残高を更新
                await updateBankBalance(amount);
            }
            
        } catch (error) {
            console.error('関連レコード更新エラー:', error);
        }
    }

    /**
     * 予算アラートを表示する関数
     */
    function showBudgetAlert(type, category, budget, actual, percent) {
        const alertDiv = document.createElement('div');
        
        const colors = {
            warning: { bg: '#fff3cd', border: '#ffeaa7', text: '#856404' },
            danger: { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24' }
        };
        
        const color = colors[type];
        
        alertDiv.style.cssText = `
            background-color: ${color.bg};
            border: 1px solid ${color.border};
            color: ${color.text};
            padding: 12px;
            margin: 10px 0;
            border-radius: 4px;
            font-size: 14px;
        `;
        
        const icon = type === 'danger' ? '🚨' : '⚠️';
        const message = type === 'danger' ? '予算を超過しました！' : '予算の80%に達しました';
        
        alertDiv.innerHTML = `
            <strong>${icon} ${message}</strong><br>
            カテゴリ: ${category}<br>
            予算: ¥${budget.toLocaleString()}<br>
            実績: ¥${actual.toLocaleString()} (${Math.round(percent)}%)
        `;
        
        const spaceElement = kintone.app.record.getSpaceElement('budget_alert');
        if (spaceElement) {
            spaceElement.appendChild(alertDiv);
        }
    }

    /**
     * 類似商品の提案を表示
     */
    function showSimilarItemSuggestions(items) {
        const suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'similar-items';
        suggestionDiv.style.cssText = `
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 10px;
            margin: 10px 0;
            max-height: 200px;
            overflow-y: auto;
        `;
        
        suggestionDiv.innerHTML = '<strong>💡 過去の類似商品:</strong><br>';
        
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.style.cssText = `
                padding: 5px;
                cursor: pointer;
                border-bottom: 1px solid #eee;
            `;
            
            itemDiv.innerHTML = `
                <span style="font-weight: bold;">${item.name}</span>
                <span style="color: #666; margin-left: 10px;">¥${parseInt(item.price).toLocaleString()}</span>
                <span style="color: #999; margin-left: 10px;">${item.category}</span>
            `;
            
            itemDiv.onclick = () => {
                const record = kintone.app.record.get().record;
                record.item_name.value = item.name;
                record.price.value = item.price;
                record.category.value = item.category;
                kintone.app.record.set({ record: record });
                suggestionDiv.remove();
            };
            
            suggestionDiv.appendChild(itemDiv);
        });
        
        const spaceElement = kintone.app.record.getSpaceElement('suggestions');
        if (spaceElement) {
            spaceElement.appendChild(suggestionDiv);
        }
    }

    // ヘルパー関数
    function analyzeFrequentItems(records) {
        const itemFrequency = {};
        
        records.forEach(record => {
            const itemName = record.item_name.value;
            if (itemName) {
                itemFrequency[itemName] = (itemFrequency[itemName] || 0) + 1;
            }
        });
        
        return Object.entries(itemFrequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));
    }

    function displayInputSuggestions(frequentItems) {
        console.log('よく使う商品:', frequentItems);
        // 実際の実装では、入力補助UIを更新
    }

    function createBudgetDisplayWidget(budgetRecords) {
        console.log('予算情報:', budgetRecords);
        // 実際の実装では、予算表示ウィジェットを作成
    }

    async function updateBankBalance(amount) {
        // 実際の実装では、銀行口座アプリの残高を更新
        console.log(`銀行残高を${amount}円減算`);
    }

})();

/**
 * 学習ポイント：
 * 
 * 1. REST API の基本
 *    - kintone.api() の使用方法
 *    - GET/POST/PUT の使い分け
 *    - クエリ文の書き方
 * 
 * 2. 非同期処理
 *    - async/await の活用
 *    - try/catch によるエラーハンドリング
 *    - Promise チェーン
 * 
 * 3. アプリ間連携
 *    - 複数アプリのデータ参照
 *    - マスターデータの活用
 *    - 統計データの自動更新
 * 
 * 4. パフォーマンス考慮
 *    - 必要なデータのみ取得
 *    - 適切なクエリ条件
 *    - 重複処理の回避
 * 
 * 次のステップ：
 * - 一括処理の実装
 * - 外部API連携
 * - 高度なデータ分析機能
 */