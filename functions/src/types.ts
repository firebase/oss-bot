export enum ActionType {
  GITHUB_COMMENT = "GITHUB_COMMENT",
  GITHUB_LABEL = "GITHUB_LABEL",
  EMAIL_SEND = "EMAIL_SEND"
}

export class Action {
  type: ActionType;

  constructor(type: ActionType) {
    this.type = type;
  }
}

export class GithubIssueAction extends Action {
  org: string;
  name: string;
  number: number;

  constructor(type: ActionType, org: string, name: string, number: number) {
    super(type);

    this.org = org;
    this.name = name;
    this.number = number;
  }
}

export class GithubCommentAction extends GithubIssueAction {
  message: string;
  collapse: boolean;

  constructor(
    org: string,
    name: string,
    number: number,
    message: string,
    collapse: boolean
  ) {
    super(ActionType.GITHUB_COMMENT, org, name, number);

    this.message = message;
    this.collapse = collapse;
  }
}

export class GithubLabelAction extends GithubIssueAction {
  label: string;

  constructor(org: string, name: string, number: number, label: string) {
    super(ActionType.GITHUB_LABEL, org, name, number);

    this.label = label;
  }
}

export class SendEmailAction extends Action {
  recipient: string;
  subject: string;
  header: string;
  body: string;
  link: string;
  action: string;

  constructor(
    recipient: string,
    subject: string,
    header: string,
    body: string,
    link: string,
    action: string
  ) {
    super(ActionType.EMAIL_SEND);

    this.recipient = recipient;
    this.subject = subject;
    this.header = header;
    this.body = body;
    this.link = link;
    this.action = action;
  }
}

export class User {
  login: string;
  id: number;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
}

export class Label {
  id: number;
  url: string;
  name: string;
  color: string;
  default: boolean;
}

export class Milestone {
  url: string;
  html_url: string;
  labels_url: string;
  id: number;
  number: number;
  state: string;
  title: string;
  description: string;
  creator: User;
  open_issues: number;
  closed_issues: number;
  created_at: Date;
  updated_at: Date;
  closed_at: Date;
  due_on: Date;
}

export class Permissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

export class Repository {
  id: number;
  owner: User;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  fork: boolean;
  url: string;
  html_url: string;
  archive_url: string;
  assignees_url: string;
  blobs_url: string;
  branches_url: string;
  clone_url: string;
  collaborators_url: string;
  comments_url: string;
  commits_url: string;
  compare_url: string;
  contents_url: string;
  contributors_url: string;
  deployments_url: string;
  downloads_url: string;
  events_url: string;
  forks_url: string;
  git_commits_url: string;
  git_refs_url: string;
  git_tags_url: string;
  git_url: string;
  hooks_url: string;
  issue_comment_url: string;
  issue_events_url: string;
  issues_url: string;
  keys_url: string;
  labels_url: string;
  languages_url: string;
  merges_url: string;
  milestones_url: string;
  mirror_url: string;
  notifications_url: string;
  pulls_url: string;
  releases_url: string;
  ssh_url: string;
  stargazers_url: string;
  statuses_url: string;
  subscribers_url: string;
  subscription_url: string;
  svn_url: string;
  tags_url: string;
  teams_url: string;
  trees_url: string;
  homepage: string;
  language?: any;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  size: number;
  default_branch: string;
  open_issues_count: number;
  topics: string[];
  has_issues: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_downloads: boolean;
  pushed_at: Date;
  created_at: Date;
  updated_at: Date;
  permissions: Permissions;
  allow_rebase_merge: boolean;
  allow_squash_merge: boolean;
  allow_merge_commit: boolean;
  subscribers_count: number;
  network_count: number;
}

export class Issue {
  id: number;
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  number: number;
  state: string;
  title: string;
  body: string;
  user: User;
  labels: Label[];
  assignee: User;
  milestone: Milestone;
  locked: boolean;
  comments: number;
  pull_request: PullRequest;
  closed_at?: any;
  created_at: Date;
  updated_at: Date;
  repository: Repository;
}

export class Comment {
  id: number;
  url: string;
  html_url: string;
  body: string;
  user: User;
  created_at: Date;
  updated_at: Date;
}

export class Sender {
  login: string;
  id: number;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
}

export class WebhookEvent {
  action: string;
  issue: Issue;
  repository: Repository;
  label: Label;
  sender: Sender;
}

export class Commit {
  label: string;
  ref: string;
  sha: string;
  user: User;
  repo: Repository;
}

export class Link {
  href: string;
}

export class Links {
  self: Link;
  html: Link;
  issue: Issue;
  comments: Link;
  review_comments: Link;
  review_comment: Link;
  commits: Link;
  statuses: Link;
}

export class PullRequest {
  id: number;
  url: string;
  html_url: string;
  diff_url: string;
  patch_url: string;
  issue_url: string;
  commits_url: string;
  review_comments_url: string;
  review_comment_url: string;
  comments_url: string;
  statuses_url: string;
  number: number;
  state: string;
  title: string;
  body: string;
  assignee: User;
  milestone: Milestone;
  locked: boolean;
  created_at: Date;
  updated_at: Date;
  closed_at: Date;
  merged_at: Date;
  head: Commit;
  base: Commit;
  _links: Links;
  user: User;
}
