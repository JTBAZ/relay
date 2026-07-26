import { prisma } from "../dist/src/lib/db.js";

const mediaId = process.argv[2];
const row = await prisma.mediaAsset.findUnique({
  where: { id: mediaId },
  select: { id: true, autopostDraftId: true, primaryPostId: true }
});
console.log(JSON.stringify(row, null, 2));
await prisma.$disconnect();
