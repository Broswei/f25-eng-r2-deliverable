import { Separator } from "@/components/ui/separator";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

export default function Home() {
  return (
    <>
      <TypographyH2>
        Welcome to T4SG <span className="text-green-400">Biodiversity Hub</span>!
      </TypographyH2>
      <TypographyP>
        Biodiversity Hub is a web-app that allows users to post information about different species and stay educated on
        biodiversity across the globe. Users sign into the app and add cards that contain data on the species&apos;
        name, description, population, and more.
      </TypographyP>
      <TypographyP>To see the species page, log in in the top right!</TypographyP>
      <Separator className="my-4" />
      <TypographyP>
        Biodiversity Hub was created as an example webapp for T4SG&apos;s Fall 2026 applications.
      </TypographyP>
      <TypographyP>Good luck! We can&apos;t wait to see what you create :)</TypographyP>
    </>
  );
}
