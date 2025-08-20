/**
 * イベント処理とUI制御
 * 
 * このサンプルでは以下を学習できます：
 * - 様々なkintoneイベントの活用
 * - 動的なUI制御
 * - ユーザーインタラクションの処理
 * - 条件分岐による表示制御
 */

(() => {
    'use strict';

    // アプリ読み込み時の初期化処理
    kintone.events.on('app.record.index.show', (event) => {
        console.log('一覧画面が表示されました');
        
        // カスタムボタンを追加
        addCustomButtons();
        
        // 一覧画面に集計情報を表示
        displaySummaryInfo();
        
        return event;
    });

    // レコード詳細画面での処理
    kintone.events.on('app.record.detail.show', (event) => {
        const record = event.record;
        
        // カテゴリに応じたアイコン表示
        addCategoryIcon(record);
        
        // 関連する推奨商品を表示
        showRecommendedItems(record);
        
        // 編集ボタンのカスタマイズ
        customizeEditButton(record);
        
        return event;
    });

    // レコード編集/作成画面での処理
    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {
        const record = event.record;
        
        // カテゴリ選択時の動的制御
        setupCategoryDependentFields();
        
        // 価格入力補助機能
        setupPriceInputHelper();
        
        // 商品名入力補助（オートコンプリート風）
        setupItemNameHelper();
        
        return event;
    });

    // カテゴリ変更時の処理
    kintone.events.on(['app.record.create.change.category', 'app.record.edit.change.category'], (event) => {
        const record = event.record;
        const category = record.category.value;
        
        // カテゴリに応じたフィールドの表示制御
        controlFieldsByCategory(category);
        
        // カテゴリ別のデフォルト値設定
        setDefaultValuesByCategory(record, category);
        
        return event;
    });

    // 日付変更時の処理
    kintone.events.on(['app.record.create.change.date', 'app.record.edit.change.date'], (event) => {
        const record = event.record;
        const selectedDate = record.date.value;
        
        if (selectedDate) {
            // 曜日を表示
            displayDayOfWeek(selectedDate);
            
            // 月次予算の残高を表示
            displayMonthlyBudgetBalance(selectedDate);
            
            // 過去の同じ日付のデータを参考表示
            showHistoricalData(selectedDate);
        }
        
        return event;
    });

    /**
     * カスタムボタンを追加する関数
     */
    function addCustomButtons() {
        const headerSpace = kintone.app.getHeaderSpaceElement();
        if (!headerSpace) return;

        // 月次レポートボタン
        const monthlyReportBtn = document.createElement('button');
        monthlyReportBtn.textContent = '月次レポート';
        monthlyReportBtn.className = 'kintoneplugin-button-normal';
        monthlyReportBtn.style.marginRight = '10px';
        monthlyReportBtn.onclick = generateMonthlyReport;

        // データエクスポートボタン
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'データエクスポート';
        exportBtn.className = 'kintoneplugin-button-normal';
        exportBtn.style.marginRight = '10px';
        exportBtn.onclick = exportData;

        // 予算設定ボタン
        const budgetBtn = document.createElement('button');
        budgetBtn.textContent = '予算設定';
        budgetBtn.className = 'kintoneplugin-button-normal';
        budgetBtn.onclick = openBudgetSettings;

        headerSpace.appendChild(monthlyReportBtn);
        headerSpace.appendChild(exportBtn);
        headerSpace.appendChild(budgetBtn);
    }

    /**
     * 集計情報を表示する関数
     */
    function displaySummaryInfo() {
        const spaceElement = kintone.app.getHeaderSpaceElement();
        if (!spaceElement) return;

        // 集計情報を表示するエリアを作成
        const summaryDiv = document.createElement('div');
        summaryDiv.id = 'summary-info';
        summaryDiv.style.cssText = `
            background: #f5f5f5;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            font-size: 14px;
        `;

        // 今月の集計データ（実際の実装ではREST APIで取得）
        const currentMonth = new Date().getMonth() + 1;
        const summaryData = {
            totalAmount: 125000,
            recordCount: 45,
            topCategory: '食費'
        };

        summaryDiv.innerHTML = `
            <strong>今月の家計簿サマリー (${currentMonth}月)</strong><br>
            総支出: ¥${summaryData.totalAmount.toLocaleString()}<br>
            記録件数: ${summaryData.recordCount}件<br>
            最多カテゴリ: ${summaryData.topCategory}
        `;

        spaceElement.appendChild(summaryDiv);
    }

    /**
     * カテゴリアイコンを追加する関数
     */
    function addCategoryIcon(record) {
        const category = record.category.value;
        const categoryElement = kintone.app.record.getFieldElement('category');
        
        if (!categoryElement || !category) return;

        const icons = {
            '食費': '🍽️',
            '交通費': '🚃',
            '娯楽費': '🎮',
            '固定費': '🏠',
            '衣服': '👕',
            '医療費': '🏥'
        };

        const icon = icons[category] || '💰';
        
        // アイコンを追加
        const iconSpan = document.createElement('span');
        iconSpan.textContent = icon + ' ';
        iconSpan.style.fontSize = '16px';
        
        categoryElement.parentNode.insertBefore(iconSpan, categoryElement);
    }

    /**
     * カテゴリ別フィールド制御
     */
    function controlFieldsByCategory(category) {
        // 全フィールドを一度表示
        kintone.app.record.setFieldShown('quantity', true);
        kintone.app.record.setFieldShown('memo', true);
        
        switch (category) {
            case '固定費':
                // 固定費の場合は数量を非表示
                kintone.app.record.setFieldShown('quantity', false);
                break;
                
            case '交通費':
                // 交通費の場合はメモを必須風に見せる
                const memoElement = kintone.app.record.getFieldElement('memo');
                if (memoElement) {
                    memoElement.style.backgroundColor = '#fff3cd';
                    memoElement.placeholder = '交通手段や目的地を記入してください';
                }
                break;
                
            case '娯楽費':
                // 娯楽費の場合は詳細を記録するようプロンプト
                showCategoryTip('娯楽費', '何に使ったか詳しく記録しましょう！');
                break;
        }
    }

    /**
     * カテゴリ別デフォルト値設定
     */
    function setDefaultValuesByCategory(record, category) {
        const defaultValues = {
            '交通費': { quantity: 1, memo: '交通費' },
            '固定費': { quantity: 1 },
            '食費': { memo: '食事' }
        };

        const defaults = defaultValues[category];
        if (defaults) {
            Object.keys(defaults).forEach(fieldCode => {
                if (!record[fieldCode].value) {
                    record[fieldCode].value = defaults[fieldCode];
                }
            });
        }
    }

    /**
     * 価格入力補助機能
     */
    function setupPriceInputHelper() {
        const priceElement = kintone.app.record.getFieldElement('price');
        if (!priceElement) return;

        // よく使う金額のクイックボタンを追加
        const quickAmounts = [100, 500, 1000, 2000, 5000];
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '5px';

        quickAmounts.forEach(amount => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `¥${amount}`;
            button.style.cssText = `
                margin-right: 5px;
                padding: 2px 8px;
                border: 1px solid #ccc;
                background: #f9f9f9;
                border-radius: 3px;
                font-size: 12px;
                cursor: pointer;
            `;
            
            button.onclick = () => {
                const record = kintone.app.record.get().record;
                record.price.value = amount;
                kintone.app.record.set({ record: record });
            };

            buttonContainer.appendChild(button);
        });

        priceElement.parentNode.appendChild(buttonContainer);
    }

    /**
     * 商品名入力補助
     */
    function setupItemNameHelper() {
        const itemNameElement = kintone.app.record.getFieldElement('item_name');
        if (!itemNameElement) return;

        // よく使う商品名の候補
        const commonItems = ['昼食', '夕食', 'コンビニ', '電車代', 'バス代', 'コーヒー', '本', '映画'];
        
        itemNameElement.addEventListener('focus', () => {
            showItemSuggestions(itemNameElement, commonItems);
        });
    }

    /**
     * 商品名候補を表示
     */
    function showItemSuggestions(element, suggestions) {
        // 既存の候補リストを削除
        const existingSuggestions = document.querySelector('.item-suggestions');
        if (existingSuggestions) {
            existingSuggestions.remove();
        }

        const suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'item-suggestions';
        suggestionDiv.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ccc;
            border-top: none;
            max-height: 150px;
            overflow-y: auto;
            z-index: 1000;
            width: ${element.offsetWidth}px;
        `;

        suggestions.forEach(item => {
            const suggestionItem = document.createElement('div');
            suggestionItem.textContent = item;
            suggestionItem.style.cssText = `
                padding: 8px;
                cursor: pointer;
                border-bottom: 1px solid #eee;
            `;
            
            suggestionItem.onmouseover = () => {
                suggestionItem.style.backgroundColor = '#f0f0f0';
            };
            
            suggestionItem.onmouseout = () => {
                suggestionItem.style.backgroundColor = 'white';
            };
            
            suggestionItem.onclick = () => {
                const record = kintone.app.record.get().record;
                record.item_name.value = item;
                kintone.app.record.set({ record: record });
                suggestionDiv.remove();
            };

            suggestionDiv.appendChild(suggestionItem);
        });

        element.parentNode.appendChild(suggestionDiv);

        // 他の場所をクリックしたら候補リストを閉じる
        setTimeout(() => {
            document.addEventListener('click', function closeSuggestions(e) {
                if (!suggestionDiv.contains(e.target) && e.target !== element) {
                    suggestionDiv.remove();
                    document.removeEventListener('click', closeSuggestions);
                }
            });
        }, 100);
    }

    /**
     * カテゴリ別のヒントを表示
     */
    function showCategoryTip(category, message) {
        const tipDiv = document.createElement('div');
        tipDiv.style.cssText = `
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 10px;
            margin: 10px 0;
            font-size: 14px;
        `;
        tipDiv.innerHTML = `<strong>💡 ${category}のヒント:</strong> ${message}`;

        const spaceElement = kintone.app.record.getSpaceElement('tips');
        if (spaceElement) {
            spaceElement.appendChild(tipDiv);
        }
    }

    /**
     * 曜日を表示する関数
     */
    function displayDayOfWeek(dateString) {
        const date = new Date(dateString);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dayOfWeek = dayNames[date.getDay()];
        
        const dateElement = kintone.app.record.getFieldElement('date');
        if (dateElement && dateElement.parentNode) {
            // 既存の曜日表示を削除
            const existingDay = dateElement.parentNode.querySelector('.day-of-week');
            if (existingDay) {
                existingDay.remove();
            }

            // 新しい曜日表示を追加
            const daySpan = document.createElement('span');
            daySpan.className = 'day-of-week';
            daySpan.textContent = ` (${dayOfWeek})`;
            daySpan.style.color = '#666';
            daySpan.style.fontSize = '14px';
            
            dateElement.parentNode.appendChild(daySpan);
        }
    }

    // カスタムボタンのイベントハンドラ
    function generateMonthlyReport() {
        alert('月次レポート機能は開発中です。\n実装時はREST APIでデータを取得し、グラフ表示します。');
    }

    function exportData() {
        alert('データエクスポート機能は開発中です。\n実装時はCSVまたはExcel形式でダウンロードします。');
    }

    function openBudgetSettings() {
        alert('予算設定機能は開発中です。\n実装時はモーダルダイアログで予算を設定します。');
    }

    function displayMonthlyBudgetBalance(dateString) {
        // 実際の実装では、選択された月の予算と実績を比較
        console.log(`${dateString}の月の予算残高をチェック中...`);
    }

    function showHistoricalData(dateString) {
        // 実際の実装では、過去の同じ日付のデータをREST APIで取得
        console.log(`${dateString}の過去データを検索中...`);
    }

})();

/**
 * 学習ポイント：
 * 
 * 1. イベントの活用
 *    - 画面表示イベント（show）
 *    - フィールド変更イベント（change）
 *    - カスタムイベント処理
 * 
 * 2. 動的UI制御
 *    - 要素の動的生成・削除
 *    - スタイルの動的変更
 *    - 条件による表示制御
 * 
 * 3. ユーザビリティの向上
 *    - 入力補助機能
 *    - 視覚的フィードバック
 *    - オートコンプリート風機能
 * 
 * 4. DOM操作
 *    - getFieldElement()の活用
 *    - カスタム要素の追加
 *    - イベントリスナーの設定
 * 
 * 次のステップ：
 * - REST APIを使用したデータ取得
 * - より複雑なUI コンポーネントの作成
 * - 外部ライブラリとの連携
 */