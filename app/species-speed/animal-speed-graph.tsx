"use client";
// "use client" = this component runs in the browser (not on the server). We need that because
// D3 draws by directly manipulating the page (the DOM), and we use React hooks (useState/useEffect/useRef).

// D3 is a JavaScript library for data visualization: https://d3js.org/
// It is split into small packages; we import only the pieces we need:
import { deviation, mean } from "d3-array"; // math helpers: average and standard deviation of a list of numbers
import { axisBottom, axisLeft } from "d3-axis"; // draws the x axis (bottom) and y axis (left), including tick marks + labels
import { csv } from "d3-fetch"; // downloads a CSV file and turns each row into a JavaScript object
import { scaleBand, scaleLinear, scaleOrdinal } from "d3-scale"; // "scales" convert data values into pixel positions / colors
import { select } from "d3-selection"; // lets D3 grab an HTML element and add SVG shapes inside it
import { useEffect, useRef, useState } from "react";

// The only three diets we allow. Using a TypeScript "union type" means TypeScript will warn us
// if we ever accidentally write a diet like "insectivore" in the code.
type Diet = "herbivore" | "omnivore" | "carnivore";
// The same three diets as a list, so we can loop over them. This order is also the left-to-right order of the bar groups.
const DIETS: Diet[] = ["carnivore", "herbivore", "omnivore"];

// The shape of one animal (one row of the cleaned CSV) after we convert it.
interface AnimalDatum {
  name: string; // e.g. "Cheetah"
  speed: number; // average speed in km/h, e.g. 112
  diet: Diet; // one of the three diets above
}

// DESIGN CHOICE: There are 144 animals — far too many bars to read (the names would overlap into a blur).
// Showing the fastest 10 of each diet (30 bars total) keeps labels legible and still lets you
// compare the three diets side by side. Change this one number to show more or fewer bars.
const TOP_PER_DIET = 10;

