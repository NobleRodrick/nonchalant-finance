import { PageSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return <PageSkeleton cards={6} rows={4} cols={3} actions={3} />;
}
