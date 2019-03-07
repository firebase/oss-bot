var COLOR_PINK = "rgb(255, 99, 132)";
var COLOR_GREEN = "rgb(99, 255, 132)";
var COLOR_BLUE = "rgb(51, 153, 255)";

var DOWNLOADS_AXIS = {
  id: "y-downloads",
  type: "linear",
  position: "left",
  scaleLabel: {
    display: true,
    labelString: "Downloads"
  },
  ticks: {
    beginAtZero: true
  }
};

var APPS_AXIS = {
  id: "y-apps",
  type: "linear",
  position: "left",
  scaleLabel: {
    display: true,
    labelString: "Apps"
  },
  ticks: {
    beginAtZero: true
  }
};

var SAM_AXIS = {
  id: "y-sam",
  type: "linear",
  position: "right",
  scaleLabel: {
    display: true,
    labelString: "SAM"
  },
  ticks: {
    min: 0.0,
    max: 2.0,
    beginAtZero: true
  },
  gridLines: {
    drawOnChartArea: false
  }
};

var SOURCE_CONFIGS = {
  bintray: {
    series: [
      {
        key: "downloads",
        label: "Downloads",
        cumulative: false,
        color: COLOR_PINK,
        axis: DOWNLOADS_AXIS
      },
      {
        key: "sam",
        label: "SAM Score",
        cumulative: false,
        color: COLOR_GREEN,
        axis: SAM_AXIS
      }
    ]
  },
  npm: {
    series: [
      {
        key: "downloads",
        label: "Downloads",
        cumulative: false,
        color: COLOR_PINK,
        axis: DOWNLOADS_AXIS
      },
      {
        key: "sam",
        label: "SAM Score",
        cumulative: false,
        color: COLOR_GREEN,
        axis: SAM_AXIS
      }
    ]
  },
  cocoapods: {
    series: [
      {
        key: "downloads",
        label: "Downloads",
        cumulative: true,
        color: COLOR_PINK,
        axis: DOWNLOADS_AXIS
      },
      {
        key: "apps",
        label: "Apps",
        cumulative: true,
        color: COLOR_BLUE,
        axis: APPS_AXIS
      },
      {
        key: "sam",
        label: "SAM Score",
        cumulative: false,
        color: COLOR_GREEN,
        axis: SAM_AXIS
      }
    ]
  }
};

function drawChart(ctx, title, labels, axes, dataSets) {
  var chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: dataSets
    },
    options: {
      responsive: true,
      stacked: false,
      title: {
        display: true,
        text: title
      },
      scales: {
        yAxes: axes
      }
    }
  });
}

function makeMetricChart(id, ctx) {
  var db = firebase.database();
  var baseDataRef = db.ref("metrics-data").child(id);
  var limit = 15;

  var getInfo = db
    .ref("metrics")
    .child(id)
    .once("value")
    .then(function(snap) {
      return snap.val();
    });

  // Collect graph info
  var name;
  var labels;
  var axes = [];
  var dataSets = [];

  getInfo
    .then(function(infoVal) {
      name = infoVal.name;

      var source = infoVal.source;
      var config = SOURCE_CONFIGS[source];

      var promises = [];
      config.series.forEach(function(series) {
        // Collect the axes, no duplicates
        if (axes.indexOf(series.axis) < 0) {
          axes.push(series.axis);
        }

        // Make the datasets
        var seriesPromise = baseDataRef
          .child(series.key)
          .limitToLast(limit)
          .once("value")
          .then(function(snap) {
            var data = snap.val();

            // Take the x-axis labels from the first series
            if (!labels) {
              labels = Object.keys(data);
              labels.sort();
            }

            // Create a Chart.js based on the series config
            var dataSet = {
              label: series.label,
              type: "line",
              borderColor: series.color,
              fill: false,
              data: [],
              yAxisID: series.axis.id
            };

            // Accumulate the data
            labels.forEach(function(label) {
              var pt = data[label];
              if (pt > 0) {
                dataSet.data.push(pt);
              } else {
                dataSet.data.push(null);
              }
            });

            // For cumulative data, do diffs
            if (series.cumulative) {
              var newData = [null];
              for (var i = 1; i < dataSet.data.length; i++) {
                newData.push(dataSet.data[i] - dataSet.data[i - 1]);
              }
              dataSet.data = newData;
            }

            dataSets.push(dataSet);
          });

        // Add the promise to the list
        promises.push(seriesPromise);
      });

      return Promise.all(promises);
    })
    .then(function() {
      // Once we have all data, draw the chart
      drawChart(ctx, name, labels, axes, dataSets);
    });
}

window.initializeCharts = function() {
  this.document.querySelectorAll(".card").forEach(function(element) {
    var chart = element.querySelector("canvas");
    var repoId = element.getAttribute("data-repo");

    makeMetricChart(repoId, chart.getContext("2d"));
  });
};
