const color = d3.scaleOrdinal(["#1f77b4", "#2ca02c", "#d62728"]);

const compactFormat = d => {
  if (d === 0) return "0";
  if (d >= 1e9) return (d / 1e9).toFixed(1) + "B";
  if (d >= 1e6) return (d / 1e6).toFixed(1) + "M";
  if (d >= 1e3) return (d / 1e3).toFixed(1) + "K";
  return d;
};

d3.csv("./combined_nei_grouped_2010_2023_final.csv").then(raw => {
  raw.forEach(d => {
    for (let k in d) {
      d[k.trim()] = d[k];
      if (k !== k.trim()) delete d[k];
    }
    d.Year = +d.Year;
    d.State = d.State ? d.State.trim() : "ALL";
    d.City = d.City ? d.City.trim() : "ALL";
    d.CO2 = +d["CO2 emissions (non-biogenic)"] || 0;
    d.CH4 = +d["Methane (CH4) emissions"] || 0;
    d.N2O = +d["Nitrous Oxide (N2O) emissions"] || 0;
    d.Industry = d["Industry Type (sectors)"] || "Other";
  });

  setupSelectors(raw);
  setupBarplot(); 
  drawLineChart();
});


function setupSelectors(data) {
    const pollutants = ["CO2", "CH4", "N2O"];
    const stateSelect = d3.select("#state-select");
    const citySelect = d3.select("#city-select");
  
    // Get unique states and sort them
    const states = [...new Set(data.map(d => d.State))].filter(s => s).sort((a, b) => {
      // Keep "ALL" at the very top
      if (a === "ALL") return -1;
      if (b === "ALL") return 1;
      return a.localeCompare(b);
    });
    
    stateSelect.selectAll("option").remove();
    stateSelect.selectAll("option")
      .data(states)
      .enter()
      .append("option")
      .attr("value", d => d) // Internal value remains "ALL"
      .text(d => d === "ALL" ? "All States" : d); // Displayed as "All States"
  
    // Set default to "ALL" so it matches your CSV rows
    stateSelect.property("value", "ALL");
  
    stateSelect.on("change", updateCities);
    citySelect.on("change", updateChart);
    d3.selectAll("#pollutant-controls input").on("change", updateChart);
  
    // Run initial setup
    updateCities();

     function updateCities() {
    const state = stateSelect.property("value");
    const cities = [...new Set(data.filter(d=>d.State===state).map(d=>d.City))].sort();

    citySelect.selectAll("option").remove();
    citySelect.selectAll("option")
      .data(cities)
      .enter().append("option")
      .attr("value", d=>d)
      .text(d => d==="ALL"? "All Cities": d);
    citySelect.property("value", cities[0] || "ALL");
    updateChart();
  }

  function updateChart(){
    const selectedPollutants = pollutants.filter(p =>
      d3.select(`#pollutant-controls input[value='${p}']`).property("checked")
    );
    const state = stateSelect.property("value");
    const city = citySelect.property("value");
    updateLineChart(data, state, city, selectedPollutants);

    // Update barplot for first available year
    const firstYear = d3.min(data.filter(d=>d.State===state && d.City===city), d=>d.Year);
    updateBarplot(firstYear || null, state, city, data);
  }
}

// Line plot 

function drawLineChart(){
  const width = 900, height = 300;
  const margin = {top:40, right:100, bottom:40, left:80};
  let svg = d3.select("#chart svg");
  if(svg.empty()){
    svg = d3.select("#chart")
      .append("svg")
      .attr("width", width)
      .attr("height", height);
    svg.append("g").attr("class","x-axis").attr("transform", `translate(0,${height-margin.bottom})`);
    svg.append("g").attr("class","y-axis").attr("transform", `translate(${margin.left},0)`);
  }
}

