"use client";
/*
Note: "use client" is a Next.js App Router directive that tells React to render the component as
a client component rather than a server component. This establishes the server-client boundary,
providing access to client-side functionality such as hooks and event handlers to this component and
any of its imported children. Although the SpeciesCard component itself does not use any client-side
functionality, it is beneficial to move it to the client because it is rendered in a list with a unique
key prop in species/page.tsx. When multiple component instances are rendered from a list, React uses the unique key prop
on the client-side to correctly match component state and props should the order of the list ever change.
React server components don't track state between rerenders, so leaving the uniquely identified components (e.g. SpeciesCard)
can cause errors with matching props and state in child components if the list order changes.
*/
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { createBrowserSupabaseClient } from "@/lib/client-utils";
import type { Database } from "@/lib/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type BaseSyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// The TypeScript type for one species.
// Database[...]["Row"] is the auto-generated type for a row of the species table (from lib/schema.ts).
// The "& { profiles: ... }" adds one more field: the author's profile, which we JOINed in species/page.tsx.
// It can be null (e.g. if the author's profile is missing), so the UI checks for that before showing it.
type Species = Database["public"]["Tables"]["species"]["Row"] & {
  profiles: { display_name: string; email: string } | null;
};

// ================================================================================================
// FEATURE 2 (EDIT) — form validation rules
// This is copied from add-species-dialog.tsx so editing follows exactly the same rules as adding.
// ================================================================================================

// The allowed kingdoms. Used both for validation and to build the options in the Kingdom dropdown.
const kingdoms = z.enum(["Animalia", "Plantae", "Fungi", "Protista", "Archaea", "Bacteria"]);

// Zod is a validation library: this "schema" describes what a valid species form looks like.
// When the user hits "Save Changes", React Hook Form runs the inputs through this schema:
//   - if something is invalid (e.g. empty scientific name, image that isn't a URL), the save is blocked
//     and an error message appears under that field
//   - if everything is valid, .transform() cleans the values (trims spaces, turns "" into null)
//     before they are sent to the database
const speciesSchema = z.object({
  scientific_name: z
    .string()
    .trim()
    .min(1)
    .transform((val) => val?.trim()),
  common_name: z
    .string()
    .nullable()
    .transform((val) => (!val || val.trim() === "" ? null : val.trim())),
  kingdom: kingdoms,
  total_population: z.number().int().positive().min(1).nullable(),
  image: z
    .string()
    .url()
    .nullable()
    .transform((val) => (!val || val.trim() === "" ? null : val.trim())),
  description: z
    .string()
    .nullable()
    .transform((val) => (!val || val.trim() === "" ? null : val.trim())),
});

// z.infer automatically creates a TypeScript type from the schema above, so the two can never get out of sync.
type FormData = z.infer<typeof speciesSchema>;

