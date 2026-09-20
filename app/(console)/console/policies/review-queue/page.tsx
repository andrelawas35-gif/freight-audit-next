import { getReviewQueue } from './actions';
import { ReviewQueueClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ReviewQueuePage() {
  const rules = await getReviewQueue();
  return <ReviewQueueClient rules={rules} />;
}
