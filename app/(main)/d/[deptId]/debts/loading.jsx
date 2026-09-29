import { PageSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return <PageSkeleton cards={4} rows={6} cols={5} actions={2} />;
}
