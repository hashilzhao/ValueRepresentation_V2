import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Study 1
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          心理学实验研究平台
        </p>
      </div>

      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          主试登录
        </Link>
        <Link
          href="/start"
          className="rounded bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          被试入口
        </Link>
      </div>
    </main>
  );
}
