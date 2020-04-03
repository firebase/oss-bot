var app; // Vue app
var db; // Firebase database

var org; // GitHub org
var repo; // GitHub repo
var key; // Specific database key

var EntryPresenter = function (org, repo, key, data) {
  this.org = org;
  this.repo = repo;
  this.key = key;
  this.data = data;
};

EntryPresenter.prototype.selfLink = function () {
  return (
    "/audit.html?org=" + this.org + "&repo=" + this.repo + "&key=" + this.key
  );
};

EntryPresenter.prototype.timeString = function () {
  return (
    new Date(this.data.time).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    }) + " (Pacific)"
  );
};

EntryPresenter.prototype.targetLink = function () {
  return (
    "https://github.com/" + this.org + "/" + this.repo + "/" + this.data.target
  );
};

EntryPresenter.prototype.hasDetails = function () {
  return this.data.details || this.data.details !== {};
};

EntryPresenter.prototype.detailsEntries = function () {
  var result = [];

  if (!this.data.details) {
    return result;
  }

  var that = this;
  Object.keys(this.data.details).forEach(function (key) {
    result.push([key, that.data.details[key]]);
  });
  return result;
};

window.initializeApp = function () {
  var params = new URLSearchParams(window.location.search);
  if (!(params.has("repo") && params.has("org"))) {
    alert("Please supply both the 'repo' and 'org' query string params.");
    return;
  }

  org = params.get("org");
  repo = params.get("repo");
  key = params.get("key");

  app = new Vue({
    el: "#app",
    data: {
      org: org,
      repo: repo,
      entries: [],
    },
  });
};

window.initializeData = function () {
  db = firebase.database();
  if (key && key !== "") {
    loadSingleEntry(key);
  } else {
    loadRepoAudit();
  }
};

function addSnapToEntries(snap) {
  console.log(snap.val());
  app.entries.unshift(new EntryPresenter(org, repo, snap.key, snap.val()));
}

function loadRepoAudit() {
  var dataRef = db.ref("repo-log").child(org).child(repo).limitToLast(100);

  dataRef.on("child_added", addSnapToEntries);
}

function loadSingleEntry(key) {
  var dataRef = db.ref("repo-log").child(org).child(repo).child(key);

  dataRef.once("value", addSnapToEntries);
}
