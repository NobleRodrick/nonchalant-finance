import { PageSkeleton } from "@/components/kit/skeletons";

export default function Loading() {
  return <PageSkeleton cards={6} rows={6} cols={5} actions={2} />;
}
