export const REFERRAL_SENT_POINTS = 10;
export const REFERRAL_WON_BONUS_POINTS = 40;

export type SimpleReferralStatus = "sent" | "won" | "not_won";

export function referralPointsForStatus(status: SimpleReferralStatus): number {
  return REFERRAL_SENT_POINTS + (status === "won" ? REFERRAL_WON_BONUS_POINTS : 0);
}
