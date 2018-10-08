function drawChart(ctx, title, labels, downloadVals, samVals) {
  var chart = new Chart(ctx, {
    type: 'line',
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
              min: 0.0,
              max: 2.0,
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
  var downloadsVal;
  var samVal;
  var infoVal;

  var baseDataRef = db.ref('metrics-data').child(id);
  var numRecords = 15;

  var getDownloads = baseDataRef
    .child("downloads")
    .limitToLast(numRecords)
    .once('value')
    .then(function(snap) {
      downloadsVal = snap.val();
    });

  var getSam = baseDataRef
    .child("sam")
    .limitToLast(numRecords)
    .once('value')
    .then(function (snap) {
      samVal = snap.val();
    });

  var getInfo = db.ref('metrics')
    .child(id)
    .once('value')
    .then(function (snap) {
      infoVal = snap.val();
    });

  Promise.all([getInfo, getDownloads, getSam])
    .then(function() {

      var name = infoVal.name;
      var labels = [];
      var downloadVals =[];
      var samVals = [];

      // Download keys are the "master"
      Object.keys(downloadsVal).forEach(function (date) {
        labels.push(date);

        var numDownloads = downloadsVal[date];
        if (numDownloads > 0) {
          downloadVals.push(numDownloads);
        } else {
          downloadVals.push(null);
        }

        var samScore = samVal[date];
        if (samScore > 0) {
          samVals.push(samScore);
        } else {
          samVals.push(null);
        }
      });

      drawChart(ctx, name, labels, downloadVals, samVals);
    });
}

window.initializeCharts = function() {
  this.document.querySelectorAll('.card').forEach(function(element) {
    var chart = element.querySelector('canvas');
    var repoId = element.getAttribute('data-repo');

    makeMetricChart(repoId, chart.getContext('2d'));
  });
};
