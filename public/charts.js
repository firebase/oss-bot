const ISSUES_AXIS = {
  id: "issues_axis",
  type: "linear",
  position: "left",
  scaleLabel: {
    display: true,
    labelString: "Issues",
  },
  ticks: {
    beginAtZero: false,
  },
};

const SAM_AXIS = {
  id: "sam_axis",
  type: "linear",
  position: "left",
  scaleLabel: {
    display: true,
    labelString: "SAM Score",
  },
  ticks: {
    beginAtZero: false,
  },
};

const STARS_AXIS = {
  id: "stars_axis",
  type: "linear",
  position: "left",
  scaleLabel: {
    display: true,
    labelString: "Stars",
  },
  ticks: {
    beginAtZero: false,
  },
};

let chartContext = undefined;
let lastChart = undefined;

let CHART_AXES = [];
let CHART_DATA = {
  datasets: [],
  labels: [],
};

let CHART_OPTS = [];

function randomColor() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);

  return `rgb(${r}, ${g}, ${b})`;
}

function selectAxis(field) {
  if (field.includes("issue")) {
    return ISSUES_AXIS;
  }

  if (field.includes("sam")) {
    return SAM_AXIS;
  }

  if (field.includes("star")) {
    return STARS_AXIS;
  }

  throw `No axis for field: ${field}`;
}

function drawChart(ctx) {
  clearChart();

  lastChart = new Chart(ctx, {
    type: "line",
    data: CHART_DATA,
    options: {
      responsive: true,
      stacked: false,
      scales: {
        yAxes: CHART_AXES,
      },
    },
  });
}

async function addSeriesToChart(ctx, opts) {
  const resp = await fetchQueryData(opts);
  const y_axis = selectAxis(resp.field);

  const seriesColor = randomColor();
  const seriesConfig = {
    key: resp.repo,
    label: `${resp.repo} - ${resp.field}`,
    color: seriesColor,
    axis: y_axis,
  };

  // Collect graph info
  // TODO: Lock labels
  const labels = Object.keys(resp.data).sort();

  // Create a Chart.js based on the series config
  const dataSet = {
    label: seriesConfig.label,
    type: "line",
    borderColor: seriesConfig.color,
    fill: false,
    data: [],
    yAxisID: seriesConfig.axis.id,
  };

  // Accumulate the data
  dataSet.data = labels.map((label) => {
    return resp.data[label];
  });

  // TODO: Just this
  CHART_AXES.push(y_axis);
  CHART_DATA.labels = labels;
  CHART_DATA.datasets.push(dataSet);

  // Once we have all data, draw the chart
  drawChart(ctx);
}

function getQueryOptsFromForm() {
  const org = document.querySelector("#field-org").value;
  const repo = document.querySelector("#field-repo").value;
  const field = document.querySelector("#field-field").value;
  const points = document.querySelector("#field-points").value;
  const daysBetween = document.querySelector("#field-daysBetween").value;

  return { org, repo, field, points, daysBetween };
}

function getQueryUrl(opts) {
  const { org, repo, field, points, daysBetween } = opts;

  let base = "https://us-central1-ossbot-f0cad.cloudfunctions.net";
  if (window.location.hostname === "localhost") {
    base = "http://localhost:5001/ossbot-test/us-central1";
  }
  return `${base}/GetRepoTimeSeries?org=${org}&repo=${repo}&field=${field}&points=${points}&daysBetween=${daysBetween}`;
}

async function fetchQueryData(opts) {
  const url = getQueryUrl(opts);
  const res = await fetch(url);
  return res.json();
}

async function withLoading(fn) {
  const loading = this.document.querySelector("#chart-loading");
  loading.classList.add("visible");
  lockFields();

  await fn();

  unlockFields();
  loading.classList.remove("visible");
}

function lockFields() {
  const fields = [
    "#field-org",
    "#field-repo",
    "#field-field",
    "#field-points",
    "#field-daysBetween"
  ];

  for (const id of fields) {
    document.querySelector(id).setAttribute("disabled", true);
  }
}

function unlockFields() {
  const fields = [
    "#field-org",
    "#field-repo",
    "#field-field",
    "#field-points",
    "#field-daysBetween"
  ];

  for (const id of fields) {
    document.querySelector(id).removeAttribute("disabled");
  }
}

function appendSeriesToState(opts) {
  CHART_OPTS.push(opts);
  setState();
}

function resetSeriesState() {
  CHART_OPTS = [];
  setState();
}

function setState() {
  const optsEncoded = btoa(JSON.stringify(CHART_OPTS));
  setQueryStringParameter("series", optsEncoded);
}

function getQueryStringParameter(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function setQueryStringParameter(name, value) {
  const params = new URLSearchParams(window.location.search);
  params.set(name, value);
  window.history.replaceState({}, "", decodeURIComponent(`${window.location.pathname}?${params}`));
}

async function loadChartFromSeriesState() {
  const param = getQueryStringParameter("series");
  if (param) {
    CHART_OPTS = JSON.parse(atob(param));
    for (const series of CHART_OPTS) {
      console.log("Loading series: ", JSON.stringify(series));
      await addSeriesToChart(chartContext, series);
    }
  }
}

const onDocReady = function (cb) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function (e) {
      cb();
    })
  } else {
    cb();
  }
};

window.resetChart = function () {
  clearChart();
  unlockFields();

  resetSeriesState();
  CHART_AXES = [];
  CHART_DATA.datasets = [];
  CHART_DATA.labels = [];
};

window.clearChart = function () {
  if (lastChart) {
    lastChart.destroy();
    lastChart = undefined;
  }
};

window.addSeriesFromForm = async function () {
  withLoading(async () => {
    const opts = getQueryOptsFromForm();
    appendSeriesToState(opts);  

    await addSeriesToChart(chartContext, opts);
  });
};

onDocReady(() => {
  const chartCard = this.document.querySelector("#chart-content");
  const chart = chartCard.querySelector("canvas");
  chartContext = chart.getContext("2d");
  
  withLoading(async () => {
    await loadChartFromSeriesState();
  });
});
