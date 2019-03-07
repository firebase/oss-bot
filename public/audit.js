var app;

var EntryPresenter = function(org, repo, data) {
  this.org = org;
  this.repo = repo;
  this.data = data;
};

EntryPresenter.prototype.timeString = function() {
  return new Date(this.data.time).toUTCString();
};

EntryPresenter.prototype.targetLink = function() {
  return (
    "https://github.com/" + this.org + "/" + this.repo + "/" + this.data.target
  );
};

window.initialize = function() {
  var params = new URLSearchParams(window.location.search);
  if (!(params.has("repo") && params.has("org"))) {
    alert("Please supply both the 'repo' and 'org' query string params.");
    return;
  }

  var org = params.get("org");
  var repo = params.get("repo");
  console.log("org", org, "repo", repo);

  app = new Vue({
    el: "#app",
    data: {
      org: org,
      repo: repo,
      entries: []
    }
  });

  var db = firebase.database();
  var dataRef = db
    .ref("repo-log")
    .child(org)
    .child(repo)
    .limitToLast(100);

  dataRef.on("child_added", function(snap) {
    console.log(snap.val());
    app.entries.push(new EntryPresenter(org, repo, snap.val()));
  });
};

function entryToRow(data) {
  var row = document.createElement("tr");
  row.appendChild(itemToCell(new Date(data.time).toUTCString()));
  row.appendChild(itemToCell(data.event));
  row.appendChild(itemToCell(data.target));
  row.appendChild(itemToCell(data.details, true, true));
  row.appendChild(itemToCell(data.reason));

  return row;
}

function itemToCell(val, stringify, pre) {
  var cell = document.createElement("td");
  var html = val;

  if (!val || val === "") {
    html = "N/A";
  }

  if (stringify) {
    html = JSON.stringify(val, undefined, 2);
  }

  if (pre) {
    html = "<code>" + html + "</code>";
  }
  cell.innerHTML = html;
  return cell;
}