export default function AnimalSpeedGraph() {
  // useRef creates a reference to the <div> where D3 will draw the chart.
  // React normally controls the page, but D3 needs a real HTML element to draw into — the ref gives us that element.
  // https://react.dev/reference/react/useRef
  const graphRef = useRef<HTMLDivElement>(null);

  // State = data that, when it changes, makes React re-run the component.
  // animalData: the 30 animals that will be drawn as bars. Starts empty until the CSV loads.
  const [animalData, setAnimalData] = useState<AnimalDatum[]>([]);
  // dietStats: the finance-style summary text for each diet, e.g. { carnivore: "μ 36 km/h · σ 26 · Sharpe 1.39", ... }
  const [dietStats, setDietStats] = useState<Record<string, string>>({});

  // ---------------------------------------------------------------------------------------------
  // STEP 1: LOAD THE DATA
  // useEffect with an empty dependency list [] runs exactly once, right after the component first appears.
  // ---------------------------------------------------------------------------------------------
  useEffect(() => {
    // csv() downloads /sample_animals.csv (served from the /public folder) and gives us an array of rows.
    // Every value in a CSV row is text (a string), even numbers, so we have to convert them ourselves.
    // "void" just tells TypeScript/ESLint we intentionally aren't awaiting this promise.
    void csv("/sample_animals.csv").then((rows) => {
      const animals = rows
        // Convert each raw row into an AnimalDatum:
        //   - name: use "" if missing (?? means "if the left side is null/undefined, use the right side")
        //   - speed: Number("112") -> 112 (and Number("abc") -> NaN, which we filter out next)
        //   - diet: tell TypeScript to treat the text as a Diet (we double-check it in the filter below)
        .map((row) => ({ name: row.name ?? "", speed: Number(row.speed), diet: row.diet as Diet }))
        // Safety check: keep only rows that have a name, a real number for speed, and one of our three diets.
        // The Python cleaning already did this, but the chart shouldn't break if the CSV is ever edited.
        .filter((a) => a.name && !isNaN(a.speed) && DIETS.includes(a.diet));

      // -------------------------------------------------------------------------------------------
      // QUANT TWIST: a "Sharpe ratio" for each diet
      // In finance, the Sharpe ratio measures return per unit of risk: (average return) / (volatility).
      // Here we treat each diet like an investment portfolio and each animal's speed like a return:
      //   - mean speed (μ, "mu")            = "expected return"  -> how fast the group is on average
      //   - standard deviation (σ, "sigma") = "volatility"       -> how spread out / inconsistent the speeds are
      //   - μ / σ                           = "Sharpe ratio"     -> speed per unit of inconsistency
      // (A true Sharpe ratio subtracts a "risk-free rate" from the return first; here that rate is 0.)
      // IMPORTANT: we compute this on ALL animals in each diet, not just the top 10 we draw.
      // Using only the fastest 10 would be "survivorship bias" — like judging a fund only by its winning trades.
      // -------------------------------------------------------------------------------------------
      const stats: Record<string, string> = {};
      DIETS.forEach((diet) => {
        // All speeds for this diet, e.g. [25, 60, 88.5, ...]
        const speeds = animals.filter((a) => a.diet === diet).map((a) => a.speed);
        // mean() and deviation() return undefined for an empty list, so "?? 0" falls back to 0.
        const mu = mean(speeds) ?? 0;
        const sigma = deviation(speeds) ?? 0; // sample standard deviation (same as pandas' .std())
        // Build the label text. toFixed(n) rounds to n decimal places and turns the number into text.
        stats[diet] = `μ ${mu.toFixed(0)} km/h · σ ${sigma.toFixed(0)} · Sharpe ${(mu / sigma).toFixed(2)}`;
      });
      setDietStats(stats); // save into state -> React re-renders -> the legend shows the numbers

      // Pick the bars to draw: for each diet, sort fastest-first and keep the top TOP_PER_DIET.
      // flatMap runs this for each diet and joins the three lists into one:
      //   [10 carnivores..., 10 herbivores..., 10 omnivores...]
      // Because they're in that order, the bars appear grouped by diet from left to right.
      const topAnimals = DIETS.flatMap(
        (diet) =>
          animals
            .filter((a) => a.diet === diet) // only this diet
            .sort((a, b) => b.speed - a.speed) // biggest speed first (b - a = descending order)
            .slice(0, TOP_PER_DIET), // keep the first 10
      );
      setAnimalData(topAnimals); // save into state -> this triggers STEP 2 below
    });
  }, []);

  // ---------------------------------------------------------------------------------------------
  // STEP 2: DRAW THE CHART
  // This effect re-runs whenever animalData or dietStats changes (the list at the bottom: [animalData, dietStats]).
  // ---------------------------------------------------------------------------------------------
  useEffect(() => {
    // Clear any previous chart first. Otherwise each re-run would stack another chart underneath
    // (this happens e.g. when dietStats updates, or when React hot-reloads during development).
    if (graphRef.current) {
      graphRef.current.innerHTML = "";
    }

    // Nothing to draw until the CSV has loaded.
    if (animalData.length === 0) return;

    // Chart size in pixels. Use the container's width, but never narrower than 700px
    // (on small screens the container scrolls sideways instead — see the overflow-x-auto class below).
    const width = Math.max(graphRef.current?.clientWidth ?? 800, 700);
    const height = 500;
    // Empty space around the plotting area, reserved for axes and labels:
    // big bottom margin because the rotated animal names are long; left margin for the speed numbers + title.
    const margin = { top: 30, right: 20, bottom: 130, left: 70 };

    // Create an <svg> element (a drawing canvas for shapes) inside our div.
    // https://github.com/d3/d3-selection
    const svg = select(graphRef.current!).append("svg").attr("width", width).attr("height", height);

    // ----- SCALES: functions that convert data -> pixels (or colors) -----

    // x scale (band scale): gives each animal name its own equal-width "slot" along the x axis.
    //   domain = the inputs (all 30 animal names)
    //   range  = the output pixels (from the left margin to the right edge minus the right margin)
    //   padding(0.2) = 20% of each slot is empty space, so bars don't touch
    // Usage: x("Cheetah") -> the pixel where Cheetah's bar starts; x.bandwidth() -> the width of each bar.
    const x = scaleBand()
      .domain(animalData.map((d) => d.name))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    // y scale (linear scale): converts a speed (km/h) into a vertical pixel position.
    //   domain = from 0 to the fastest speed; .nice() rounds the top up to a clean number (e.g. 118 -> 120)
    //   range is "upside down" (bottom pixel first) because in SVG, y = 0 is the TOP of the screen,
    //   but on a chart we want 0 km/h at the BOTTOM.
    const y = scaleLinear()
      .domain([0, Math.max(...animalData.map((d) => d.speed))])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // color scale (ordinal scale): maps each diet to a fixed color.
    // carnivore -> red, herbivore -> green, omnivore -> orange (same order as DIETS).
    const color = scaleOrdinal<Diet, string>().domain(DIETS).range(["#e15759", "#59a14f", "#f1a340"]);

    // ----- BARS: one rectangle per animal -----
    // D3's "data join" pattern: selectAll("rect") + .data(list) + .join("rect")
    // means "make sure there is exactly one <rect> for each item in animalData".
    // Then each .attr(...) sets a property; the (d) => ... functions receive that bar's animal.
    svg
      .selectAll("rect")
      .data(animalData)
      .join("rect")
      .attr("x", (d) => x(d.name)!) // left edge of the bar (the ! tells TypeScript this is never undefined)
      .attr("y", (d) => y(d.speed)) // top edge of the bar (higher speed = higher up = smaller y)
      .attr("width", x.bandwidth()) // every bar is the same width
      .attr("height", (d) => y(0) - y(d.speed)) // from the top of the bar down to the 0 km/h line
      .attr("fill", (d) => color(d.diet)) // color by diet
      .attr("rx", 2) // slightly rounded corners
      .append("title") // a <title> inside an SVG shape = the browser's built-in hover tooltip
      .text((d) => `${d.name}: ${d.speed} km/h (${d.diet})`);

    // ----- X AXIS -----
    // Put a group (<g>) at the bottom of the plotting area and let axisBottom draw the line, ticks and names.
    // Then rotate every label -45° (and anchor it at its end) so long animal names don't overlap each other.
    svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`) // move it down to the bottom of the plot
      .call(axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .attr("dx", "-0.6em") // small nudges so the rotated text lines up under its bar
      .attr("dy", "0.2em");

    // ----- Y AXIS -----
    // Same idea on the left side: axisLeft draws the speed numbers (0, 10, 20, ...) with tick marks.
    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(axisLeft(y));

    // ----- AXIS TITLES -----
    // "currentColor" = use the page's text color, so the text is readable in both light and dark mode.
    // x-axis title, centered under the chart:
    svg
      .append("text")
      .attr("x", (margin.left + width - margin.right) / 2) // horizontal middle of the plotting area
      .attr("y", height - 8) // near the very bottom of the SVG
      .attr("text-anchor", "middle") // center the text on that x position
      .attr("fill", "currentColor")
      .text("Animal");

    // y-axis title, rotated to read bottom-to-top along the left edge.
    // Because the text is rotated -90°, its x/y are also rotated: x now moves it up/down, y moves it left/right.
    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + height - margin.bottom) / 2) // vertical middle of the plotting area
      .attr("y", 20) // 20px from the left edge
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .text("Speed (km/h)");

    // ----- LEGEND -----
    // Placed in the top-right, where the bars are shortest (omnivores max out around 64 km/h),
    // so it never covers any bars. It's 330px wide to fit the Sharpe stats text.
    const legend = svg.append("g").attr("transform", `translate(${width - margin.right - 330},${margin.top})`);

    // One row per diet: a small colored square + a label, each row 22px below the previous one.
    DIETS.forEach((diet, i) => {
      const row = legend.append("g").attr("transform", `translate(0,${i * 22})`);
      row.append("rect").attr("width", 14).attr("height", 14).attr("rx", 2).attr("fill", color(diet));
      row
        .append("text")
        .attr("x", 22) // to the right of the square
        .attr("y", 12) // vertically lined up with the square
        .attr("fill", "currentColor")
        // Capitalize the diet ("carnivore" -> "Carnivore") and append its stats from the quant step above.
        .text(`${diet.charAt(0).toUpperCase() + diet.slice(1)} — ${dietStats[diet] ?? ""}`);
    });
  }, [animalData, dietStats]);

  // What React renders: a short caption, then the empty div that D3 fills with the chart.
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        The {TOP_PER_DIET} fastest animals in each diet group. Hover a bar for its exact speed. Legend stats (mean μ,
        volatility σ, Sharpe = μ/σ) use all animals in each diet.
      </p>
      {/* ref={graphRef} connects this div to graphRef, so D3 knows where to draw.
          overflow-x-auto lets the chart scroll sideways on small screens instead of getting squished. */}
      <div ref={graphRef} className="w-full overflow-x-auto" />
    </div>
  );
}
