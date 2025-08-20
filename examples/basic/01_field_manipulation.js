/**
 * 基本的なフィールド操作
 * 
 * このサンプルでは以下を学習できます：
 * - フィールド値の取得
 * - フィールド値の設定
 * - 基本的な計算処理
 * - フィールドの表示/非表示制御
 */

(() => {
    'use strict';

    // レコード詳細画面表示時のイベント
    kintone.events.on('app.record.detail.show', (event) => {
        console.log('レコード詳細画面が表示されました');
        
        // フィールド値の取得例
        const record = event.record;
        const itemName = record.item_name.value; // 商品名
        const price = record.price.value;        // 価格
        const quantity = record.quantity.value;  // 数量
        
        console.log(`商品名: ${itemName}, 価格: ${price}, 数量: ${quantity}`);
        
        return event;
    });

    // レコード編集画面表示時のイベント
    kintone.events.on('app.record.edit.show', (event) => {
        // 合計金額を自動計算する例
        calculateTotal(event);
        
        // 特定の条件でフィールドを非表示にする例
        const record = event.record;
        if (record.category.value === '固定費') {
            // 固定費の場合は数量フィールドを非表示
            kintone.app.record.setFieldShown('quantity', false);
        }
        
        return event;
    });

    // レコード作成画面表示時のイベント
    kintone.events.on('app.record.create.show', (event) => {
        // デフォルト値を設定する例
        const record = event.record;
        
        // 今日の日付をデフォルトで設定
        const today = new Date();
        const dateString = today.getFullYear() + '-' + 
                          String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                          String(today.getDate()).padStart(2, '0');
        
        record.date.value = dateString;
        
        // 合計金額の初期化
        record.total.value = 0;
        
        return event;
    });

    // フィールド値変更時のイベント（価格または数量が変更された時）
    kintone.events.on(['app.record.create.change.price', 
                      'app.record.create.change.quantity',
                      'app.record.edit.change.price', 
                      'app.record.edit.change.quantity'], (event) => {
        
        // リアルタイムで合計金額を計算
        calculateTotal(event);
        
        return event;
    });

    /**
     * 合計金額を計算する関数
     * @param {Object} event - kintoneイベントオブジェクト
     */
    function calculateTotal(event) {
        const record = event.record;
        const price = parseInt(record.price.value) || 0;
        const quantity = parseInt(record.quantity.value) || 0;
        
        // 合計 = 価格 × 数量
        const total = price * quantity;
        
        // 合計フィールドに値を設定
        record.total.value = total;
        
        // 合計金額に応じて背景色を変更（視覚的フィードバック）
        const totalElement = kintone.app.record.getFieldElement('total');
        if (totalElement) {
            if (total > 10000) {
                totalElement.style.backgroundColor = '#ffebee'; // 薄い赤
            } else if (total > 5000) {
                totalElement.style.backgroundColor = '#fff3e0'; // 薄いオレンジ
            } else {
                totalElement.style.backgroundColor = '#e8f5e8'; // 薄い緑
            }
        }
    }

})();

/**
 * 学習ポイント：
 * 
 * 1. イベントの種類
 *    - app.record.detail.show : 詳細画面表示時
 *    - app.record.edit.show   : 編集画面表示時
 *    - app.record.create.show : 作成画面表示時
 *    - app.record.*.change.*  : フィールド値変更時
 * 
 * 2. フィールド操作
 *    - event.record.フィールドコード.value でアクセス
 *    - 値の取得と設定が可能
 * 
 * 3. UI操作
 *    - kintone.app.record.setFieldShown() で表示/非表示
 *    - kintone.app.record.getFieldElement() でDOM要素取得
 * 
 * 4. 実用的なパターン
 *    - 自動計算
 *    - 条件による表示制御
 *    - 視覚的フィードバック
 * 
 * 次のステップ：
 * - バリデーション機能を追加してみましょう
 * - より複雑な計算ロジックを実装してみましょう
 */