"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/stimuli", label: "Stimuli" },
  { href: "/admin/study1", label: "Study 1" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/results", label: "Results" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <nav className="flex items-center gap-6 border-b px-6 py-3 text-sm">
      <span className="font-semibold text-gray-900">Study 1 — Admin</span>
      <div className="flex gap-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              pathname === link.href
                ? "text-gray-900 underline"
                : "text-gray-500 hover:text-gray-900"
            }
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex-1" />
      <button
        onClick={handleLogout}
        className="text-gray-500 hover:text-gray-900"
      >
        Logout
      </button>
    </nav>
  );
}
