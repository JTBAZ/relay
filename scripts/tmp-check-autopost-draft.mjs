import { prisma } from "../dist/src/lib/db.js";

const draftId = process.argv[2];
if (!draftId) {
  console.error("usage: node scripts/tmp-check-autopost-draft.mjs <draft_id>");
  process.exit(1);
}
const row = await prisma.autopostDraft.findUnique({ where: { id: draftId } });
console.log(JSON.stringify(row, null, 2));
await prisma.$disconnect();
