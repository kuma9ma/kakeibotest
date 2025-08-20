/**
 * バリデーション機能の実装
 * 
 * このサンプルでは以下を学習できます：
 * - 入力値の検証
 * - エラーメッセージの表示
 * - 保存処理の制御
 * - カスタムバリデーション関数の作成
 */

(() => {
    'use strict';

    // レコード保存前のバリデーション
    kintone.events.on(['app.record.create.submit', 'app.record.edit.submit'], (event) => {
        const record = event.record;
        const errors = [];

        // 必須項目チェック
        if (!record.item_name.value) {
            errors.push('商品名は必須です。');
        }

        if (!record.price.value || record.price.value <= 0) {
            errors.push('価格は1円以上で入力してください。');
        }

        if (!record.category.value) {
            errors.push('カテゴリを選択してください。');
        }

        // 日付の妥当性チェック
        if (record.date.value) {
            const inputDate = new Date(record.date.value);
            const today = new Date();
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(today.getFullYear() - 1);

            if (inputDate > today) {
                errors.push('未来の日付は入力できません。');
            }

            if (inputDate < oneYearAgo) {
                errors.push('1年以上前の日付は入力できません。');
            }
        }

        // 商品名の文字数チェック
        if (record.item_name.value && record.item_name.value.length > 50) {
            errors.push('商品名は50文字以内で入力してください。');
        }

        // 価格の上限チェック
        const price = parseInt(record.price.value) || 0;
        if (price > 1000000) {
            errors.push('価格は100万円以下で入力してください。');
        }

        // 数量の妥当性チェック
        const quantity = parseInt(record.quantity.value) || 0;
        if (quantity < 0) {
            errors.push('数量は0以上で入力してください。');
        }

        if (quantity > 100) {
            errors.push('数量は100以下で入力してください。');
        }

        // カテゴリ別の特別なバリデーション
        const category = record.category.value;
        if (category === '食費' && price > 50000) {
            errors.push('食費は5万円以下で入力してください。');
        }

        if (category === '交通費' && quantity > 1) {
            errors.push('交通費の数量は通常1です。確認してください。');
        }

        // 重複チェック（同じ日付・同じ商品名）
        if (record.date.value && record.item_name.value) {
            // 実際の実装では、kintone REST APIを使用して重複チェックを行います
            // ここでは簡易的な例として、特定のパターンをチェック
            const duplicateCheck = checkDuplicate(record.date.value, record.item_name.value);
            if (duplicateCheck.isDuplicate) {
                errors.push(`同じ日付に同じ商品名のレコードが既に存在します。(${duplicateCheck.count}件)`);
            }
        }

        // エラーがある場合は保存を中断
        if (errors.length > 0) {
            event.error = errors.join('\n');
            return event;
        }

        // 保存前の最終処理
        // 合計金額の再計算（念のため）
        const total = price * quantity;
        record.total.value = total;

        // 月次予算チェック（警告レベル）
        checkMonthlyBudget(record);

        return event;
    });

    // リアルタイムバリデーション（フィールド変更時）
    kintone.events.on(['app.record.create.change.price', 'app.record.edit.change.price'], (event) => {
        const record = event.record;
        const price = parseInt(record.price.value) || 0;

        // 価格フィールドの要素を取得
        const priceElement = kintone.app.record.getFieldElement('price');
        
        if (price < 0) {
            // 負の値の場合は警告表示
            showFieldWarning(priceElement, 'マイナスの金額は入力できません');
            record.price.value = 0;
        } else if (price > 100000) {
            // 高額の場合は警告表示
            showFieldWarning(priceElement, '10万円を超える金額です。正しいですか？');
        } else {
            // 警告をクリア
            clearFieldWarning(priceElement);
        }

        return event;
    });

    kintone.events.on(['app.record.create.change.item_name', 'app.record.edit.change.item_name'], (event) => {
        const record = event.record;
        const itemName = record.item_name.value;

        // 商品名の要素を取得
        const itemNameElement = kintone.app.record.getFieldElement('item_name');

        if (itemName && itemName.length > 50) {
            showFieldWarning(itemNameElement, '商品名は50文字以内で入力してください');
        } else {
            clearFieldWarning(itemNameElement);
        }

        return event;
    });

    /**
     * 重複チェック関数（簡易版）
     * 実際の開発では kintone REST API を使用します
     */
    function checkDuplicate(date, itemName) {
        // この例では固定的な判定を行います
        // 実際の実装では、kintone.api を使用してレコードを検索
        
        const duplicatePatterns = [
            { date: '2024-01-01', itemName: 'テスト商品' },
            { date: '2024-01-15', itemName: 'サンプル' }
        ];

        const isDuplicate = duplicatePatterns.some(pattern => 
            pattern.date === date && pattern.itemName === itemName
        );

        return {
            isDuplicate: isDuplicate,
            count: isDuplicate ? 1 : 0
        };
    }

    /**
     * 月次予算チェック関数
     */
    function checkMonthlyBudget(record) {
        const category = record.category.value;
        const total = parseInt(record.total.value) || 0;
        
        // カテゴリ別の月次予算設定（例）
        const monthlyBudgets = {
            '食費': 50000,
            '交通費': 20000,
            '娯楽費': 30000,
            '固定費': 100000
        };

        const budget = monthlyBudgets[category];
        if (budget && total > budget * 0.8) {
            // 予算の80%を超えた場合は警告
            console.warn(`注意: ${category}の予算(${budget}円)の80%を超えています`);
        }
    }

    /**
     * フィールドに警告を表示する関数
     */
    function showFieldWarning(element, message) {
        if (!element) return;

        // 既存の警告を削除
        clearFieldWarning(element);

        // 警告要素を作成
        const warningDiv = document.createElement('div');
        warningDiv.className = 'kintone-field-warning';
        warningDiv.style.color = '#ff5722';
        warningDiv.style.fontSize = '12px';
        warningDiv.style.marginTop = '4px';
        warningDiv.textContent = message;

        // 警告を表示
        element.parentNode.appendChild(warningDiv);
        
        // フィールドの背景色を変更
        element.style.backgroundColor = '#ffebee';
    }

    /**
     * フィールドの警告をクリアする関数
     */
    function clearFieldWarning(element) {
        if (!element) return;

        // 警告要素を削除
        const warnings = element.parentNode.querySelectorAll('.kintone-field-warning');
        warnings.forEach(warning => warning.remove());

        // 背景色をリセット
        element.style.backgroundColor = '';
    }

})();

/**
 * 学習ポイント：
 * 
 * 1. バリデーションのタイミング
 *    - 保存時バリデーション: submit イベント
 *    - リアルタイムバリデーション: change イベント
 * 
 * 2. エラーハンドリング
 *    - event.error でエラーメッセージを設定
 *    - 複数のエラーを配列で管理
 * 
 * 3. ユーザビリティの向上
 *    - 視覚的フィードバック（色の変更）
 *    - 具体的なエラーメッセージ
 *    - リアルタイム警告
 * 
 * 4. 業務ロジックの実装
 *    - 重複チェック
 *    - 予算チェック
 *    - カテゴリ別ルール
 * 
 * 次のステップ：
 * - kintone REST API を使用した重複チェック
 * - より複雑な業務ルールの実装
 * - 外部システムとの連携バリデーション
 */