import { IssueStats } from "./stats";

export enum ActionService {
  GITHUB = "GITHUB",
  EMAIL = "EMAIL"
}

export enum ActionType {
  GITHUB_COMMENT = "GITHUB_COMMENT",
  GITHUB_ADD_LABEL = "GITHUB_LABEL",
  GITHUB_REMOVE_LABEL = "GITHUB_REMOVE_LABEL",
  GITHUB_CLOSE = "GITHUB_CLOSE",
  GITHUB_LOCK = "GITHUB_LOCK",
  GITHUB_NO_OP = "GITHUB_NO_OP",
  EMAIL_SEND = "EMAIL_SEND"
}

export const GITHUB_ISSUE_ACTIONS = [
  ActionType.GITHUB_COMMENT,
  ActionType.GITHUB_ADD_LABEL,
  ActionType.GITHUB_REMOVE_LABEL,
  ActionType.GITHUB_CLOSE,
  ActionType.GITHUB_LOCK,
  ActionType.GITHUB_NO_OP
];

export class Action {
  type: ActionType;
  reason: string;

  constructor(type: ActionType) {
    this.type = type;
    this.reason = "";
  }

  toString() {
    return `Action(${this.type})`;
  }
}

export class GitHubIssueAction extends Action {
  org: string;
  name: string;
  number: number;

  constructor(type: ActionType, org: string, name: string, number: number) {
    super(type);

    this.org = org;
    this.name = name;
    this.number = number;
  }

  details(): { [s: string]: any } {
    return {};
  }

  toString() {
    return `IssueAction(${this.type}, ${this.org}/${this.name}#{${this.number})`;
  }
}

export class GitHubCommentAction extends GitHubIssueAction {
  message: string;
  collapse: boolean;

  constructor(
    org: string,
    name: string,
    number: number,
    message: string,
    collapse: boolean,
    reason?: string
  ) {
    super(ActionType.GITHUB_COMMENT, org, name, number);

    this.message = message;
    this.collapse = collapse;

    if (reason) {
      this.reason = reason;
    }
  }

  details() {
    return {
      message: this.message
    };
  }
}

export class GitHubAddLabelAction extends GitHubIssueAction {
  label: string;

  constructor(
    org: string,
    name: string,
    number: number,
    label: string,
    reason?: string
  ) {
    super(ActionType.GITHUB_ADD_LABEL, org, name, number);

    this.label = label;
    if (reason) {
      this.reason = reason;
    }
  }

  details() {
    return {
      label: this.label
    };
  }
}

export class GitHubRemoveLabelAction extends GitHubIssueAction {
  label: string;

  constructor(
    org: string,
    name: string,
    number: number,
    label: string,
    reason?: string
  ) {
    super(ActionType.GITHUB_REMOVE_LABEL, org, name, number);

    this.label = label;
    if (reason) {
      this.reason = reason;
    }
  }

  details() {
    return {
      label: this.label
    };
  }
}

export class GitHubCloseAction extends GitHubIssueAction {
  constructor(org: string, name: string, number: number, reason?: string) {
    super(ActionType.GITHUB_CLOSE, org, name, number);

    if (reason) {
      this.reason = reason;
    }
  }
}

export class GitHubLockAction extends GitHubIssueAction {
  constructor(org: string, name: string, number: number, reason?: string) {
    super(ActionType.GITHUB_LOCK, org, name, number);

    if (reason) {
      this.reason = reason;
    }
  }
}

export class GitHubNoOpAction extends GitHubIssueAction {
  constructor(org: string, name: string, number: number, reason?: string) {
    super(ActionType.GITHUB_NO_OP, org, name, number);

    if (reason) {
      this.reason = reason;
    }
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

  toString() {
    let subjectPreview = this.subject;
    if (subjectPreview.length > 20) {
      subjectPreview = subjectPreview.substr(0, 17) + "...";
    }

    return `SendEmailAction(${this.recipient}, ${subjectPreview})`;
  }
}

export class ActionLog {
  event: string;
  target: string;
  details: { [s: string]: any };
  reason: string;
  time: number;

  constructor(action: GitHubIssueAction) {
    this.event = action.type;
    this.target = `issues/${action.number}`;
    this.details = action.details();
    this.reason = action.reason;
    this.time = Date.now();
  }
}

export class TemplateOptions {
  path: string;
  validate: boolean;

