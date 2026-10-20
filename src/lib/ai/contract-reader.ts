import { ContractReadingSchema } from "@/lib/domain/contract";
import type { UploadedFile } from "@/lib/domain/upload";
import type { AiClient } from "./client";
import { readFileAsJson } from "./read-file";

const str = (description: string) => ({ type: "string", description });
const day = (what: string) => str(`${what} as YYYY-MM-DD; empty string if not stated`);
const money = (what: string) => str(`${what}: digits with thousands commas and 2 decimals, no currency, e.g. 12,000.00`);

export const CONTRACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["campaignName", "clientName", "clientEmail", "startDate", "endDate", "totalFee", "depositAmount", "depositDueDate", "balanceAmount", "balanceDueDate", "creators"],
  properties: {
    campaignName: str("Campaign name exactly as written"),
    clientName: str("Client company name (the brand paying the agency)"),
    clientEmail: str("Client billing email; empty string if none"),
    startDate: day("Campaign start date"),
    endDate: day("Campaign end date"),
    totalFee: money("Total fee the client pays the agency"),
    depositAmount: money("Deposit amount"),
    depositDueDate: day("Deposit due date"),
    balanceAmount: money("Balance amount"),
    balanceDueDate: day("Balance due date"),
    creators: {
      type: "array",
      description: "Every influencer and freelancer named in the contract, in order",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type", "detail", "paypalEmail", "deliverable", "fee", "dueDate", "payoutDate", "brandTag", "hashtags", "windowStart", "windowEnd"],
        properties: {
          name: str("Influencer handle or freelancer name exactly as written, e.g. @aina.eats or Daniel Lim"),
          type: { type: "string", enum: ["influencer", "freelancer"] },
          detail: str("Platform for an influencer (e.g. Instagram, TikTok) or the service for a freelancer (e.g. Video edits)"),
          paypalEmail: str("The creator's PayPal email; empty string if none"),
          deliverable: str("The deliverable exactly as written, e.g. 1 Reel + 2 Stories"),
          fee: money("The creator's fee"),
          dueDate: day("Delivery or posting due date"),
          payoutDate: day("Date the creator is paid"),
          brandTag: str("Brand handle the post must tag, e.g. @kopikita; empty string for freelancers"),
          hashtags: str("Required hashtags separated by spaces, e.g. #KopiKitaPagi #ad; empty string for freelancers"),
          windowStart: day("First day the post may go live; empty string for freelancers"),
          windowEnd: day("Last day the post may go live; empty string for freelancers"),
        },
      },
    },
  },
};

const INSTRUCTIONS = [
  "This is a signed services agreement between a marketing agency and its client.",
  "Extract the campaign terms. Copy names, handles, emails and deliverables exactly as written.",
  "Convert every date to YYYY-MM-DD. Do not invent anything that is not in the document: use an empty string instead.",
].join(" ");

export function readContract(ai: AiClient, file: UploadedFile) {
  return readFileAsJson(ai, { file, instructions: INSTRUCTIONS, jsonSchema: CONTRACT_JSON_SCHEMA, parse: ContractReadingSchema, maxTokens: 4096 });
}
