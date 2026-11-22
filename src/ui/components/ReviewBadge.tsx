/** Subtle badge for model-knowledge items that a qualified teacher has not yet checked (BRIEF B3). */
export function ReviewBadge({ status = 'unreviewed' }: { status?: 'unreviewed' | 'teacher-approved' }) {
  if (status === 'teacher-approved') return null;
  return (
    <span class="badge-review" title="Written from general knowledge; not yet checked by a qualified teacher. See TEACHER_REVIEW.md.">
      not yet teacher-checked
    </span>
  );
}
