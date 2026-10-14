import { error } from "node:console";
import { Assignment, Campaign, EditResult, PayDecision, Payout, Verification } from "./types";

const SENT: Payout["status"][] = ["payout_sent", "paid"];

export const canPay = (
    input: {
        campaign: Campaign;
        assignment: Assignment;
        verification: Verification | null;
        payout: Payout;
    }
): PayDecision => {
    const { campaign, assignment, verification, payout} = input;

    if (!campaign.depositCleared) return {
        kind: "deny",
        reason: "Client deposit not received"
    };

    if (assignment.status === "paid" || SENT.includes(payout.status)) return {
        kind: "deny",
        reason: "Already paid"
    };

    if (!verification?.pass) return {
        kind: "deny",
        reason: "Work not verified"
    };

    if (payout.amountCents > assignment.feeCents) return {
        kind: "deny",
        reason: "Exceeds contracted fee"
    }

    if (!payout.approvedBy) return {
        kind: "needs_approval",
        reason: "Waiting for approval"
    };

    return { kind: "allow" };
}

export const validatePayoutEdit = (input: {
    payout: Payout;
    assignment: Assignment;
    newAmountCents: number;
    newDate: string;
    reason: string;
    today: string
}): EditResult => {
    const { payout, assignment, newAmountCents, newDate, reason, today } = input;

    if (SENT.includes(payout.status)) return {
        ok: false,
        errors: ["This payout was already sent"]
    };

    const errors: string[] = [];

    if (!Number.isInteger(newAmountCents) || newAmountCents <= 0) {
        errors.push("Amount must be a positive whole number of cents");
    } else if (newAmountCents > assignment.feeCents) {
        errors.push("Amount is above the contract fee");
    }

    if (newDate < today) errors.push("Payout date can't be in the past");

    if (!reason.trim()) errors.push("A reason is required")

    if (errors.length) return {ok: false, errors};

    return {
        ok: true,
        resetApproval: payout.status === "scheduled"
    }
}