function updateLineChart(data, state, city, selectedPollutants){
  const width = 900, height = 300;
  const margin = {top:40, right:100, bottom:40, left:80};
  const filtered = data.filter(d => d.State===state && d.City===city);
  if(filtered.length===0) return;

  const yearlyMap = d3.rollups(
    filtered,
    v => ({
      CO2: d3.sum(v,d=>d.CO2),
      CH4: d3.sum(v,d=>d.CH4),
      N2O: d3.sum(v,d=>d.N2O)
    }),
    d=>d.Year
  );

  const chartData = [];
  for(let [year, values] of yearlyMap){
    for(let pollutant of selectedPollutants){
      chartData.push({date: new Date(year,0,1), pollutant, value: values[pollutant], year, state, city});
    }
  }

  chartData.sort((a,b)=>a.date-b.date);
  const svg = d3.select("#chart svg");

  const x = d3.scaleTime().domain(d3.extent(chartData,d=>d.date)).range([margin.left,width-margin.right]);
  const y = d3.scaleLinear().domain([0,d3.max(chartData,d=>d.value)||0]).nice().range([height-margin.bottom,margin.top]);

  svg.select(".x-axis").transition().call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
  svg.select(".y-axis").transition().call(d3.axisLeft(y).tickFormat(d3.format(",")).tickFormat(compactFormat));

  svg.append("text")
  .attr("class", "y-axis-label")
  .attr("transform", `rotate(-90)`)
  .attr("x", -height/2)
  .attr("y", margin.left - 50)
  .attr("text-anchor", "middle")
  .text("Emissions (tons)");

  const grouped = d3.groups(chartData,d=>d.pollutant);
  const line = d3.line().curve(d3.curveMonotoneX).x(d=>x(d.date)).y(d=>y(d.value));
  const tooltip = d3.select(".tooltip");

  const lines = svg.selectAll(".line").data(grouped,d=>d[0]);
  lines.enter().append("path").attr("class","line")
    .merge(lines)
    .transition()
    .attr("fill","none")
    .attr("stroke", d=>color(d[0]))
    .attr("stroke-width",2)
    .attr("d", d=>line(d[1]));
  lines.exit().remove();

  const circles = svg.selectAll(".circle-group").data(grouped,d=>d[0]);
  const circlesEnter = circles.enter().append("g").attr("class","circle-group");

  circlesEnter.merge(circles).each(function([pollutant, values]){
    const circleSel = d3.select(this).selectAll("circle").data(values,d=>d.date);
    circleSel.enter().append("circle")
      .attr("r",4)
      .attr("fill", color(pollutant))
      .on("mouseenter",(e,d)=>{
        tooltip.style("opacity",1)
          .html(`<strong>${pollutant}</strong><br>Year: ${d.year}<br>State: ${d.state}<br>City: ${d.city}<br>Value: ${d3.format(",")(d.value)}`);
        updateBarplot(d.year,d.state,d.city,data);
      })
      .on("mousemove",e=>tooltip.style("left",(e.pageX+10)+"px").style("top",(e.pageY-20)+"px"))
      .on("mouseleave",()=>tooltip.style("opacity",0))
      .merge(circleSel)
      .attr("cx", d=>x(d.date))
      .attr("cy", d=>y(d.value));
    circleSel.exit().remove();
  });
  circles.exit().remove();
}


// Bar plot

function setupBarplot() {
  const container = document.getElementById("barplot-container");
  const svg = d3.select("#barplot");

  const width = container.clientWidth;
  const height = container.clientHeight;

  svg
    .attr("width", width)
    .attr("height", height);

  svg.selectAll("*").remove();

  svg.append("g")
    .attr("class", "barplot-g");

  const margin = { top: 40, right: 40, bottom: 50, left: 220 };
  const innerWidth = width - margin.left - margin.right;

  svg.select(".barplot-g")
    .attr("transform", `translate(${margin.left},${margin.top})`)
    .append("text")
    .attr("x", innerWidth / 2)
    .attr("y", 0)
    .attr("text-anchor", "middle")
    .attr("font-weight", "bold")
    .text("Barplot – No data yet");
}

