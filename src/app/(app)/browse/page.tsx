import type { Metadata } from "next";
import { AllTools } from "@/components/all-tools";

export const metadata: Metadata = { title: "Browse tools – LendLoop" };

export default function Page() {
  return <AllTools />;
}
