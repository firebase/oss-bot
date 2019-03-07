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

EntryPresenter.prototype.hasDetails = function() {
  return this.data.details || this.data.details !== {};
};

EntryPresenter.prototype.detailsEntries = function () {
  var result = [];
  const that = this;
  Object.keys(this.data.details).forEach(function(key) {
    result.push([key, that.data.details[key]]);
  });
  return result;
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