function updateBarplot(year, state, city, data) {
  const container = document.getElementById("barplot-container");
  const svg = d3.select("#barplot");

  const width = container.clientWidth;
  const height = container.clientHeight;

  svg
    .attr("width", width)
    .attr("height", height);

  const margin = { top: 40, right: 40, bottom: 50, left: 220 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.select(".barplot-g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  g.selectAll("*").remove();

  if (!year) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .text("No data for this selection");
    return;
  }

  const filtered = data.filter(d =>
    d.Year === year && d.State === state && d.City === city
  );

  if (!filtered.length) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .text("No data");
    return;
  }

  const pollutants = ["CO2", "CH4", "N2O"];
  const selectedPollutants = pollutants.filter(p =>
    d3.select(`#pollutant-controls input[value='${p}']`).property("checked")
  );

  if (!selectedPollutants.length) {
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .text("No pollutants selected");
    return;
  }

  const aggregated = d3.rollups(
    filtered,
    v => {
      const obj = {};
      selectedPollutants.forEach(p => {
        obj[p] = d3.sum(v, d => d[p]);
      });
      return obj;
    },
    d => d.Industry
  ).map(([industry, values]) => ({
    industry,
    ...values
  }));

  const total = d3.sum(aggregated, d =>
    selectedPollutants.reduce((s, p) => s + d[p], 0)
  );

  const threshold = 0.003;
  const main = [];
  const other = { industry: "Minor sectors (<0.3%)" };
  selectedPollutants.forEach(p => other[p] = 0);

  aggregated.forEach(d => {
    const sum = selectedPollutants.reduce((s, p) => s + d[p], 0);
    if (sum / total < threshold) {
      selectedPollutants.forEach(p => other[p] += d[p]);
    } else {
      main.push(d);
    }
  });

  if (selectedPollutants.some(p => other[p] > 0)) {
    main.push(other);
  }

  main.sort((a, b) =>
    d3.descending(
      selectedPollutants.reduce((s, p) => s + a[p], 0),
      selectedPollutants.reduce((s, p) => s + b[p], 0)
    )
  );

  const x = d3.scaleLinear()
    .domain([0, d3.max(main, d =>
      selectedPollutants.reduce((s, p) => s + d[p], 0)
    )])
    .nice()
    .range([0, innerWidth]);

  const y = d3.scaleBand()
    .domain(main.map(d => d.industry))
    .range([0, innerHeight])
    .padding(0.2);

  const stack = d3.stack().keys(selectedPollutants);
  const series = stack(main);

  g.append("g").call(d3.axisLeft(y));

  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(compactFormat));

  const tooltip = d3.select(".tooltip");

  g.selectAll(".layer")
    .data(series)
    .join("g")
    .attr("class", "layer")
    .attr("fill", d => color(d.key))
    .selectAll("rect")
    .data(d => d)
    .join("rect")
    .attr("y", d => y(d.data.industry))
    .attr("x", d => x(d[0]))
    .attr("height", y.bandwidth())
    .attr("width", d => x(d[1]) - x(d[0]))
    .on("mouseenter", (event, d) => {
      const pollutant = d3.select(event.currentTarget.parentNode).datum().key;
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>${pollutant}</strong><br>
          Industry: ${d.data.industry}<br>
          Year: ${year}<br>
          State: ${state}<br>
          City: ${city}<br>
          Value: ${d3.format(",")(d.data[pollutant])}
        `);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", -15)
    .attr("text-anchor", "middle")
    .attr("font-weight", "bold")
    .text(`Emissions by Industry – ${city}, ${state} (${year})`);

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 40)
    .attr("text-anchor", "middle")
    .text("Emissions (tons)");
}

const mapWidth = 1920;
const mapHeight = 1200;

const mapSvg = d3.select("#choropleth-container")
  .append("svg")
  .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

const mapGroup = mapSvg.append("g");
const mapTooltip = d3.select("#map-tooltip");

const yearSlider = document.getElementById("yearSlider");
const yearText = document.getElementById("yearText");
const pollutantSelect = document.getElementById("pollutantSelect");

const projection = d3.geoAlbersUsa()
  .translate([mapWidth / 2, mapHeight / 2 + 40])
  .scale(1600);

const path = d3.geoPath().projection(projection);

const color_map = d3.scaleSequential(d3.interpolateYlOrRd).clamp(true);

const stateAbbrToName = new Map([
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],
  ["CA","California"],["CO","Colorado"],["CT","Connecticut"],
  ["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],
  ["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],
  ["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],
  ["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],
  ["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],
  ["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],
  ["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],
  ["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],
  ["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],
  ["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],
  ["WI","Wisconsin"],["WY","Wyoming"]
]);

let stateFeatures;
let dataAgg;
let currentYear;
let currentPollutant;

Promise.all([
  d3.json("https://unpkg.com/us-atlas@3/states-10m.json"),
  d3.csv("./combined_nei_grouped_2010_2023_final.csv", d => {
    const clean = {};
    for (const k in d) clean[k.trim()] = d[k];

    if (clean.State === "ALL") return null;

    const stateName = stateAbbrToName.get(clean.State);
    if (!stateName) return null;

    return {
      year: +clean.Year,
      state: stateName,
      CO2: +clean["CO2 emissions (non-biogenic)"],
      CH4: +clean["Methane (CH4) emissions"],
      N2O: +clean["Nitrous Oxide (N2O) emissions"],
      TOTAL: +clean["Total reported direct emissions"]
    };
  })
]).then(([statesTopo, rawRows]) => {

  const rows = rawRows.filter(d => d !== null);

  stateFeatures = topojson.feature(
    statesTopo,
    statesTopo.objects.states
  ).features;

  const years = Array.from(new Set(rows.map(d => d.year))).sort(d3.ascending);

  yearSlider.min = 0;
  yearSlider.max = years.length - 1;
  yearSlider.value = 0;

  currentYear = years[0];
  yearText.value = currentYear;
  currentPollutant = pollutantSelect.value;

  dataAgg = d3.rollup(
    rows,
    v => ({
      CO2: d3.sum(v, d => d.CO2),
      CH4: d3.sum(v, d => d.CH4),
      N2O: d3.sum(v, d => d.N2O),
      TOTAL: d3.sum(v, d => d.TOTAL)
    }),
    d => d.state,
    d => d.year
  );

  renderMap();

  yearSlider.addEventListener("input", () => {
    currentYear = years[+yearSlider.value];
    yearText.value = currentYear;
    renderMap();
  });

  pollutantSelect.addEventListener("change", () => {
    currentPollutant = pollutantSelect.value;
    renderMap();
  });
});

function renderMap() {
  const valuesByState = new Map();

  dataAgg.forEach((yearMap, state) => {
    const vals = yearMap.get(currentYear);
    if (vals && vals[currentPollutant] != null) {
      valuesByState.set(state, vals[currentPollutant]);
    }
  });

  const values = Array.from(valuesByState.values());
  if (!values.length) return;

  const maxValue = d3.max(values);
  color_map.domain([0, maxValue]);

  mapGroup.selectAll("path")
    .data(stateFeatures, d => d.properties.name)
    .join("path")
    .attr("d", path)
    .attr("fill", d => {
      const v = valuesByState.get(d.properties.name);
      return v != null ? color_map(v) : "#eee";
    })
    .attr("stroke", "#999")
    .attr("stroke-width", 0.5)
    .on("mouseover", (event, d) => {
      const v = valuesByState.get(d.properties.name);

      mapTooltip
        .style("opacity", 1)
        .html(`
          <strong>${d.properties.name}</strong><br>
          ${currentPollutant}: ${v != null ? d3.format(",")(v) : "No data"}<br>
          Year: ${currentYear}
        `);
    })
    .on("mousemove", event => {
      mapTooltip
        .style("left", (event.pageX + 12) + "px")
        .style("top", (event.pageY + 12) + "px");
    })
    .on("mouseout", () => {
      mapTooltip.style("opacity", 0);
    });
}
