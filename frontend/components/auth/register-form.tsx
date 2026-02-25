"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { register as registerUser } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { extractApiError } from "@/lib/api-errors";
import Link from "next/link";

const step1Schema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores"),
  email: z.string().email("Invalid email address"),
});

const step2Schema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const step3Schema = z.object({
  captchaAnswer: z.string().min(1, "Please answer the question"),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;

const generateCaptcha = () => {
  const ops = ["+", "-", "×"] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a = Math.floor(Math.random() * 8) + 2; // 2-9
  let b = Math.floor(Math.random() * 8) + 2; // 2-9
  if (op === "-" && b > a) [a, b] = [b, a];
  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return { a, b, op, answer: String(answer) };
};

export default function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Step1Data & Step2Data>>({});
  const [captcha, setCaptcha] = useState(generateCaptcha);

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3Data>({ resolver: zodResolver(step3Schema) });

  const refreshCaptcha = useCallback(() => setCaptcha(generateCaptcha()), []);

  const onStep1 = (data: Step1Data) => {
    setFormData((p) => ({ ...p, ...data }));
    setStep(2);
  };

  const onStep2 = (data: Step2Data) => {
    setFormData((p) => ({ ...p, ...data }));
    setStep(3);
  };

  const onStep3 = async (data: Step3Data) => {
    if (data.captchaAnswer.trim() !== captcha.answer) {
      form3.setError("captchaAnswer", { message: "Incorrect answer. Try again." });
      refreshCaptcha();
      return;
    }
    setIsLoading(true);
    try {
      await registerUser({
        name: formData.name!,
        username: formData.username!,
        email: formData.email!,
        password: formData.password!,
        confirm_password: formData.confirmPassword!,
      });
      toast.success("Account created! You can now sign in.");
      router.push("/login");
    } catch (err: unknown) {
      toast.error(extractApiError(err, "Registration failed."));
      refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const stepTitles = [
    "Create your account",
    "Set your password",
    "Verify you're human",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-md"
    >
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)]">
          <Brain className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--text)]">{stepTitles[step - 1]}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Step {step} of 3</p>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex gap-1.5">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              s <= step ? "bg-[var(--primary)]" : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.form
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onSubmit={form1.handleSubmit(onStep1)}
            className="space-y-4"
          >
            <Input
              label="Full Name"
              placeholder="John Doe"
              error={form1.formState.errors.name?.message}
              {...form1.register("name")}
            />
            <Input
              label="Username"
              placeholder="johndoe"
              error={form1.formState.errors.username?.message}
              {...form1.register("username")}
            />
            <Input
              label="Email"
              type="email"
              placeholder="john@example.com"
              error={form1.formState.errors.email?.message}
              {...form1.register("email")}
            />
            <Button type="submit" className="w-full" size="lg">
              Continue
            </Button>
          </motion.form>
        )}

        {step === 2 && (
          <motion.form
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onSubmit={form2.handleSubmit(onStep2)}
            className="space-y-4"
          >
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                error={form2.formState.errors.password?.message}
                helperText="Use a mix of letters, numbers, and symbols"
                {...form2.register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="relative">
              <Input
                label="Confirm Password"
                type={showConfirm ? "text" : "password"}
                placeholder="Re-enter your password"
                error={form2.formState.errors.confirmPassword?.message}
                {...form2.register("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-8 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" className="flex-1">
                Continue
              </Button>
            </div>
          </motion.form>
        )}

        {step === 3 && (
          <motion.form
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onSubmit={form3.handleSubmit(onStep3)}
            className="space-y-4"
          >
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
              <p className="text-sm text-[var(--text-muted)] mb-2">Quick math challenge</p>
              <p className="text-2xl font-bold text-[var(--text)]">
                What is {captcha.a} {captcha.op} {captcha.b}?
              </p>
            </div>
            <Input
              label="Your Answer"
              placeholder="Enter the answer"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              error={form3.formState.errors.captchaAnswer?.message}
              {...form3.register("captchaAnswer")}
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="submit" className="flex-1" isLoading={isLoading}>
                Create Account
              </Button>
            </div>
          </motion.form>
        )}

      </AnimatePresence>

      {step === 1 && (
        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[var(--primary)] hover:underline">
            Sign in
          </Link>
        </p>
      )}
    </motion.div>
  );
}
