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

let lastChart = undefined;
let CHART_AXES = [];
let CHART_DATA = {
  datasets: [],
  labels: [],
};

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

// TODO: DRY with stats.js
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

async function makeMetricChart(ctx) {
  const resp = await fetchQueryData();

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

async function fetchQueryData() {
  const opts = getQueryOptsFromForm();
  const url = getQueryUrl(opts);
  const res = await fetch(url);
  return res.json();
}

function toggleLoading() {
  const loading = this.document.querySelector("#chart-loading");
  loading.classList.toggle("visible");
}

function lockFields() {
  document.querySelector("#field-points").setAttribute("disabled", true);
  document.querySelector("#field-daysBetween").setAttribute("disabled", true);
}

function unlockFields() {
  document.querySelector("#field-points").removeAttribute("disabled");
  document.querySelector("#field-daysBetween").removeAttribute("disabled");
}

window.resetChart = function () {
  clearChart();
  unlockFields();

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

window.loadChart = async function () {
  const chartCard = this.document.querySelector("#chart-content");
  const chart = chartCard.querySelector("canvas");

  toggleLoading();
  lockFields();
  await makeMetricChart(chart.getContext("2d"));
  toggleLoading();
};
