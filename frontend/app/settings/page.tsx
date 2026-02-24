"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Palette, Shield, Eye, EyeOff } from "lucide-react";
import Navbar from "@/components/layout/navbar";
import ThemeSelector from "@/components/settings/theme-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, changePassword } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import type { User as UserType } from "@/lib/types";
import toast from "react-hot-toast";

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Required"),
    new_password: z.string().min(8, "At least 8 characters"),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

type TabId = "profile" | "themes" | "account";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserType | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const fetchUser = useCallback(async () => {
    try {
      const u = await getCurrentUser();
      setUser(u);
    } catch {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const onPasswordSubmit = async (data: PasswordForm) => {
    setChangingPw(true);
    try {
      await changePassword(data.current_password, data.new_password);
      toast.success("Password changed successfully!");
      reset();
    } catch {
      toast.error("Failed to change password. Check your current password.");
    } finally {
      setChangingPw(false);
    }
  };

  const tabs = [
    { id: "profile" as TabId, label: "Profile", icon: <User className="h-4 w-4" /> },
    { id: "themes" as TabId, label: "Themes", icon: <Palette className="h-4 w-4" /> },
    { id: "account" as TabId, label: "Account", icon: <Shield className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar userName={user?.full_name || user?.username} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Settings</h1>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-[var(--border)] mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? "border-[var(--primary)] text-[var(--primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Profile Tab */}
          {activeTab === "profile" && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h2 className="font-semibold text-[var(--text)]">Profile Information</h2>
                  {user && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-1">Full Name</p>
                        <p className="text-sm font-medium text-[var(--text)]">{user.full_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-1">Username</p>
                        <p className="text-sm font-medium text-[var(--text)]">@{user.username}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-[var(--text-muted)] mb-1">Email</p>
                        <p className="text-sm font-medium text-[var(--text)]">{user.email}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 space-y-4">
                  <h2 className="font-semibold text-[var(--text)]">Change Password</h2>
                  <form onSubmit={handleSubmit(onPasswordSubmit)} className="space-y-4">
                    <div className="relative">
                      <Input
                        label="Current Password"
                        type={showCurrent ? "text" : "password"}
                        placeholder="Enter current password"
                        error={errors.current_password?.message}
                        {...register("current_password")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-8 text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        label="New Password"
                        type={showNew ? "text" : "password"}
                        placeholder="At least 8 characters"
                        error={errors.new_password?.message}
                        {...register("new_password")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-8 text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Input
                      label="Confirm Password"
                      type="password"
                      placeholder="Re-enter new password"
                      error={errors.confirm_password?.message}
                      {...register("confirm_password")}
                    />
                    <Button type="submit" isLoading={changingPw}>
                      Update Password
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Themes Tab */}
          {activeTab === "themes" && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h2 className="font-semibold text-[var(--text)]">Choose Theme</h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    Select your preferred color theme. Changes apply immediately.
                  </p>
                  <ThemeSelector />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Account Tab */}
          {activeTab === "account" && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h2 className="font-semibold text-[var(--text)]">Account Information</h2>
                  {user && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                        <span className="text-sm text-[var(--text-muted)]">Member Since</span>
                        <span className="text-sm font-medium text-[var(--text)]">{formatDate(user.created_at)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                        <span className="text-sm text-[var(--text-muted)]">Email Verification</span>
                        <Badge variant={user.is_verified ? "success" : "pending"}>
                          {user.is_verified ? "Verified" : "Pending"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-[var(--text-muted)]">Account ID</span>
                        <code className="text-xs bg-[var(--surface-2)] px-2 py-1 rounded text-[var(--text-muted)]">
                          {user.id}
                        </code>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
