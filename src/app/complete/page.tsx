import Link from "next/link";

export default function CompletePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">实验已完成</h1>
      <p className="mt-2 text-sm text-gray-500">
        感谢你的参与！你可以关闭本页面了。
      </p>
      <Link
        href="/"
        className="mt-6 text-sm text-gray-500 underline hover:text-gray-900"
      >
        返回首页
      </Link>
    </main>
  );
}
