import { PageSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return <PageSkeleton cards={0} rows={10} cols={6} />;
}