  constructor(path: string, validate: boolean) {
    this.path = path;
    this.validate = validate;
  }
}

export interface FeatureConfig {
  issue_labels: boolean;
  custom_emails: boolean;
  issue_cleanup: boolean;
  repo_reports: boolean;
}

export interface Config {
  [org: string]: OrgConfig;
}

export interface OrgConfig {
  [repo: string]: RepoConfig;
}

export interface RepoConfig {
  reports?: ReportConfig;
  labels?: { [labelName: string]: LabelConfig };
  templates?: { [templateName: string]: string };
  cleanup?: CleanupConfig;
  validation?: ValidationConfig;
}

export interface ReportConfig {
  email: string;
}

export interface LabelConfig {
  regex: string;
  email?: string;
}

export interface CleanupConfig {
  issue?: IssueCleanupConfig;
}

export interface ValidationConfig {
  templates: { [path: string]: TemplateValidationConfig };
}

export interface TemplateValidationConfig {
  validation_failed_label?: string;
  required_section_validation?: "strict" | "relaxed" | "none";
}

export interface IssueCleanupConfig {
  label_needs_info: string;
  label_needs_attention?: string;
  label_stale: string;
  auto_close_labels?: {
    add: string[];
    remove: string[];
  };
  ignore_labels?: string[];
  needs_info_days: number;
  stale_days: number;
  lock_days?: number;
}

export namespace github {
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
    created_at: string;
    updated_at: string;
    closed_at: string;
    due_on: string;
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
    pushed_at: string;
    created_at: string;
    updated_at: string;
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
    closed_at?: string;
    created_at: string;
    updated_at: string;
    repository: Repository;
    changes?: {
      old_issue?: {
        url: string;
      };
    };
  }

  export class Comment {
    id: number;
    url: string;
    html_url: string;
    body: string;
    user: User;
    created_at: string;
    updated_at: string;
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
    created_at: string;
    updated_at: string;
    closed_at: string;
    merged_at: string;
    head: Commit;
    base: Commit;
    _links: Links;
    user: User;
    labels: Label[];
  }
}

/**
 * Types for data as it is stored in the 'snapshots' tree
 * in the RTDB.
 */
export namespace snapshot {
  export interface Map<T> {
    [repo: string]: T;
  }

  export interface Org {
    name: string;
    public_repos: number;
    repos: Map<Repo>;
  }

  export interface Repo {
    name: string;
    private: boolean;
    open_issues_count: number;
    closed_issues_count: number;
    stargazers_count: number;
    forks_count: number;

    issues: Map<Issue>;
  }

  export interface Issue {
    title: string;
    number: number;
    comments: number;
    pull_request: boolean;
    state: string;
    locked: boolean;
    user: {
      login: string;
    };
    assignee: {
      login: string;
    };
    labels?: string[];
    updated_at: string;
    created_at: string;
  }
}

/**
 * Types for data as it is reported.
 */
export namespace report {
  export class Diff {
    before: number;
    after: number;
    diff: number;

    constructor(before: number, after: number) {
      this.before = before;
      this.after = after;

      this.diff = after - before;
    }
  }

  export interface ChangedIssue {
    number: number;
    title: string;
    link: string;
  }

  export interface LabelReport extends IssueStats {
    name: string;
  }

  export interface Repo {
    name: string;

    start: string;
    end: string;

    sam: Diff;

    open_issues: Diff;
    stars: Diff;
    forks: Diff;

    opened_issues: ChangedIssue[];
    closed_issues: ChangedIssue[];

    worst_labels: LabelReport[];
  }

  export interface RepoTimeSeries {
    org: string;
    repo: string;
    field: string;
    data: { [key: string]: number | string };
  }
}

/**
 * Internal type specifications that allow us to merge data sources.
 */
export namespace internal {
  export interface Repository {
    name: string;
    owner: User;
  }

  export interface Issue {
    number: number;
    state: string;
    locked: boolean;
    title: string;
    body: string;
    user: User;
    labels: Label[];
    created_at: string;
    updated_at: string;

    closed_at?: string | null;
    assignee?: User;
    html_url?: string;
    changes?: {
      old_issue?: {
        url: string;
      };
    };
  }

  export interface IssueOrPullRequest {
    number: number;
    title: string;
    body: string;
    labels: Label[];
    user: User;

    html_url?: string;
  }

  export interface Comment {
    body: string;
    user: User;
    created_at: string;
    updated_at: string;
  }

  export interface User {
    login: string;
  }

  export interface Label {
    name: string;
  }

  export interface Timestamped {
    updated_at: string;
    created_at: string;
  }
}

export namespace bigquery {
  export class Issue {
    repo?: string;
    ingested?: string;
    title?: string;
    number?: number;
    comments?: number;
    pull_request?: boolean;
    state?: string;
    locked?: boolean;
    user?: {
      login?: string;
    };
    assignee?: {
      login?: string;
    };
    labels?: string[];
    updated_at?: string;
    created_at?: string;

    constructor(issue: snapshot.Issue, repo: string, ingested: Date) {
      this.repo = repo;
      this.number = issue.number;
      this.title = issue.title;
      this.state = issue.state;
      this.pull_request = issue.pull_request;
      this.locked = issue.locked;
      this.comments = issue.comments;
      this.user = {
        login: issue.user.login
      };
      this.assignee = {
        login: issue.assignee.login
      };
      this.labels = issue.labels || [];
      this.updated_at = issue.updated_at;
      this.created_at = issue.created_at;
      this.ingested = ingested.toISOString();
    }
  }
}
