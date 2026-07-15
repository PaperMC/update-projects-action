export interface Review {
  id: number;
  state: string;
  submitted_at?: string | null;
  user: { login: string } | null;
}

// Latest active (non-dismissed) approval/change request per reviewer
export function latestActiveByUser(reviews: Review[]): Map<string, Review> {
  const active = new Map<string, Review>();
  for (const review of reviews) {
    if (!review.user || (review.state !== 'APPROVED' && review.state !== 'CHANGES_REQUESTED')) continue;
    active.set(review.user.login, review);
  }
  return active;
}
