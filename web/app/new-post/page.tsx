import type { Metadata } from "next";
import { NewPostPageClient } from "./new-post-page-client";

export const metadata: Metadata = {
  title: "New post · Relay",
  description: "Create a Relay-native post — upload to R2 and publish."
};

export default function NewPostPage() {
  return <NewPostPageClient />;
}
