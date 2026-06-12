/**
 * Manipulation check items — internal only.
 * Construct names are NEVER shown to participants.
 */

export interface McItem {
  item_id: number;
  construct: string; // internal/admin-only
  item_text: string; // shown to participant in Chinese
  reverse_scored: boolean;
}

export const MC_ITEMS: McItem[] = [
  // Construct 1: resource_insufficiency (items 1–5)
  {
    item_id: 1,
    construct: "resource_insufficiency",
    item_text: "我感觉上一项任务中的可用资源比较有限。",
    reverse_scored: false,
  },
  {
    item_id: 2,
    construct: "resource_insufficiency",
    item_text: "我担心当前资源可能不足以支持后续任务。",
    reverse_scored: false,
  },
  {
    item_id: 3,
    construct: "resource_insufficiency",
    item_text: "我觉得自己需要谨慎管理当前资源。",
    reverse_scored: false,
  },
  {
    item_id: 4,
    construct: "resource_insufficiency",
    item_text: "我感觉自己的资源余额处于一种有压力的状态。",
    reverse_scored: false,
  },
  {
    item_id: 5,
    construct: "resource_insufficiency",
    item_text: "我会注意自己当前资源是否足够。",
    reverse_scored: false,
  },
  // Construct 2: resource_confidence (items 6–7)
  {
    item_id: 6,
    construct: "resource_confidence",
    item_text: "我觉得当前资源足够支持我完成后续任务。",
    reverse_scored: false,
  },
  {
    item_id: 7,
    construct: "resource_confidence",
    item_text: "我对自己当前的资源状况比较有信心。",
    reverse_scored: false,
  },
  // Construct 3: stress_negative_affect (items 8–10)
  {
    item_id: 8,
    construct: "stress_negative_affect",
    item_text: "我在上一项任务中感到有压力。",
    reverse_scored: false,
  },
  {
    item_id: 9,
    construct: "stress_negative_affect",
    item_text: "我在上一项任务中感到紧张或不安。",
    reverse_scored: false,
  },
  {
    item_id: 10,
    construct: "stress_negative_affect",
    item_text: "我担心自己在任务中的表现不够好。",
    reverse_scored: false,
  },
  // Construct 4: task_engagement (items 11–14)
  {
    item_id: 11,
    construct: "task_engagement",
    item_text: "我有动力认真完成上一项任务。",
    reverse_scored: false,
  },
  {
    item_id: 12,
    construct: "task_engagement",
    item_text: "我在上一项任务中比较投入。",
    reverse_scored: false,
  },
  {
    item_id: 13,
    construct: "task_engagement",
    item_text: "我觉得上一项任务具有一定挑战性。",
    reverse_scored: false,
  },
  {
    item_id: 14,
    construct: "task_engagement",
    item_text: "我认真关注了任务说明和反馈信息。",
    reverse_scored: false,
  },
];
