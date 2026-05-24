import { TopBar } from "@/components/profile/TopBar";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { PatronsRow } from "@/components/profile/PatronsRow";
import { Collections } from "@/components/profile/Collections";
import { Favorites } from "@/components/profile/Favorites";

export default function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <TopBar />
      <ProfileHeader />
      <div className="mt-4 border-t border-border/60">
        <PatronsRow />
      </div>
      <div className="border-t border-border/60">
        <Collections />
      </div>
      <div className="border-t border-border/60">
        <Favorites />
      </div>
    </main>
  );
}
