import { Separator } from "@/components/ui/separator";
import { TypographyH2 } from "@/components/ui/typography";
import { createServerSupabaseClient } from "@/lib/server-utils";
import { redirect } from "next/navigation";
import AddSpeciesDialog from "./add-species-dialog";
import SpeciesCard from "./species-card";

export default async function SpeciesList() {
  // Create supabase server component client and obtain user session from stored cookie
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // this is a protected route - only users who are signed in can view this route
    redirect("/");
  }

  // Obtain the ID of the currently signed-in user
  const sessionId = session.user.id;

  // Fetch all species from the Supabase database, newest first (highest id first).
  //
  // STRETCH GOAL (author info): the species table only stores the author's user ID in its "author" column,
  // not their name. The profiles table has the names and emails. Because species.author is a
  // "foreign key" pointing at profiles.id, Supabase can JOIN the two tables for us:
  //   "*"                            -> every column of the species row
  //   "profiles(display_name, email)" -> plus the matching author's display_name and email from profiles
  // So each species comes back looking like:
  //   { id: 1, scientific_name: "...", ..., author: "abc-123", profiles: { display_name: "Shwei", email: "..." } }
  // In SQL terms this is roughly: SELECT species.*, profiles.display_name, profiles.email
  //                               FROM species JOIN profiles ON species.author = profiles.id
  const { data: species } = await supabase
    .from("species")
    .select("*, profiles(display_name, email)")
    .order("id", { ascending: false });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <TypographyH2>Species List</TypographyH2>
        <AddSpeciesDialog userId={sessionId} />
      </div>
      <Separator className="my-4" />
      <div className="flex flex-wrap justify-center">
        {/* One card per species. We pass the logged-in user's ID (sessionId) into each card, so the card can
            compare it with the species' author and decide whether to show the Edit and Delete buttons. */}
        {species?.map((species) => <SpeciesCard key={species.id} species={species} currentUserId={sessionId} />)}
      </div>
    </>
  );
}
