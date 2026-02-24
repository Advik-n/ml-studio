import { redirect } from "next/navigation";

// Projects list is shown on dashboard
export default function ProjectsPage() {
  redirect("/dashboard");
}
