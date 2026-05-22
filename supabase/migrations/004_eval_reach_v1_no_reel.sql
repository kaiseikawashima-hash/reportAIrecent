-- ============================================
-- Phase 検証: reach v1 プロンプトにリール除外指示を追加
-- ============================================
-- 検証フェーズではリール考察を評価対象外とするため、
-- eval_prompt_versions の section='reach', version_label='v1' レコードに
-- 「リール考察を生成しない」明示的な指示を末尾に追加する。
--
-- 注意:
--   - 本番アプリの app/api/generate-report/route.ts は変更しない
--   - 対象は eval_prompt_versions テーブルの 1 レコードのみ
--   - summary, follower, account の v1 は変更しない（元々リールに言及していない）

update eval_prompt_versions
set
  prompt_template = $prompt$[Layer 1] マスターFMT
{master_fmt}
[Layer 2] クライアント属性
会社名: {client_name}
エリア: {client_area}
特徴メモ: {client_auto_memo}
[Layer 3] 今月の構造化数値
{diff_text}
[Layer 3-b] 詳細データ
{detail_text}
[Layer 4] 過去レポート参照（文体・施策の参考）
※ マスターFMTと矛盾する場合はマスターFMTを優先すること
{knowledge_text}
[Layer 5] 担当者メモ
{operator_memo}
[Layer 6] 投稿サムネイル画像
※ 添付画像はフィードTOP3・ワースト3のサムネイル
※ テーマ・デザイン傾向を考察に活かすこと
[既に生成済みのセクション（文脈として参照）]
{previous_sections}
---
【重要・検証フェーズ限定の指示】
本セクションでは、フィードのリーチ分析のみを生成すること。
リール（動画コンテンツ）に関する考察は本検証では評価対象外のため、出力に一切含めないこと。
入力データ（[Layer 3] [Layer 3-b]）に reel_ranking や reel_posts が含まれていても、それらには言及しない。

出力構成は以下の4点のみ:
1. 全体的なリーチ・エンゲージメント傾向（フィード基準）
2. フィード TOP3 の個別考察
3. フィード ワースト3 の個別考察
4. 次月のフィード施策提案

上記をもとに「リーチ分析（フィード版）」セクションを生成してください
Markdown形式で出力すること$prompt$,
  description = '本番アプリと同じプロンプト（ベースライン）+ 検証フェーズ用にリール考察を除外'
where section = 'reach' and version_label = 'v1';
