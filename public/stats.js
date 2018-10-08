function makeChart(ctx, title, labels, downloadVals, samVals) {
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
  db.ref('metrics')
    .child(id)
    .once('value', function (snap) {
      var val = snap.val();

      var labels = [];
      var downloadVals = [];
      var samVals = [];

      // Download keys are the "master"
      Object.keys(val.downloads).forEach(function (date) {
        labels.push(date);
        downloadVals.push(val.downloads[date]);
        samVals.push(val.sam[date]);
      });

      makeChart(ctx, val.name, labels, downloadVals, samVals);
    });
}

window.initChart = function() {
  var ctx1 = document.getElementById('chart-1').getContext('2d');
  makeMetricChart('firebase-ui-database-android', ctx1);

  var ctx2 = document.getElementById('chart-2').getContext('2d');
  makeMetricChart('firebase-ui-firestore-android', ctx2);
};
