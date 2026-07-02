"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { EditPatronProfileModal } from "@/components/patron/EditPatronProfileModal";
import {
  fetchPatronProfileMe,
  type PatronProfileMe,
} from "@/lib/patron-profile-api";
import { patronProfileHandlesMatch } from "@/lib/patron-profile-identity";

type PublicPatronProfileOwnEditProps = {
  pageHandle: string;
};

/**
 * Shows "Edit profile" on `/p/[handle]` only when the signed-in patron's handle matches the page.
 * Authorization for saves is enforced server-side on PATCH /api/v1/patron/me (session-scoped).
 */
export function PublicPatronProfileOwnEdit({
  pageHandle,
}: PublicPatronProfileOwnEditProps): React.ReactElement | null {
  const router = useRouter();
  const [me, setMe] = useState<PatronProfileMe | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchPatronProfileMe({ suppressAuthRedirect: true })
      .then((profile) => {
        if (!cancelled) setMe(profile);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!me || !patronProfileHandlesMatch(me.handle, pageHandle)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#2A2A2A] bg-[#141414] px-3 py-1.5 text-xs font-medium text-[#9bf0c4] hover:border-[#2D6A4F]"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit profile
      </button>
      <EditPatronProfileModal
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={me}
        onSaved={(profile) => {
          setMe(profile);
          router.refresh();
        }}
      />
    </>
  );
}
