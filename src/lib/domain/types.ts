export type AssignmentStatus = "scheduled" | "submitted" | "verified" | "held" | "paid";
export type PayoutStatus = "awaiting_approval" | "scheduled" | "payout_sent" | "paid" | "payout_failed" | "held"

export interface Campaign {
    id: string;
    depositCleared: boolean;
}

export interface Assignment {
    id: string;
    feeCents: number;
    status: AssignmentStatus;
}

export interface Verification {
    pass: boolean;
    source: "user" | "ai";
}

export interface Payout {
    id: string;
    amountCents: number;
    status: PayoutStatus;
    approvedBy: string | null;
    scheduledFor: string;  // YYYY-MM-DD
}

export type PayDecision = 
 | { kind: "allow" }
 | { kind: "needs_approval"; reason: string}
 | { kind: "deny"; reason: string}

export type EditResult = 
| { ok: true; resetApproval: boolean}
| { ok: false; errors: string[]}

// Checklist source for an influencer post. Freelancer assignments have no brief
export interface PostBrief {
    brandTag: string;
    hashtags: string[];
    windowStart: string;  //YYYY-MM-DD
    windowEnd: string;  //YYYY-MM-DD
}