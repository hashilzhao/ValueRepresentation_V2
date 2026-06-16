"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ParticipantForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const participant_code = (form.get("participant_code") as string).trim();
    const name = (form.get("name") as string).trim();
    const birth_date = (form.get("birth_date") as string).trim();
    const gender = form.get("gender") as string;
    const grade = (form.get("grade") as string).trim();
    const major = (form.get("major") as string).trim();
    const contact = (form.get("contact") as string).trim();
    const consented = form.get("consent") === "on";

    if (!participant_code || !name || !birth_date || !gender) {
      setError("请填写所有必填信息（被试编号、姓名、出生日期、性别）。");
      setLoading(false);
      return;
    }

    if (!/^P\d+$/i.test(participant_code)) {
      setError("被试编号格式应为 P+数字（如 P001）。");
      setLoading(false);
      return;
    }

    if (!consented) {
      setError("请勾选同意参与实验。");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/participants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_code, name, birth_date, gender, grade, major, contact,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "登记失败，请稍后重试。");
      setLoading(false);
      return;
    }

    const { participant_code: code, session_id } = await res.json();

    router.push(
      `/experiment?code=${encodeURIComponent(code)}&session=${session_id}`,
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 被试编号 */}
      <div>
        <label htmlFor="participant_code" className="block text-sm font-medium text-gray-700">
          被试编号 <span className="text-red-500">*</span>
        </label>
        <input
          id="participant_code" name="participant_code" type="text" required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          placeholder="例如：P001"
        />
      </div>

      {/* 姓名 */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          姓名 <span className="text-red-500">*</span>
        </label>
        <input
          id="name" name="name" type="text" required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          placeholder="请输入姓名"
        />
      </div>

      {/* 出生日期 */}
      <div>
        <label htmlFor="birth_date" className="block text-sm font-medium text-gray-700">
          出生日期 <span className="text-red-500">*</span>
        </label>
        <input
          id="birth_date" name="birth_date" type="date" required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      {/* 性别 */}
      <div>
        <label htmlFor="gender" className="block text-sm font-medium text-gray-700">
          性别 <span className="text-red-500">*</span>
        </label>
        <select
          id="gender" name="gender" required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        >
          <option value="">请选择</option>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </div>

      {/* 年级 */}
      <div>
        <label htmlFor="grade" className="block text-sm font-medium text-gray-700">
          年级
        </label>
        <input
          id="grade" name="grade" type="text"
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          placeholder="例如：大二 / 研一"
        />
      </div>

      {/* 专业 */}
      <div>
        <label htmlFor="major" className="block text-sm font-medium text-gray-700">
          专业 / 研究领域
        </label>
        <input
          id="major" name="major" type="text"
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          placeholder="例如：心理学"
        />
      </div>

      {/* 联系方式 */}
      <div>
        <label htmlFor="contact" className="block text-sm font-medium text-gray-700">
          联系方式
        </label>
        <input
          id="contact" name="contact" type="text"
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          placeholder="手机号或邮箱"
        />
      </div>

      {/* 知情同意 */}
      <div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input name="consent" type="checkbox" className="mt-0.5" />
          <span>
            我同意参加本研究。我理解我的作答将以匿名方式记录，并且我可以在任何时候退出实验。
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "正在进入实验…" : "开始实验"}
      </button>
    </form>
  );
}
