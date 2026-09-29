import { PageSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return <PageSkeleton cards={3} rows={6} cols={6} actions={2} />;
}
