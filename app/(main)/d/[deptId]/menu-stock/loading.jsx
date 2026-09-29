import { PageSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return <PageSkeleton cards={4} rows={8} cols={7} actions={2} />;
}
