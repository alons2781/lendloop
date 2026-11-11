import type { Metadata } from "next";
import { MyListings } from "@/components/my-listings";

export const metadata: Metadata = { title: "My listings – LendLoop" };

export default function Page() {
  return <MyListings />;
}
