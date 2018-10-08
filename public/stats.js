function drawChart(ctx, title, labels, downloadVals, samVals) {
  var chart = new Chart.Line(ctx, {
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Downloads',
          type: 'line',
          borderColor: 'rgb(255, 99, 132)',
          fill: false,
          data: downloadVals,
          yAxisID: 'y-downloads'
        },
        {
          label: 'SAM Score',
          type: 'line',
          borderColor: 'rgb(99, 255, 132)',
          fill: false,
          data: samVals,
          yAxisID: 'y-sam'
        }
      ]
    },
    options: {
      responsive: true,
      stacked: false,
      title: {
        display: true,
        text: title
      },
      scales: {
        yAxes: [
          {
            id: 'y-downloads',
            type: 'linear',
            position: 'left',
            ticks: {
              beginAtZero: true
            }
          },
          {
            id: 'y-sam',
            type: 'linear',
            position: 'right',
            ticks: {
              beginAtZero: true
            },
            gridLines: {
              drawOnChartArea: false
            }
          }
        ]
      }
    }
  });
}

function makeMetricChart(id, ctx) {
  var db = firebase.database();
  let dataVal;
  let infoVal;

  var getData = db.ref('metrics-data')
    .child(id)
    .once('value')
    .then(function(snap) {
      dataVal = snap.val();
    });

  var getInfo = db.ref('metrics')
    .child(id)
    .once('value')
    .then(function (snap) {
      infoVal = snap.val();
    });

  Promise.all([getInfo, getData])
    .then(function() {

      var name = infoVal.name;
      var labels = [];
      var downloadVals =[];
      var samVals = [];

      // Download keys are the "master"
      Object.keys(dataVal.downloads).forEach(function (date) {
        labels.push(date);
        downloadVals.push(dataVal.downloads[date]);
        samVals.push(dataVal.sam[date]);
      });

      drawChart(ctx, name, labels, downloadVals, samVals);
    });
}

window.initializeCharts = function() {
  this.document.querySelectorAll('.card').forEach(function(element) {
    console.log(element)
    var chart = element.querySelector('canvas');
    var repoId = element.getAttribute('data-repo');

    makeMetricChart(repoId, chart.getContext('2d'));
  });
};
