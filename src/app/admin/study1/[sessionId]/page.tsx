import { getDb } from "@/lib/db";
import { STAGE_LABELS } from "@/lib/stages";
import type { Stage } from "@/lib/stages";
import Link from "next/link";
import Image from "next/image";

const DEV = process.env.NEXT_PUBLIC_DEV_TEST_MODE === "true";

interface Props { params: Promise<{ sessionId: string }> }

export default async function SessionDetailPage({ params }: Props) {
  const { sessionId } = await params;
  const db = getDb();

  const ses = db.prepare("SELECT s.*, p.participant_code, p.name, p.birth_date, p.gender, p.grade, p.major, p.contact FROM experiment_sessions s JOIN participants p ON p.id=s.participant_id WHERE s.id=?").get(sessionId) as any;
  if (!ses) return <div className="p-8 text-center text-sm text-gray-400">Session not found.</div>;

  const stage = ses.current_stage as Stage;

  // Quality gate
  const lmCount = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_map WHERE session_id=?").get(sessionId) as any).cnt;
  const vq = db.prepare("SELECT * FROM liking_validation_quality WHERE session_id=?").get(sessionId) as any;
  const gateOk = lmCount === 25 && vq && vq.validation_passed && !vq.needs_rerank;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/admin/study1" className="text-sm text-gray-400 hover:text-gray-900">← Study 1</Link>
        <h1 className="text-xl font-semibold text-gray-900">{ses.participant_code}</h1>
        <span className="text-sm text-gray-500 capitalize">{ses.group_label}</span>
        <span className="text-xs text-gray-400">{STAGE_LABELS[stage] ?? stage}</span>
        {DEV && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">DEV</span>}
        {gateOk && <span className="text-xs text-green-700">✅ gates passed</span>}
        {!gateOk && lmCount === 25 && <span className="text-xs text-red-600">⚠ gates not passed</span>}
      </div>

      {/* Section 1: Overview */}
      <Section title="Session Overview">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <KV label="Participant" value={`${ses.participant_code} · ${ses.name}`} />
          <KV label="Birth / Gender" value={`${ses.birth_date} · ${ses.gender === "male" ? "男" : ses.gender === "female" ? "女" : ses.gender}`} />
          <KV label="Grade / Major" value={`${ses.grade || "—"} · ${ses.major || "—"}`} />
          <KV label="Contact" value={ses.contact || "—"} />
          <KV label="Status" value={ses.status} />
          <KV label="Group" value={ses.group_label} />
          <KV label="Stage" value={STAGE_LABELS[stage] ?? stage} />
          <KV label="Seed" value={String(ses.random_seed ?? "—")} />
          <KV label="Balance" value={String(ses.resource_balance ?? "—")} />
          {DEV && <KV label="DEV_MODE" value="ON — not valid for analysis" />}
        </div>
      </Section>

      {/* Section 2: Task Material Summary */}
      <Section title="任务材料状态">
        {renderTaskSummary(db, sessionId)}
      </Section>

      {/* Section 3: Stage-game Trial Viewer */}
      <Section title="Resource Task">
        {renderStageGame(db, sessionId)}
      </Section>

      {/* Section 4: Within-Set Stable Table (First Table) */}
      <Section title="组内稳定建模表 · Within-Set Stable（50次组内+20次复测）">
        {renderWithinSetStable(db, sessionId)}
      </Section>

      {/* Section 5: Cross-Set Orthogonalized Table (Second Table) */}
      <Section title="组间正交化表 · Cross-Set Orthogonalized（+80次组间比较）">
        {renderCrossSetOrthogonalized(db, sessionId)}
      </Section>

      {/* Section 5.5: Final Orthogonal Liking×Value Map (重点) */}
      <Section title="🎯 正交喜好-价值矩阵 · Liking×Value Orthogonal Map（最终输出）" defaultOpen={true}>
        {renderMatrix(db, sessionId)}
      </Section>

      {/* Section 6: Liking Calibration / Validation Viewer */}
      <Section title="Liking Calibration & Validation">
        {renderCalibration(db, sessionId)}
      </Section>

      {/* Section 7: Formal Choice Trial Viewer */}
      <Section title="Formal Choice">
        {renderFormalChoice(db, sessionId)}
      </Section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="rounded border border-gray-200" open={defaultOpen ?? true}>
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-900 bg-gray-50 hover:bg-gray-100">{title}</summary>
      <div className="px-4 py-3">{children}</div>
    </details>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return <div><span className="text-gray-400">{label}:</span> <span className="text-gray-700">{value}</span></div>;
}

function renderMatrix(db: ReturnType<typeof getDb>, sessionId: string) {
  // Read from stimulus_value_map, joined with stimulus_elo for continuous scores.
  const svm = db.prepare(
    `SELECT svm.set_id, svm.stim_id, svm.final_liking_rank, svm.external_value, svm.image_url, svm.elo_score,
            se.elo_score AS live_elo, se.elo_volatility, se.comparisons_count
     FROM stimulus_value_map svm
     LEFT JOIN stimulus_elo se ON se.session_id = svm.session_id AND se.stim_id = svm.stim_id
     WHERE svm.session_id = ?
     ORDER BY svm.external_value, svm.final_liking_rank`
  ).all(sessionId) as any[];

  if (svm.length === 0) {
    const selected = db.prepare("SELECT stim_id, image_url FROM subject_selected_stimuli WHERE session_id=? LIMIT 25").all(sessionId) as any[];
    if (selected.length === 0) return <p className="text-xs text-gray-400">尚无数据。等待喜好校准和价值分配完成后自动生成。</p>;
    return (
      <div>
        <p className="text-xs text-gray-400 mb-2">正交矩阵尚未生成。基于第二张组间正交化表 + value assignment 构建。当前显示已选刺激材料：</p>
        <div className="flex flex-wrap gap-1">
          {selected.map((s: any) => (
            <Image key={s.stim_id} src={s.image_url} alt={s.stim_id} width={40} height={40} unoptimized className="rounded border border-gray-100" title={s.stim_id} />
          ))}
        </div>
      </div>
    );
  }

  const values = [5, 10, 15, 20, 25];
  const ranks = [1, 2, 3, 4, 5];
  const cell = (val: number, rank: number) => svm.find((s: any) => s.external_value === val && s.final_liking_rank === rank);

  // Value color coding.
  const valueColors: Record<number, string> = {
    5: "border-blue-200 bg-blue-50/30",
    10: "border-green-200 bg-green-50/30",
    15: "border-amber-200 bg-amber-50/30",
    20: "border-orange-200 bg-orange-50/30",
    25: "border-red-200 bg-red-50/30",
  };

  const valueLabels: Record<number, string> = {
    5: "极低价值",
    10: "低价值",
    15: "中等价值",
    20: "高价值",
    25: "极高价值",
  };

  // Collect Elo range for scale.
  const elos = svm.filter((s: any) => s.live_elo != null).map((s: any) => s.live_elo);
  const eloMin = elos.length > 0 ? Math.min(...elos) : 0;
  const eloMax = elos.length > 0 ? Math.max(...elos) : 0;
  const eloRange = eloMax - eloMin || 1;

  return (
    <div>
      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-2 text-[10px]">
        {values.map((v) => (
          <span key={v} className={`px-2 py-0.5 rounded border ${valueColors[v]} text-gray-700 font-medium`}>
            {v}pt · {valueLabels[v]}
          </span>
        ))}
        <span className="ml-3 text-gray-400">
          Elo 范围: {eloMin.toFixed(0)} – {eloMax.toFixed(0)} (跨度 {eloRange.toFixed(0)})
        </span>
      </div>

      {/* Description */}
      <p className="text-[10px] text-gray-400 mb-2">
        行 = 喜好排名 (Like 1=最不喜欢, Like 5=最喜欢) &nbsp;|&nbsp;
        列 = 价值点数 (5-25, 每个 set 分配一个值) &nbsp;|&nbsp;
        每格为一个 stimulus，显示其 set、Elo 分数、Elo 不确定度
      </p>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="p-1.5 text-gray-400 w-16">喜好↓ 价值→</th>
              {values.map((v) => (
                <th key={v} className={`p-2 font-semibold text-gray-700 border-t-2 ${valueColors[v]}`} style={{ width: "18%" }}>
                  <div>{v} 点</div>
                  <div className="text-[9px] text-gray-400 font-normal">{valueLabels[v]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranks.map((r) => (
              <tr key={r}>
                <td className="p-2 font-semibold text-gray-800 text-center align-middle bg-gray-50">
                  Like {r}
                  <div className="text-[9px] text-gray-400 font-normal">{r === 1 ? "最不喜欢" : r === 5 ? "最喜欢" : ""}</div>
                </td>
                {values.map((v) => {
                  const c = cell(v, r);
                  if (!c) return (
                    <td key={v} className={`p-2 border text-center ${valueColors[v]}`}>
                      <div className="w-16 h-16 bg-gray-100 rounded mx-auto flex items-center justify-center text-gray-300 text-lg">?</div>
                      <div className="text-[9px] text-red-400 mt-1">缺失</div>
                    </td>
                  );

                  const elo = c.live_elo ?? c.elo_score;
                  const vol = c.elo_volatility;
                  const cmp = c.comparisons_count;
                  // Color intensity by Elo within range.
                  const eloIntensity = elo != null ? (elo - eloMin) / eloRange : 0.5;

                  return (
                    <td key={v} className={`p-2 border text-center align-middle ${valueColors[v]}`}>
                      <div className="relative inline-block">
                        <Image src={c.image_url} alt={c.stim_id} width={64} height={64} unoptimized
                          className="rounded border border-gray-300 mx-auto shadow-sm"
                          style={{ filter: `brightness(${0.85 + eloIntensity * 0.3})` }} />
                      </div>
                      <div className="text-xs font-bold text-gray-900 mt-1">{c.stim_id}</div>
                      <div className="text-[10px] text-gray-500">{c.set_id}</div>
                      {elo != null && (
                        <div className="text-[10px] text-gray-700 font-medium mt-0.5">
                          Elo: {elo.toFixed(0)}
                        </div>
                      )}
                      {vol != null && (
                        <div className="text-[9px] text-gray-400">
                          σ={vol.toFixed(0)} · n={cmp ?? 0}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* All stimuli summary */}
      <details className="mt-3">
        <summary className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600">
          全部 25 个 stimulus 列表 (按 Elo 排序)
        </summary>
        <div className="mt-2 overflow-x-auto max-h-64 overflow-y-auto">
          <table className="text-[10px] w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-1 text-left">stim_id</th>
                <th className="p-1 text-left">set</th>
                <th className="p-1 text-right">liking_rank</th>
                <th className="p-1 text-right">value</th>
                <th className="p-1 text-right">Elo</th>
                <th className="p-1 text-right">σ</th>
                <th className="p-1 text-right">n</th>
              </tr>
            </thead>
            <tbody>
              {[...svm].sort((a: any, b: any) => (b.live_elo ?? b.elo_score ?? 1500) - (a.live_elo ?? a.elo_score ?? 1500)).map((s: any) => (
                <tr key={s.stim_id} className="border-t border-gray-100">
                  <td className="p-1 font-medium">{s.stim_id}</td>
                  <td className="p-1 text-gray-500">{s.set_id}</td>
                  <td className="p-1 text-right">{s.final_liking_rank}</td>
                  <td className="p-1 text-right">{s.external_value}</td>
                  <td className="p-1 text-right font-medium">{(s.live_elo ?? s.elo_score ?? 1500).toFixed(0)}</td>
                  <td className="p-1 text-right text-gray-400">{s.elo_volatility?.toFixed(0) ?? "—"}</td>
                  <td className="p-1 text-right text-gray-400">{s.comparisons_count ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function renderStageGame(db: ReturnType<typeof getDb>, sessionId: string) {
  const total = (db.prepare("SELECT COUNT(*) AS cnt FROM stage_game_trials WHERE session_id=?").get(sessionId) as any).cnt;
  const resp = (db.prepare("SELECT COUNT(*) AS cnt FROM stage_game_responses WHERE session_id=?").get(sessionId) as any).cnt;
  if (total === 0) return <p className="text-xs text-gray-400">No Resource Task data.</p>;

  const acc = (db.prepare("SELECT AVG(CASE WHEN accuracy=1 THEN 1.0 ELSE 0.0 END) AS a FROM stage_game_responses WHERE session_id=?").get(sessionId) as any).a;
  const rt = (db.prepare("SELECT AVG(rt_ms) AS a FROM stage_game_responses WHERE session_id=? AND timeout=0").get(sessionId) as any).a;
  const toRate = resp > 0 ? (db.prepare("SELECT COUNT(*) AS cnt FROM stage_game_responses WHERE session_id=? AND timeout=1").get(sessionId) as any).cnt / resp : 0;

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs mb-3">
        <KV label="Trials" value={`${resp}/${total}`} />
        <KV label="Accuracy" value={acc != null ? `${(acc*100).toFixed(0)}%` : "—"} />
        <KV label="Mean RT" value={rt != null ? `${rt.toFixed(0)}ms` : "—"} />
        <KV label="Timeout" value={`${(toRate*100).toFixed(0)}%`} />
        <KV label="Balance" value={String((db.prepare("SELECT resource_balance FROM experiment_sessions WHERE id=?").get(sessionId) as any)?.resource_balance ?? "—")} />
      </div>
      <CollapsibleTable
        label="Trial-level data"
        columns={["blk","idx","type","ans","resp","acc","rt","fb","pts","bal_before","bal_after"]}
        rows={db.prepare("SELECT block_index, trial_index, task_type, correct_answer, response, accuracy, rt_ms, preset_feedback_direction, preset_feedback_points, balance_before, balance_after FROM stage_game_responses WHERE session_id=? ORDER BY global_trial_index LIMIT 200", ).all(sessionId)}
      />
    </div>
  );
}

function renderCalibration(db: ReturnType<typeof getDb>, sessionId: string) {
  const calTotal = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id=?").get(sessionId) as any).cnt;
  const calResp = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id=?").get(sessionId) as any).cnt;
  if (calTotal === 0) return <p className="text-xs text-gray-400">No calibration data.</p>;

  const calToRate = calTotal > 0 ? (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id=? AND timeout=1").get(sessionId) as any).cnt / calTotal : 0;
  const within = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id=? AND phase='within_set'").get(sessionId) as any).cnt;
  const ties = (db.prepare("SELECT SUM(tie_flag) AS cnt FROM liking_map WHERE session_id=?").get(sessionId) as any).cnt;
  const r1w = (db.prepare("SELECT AVG(win_count_within_set) AS a FROM liking_map WHERE session_id=? AND final_liking_rank=1").get(sessionId) as any).a;
  const r5w = (db.prepare("SELECT AVG(win_count_within_set) AS a FROM liking_map WHERE session_id=? AND final_liking_rank=5").get(sessionId) as any).a;

  const valTotal = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_validation_trials WHERE session_id=?").get(sessionId) as any).cnt;
  const valResp = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_validation_responses WHERE session_id=?").get(sessionId) as any).cnt;
  const vq = db.prepare("SELECT * FROM liking_validation_quality WHERE session_id=?").get(sessionId) as any;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-medium text-gray-600 mb-1">Calibration</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
          <KV label="Trials" value={`${calResp}/${calTotal} (w/in ${within})`} />
          <KV label="Timeout" value={`${(calToRate*100).toFixed(0)}%`} />
          <KV label="Ties" value={String(ties ?? 0)} />
          <KV label="R1 wins" value={r1w != null ? r1w.toFixed(1) : "—"} />
          <KV label="R5 wins" value={r5w != null ? r5w.toFixed(1) : "—"} />
          <KV label="Direction OK" value={r5w >= r1w ? "✅" : "❌ REVERSED"} />
        </div>
        <CollapsibleTable
          label="Calibration trials"
          columns={["idx","phase","L stim","R stim","L set","R set","resp","chosen","rt","to","consistent"]}
          rows={db.prepare("SELECT ct.trial_index, ct.phase, ct.left_stim_id, ct.right_stim_id, ct.left_set_id, ct.right_set_id, cr.response_side, cr.chosen_stim_id, cr.rt_ms, cr.timeout, cr.consistent FROM calibration_trials ct LEFT JOIN calibration_responses cr ON cr.trial_id=ct.id WHERE ct.session_id=? ORDER BY ct.trial_index LIMIT 200", ).all(sessionId)}
        />
      </div>
      <div>
        <h3 className="text-xs font-medium text-gray-600 mb-1">Validation</h3>
        {valTotal === 0 ? <p className="text-xs text-gray-400">No validation data yet.</p> : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs mb-1">
              <KV label="Trials" value={`${valResp}/${valTotal}`} />
              <KV label="Passed" value={vq ? (vq.validation_passed ? "✅" : "❌") : "—"} />
              <KV label="Rerank" value={vq ? (vq.needs_rerank ? "⚠ yes" : "no") : "—"} />
              <KV label="Diff-rank cons" value={vq?.different_rank_consistency_rate != null ? `${(vq.different_rank_consistency_rate*100).toFixed(0)}%` : "—"} />
            </div>
            <CollapsibleTable
              label="Validation trials"
              columns={["idx","type","L stim","R stim","L rank","R rank","exp","resp","chosen","rt","to","consistent"]}
              rows={db.prepare("SELECT lvt.trial_index, lvt.validation_type, lvt.left_stim_id, lvt.right_stim_id, lvt.left_liking_rank, lvt.right_liking_rank, lvt.expected_choice, lvr.response_side, lvr.chosen_stim_id, lvr.rt_ms, lvr.timeout, lvr.consistent_with_ranking FROM liking_validation_trials lvt LEFT JOIN liking_validation_responses lvr ON lvr.trial_id=lvt.id WHERE lvt.session_id=? ORDER BY lvt.trial_index LIMIT 200", ).all(sessionId)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function renderFormalChoice(db: ReturnType<typeof getDb>, sessionId: string) {
  const ftTotal = (db.prepare("SELECT COUNT(*) AS cnt FROM formal_trials WHERE session_id=?").get(sessionId) as any).cnt;
  const crTotal = (db.prepare("SELECT COUNT(*) AS cnt FROM choice_responses WHERE session_id=?").get(sessionId) as any).cnt;
  if (ftTotal === 0) return <p className="text-xs text-gray-400">No formal choice data yet.</p>;

  const rt = (db.prepare("SELECT AVG(rt_ms) AS a FROM choice_responses WHERE session_id=? AND timeout=0").get(sessionId) as any).a;
  const toRate = ftTotal > 0 ? (db.prepare("SELECT COUNT(*) AS cnt FROM choice_responses WHERE session_id=? AND timeout=1").get(sessionId) as any).cnt / ftTotal : 0;
  const byType = db.prepare("SELECT trial_type, COUNT(*) AS cnt FROM formal_trials WHERE session_id=? GROUP BY trial_type").all(sessionId) as any[];
  const hvRate = (db.prepare("SELECT AVG(CASE WHEN chose_high_value=1 THEN 1.0 ELSE 0.0 END) AS a FROM choice_responses WHERE session_id=? AND chose_high_value IS NOT NULL AND timeout=0").get(sessionId) as any).a;
  const hlRate = (db.prepare("SELECT AVG(CASE WHEN chose_high_liking=1 THEN 1.0 ELSE 0.0 END) AS a FROM choice_responses WHERE session_id=? AND chose_high_liking IS NOT NULL AND timeout=0").get(sessionId) as any).a;
  const conflictHV = (db.prepare("SELECT AVG(CASE WHEN chose_high_value=1 THEN 1.0 ELSE 0.0 END) AS a FROM choice_responses WHERE session_id=? AND trial_type='conflict' AND timeout=0").get(sessionId) as any).a;
  const conflictHL = (db.prepare("SELECT AVG(CASE WHEN chose_high_liking=1 THEN 1.0 ELSE 0.0 END) AS a FROM choice_responses WHERE session_id=? AND trial_type='conflict' AND timeout=0").get(sessionId) as any).a;

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs mb-3">
        <KV label="Trials" value={`${crTotal}/${ftTotal}`} />
        <KV label="Mean RT" value={rt != null ? `${rt.toFixed(0)}ms` : "—"} />
        <KV label="Timeout" value={`${(toRate*100).toFixed(0)}%`} />
        <KV label="High-value" value={hvRate != null ? `${(hvRate*100).toFixed(0)}%` : "—"} />
        <KV label="High-liking" value={hlRate != null ? `${(hlRate*100).toFixed(0)}%` : "—"} />
        <KV label="Conflict HV" value={conflictHV != null ? `${(conflictHV*100).toFixed(0)}%` : "—"} />
        <KV label="Conflict HL" value={conflictHL != null ? `${(conflictHL*100).toFixed(0)}%` : "—"} />
        {byType.map((t: any) => <KV key={t.trial_type} label={t.trial_type} value={String(t.cnt)} />)}
      </div>
      <CollapsibleTable
        label="Formal choice trials"
        columns={["idx","type","L stim","R stim","L like","R like","L val","R val","ΔL","ΔV","HL side","HV side","resp","chosen","rt","to","ch HL","ch HV"]}
        rows={db.prepare("SELECT ft.trial_index, ft.trial_type, ft.left_stim_id, ft.right_stim_id, ft.left_liking_rank, ft.right_liking_rank, ft.left_external_value, ft.right_external_value, ft.delta_liking, ft.delta_value, ft.high_liking_side, ft.high_value_side, cr.response_side, cr.chosen_stim_id, cr.rt_ms, cr.timeout, cr.chose_high_liking, cr.chose_high_value FROM formal_trials ft LEFT JOIN choice_responses cr ON cr.formal_trial_id=ft.id WHERE ft.session_id=? ORDER BY ft.trial_index LIMIT 300", ).all(sessionId)}
      />
    </div>
  );
}

function renderTaskSummary(db: ReturnType<typeof getDb>, sessionId: string) {
  const sel = (db.prepare("SELECT COUNT(*) AS cnt FROM subject_selected_stimuli WHERE session_id = ?").get(sessionId) as any).cnt;
  const va = (db.prepare("SELECT COUNT(*) AS cnt FROM value_assignment WHERE session_id = ?").get(sessionId) as any).cnt;
  const svm = (db.prepare("SELECT COUNT(*) AS cnt FROM stimulus_value_map WHERE session_id = ?").get(sessionId) as any).cnt;
  const vq = db.prepare("SELECT validation_passed, different_rank_consistency_rate FROM liking_validation_quality WHERE session_id = ?").get(sessionId) as any;
  const stage = (db.prepare("SELECT current_stage FROM experiment_sessions WHERE id = ?").get(sessionId) as any).current_stage;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
      <KV label="Selected stimuli" value={String(sel)} />
      <KV label="Value assignment" value={String(va) + " / 5"} />
      <KV label="Stimulus value map" value={String(svm) + " / 25"} />
      <KV label="Validation" value={vq ? (vq.validation_passed ? ("✅ passed (" + (vq.different_rank_consistency_rate * 100).toFixed(0) + "%)") : "❌ failed") : "—"} />
      <KV label="Current stage" value={stage ?? "—"} />
    </div>
  );
}

function renderWithinSetStable(db: ReturnType<typeof getDb>, sessionId: string) {
  const rows = db.prepare(
    `SELECT set_id, stim_id, image_url, original_within_rank, stable_within_rank, win_count,
            adjacent_retest_result, adjacent_consistency, tie_flag, ambiguity_flag,
            final_stable_rank
     FROM within_set_stable WHERE session_id = ? ORDER BY set_id, final_stable_rank`
  ).all(sessionId) as any[];
  if (rows.length === 0) return <p className="text-xs text-gray-400">暂无组内稳定建模数据。</p>;

  const setIds = ["set_1", "set_2", "set_3", "set_4", "set_5"];
  const ranks = [1, 2, 3, 4, 5];

  // Check completeness
  const missing: string[] = [];
  for (const sid of setIds) {
    for (const rank of ranks) {
      if (!rows.find((r: any) => r.set_id === sid && r.final_stable_rank === rank)) {
        missing.push(sid + ' Like ' + rank);
      }
    }
  }

  // Flag logic:
  // - tie_flag: initial win-count tie in 4A, but stable rank was resolved → "初始并列，已处理"
  // - adjacent_retest_result === "inconsistent": retest disagreed, but rank by second choice → "复测不一致，已按第二次定序"
  // - Only if stable rank is missing/duplicate within a set → "未解决并列"
  function rankFlags(item: any) {
    if (!item) return null;
    const flags: any[] = [];
    if (item.tie_flag) {
      flags.push(<span key="tie" className="text-[10px] text-amber-600 font-medium">初始并列，已处理</span>);
    }
    if (item.adjacent_retest_result === "inconsistent") {
      flags.push(<span key="retest" className="text-[10px] text-amber-600 font-medium">复测不一致，已按第二次定序</span>);
    }
    // Only mark unresolved if stable_rank is 0 or duplicate within same set.
    if (item.ambiguity_flag && !item.tie_flag && item.adjacent_retest_result !== "inconsistent") {
      flags.push(<span key="amb" className="text-[10px] text-red-600 font-medium">未解决并列</span>);
    }
    return flags.length > 0 ? <div className="mt-0.5 flex flex-wrap justify-center gap-x-1">{flags}</div> : null;
  }

  return (
    <div>
      {missing.length > 0 && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          ⚠ 异常：第一张表存在空格 — {missing.join(', ')}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-1.5 border text-left font-medium text-gray-600 w-16">Like</th>
              {setIds.map((sid) => (
                <th key={sid} className="p-1.5 border text-center font-medium text-gray-600 w-1/5">{sid}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranks.map((rank) => (
              <tr key={rank} className="border-t border-gray-200">
                <td className="p-1.5 border font-semibold text-gray-900 text-center align-middle">Like {rank}</td>
                {setIds.map((sid) => {
                  const item = rows.find((r: any) => r.set_id === sid && r.final_stable_rank === rank);
                  if (!item) return (
                    <td key={sid} className="p-1.5 border text-center align-middle">
                      <span className="text-red-500 font-bold text-lg">?</span>
                      <div className="text-[10px] text-red-400">missing {sid} r{rank}</div>
                    </td>
                  );
                  return (
                    <td key={sid} className="p-1.5 border text-center align-middle">
                      {item.image_url ? (
                        <Image src={item.image_url} alt={item.stim_id} width={56} height={56} unoptimized className="rounded border border-gray-200 mx-auto mb-1" />
                      ) : null}
                      <div className="text-xs font-semibold text-gray-900">{item.stim_id}</div>
                      <div className="text-[10px] text-gray-500">
                        orig→stable: {item.original_within_rank}→{item.stable_within_rank}
                        {' · '}wins: {item.win_count}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {item.adjacent_retest_result}
                        {item.adjacent_consistency != null ? ` (${(item.adjacent_consistency * 100).toFixed(0)}%)` : ""}
                      </div>
                      {rankFlags(item)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCrossSetOrthogonalized(db: ReturnType<typeof getDb>, sessionId: string) {
  const rows = db.prepare(
    `SELECT cso.*, sa.image_url FROM cross_set_orthogonalized cso
     LEFT JOIN subject_set_assignment sa ON sa.session_id = cso.session_id AND sa.stim_id = cso.stim_id
     WHERE cso.session_id = ?
     ORDER BY cso.calibrated_liking_rank, cso.set_id`
  ).all(sessionId) as any[];
  if (rows.length === 0) return <p className="text-xs text-gray-400">暂无组间正交化数据。</p>;

  const setIds = ["set_1", "set_2", "set_3", "set_4", "set_5"];

  function shiftBadge(r: any) {
    if (r.shift_direction === "none") return null;
    const colors: Record<string, string> = {
      high: "bg-green-100 text-green-800",
      low: "bg-amber-100 text-amber-800",
      ambiguous: "bg-red-100 text-red-800",
    };
    return (
      <span className={`ml-0.5 px-1 rounded text-[9px] font-medium ${colors[r.shift_confidence] || "bg-gray-100 text-gray-600"}`}>
        {r.shift_direction} {(r.shift_rate * 100).toFixed(0)}% {r.shift_confidence}
      </span>
    );
  }

  return (
    <div>
      <p className="text-[10px] text-gray-400 mb-2">基于第一张组内稳定表 + 80 次 cross_set_boundary 生成。允许空格和多图。</p>
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-1.5 border text-left font-medium text-gray-600 w-16">Level</th>
              {setIds.map((sid: string) => (
                <th key={sid} className="p-1.5 border text-center font-medium text-gray-600 w-1/5">{sid}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((rank) => (
              <tr key={rank} className="border-t border-gray-200">
                <td className="p-1.5 border font-semibold text-gray-900 text-center align-middle">Level {rank}</td>
                {setIds.map((sid: string) => {
                  const cellItems = rows.filter((r: any) => r.calibrated_liking_rank === rank && r.set_id === sid);
                  if (cellItems.length === 0) return (
                    <td key={sid} className="p-1.5 border text-center text-gray-300 italic align-middle">空</td>
                  );
                  return (
                    <td key={sid} className="p-1.5 border text-center align-middle">
                      {cellItems.map((r: any) => (
                        <div key={r.stim_id} className="mb-1.5 last:mb-0">
                          {r.image_url ? (
                            <Image src={r.image_url} alt={r.stim_id} width={48} height={48} unoptimized className="rounded border border-gray-200 mx-auto mb-0.5" />
                          ) : null}
                          <div className="font-semibold text-gray-900">{r.stim_id}</div>
                          <div className="text-[10px] text-gray-500">
                            orig {r.original_liking_rank} → calibrated {r.calibrated_liking_rank}
                          </div>
                          {shiftBadge(r)}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CollapsibleTable({ label, columns, rows }: { label: string; columns: string[]; rows: any[] }) {
  if (rows.length === 0) return <p className="text-[10px] text-gray-400 mt-1">{label}: no data.</p>;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600">{label} ({rows.length} rows)</summary>
      <div className="overflow-x-auto mt-1 max-h-64 overflow-y-auto">
        <table className="text-[10px] w-full">
          <thead>
            <tr className="bg-gray-50">
              {columns.map((c) => <th key={c} className="p-0.5 text-left text-gray-500 font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((r: any, i: number) => (
              <tr key={i} className="border-t border-gray-100">
                {Object.values(r as Record<string,unknown>).map((v: unknown, j: number) => (
                  <td key={j} className="p-0.5 text-gray-600">{v != null ? String(v).slice(0, 20) : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
