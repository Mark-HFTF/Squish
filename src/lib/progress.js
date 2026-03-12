export function calculateJobProgress(completedVariants, activeVariantProgress, totalVariants = 6) {
  const safeTotal = Math.max(1, totalVariants);
  const safeCompleted = Math.min(Math.max(0, completedVariants), safeTotal);
  const safeActive = Math.min(Math.max(0, activeVariantProgress), 1);

  if (safeCompleted >= safeTotal) {
    return 1;
  }

  return Math.min((safeCompleted + safeActive) / safeTotal, 1);
}
