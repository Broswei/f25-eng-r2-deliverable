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
import { Pencil } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type BaseSyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type Species = Database["public"]["Tables"]["species"]["Row"];

// Define kingdom enum for use in Zod schema and displaying dropdown options in the form
const kingdoms = z.enum(["Animalia", "Plantae", "Fungi", "Protista", "Archaea", "Bacteria"]);

// Use Zod to define the shape + requirements of a Species entry; used in form validation
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

type FormData = z.infer<typeof speciesSchema>;

export default function SpeciesCard({ species, currentUserId }: { species: Species; currentUserId?: string }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const isAuthor = currentUserId === species.author;

  // Set up form with current species data as default values
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

  const onSubmit = async (input: FormData) => {
    const supabase = createBrowserSupabaseClient();
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

    if (error) {
      return toast({
        title: "Something went wrong.",
        description: error.message,
        variant: "destructive",
      });
    }

    setEditOpen(false);
    router.refresh();

    return toast({
      title: "Species updated!",
      description: "Successfully updated " + input.scientific_name + ".",
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

      <div className="mt-3 flex gap-2">
        {/* Edit Dialog - only show if user is the author */}
        {isAuthor && (
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-screen overflow-y-auto sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Edit Species</DialogTitle>
                <DialogDescription>
                  Edit the species information here. Click &quot;Save Changes&quot; below when you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={(e: BaseSyntheticEvent) => void form.handleSubmit(onSubmit)(e)}>
                  <div className="grid w-full items-center gap-4">
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
                      <Button type="submit" className="ml-1 mr-1 flex-auto">
                        Save Changes
                      </Button>
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

        {/* Learn More Dialog */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="flex-1">Learn More</Button>
          </DialogTrigger>
          <DialogContent className="max-h-screen overflow-y-auto sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{species.scientific_name}</DialogTitle>
              <DialogDescription>{species.common_name ?? "No common name available"}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
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
                    <p className="text-lg">{species.total_population.toLocaleString()}</p>
                  </div>
                )}
                {species.description && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground">Description</h4>
                    <p className="text-base leading-relaxed">{species.description}</p>
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
