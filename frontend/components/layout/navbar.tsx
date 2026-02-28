"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  LayoutDashboard,
  FolderOpen,
  Image as ImageIcon,
  Menu,
  X,
  Palette,
  LogOut,
  Settings,
  User,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTheme, setTheme, THEMES, type Theme } from "@/lib/theme";
import { logout } from "@/lib/auth";

interface NavbarProps {
  userName?: string;
}

export default function Navbar({ userName = "User" }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentTheme, setCurrentTheme] = React.useState<Theme>("dark");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  React.useEffect(() => {
    setCurrentTheme(getTheme());
  }, []);

  const handleLogout = () => {
    logout();
  };

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: "/projects", label: "Projects", icon: <FolderOpen className="h-4 w-4" /> },
    { href: "/image-processing", label: "Img Processing", icon: <ImageIcon className="h-4 w-4" /> },
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

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

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
          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => setThemePickerOpen(!themePickerOpen)} title="Change theme">
              <Palette className="h-4 w-4" />
            </Button>
            <AnimatePresence>
              {themePickerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg z-50"
                >
                  <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Theme</p>
                  <div className="grid grid-cols-4 gap-2">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setTheme(t.id); setCurrentTheme(t.id); setThemePickerOpen(false); }}
                        title={t.label}
                        className={`h-8 w-8 rounded-full border-2 transition-all ${currentTheme === t.id ? 'border-[var(--primary)] scale-110 ring-2 ring-[var(--primary)]/30' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: t.color }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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

            <AnimatePresence>
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
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="px-4 py-2 space-y-1">
              {navLinks.map((link) => {
                const active = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
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
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
