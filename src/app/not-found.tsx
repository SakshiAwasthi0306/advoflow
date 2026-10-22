import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return <EmptyState title="Not found" body="This record does not exist in your office, or it was removed." action={<Link href="/" className="btn-primary">Go to dashboard</Link>} />;
}
