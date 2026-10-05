import { PageSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return <PageSkeleton cards={0} rows={6} cols={3} actions={1} />;
}
