/**
 * 練習問題1の解答例: 基本的なフィールド操作
 * 
 * この解答では以下の機能を実装しています：
 * 1. 価格×数量の自動計算
 * 2. 1万円超過時の視覚的フィードバック
 * 3. カテゴリ別のUI制御
 */

(() => {
    'use strict';

    // 価格または数量の変更時に合計を自動計算
    kintone.events.on([
        'app.record.create.change.price',
        'app.record.create.change.quantity',
        'app.record.edit.change.price',
        'app.record.edit.change.quantity'
    ], (event) => {
        calculateAndUpdateTotal(event);
        return event;
    });

    // カテゴリ変更時のUI制御
    kintone.events.on([
        'app.record.create.change.category',
        'app.record.edit.change.category'
    ], (event) => {
        handleCategoryChange(event);
        return event;
    });

    // 画面表示時の初期設定
    kintone.events.on([
        'app.record.create.show',
        'app.record.edit.show'
    ], (event) => {
        // 初期計算
        calculateAndUpdateTotal(event);
        // カテゴリに応じた初期設定
        handleCategoryChange(event);
        return event;
    });

    /**
     * 合計金額の計算と表示更新
     */
    function calculateAndUpdateTotal(event) {
        const record = event.record;
        
        // 値の取得（数値でない場合は0とする）
        const price = parseInt(record.price.value) || 0;
        const quantity = parseInt(record.quantity.value) || 0;
        
        // 合計計算
        const total = price * quantity;
        
        // 合計フィールドに設定
        record.total.value = total;
        
        // 視覚的フィードバック
        updateTotalFieldAppearance(total);
    }

    /**
     * 合計フィールドの見た目を更新
     */
    function updateTotalFieldAppearance(total) {
        const totalElement = kintone.app.record.getFieldElement('total');
        
        if (totalElement) {
            // 1万円を超える場合は背景色を変更
            if (total > 10000) {
                totalElement.style.backgroundColor = '#ffebee'; // 薄い赤色
                totalElement.style.fontWeight = 'bold';
                
                // 警告アイコンを追加（既存のものがあれば削除してから）
                removeWarningIcon(totalElement);
                addWarningIcon(totalElement);
            } else {
                // 通常の表示に戻す
                totalElement.style.backgroundColor = '';
                totalElement.style.fontWeight = '';
                removeWarningIcon(totalElement);
            }
        }
    }

    /**
     * カテゴリ変更時の処理
     */
    function handleCategoryChange(event) {
        const record = event.record;
        const category = record.category.value;
        
        // メモフィールドの要素を取得
        const memoElement = kintone.app.record.getFieldElement('memo');
        
        if (memoElement) {
            // カテゴリに応じてプレースホルダーを設定
            switch (category) {
                case '食費':
                    memoElement.placeholder = '食事内容を詳しく記録しましょう';
                    memoElement.style.backgroundColor = '#f0f8f0'; // 薄い緑
                    break;
                case '交通費':
                    memoElement.placeholder = '交通手段や目的地を記入してください';
                    memoElement.style.backgroundColor = '#f0f8ff'; // 薄い青
                    break;
                case '娯楽費':
                    memoElement.placeholder = '何に使ったか詳しく記録しましょう';
                    memoElement.style.backgroundColor = '#fff8f0'; // 薄いオレンジ
                    break;
                default:
                    memoElement.placeholder = 'メモを入力してください';
                    memoElement.style.backgroundColor = '';
                    break;
            }
        }
    }

    /**
     * 警告アイコンを追加
     */
    function addWarningIcon(element) {
        const icon = document.createElement('span');
        icon.className = 'warning-icon';
        icon.innerHTML = ' ⚠️';
        icon.style.color = '#ff5722';
        icon.title = '高額な支出です';
        
        element.parentNode.appendChild(icon);
    }

    /**
     * 警告アイコンを削除
     */
    function removeWarningIcon(element) {
        const existingIcon = element.parentNode.querySelector('.warning-icon');
        if (existingIcon) {
            existingIcon.remove();
        }
    }

})();

/**
 * 解答のポイント:
 * 
 * 1. イベントハンドラの適切な設定
 *    - 作成・編集の両方に対応
 *    - 複数フィールドの変更に対応
 * 
 * 2. 数値計算の安全な実装
 *    - parseInt() と || 0 で不正な値を処理
 *    - 計算結果の適切な設定
 * 
 * 3. DOM操作の基本
 *    - getFieldElement() でのフィールド要素取得
 *    - スタイルの動的変更
 *    - 要素の追加・削除
 * 
 * 4. ユーザビリティの考慮
 *    - 視覚的フィードバック
 *    - わかりやすいプレースホルダー
 *    - アクセシブルなアイコン表示
 * 
 * 改善点のアイデア:
 * - アニメーション効果の追加
 * - 多言語対応
 * - より複雑な計算ロジック
 * - 設定可能な閾値
 */