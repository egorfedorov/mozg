/** What the site's server answers the operator, in the shapes it answers it. */

export type Message = { id: string; author: "visitor" | "operator"; body: string; at: string };

export type Thread = {
  id: string;
  lang: string;
  page: string;
  createdAt: string;
  email: string | null;
  messages: Message[];
  readAt: string;
  seenAt: string;
  /** What the visitor said since the operator last read it. */
  waiting: number;
};

export type SiteError = { id: string; message: string; url: string; stack: string; count: number; firstAt: string; lastAt: string; resolvedAt: string | null };

export type AnnouncementKind = "news" | "notice" | "maintenance";

export type Announcement = {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  link: string;
  startsAt: string;
  endsAt: string | null;
  published: boolean;
  createdAt: string;
};

export type Draft = { id: string; channel: string; title: string; body: string; updatedAt: string };

export type Overview = {
  version: string;
  startedAt: string;
  mail: boolean;
  origin: string;
  threads: { all: number; waiting: number };
  errors: { open: number };
  announcements: { live: number; all: number };
  drafts: number;
};