// One species card. It receives:
//   species       -> this species' data (including the joined author profile)
//   currentUserId -> the ID of whoever is logged in (passed down from species/page.tsx)
export default function SpeciesCard({ species, currentUserId }: { species: Species; currentUserId?: string }) {
  // router lets us refresh the page's data after an edit or delete.
  const router = useRouter();

  // Each dialog (pop-up) has an open/closed state. We control them ourselves (instead of letting the
  // dialog manage itself) so our code can close them automatically after a successful save/delete.
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);

  // Is the logged-in user the person who created this species?
  // This decides whether the Edit and Delete buttons are shown at all.
  // (Supabase's database rules ALSO block non-authors from editing/deleting, so this is about a clean UI —
  // the real security is enforced on the backend.)
  const isAuthor = currentUserId === species.author;

  // ================================================================================================
  // FEATURE 2 (EDIT) — the form
  // useForm (from React Hook Form) manages the form's values, validation and submission.
  //   resolver: zodResolver(speciesSchema) -> validate using our Zod rules above
  //   defaultValues -> PRE-FILL every field with this species' current data, so the user edits
  //                    the existing info instead of starting from a blank form
  //   mode: "onChange" -> re-check validation as the user types, so errors show up immediately
  // ================================================================================================
  const form = useForm<FormData>({
    resolver: zodResolver(speciesSchema),
    defaultValues: {
      scientific_name: species.scientific_name,
      common_name: species.common_name,
      kingdom: species.kingdom as z.infer<typeof kingdoms>,
      total_population: species.total_population,
      image: species.image,
      description: species.description,
    },
    mode: "onChange",
  });

  // Runs when the user clicks "Save Changes" AND every field passed validation.
  // "input" is the already-cleaned data (Zod has trimmed it and turned blanks into null).
  const onSubmit = async (input: FormData) => {
    // Connect to Supabase from the browser (the user's login cookie is sent along automatically).
    const supabase = createBrowserSupabaseClient();
    // UPDATE this species' row with the new values.
    // .eq("id", species.id) is the crucial part: "only update the row whose id equals this species' id".
    // Without it, the update would try to change EVERY species in the table.
    // In SQL: UPDATE species SET common_name = ..., ... WHERE id = <this species' id>
    const { error } = await supabase
      .from("species")
      .update({
        common_name: input.common_name,
        description: input.description,
        kingdom: input.kingdom,
        scientific_name: input.scientific_name,
        total_population: input.total_population,
        image: input.image,
      })
      .eq("id", species.id);

    // If Supabase reports an error (e.g. no internet, or the database rejected the change),
    // show a red "toast" notification with the error and stop here ("return" exits the function early).
    if (error) {
      return toast({
        title: "Something went wrong.",
        description: error.message,
        variant: "destructive",
      });
    }

    // Success! Close the edit pop-up...
    setEditOpen(false);
    // ...and re-fetch the species list. The list is loaded in species/page.tsx, a server component,
    // so router.refresh() asks the server to run that query again — the card then shows the new values.
    router.refresh();

    // Show a success notification.
    return toast({
      title: "Species updated!",
      description: "Successfully updated " + input.scientific_name + ".",
    });
  };

  // ================================================================================================
  // STRETCH GOAL (DELETE)
  // Runs only when the user clicks the red "Delete" button INSIDE the confirmation pop-up —
  // clicking the trash icon on the card just opens that pop-up. The two-step design prevents
  // deleting a species by accident.
  // ================================================================================================
  const onDelete = async () => {
    const supabase = createBrowserSupabaseClient();
    // DELETE only the row whose id matches this species.
    // In SQL: DELETE FROM species WHERE id = <this species' id>
    const { error } = await supabase.from("species").delete().eq("id", species.id);

    // Same error handling pattern as editing: show a red toast and stop.
    if (error) {
      return toast({
        title: "Something went wrong.",
        description: error.message,
        variant: "destructive",
      });
    }

    // Success: close the confirmation pop-up, refresh the list (the card disappears), and confirm with a toast.
    setDeleteOpen(false);
    router.refresh();

    return toast({
      title: "Species deleted.",
      description: "Successfully deleted " + species.scientific_name + ".",
    });
  };

  return (
    <div className="m-4 w-72 min-w-72 flex-none rounded border-2 p-3 shadow">
      {species.image && (
        <div className="relative h-40 w-full">
          <Image src={species.image} alt={species.scientific_name} fill style={{ objectFit: "cover" }} />
        </div>
      )}
      <h3 className="mt-3 text-2xl font-semibold">{species.scientific_name}</h3>
      <h4 className="text-lg font-light italic">{species.common_name}</h4>
      <p>{species.description ? species.description.slice(0, 150).trim() + "..." : ""}</p>

      {/* Row of buttons at the bottom of the card: [Edit] [Trash] [Learn More] */}
      <div className="mt-3 flex gap-2">
        {/* ============================================================================================
            FEATURE 2 (EDIT) — the Edit button + pop-up form
            "isAuthor && (...)" means: only render this if the logged-in user created this species.
            Non-authors never even see the button.
            ============================================================================================ */}
        {isAuthor && (
          // A Dialog is a pop-up window (a shadcn/ui component). open/onOpenChange connect it to our editOpen state.
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            {/* DialogTrigger = the thing you click to open the pop-up. "asChild" makes our Button act as that trigger. */}
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </DialogTrigger>
            {/* DialogContent = what appears inside the pop-up. max-h-screen + overflow-y-auto let a long form scroll. */}
            <DialogContent className="max-h-screen overflow-y-auto sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Edit Species</DialogTitle>
                <DialogDescription>
                  Edit the species information here. Click &quot;Save Changes&quot; below when you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              {/* <Form {...form}> gives every field below access to the form we set up with useForm. */}
              <Form {...form}>
                {/* On submit: form.handleSubmit runs Zod validation first, and only calls onSubmit if everything is valid. */}
                <form onSubmit={(e: BaseSyntheticEvent) => void form.handleSubmit(onSubmit)(e)}>
                  <div className="grid w-full items-center gap-4">
                    {/* Each FormField below follows the same pattern:
                          name       -> which field of the form it controls (must match a key in speciesSchema)
                          FormLabel  -> the label shown above the input
                          FormControl + Input -> the actual text box, connected to the form via {...field}
                          FormMessage -> shows the validation error for this field (if any) */}
                    <FormField
                      control={form.control}
                      name="scientific_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Scientific Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Cavia porcellus" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="common_name"
                      render={({ field }) => {
                        // Optional fields can be null, but a text box can't display null — so we pull "value"
                        // out and show "" instead (value ?? ""). "...rest" passes along everything else
                        // (onChange, name, etc.). The same trick is used for the other optional fields below.
                        const { value, ...rest } = field;
                        return (
                          <FormItem>
                            <FormLabel>Common Name</FormLabel>
                            <FormControl>
                              <Input value={value ?? ""} placeholder="Guinea pig" {...rest} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <FormField
                      control={form.control}
                      name="kingdom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Kingdom</FormLabel>
                          {/* A dropdown instead of a text box, so users can only pick a valid kingdom.
                              kingdoms.parse(value) double-checks the choice is one of the allowed kingdoms. */}
                          <Select onValueChange={(value) => field.onChange(kingdoms.parse(value))} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a kingdom" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectGroup>
                                {kingdoms.options.map((kingdom, index) => (
                                  <SelectItem key={index} value={kingdom}>
                                    {kingdom}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="total_population"
                      render={({ field }) => {
                        const { value, ...rest } = field;
                        return (
                          <FormItem>
                            <FormLabel>Total population</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                value={value ?? ""}
                                placeholder="300000"
                                {...rest}
                                // Inputs always give back text (e.g. "300000"). The "+" converts it to a
                                // number (300000), because the schema expects a number for total_population.
                                onChange={(event) => field.onChange(+event.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <FormField
                      control={form.control}
                      name="image"
                      render={({ field }) => {
                        const { value, ...rest } = field;
                        return (
                          <FormItem>
                            <FormLabel>Image URL</FormLabel>
                            <FormControl>
                              <Input
                                value={value ?? ""}
                                placeholder="https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/George_the_amazing_guinea_pig.jpg/440px-George_the_amazing_guinea_pig.jpg"
                                {...rest}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => {
                        const { value, ...rest } = field;
                        return (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea
                                value={value ?? ""}
                                placeholder="The guinea pig or domestic guinea pig, also known as the cavy or domestic cavy, is a species of rodent belonging to the genus Cavia in the family Caviidae."
                                {...rest}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <div className="flex">
                      {/* type="submit" triggers the form's onSubmit (validation -> onSubmit -> Supabase update) */}
                      <Button type="submit" className="ml-1 mr-1 flex-auto">
                        Save Changes
                      </Button>
                      {/* DialogClose closes the pop-up without saving */}
                      <DialogClose asChild>
                        <Button type="button" className="ml-1 mr-1 flex-auto" variant="secondary">
                          Cancel
                        </Button>
                      </DialogClose>
                    </div>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}

        {/* ============================================================================================
            STRETCH GOAL (DELETE) — trash button + "Are you sure?" confirmation pop-up
            Also only shown to the author. Clicking the trash icon does NOT delete anything by itself;
            it only opens the pop-up. The species is deleted only if the user then clicks "Delete".
            ============================================================================================ */}
        {isAuthor && (
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              {/* variant="destructive" = red button. aria-label gives screen readers a name for this icon-only button. */}
              <Button variant="destructive" size="sm" aria-label="Delete species">
                <Trash2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                {/* Name the species in the title so the user knows exactly what they're deleting */}
                <DialogTitle>Delete {species.scientific_name}?</DialogTitle>
                <DialogDescription>This will permanently remove this species. This cannot be undone.</DialogDescription>
              </DialogHeader>
              <div className="flex">
                {/* The real delete: calls onDelete() above */}
                <Button variant="destructive" className="ml-1 mr-1 flex-auto" onClick={() => void onDelete()}>
                  Delete
                </Button>
                {/* Cancel just closes the pop-up; nothing is deleted */}
                <DialogClose asChild>
                  <Button type="button" className="ml-1 mr-1 flex-auto" variant="secondary">
                    Cancel
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* ============================================================================================
            FEATURE 1 (DETAILED VIEW) — "Learn More" pop-up
            Shown to everyone (not just the author). It only DISPLAYS data we already have in "species",
            so no database request or form is needed. We don't pass open/onOpenChange here, so the
            Dialog manages its own open/closed state (nothing in our code needs to close it).
            ============================================================================================ */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="flex-1">Learn More</Button>
          </DialogTrigger>
          <DialogContent className="max-h-screen overflow-y-auto sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{species.scientific_name}</DialogTitle>
              {/* ?? shows a fallback message if the species has no common name */}
              <DialogDescription>{species.common_name ?? "No common name available"}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {/* Optional fields use "value && (...)" so a section only appears if that field has data,
                  instead of showing an empty heading. */}
              {species.image && (
                <div className="relative h-64 w-full overflow-hidden rounded-lg">
                  <Image src={species.image} alt={species.scientific_name} fill style={{ objectFit: "cover" }} />
                </div>
              )}
              <div className="grid gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground">Scientific Name</h4>
                  <p className="text-lg">{species.scientific_name}</p>
                </div>
                {species.common_name && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground">Common Name</h4>
                    <p className="text-lg italic">{species.common_name}</p>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground">Kingdom</h4>
                  <p className="text-lg">{species.kingdom}</p>
                </div>
                {species.total_population && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground">Total Population</h4>
                    {/* toLocaleString() adds thousands separators: 300000 -> "300,000" */}
                    <p className="text-lg">{species.total_population.toLocaleString()}</p>
                  </div>
                )}
                {species.description && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground">Description</h4>
                    <p className="text-base leading-relaxed">{species.description}</p>
                  </div>
                )}
                {/* STRETCH GOAL (AUTHOR INFO): the author's name + email, which came from the profiles
                    table via the JOIN in species/page.tsx. Hidden if no profile was found. */}
                {species.profiles && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground">Added By</h4>
                    <p className="text-base">
                      {species.profiles.display_name}{" "}
                      <span className="text-muted-foreground">({species.profiles.email})</span>
                    </p>
                  </div>
                )}
              </div>
              <DialogClose asChild>
                <Button type="button" variant="secondary" className="w-full">
                  Close
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
