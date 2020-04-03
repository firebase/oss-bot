const COLOR_PINK = "rgb(255, 99, 132)";
const COLOR_GREEN = "rgb(99, 255, 132)";
const COLOR_BLUE = "rgb(51, 153, 255)";

let lastChart = undefined;

// TODO: DRY with stats.js
function drawChart(ctx, title, labels, axes, dataSets) {
  if (lastChart) {
    lastChart.destroy();
  }

  lastChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: dataSets,
    },
    options: {
      responsive: true,
      stacked: false,
      title: {
        display: true,
        text: title,
      },
      scales: {
        yAxes: axes,
      },
    },
  });
}

async function makeMetricChart(ctx) {
  const resp = await fetchData();

  const y_axis = {
    id: "y-axis",
    type: "linear",
    position: "left",
    scaleLabel: {
      display: true,
      labelString: resp.field,
    },
    ticks: {
      beginAtZero: false,
    },
  };

  const seriesConfig = {
    key: resp.repo,
    label: resp.repo,
    color: COLOR_GREEN,
    axis: y_axis,
  };

  // Collect graph info
  const labels = Object.keys(resp.data).sort();
  const axes = [y_axis];
  const dataSets = [];

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
  labels.forEach(function (label) {
    var pt = resp.data[label];
    if (pt > 0) {
      dataSet.data.push(pt);
    } else {
      dataSet.data.push(null);
    }
  });

  dataSets.push(dataSet);

  // Once we have all data, draw the chart
  drawChart(ctx, name, labels, axes, dataSets);
}

function getQueryUrl() {
  const org = document.querySelector("#field-org").value;
  const repo = document.querySelector("#field-repo").value;
  const field = document.querySelector("#field-field").value;
  const points = document.querySelector("#field-points").value;
  const daysBetween = document.querySelector("#field-daysBetween").value;

  let base = "https://us-central1-ossbot-f0cad.cloudfunctions.net";
  if (window.location.hostname === "localhost") {
    base = "http://localhost:5001/ossbot-test/us-central1";
  }
  return `${base}/GetRepoTimeSeries?org=${org}&repo=${repo}&field=${field}&points=${points}&daysBetween=${daysBetween}`;
}

async function fetchData() {
  const url = getQueryUrl();
  const res = await fetch(url);
  return res.json();
}

window.loadChart = async function () {
  const chartCard = this.document.querySelector("#chart-content");
  const loading = this.document.querySelector("#chart-loading");
  const chart = chartCard.querySelector("canvas");

  loading.classList.toggle("visible");
  await makeMetricChart(chart.getContext("2d"));
  loading.classList.toggle("visible");
};
