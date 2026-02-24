"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain,
  LayoutDashboard,
  FolderOpen,
  Sun,
  Moon,
  Palette,
  LogOut,
  Settings,
  User,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cycleTheme, getTheme, type Theme } from "@/lib/theme";
import { logout } from "@/lib/auth";

const themeIcons: Record<Theme, React.ReactNode> = {
  dark: <Moon className="h-4 w-4" />,
  light: <Sun className="h-4 w-4" />,
  purple: <Palette className="h-4 w-4" />,
};

interface NavbarProps {
  userName?: string;
}

export default function Navbar({ userName = "User" }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentTheme, setCurrentTheme] = React.useState<Theme>("dark");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  React.useEffect(() => {
    setCurrentTheme(getTheme());
  }, []);

  const handleThemeToggle = () => {
    const next = cycleTheme();
    setCurrentTheme(next);
  };

  const handleLogout = () => {
    logout();
  };

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: "/projects", label: "Projects", icon: <FolderOpen className="h-4 w-4" /> },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <span className="bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] bg-clip-text text-lg font-bold text-transparent">
            ML Studio
          </span>
        </Link>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                }`}
              >
                {link.icon}
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleThemeToggle}
            title={`Current theme: ${currentTheme}`}
          >
            {themeIcons[currentTheme]}
          </Button>

          {/* User dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-2)] transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-white text-xs font-bold">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:block text-[var(--text)] font-medium max-w-[100px] truncate">
                {userName}
              </span>
              <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
            </button>

            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg z-50"
              >
                <button
                  onClick={() => { router.push("/settings"); setDropdownOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <button
                  onClick={() => { router.push("/settings"); setDropdownOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  <User className="h-4 w-4" /> Profile
                </button>
                <div className="my-1 border-t border-[var(--border)]" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
