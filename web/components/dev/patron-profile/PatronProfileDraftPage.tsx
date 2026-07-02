import "./patron-profile-draft.css";
import { PatronProfileDraftTopBar } from "./TopBar";
import { PatronProfileDraftHeader } from "./ProfileHeader";
import { PatronProfileDraftPatronsRow } from "./PatronsRow";
import { PatronProfileDraftCollections } from "./Collections";
import { PatronProfileDraftFavorites } from "./Favorites";

/**
 * Dev-only patron (user) profile draft — adapted from F:\relay-profile-tsx.
 * Header loads live patron profile when signed in; edit uses PATCH /api/v1/patron/me.
 */
export function PatronProfileDraftPage() {
  return (
    <main className="patron-profile-draft min-h-screen bg-background text-foreground">
      <PatronProfileDraftTopBar />
      <PatronProfileDraftHeader />
      <div className="mt-4 border-t border-border/60">
        <PatronProfileDraftPatronsRow />
      </div>
      <div className="border-t border-border/60">
        <PatronProfileDraftCollections />
      </div>
      <div className="border-t border-border/60">
        <PatronProfileDraftFavorites />
      </div>
    </main>
  );
}
