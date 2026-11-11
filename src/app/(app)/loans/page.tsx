import type { Metadata } from "next";
import { LoansView } from "@/components/loan-lists";

export const metadata: Metadata = { title: "Current lends & borrows – LendLoop" };

export default function Page() {
  return <LoansView mode="current" />;
}
